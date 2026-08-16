import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { readJsonFile, writeJsonFileAtomic } from "./files.js";

const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;
const MAX_GROUP_BYTES = 10 * 1024 * 1024;
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BLOB_ID_PATTERN = /^[a-f0-9]{32}$/;
const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

type MessageRow = Record<string, unknown>;
type AttachmentRecord = {
  id: string;
  sessionId: string;
  messageId: string | null;
  groupId: string;
  originalText?: string;
  mimeType: string;
  size: number;
  position: number;
  createdAt: number;
};
type PendingGroup = {
  id: string;
  sessionId: string;
  attachmentIds: string[];
  baselineIds: string[];
  text: string;
  createdAt: number;
};
type AttachmentIndex = {
  version: 1;
  attachments: Record<string, AttachmentRecord>;
  pendingGroups: Record<string, PendingGroup>;
};

const AttachmentRecordSchema = z.object({
  id: z.string().regex(BLOB_ID_PATTERN),
  sessionId: z.string(),
  messageId: z.string().nullable(),
  groupId: z.string().regex(BLOB_ID_PATTERN),
  originalText: z.string().optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
  position: z.number().int().nonnegative(),
  createdAt: z.number(),
});
const PendingGroupSchema = z.object({
  id: z.string().regex(BLOB_ID_PATTERN),
  sessionId: z.string(),
  attachmentIds: z.array(z.string().regex(BLOB_ID_PATTERN)),
  baselineIds: z.array(z.string()),
  text: z.string(),
  createdAt: z.number(),
});
const AttachmentIndexSchema = z.object({
  version: z.literal(1),
  attachments: z.record(z.string(), AttachmentRecordSchema),
  pendingGroups: z.record(z.string(), PendingGroupSchema),
});

const emptyIndex = (): AttachmentIndex => ({
  version: 1,
  attachments: {},
  pendingGroups: {},
});

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const messageText = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      const record = asObject(part);
      return record?.type === "text" && typeof record.text === "string"
        ? [record.text]
        : [];
    })
    .join("\n")
    .trim();
};

const validImageSignature = (mimeType: string, bytes: Buffer): boolean => {
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mimeType === "image/png") {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/gif") {
    return ["GIF87a", "GIF89a"].includes(
      bytes.subarray(0, 6).toString("ascii"),
    );
  }
  return (
    mimeType === "image/webp" &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
};

const decodeImage = (url: string): { mimeType: string; bytes: Buffer } => {
  const match = DATA_URL_PATTERN.exec(url);
  if (!match) throw new Error("invalid_attachment_data_url");
  const [, mimeType, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    bytes.toString("base64").replace(/=+$/, "") !==
      encoded.replace(/=+$/, "") ||
    !validImageSignature(mimeType, bytes)
  ) {
    throw new Error("invalid_attachment_content");
  }
  return { mimeType, bytes };
};

const extractImages = (
  payload: unknown,
): { images: Array<{ mimeType: string; bytes: Buffer }>; text: string } => {
  const record = asObject(payload);
  const message = record?.message;
  if (!Array.isArray(message))
    return { images: [], text: messageText(message) };
  const images = message.flatMap((part) => {
    const item = asObject(part);
    const imageUrl = asObject(item?.image_url);
    return item?.type === "image_url" && typeof imageUrl?.url === "string"
      ? [decodeImage(imageUrl.url)]
      : [];
  });
  if (
    images.reduce((total, image) => total + image.bytes.length, 0) >
    MAX_GROUP_BYTES
  ) {
    throw new Error("attachment_group_too_large");
  }
  return { images, text: messageText(message) };
};

const parseIndex = (payload: unknown): AttachmentIndex => {
  const parsed = AttachmentIndexSchema.safeParse(payload);
  return parsed.success ? parsed.data : emptyIndex();
};

