import { readFile } from "node:fs/promises";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerConfig } from "./config.js";
import { AttachmentStore } from "./attachments.js";
import { proxyHermes, safeJsonBody } from "./hermes-client.js";
import { modelOptionsResponse } from "./model-options.js";
import { notificationRoutes } from "./notifications.js";
import { createProactiveMessage } from "./proactive.js";
import {
  cancelActiveStream,
  deleteSession,
  getSessionMessages,
  proxySessionRequest,
  resumeActiveStream,
  sessionPath,
  streamSessionChat,
} from "./sessions.js";

const apiNotFound = (): Response =>
  Response.json({ detail: "Not Found" }, { status: 404 });

export const createApp = (config: ServerConfig): Hono => {
  const app = new Hono();
  const attachments = new AttachmentStore(config);
  void attachments
    .cleanupAbandonedPending()
    .catch((error) =>
      console.error("[attachments] Startup cleanup failed:", error),
    );
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.get("/api/health", (context) =>
    context.json({
      status: "ok",
      service: "hermes-chat-ui",
      hermes_api_configured: Boolean(config.hermesApiUrl),
    }),
  );
  app.get("/v1/capabilities", () =>
    proxyHermes(config, "GET", "/v1/capabilities"),
  );
  app.get("/api/model/options", () => modelOptionsResponse(config));

  app.get("/api/sessions", (context) =>
    proxySessionRequest(config, "GET", "/api/sessions", context.req.raw),
  );
  app.post("/api/sessions", async (context) =>
    proxySessionRequest(
      config,
      "POST",
      "/api/sessions",
      context.req.raw,
      await safeJsonBody(context.req.raw),
    ),
  );
  app.get("/api/sessions/:sessionId", (context) =>
    proxySessionRequest(
      config,
      "GET",
      sessionPath(context.req.param("sessionId")),
      context.req.raw,
    ),
  );
  app.patch("/api/sessions/:sessionId", async (context) =>
    proxySessionRequest(
      config,
      "PATCH",
      sessionPath(context.req.param("sessionId")),
      context.req.raw,
      await safeJsonBody(context.req.raw),
    ),
  );
  app.delete("/api/sessions/:sessionId", async (context) => {
    const sessionId = context.req.param("sessionId");
    return deleteSession(config, sessionId, context.req.raw, attachments);
  });
  app.get("/api/sessions/:sessionId/messages", (context) =>
    getSessionMessages(
      config,
      context.req.param("sessionId"),
      context.req.raw,
      attachments,
    ),
  );
  app.post("/api/sessions/:sessionId/model", async (context) =>
    proxySessionRequest(
      config,
      "POST",
      sessionPath(context.req.param("sessionId"), "/model"),
      context.req.raw,
      await safeJsonBody(context.req.raw),
    ),
  );
  app.post("/api/sessions/:sessionId/chat/stream", (context) =>
    streamSessionChat(
      config,
      context.req.param("sessionId"),
      context.req.raw,
      attachments,
    ),
  );
  app.get("/api/sessions/:sessionId/chat/stream", (context) =>
    resumeActiveStream(context.req.param("sessionId")),
  );
  app.post("/api/sessions/:sessionId/chat/cancel", async (context) =>
    context.json({
      status: (await cancelActiveStream(context.req.param("sessionId")))
        ? "cancelled"
        : "not_found",
    }),
  );

  app.get("/api/push/vapid-public-key", () =>
    notificationRoutes.vapidPublicKey(config),
  );
  app.post("/api/push/presence", async (context) =>
    notificationRoutes.presence(await safeJsonBody(context.req.raw)),
  );
  app.post("/api/push/subscribe", async (context) =>
    notificationRoutes.subscribe(config, await safeJsonBody(context.req.raw)),
  );
  app.post("/api/push/unsubscribe", async (context) =>
    notificationRoutes.unsubscribe(config, await safeJsonBody(context.req.raw)),
  );
  app.post("/api/push/send", async (context) =>
    notificationRoutes.send(
      config,
      context.req.header("Authorization") ?? "",
      await safeJsonBody(context.req.raw),
    ),
  );
  app.post("/api/proactive/messages", async (context) =>
    createProactiveMessage(
      config,
      context.req.header("Authorization") ?? "",
      await safeJsonBody(context.req.raw),
    ),
  );

  app.get("/api/attachments/:blobId", async (context) => {
    const blob = await attachments.readBlob(context.req.param("blobId"));
    if (!blob) return context.json({ detail: "Not Found" }, 404);
    return new Response(new Uint8Array(blob.bytes), {
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Length": String(blob.bytes.length),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.all("/api/*", apiNotFound);
  app.all("/v1/*", apiNotFound);
  app.use("*", serveStatic({ root: config.staticDir }));
  app.get("*", async (context) => {
    const accept = context.req.header("Accept") ?? "";
    if (!accept.includes("text/html")) return context.notFound();
    try {
      return context.html(
        await readFile(path.join(config.staticDir, "index.html"), "utf8"),
      );
    } catch {
      return context.text("UI assets are unavailable", 503);
    }
  });
  return app;
};
