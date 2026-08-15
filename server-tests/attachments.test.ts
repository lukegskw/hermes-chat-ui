import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentStore } from "../server/attachments.js";
import { createApp } from "../server/app.js";
import { streamSessionChat } from "../server/sessions.js";
import { testConfig } from "./helpers.js";

const pngDataUrl = `data:image/png;base64,${Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
]).toString("base64")}`;

const setup = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hermes-attachments-"));
  const config = testConfig({
    attachmentsDir: path.join(directory, "blobs"),
    attachmentsIndexFile: path.join(directory, "index.json"),
  });
  return { config, store: new AttachmentStore(config) };
};

afterEach(() => vi.unstubAllGlobals());

describe("durable attachment store", () => {
  it("atomically stores, restart-binds, enriches, serves, and deletes images", async () => {
    const { config, store } = await setup();
    const groupId = await store.createPending(
      "session-1",
      {
        message: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: pngDataUrl } },
        ],
      },
      [{ id: 1, role: "assistant", content: "old" }],
    );
    expect(groupId).toMatch(/^[a-f0-9]{32}$/);

    const persistedIndex = JSON.parse(
      await readFile(config.attachmentsIndexFile, "utf8"),
    );
    const blobId = Object.keys(persistedIndex.attachments)[0];
    await expect(
      access(path.join(config.attachmentsDir, blobId)),
    ).resolves.toBeUndefined();

    const restarted = new AttachmentStore(config);
    expect(
      await restarted.reconcileSession("session-1", [
        { id: 1, role: "assistant", content: "old" },
        { id: 2, role: "user", content: "look" },
        { id: 3, role: "user", content: "look" },
      ]),
    ).toEqual([groupId]);
    const enriched = (await restarted.enrichMessages("session-1", {
      session_id: "session-1",
      data: [{ id: 2, role: "user", content: "look" }],
    })) as { data: Array<{ content: unknown[] }> };
    expect(enriched.data[0].content).toEqual([
      { type: "text", text: "look" },
      {
        type: "image_url",
        image_url: { url: `/api/attachments/${blobId}` },
      },
    ]);
    await expect(restarted.readBlob(blobId)).resolves.toMatchObject({
      mimeType: "image/png",
    });
    const response = await createApp(config).request(
      `/api/attachments/${blobId}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await restarted.deleteSession("session-1");
    await expect(restarted.readBlob(blobId)).resolves.toBeUndefined();
  });

  it("rejects invalid content and never accepts a path as a blob ID", async () => {
    const { store } = await setup();
    await expect(
      store.createPending(
        "session-1",
        {
          message: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`,
              },
            },
          ],
        },
        [],
      ),
    ).rejects.toThrow("invalid_attachment_content");
    await expect(store.readBlob("../../config.yaml")).resolves.toBeUndefined();
  });

  it("discards files when Hermes rejects the chat request", async () => {
    const { config, store } = await setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({ detail: "rejected" }, { status: 422 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const response = await streamSessionChat(
      config,
      "session-1",
      new Request("http://ui.test/api/sessions/session-1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: [{ type: "image_url", image_url: { url: pngDataUrl } }],
        }),
      }),
      store,
    );
    expect(response.status).toBe(422);
    const index = JSON.parse(
      await readFile(config.attachmentsIndexFile, "utf8"),
    );
    expect(index.attachments).toEqual({});
    expect(index.pendingGroups).toEqual({});
  });
});