export class AttachmentStore {
  private operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly config: ServerConfig) {}

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release: () => void = () => undefined;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async loadIndex(): Promise<AttachmentIndex> {
    return parseIndex(
      await readJsonFile<unknown>(
        this.config.attachmentsIndexFile,
        emptyIndex(),
      ),
    );
  }

  private blobPath(blobId: string): string {
    if (!BLOB_ID_PATTERN.test(blobId)) throw new Error("invalid_attachment_id");
    return path.join(this.config.attachmentsDir, blobId);
  }

  private async writeBlobAtomic(blobId: string, bytes: Buffer): Promise<void> {
    await mkdir(this.config.attachmentsDir, { recursive: true });
    const destination = this.blobPath(blobId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async createPending(
    sessionId: string,
    payload: unknown,
    baselineRows: MessageRow[],
  ): Promise<string | undefined> {
    const extracted = extractImages(payload);
    if (extracted.images.length === 0) return undefined;
    return this.exclusive(async () => {
      const index = await this.loadIndex();
      const groupId = randomUUID().replaceAll("-", "");
      const createdAt = Date.now();
      const attachmentIds: string[] = [];
      try {
        for (const [position, image] of extracted.images.entries()) {
          const id = randomUUID().replaceAll("-", "");
          await this.writeBlobAtomic(id, image.bytes);
          attachmentIds.push(id);
          index.attachments[id] = {
            id,
            sessionId,
            messageId: null,
            groupId,
            originalText: extracted.text,
            mimeType: image.mimeType,
            size: image.bytes.length,
            position,
            createdAt,
          };
        }
        index.pendingGroups[groupId] = {
          id: groupId,
          sessionId,
          attachmentIds,
          baselineIds: baselineRows.flatMap((row) =>
            row.id === undefined || row.id === null ? [] : [String(row.id)],
          ),
          text: extracted.text,
          createdAt,
        };
        await writeJsonFileAtomic(this.config.attachmentsIndexFile, index);
        return groupId;
      } catch (error) {
        await Promise.all(
          attachmentIds.map((id) => rm(this.blobPath(id), { force: true })),
        );
        throw error;
      }
    });
  }

  async discardPending(groupId: string): Promise<void> {
    await this.exclusive(async () => {
      const index = await this.loadIndex();
      if (!Object.hasOwn(index.pendingGroups, groupId)) return;
      const group = index.pendingGroups[groupId];
      await Promise.all(
        group.attachmentIds.map((id) => rm(this.blobPath(id), { force: true })),
      );
      for (const id of group.attachmentIds) delete index.attachments[id];
      delete index.pendingGroups[groupId];
      await writeJsonFileAtomic(this.config.attachmentsIndexFile, index);
    });
  }

  async reconcileSession(
    sessionId: string,
    rows: MessageRow[],
  ): Promise<string[]> {
    return this.exclusive(async () => {
      const index = await this.loadIndex();
      const groups = Object.values(index.pendingGroups)
        .filter((group) => group.sessionId === sessionId)
        .sort((left, right) => left.createdAt - right.createdAt);
      let changed = false;
      const boundGroups: string[] = [];
      const claimedMessageIds = new Set<string>();
      for (const group of groups) {
        const baselineIds = new Set(group.baselineIds);
        const candidates = rows.filter(
          (row) =>
            row.role === "user" &&
            row.id !== undefined &&
            row.id !== null &&
            !baselineIds.has(String(row.id)) &&
            !claimedMessageIds.has(String(row.id)),
        );
        const matching = candidates.filter(
          (row) => !group.text || messageText(row.content) === group.text,
        );
        const selected = matching.at(0) ?? candidates.at(0);
        if (!selected) continue;
        const messageId = String(selected.id);
        claimedMessageIds.add(messageId);
        for (const id of group.attachmentIds) {
          if (Object.hasOwn(index.attachments, id)) {
            index.attachments[id].messageId = messageId;
          }
        }
        delete index.pendingGroups[group.id];
        boundGroups.push(group.id);
        changed = true;
      }
      if (changed)
        await writeJsonFileAtomic(this.config.attachmentsIndexFile, index);
      return boundGroups;
    });
  }

  async enrichMessages(sessionId: string, payload: unknown): Promise<unknown> {
    const record = asObject(payload);
    if (!record || !Array.isArray(record.data)) return payload;
    const rows = record.data.filter((row): row is MessageRow =>
      Boolean(asObject(row)),
    );
    await this.reconcileSession(sessionId, rows);
    const index = await this.loadIndex();
    const byMessage = new Map<string, AttachmentRecord[]>();
    for (const attachment of Object.values(index.attachments)) {
      if (attachment.sessionId !== sessionId || !attachment.messageId) continue;
      const group = byMessage.get(attachment.messageId) ?? [];
      group.push(attachment);
      byMessage.set(attachment.messageId, group);
    }
    return {
      ...record,
      data: rows.map((row) => {
        const attachments = byMessage
          .get(String(row.id))
          ?.sort((left, right) => left.position - right.position);
        if (!attachments?.length) return row;
        const contentWithoutImages = Array.isArray(row.content)
          ? row.content.filter((part) => asObject(part)?.type !== "image_url")
          : typeof row.content === "string" && row.content
            ? [{ type: "text", text: row.content }]
            : [];
        const retainedText = attachments.find(
          (attachment) => attachment.originalText !== undefined,
        )?.originalText;
        const textParts =
          retainedText !== undefined
            ? retainedText
              ? [{ type: "text", text: retainedText }]
              : []
            : contentWithoutImages.flatMap((part) => {
                const item = asObject(part);
                if (item?.type !== "text" || typeof item.text !== "string") {
                  return [part];
                }
                const text = item.text
                  .split(/\r?\n/)
                  .filter(
                    (line) => line.trim().toLowerCase() !== "[screenshot]",
                  )
                  .join("\n")
                  .trim();
                return text ? [{ ...item, text }] : [];
              });
        return {
          ...row,
          content: [
            ...textParts,
            ...attachments.map((attachment) => ({
              type: "image_url",
              image_url: {
                url: `/api/attachments/${attachment.id}`,
              },
            })),
          ],
        };
      }),
    };
  }

  async readBlob(
    blobId: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
    if (!BLOB_ID_PATTERN.test(blobId)) return undefined;
    const index = await this.loadIndex();
    if (!Object.hasOwn(index.attachments, blobId)) return undefined;
    const attachment = index.attachments[blobId];
    if (!attachment.messageId) return undefined;
    try {
      return {
        bytes: await readFile(this.blobPath(blobId)),
        mimeType: attachment.mimeType,
      };
    } catch {
      return undefined;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.exclusive(async () => {
      const index = await this.loadIndex();
      const ids = Object.values(index.attachments)
        .filter((attachment) => attachment.sessionId === sessionId)
        .map((attachment) => attachment.id);
      await Promise.all(
        ids.map((id) => rm(this.blobPath(id), { force: true })),
      );
      for (const id of ids) delete index.attachments[id];
      for (const group of Object.values(index.pendingGroups)) {
        if (group.sessionId === sessionId) delete index.pendingGroups[group.id];
      }
      await writeJsonFileAtomic(this.config.attachmentsIndexFile, index);
    });
  }

  async cleanupAbandonedPending(now = Date.now()): Promise<void> {
    const index = await this.loadIndex();
    const expired = Object.values(index.pendingGroups).filter(
      (group) => now - group.createdAt > PENDING_MAX_AGE_MS,
    );
    for (const group of expired) await this.discardPending(group.id);
  }
}
