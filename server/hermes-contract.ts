// Browser-safe API schemas shared by the chat client and deployment diagnostics.
// Keep this module free of Node APIs, server configuration, and credentials.
import { z } from "zod";

export const ModelOptionsSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  reasoning_efforts: z.array(z.string()).nullish(),
  reasoning_unconfirmed_efforts: z.array(z.string()).nullish(),
  reasoning_defaults: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  providers: z.array(
    z.object({
      slug: z.string(),
      name: z.string().optional(),
      models: z.array(z.string()).optional(),
      capabilities: z
        .record(z.string(), z.object({ reasoning: z.boolean().optional() }))
        .optional(),
    }),
  ),
});

export const SessionSchema = z.object({
  id: z.string(),
  source: z.string().nullish(),
  model: z.string().nullish(),
  title: z.string().nullish(),
  started_at: z.number().nullish(),
  last_active: z.number().nullish(),
  message_count: z.number().optional(),
  parent_session_id: z.string().nullish(),
  pinned: z.boolean().optional(),
});

export const SessionsResponseSchema = z.object({
  data: z.array(SessionSchema),
  has_more: z.boolean(),
});

export const SessionEnvelopeSchema = z.object({
  session: SessionSchema,
});

export const SessionMessageSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.unknown().nullish(),
  reasoning: z.string().nullish(),
  reasoning_content: z.string().nullish(),
  tool_calls: z.unknown().nullish(),
  timestamp: z.number().nullish(),
});

export const SessionMessagesSchema = z.object({
  session_id: z.string(),
  data: z.array(SessionMessageSchema),
  pagination: z
    .object({
      limit: z.number(),
      offset: z.number(),
      order: z.string(),
      returned: z.number(),
    })
    .optional(),
});

export const CapabilitiesSchema = z.object({
  features: z.object({
    session_resources: z.literal(true),
    session_chat: z.literal(true),
    session_chat_streaming: z.literal(true),
    model_options: z.literal(true),
    session_model_lock: z.literal(true),
  }),
  endpoints: z.object({
    sessions: z.object({ path: z.string() }),
    session_create: z.object({ path: z.string() }),
    session_delete: z.object({ path: z.string() }),
    session_messages: z.object({ path: z.string() }),
    session_chat_stream: z.object({ path: z.string() }),
    model_options: z.object({ path: z.string() }),
    session_model_lock: z.object({ path: z.string() }),
  }),
});
