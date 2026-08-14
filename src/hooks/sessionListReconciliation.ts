import type { Conversation } from "../types";

export const mergeSessions = (
  previous: Conversation[],
  incoming: Conversation[],
  retainedId?: string,
): Conversation[] => {
  const previousById = new Map(
    previous.map((session) => [session.id, session]),
  );
  const incomingIds = new Set(incoming.map((session) => session.id));
  const merged = incoming.map((session) => {
    const existing = previousById.get(session.id);
    if (!existing) return session;

    // Hermes intentionally omits the provider from its public session shape.
    // Once this client has a confirmed provider/model pair, preserve that pair
    // atomically: accepting an upstream model without its provider can route a
    // duplicate model ID through Hermes' unrelated global provider.
    const hasConfirmedClientRuntime = Boolean(
      existing.providerId && existing.modelId,
    );
    return {
      ...session,
      messages: existing.messages,
      modelId: hasConfirmedClientRuntime
        ? existing.modelId
        : session.modelId || existing.modelId,
      providerId: existing.providerId || session.providerId,
      reasoningEffort: hasConfirmedClientRuntime
        ? existing.reasoningEffort
        : session.reasoningEffort || existing.reasoningEffort,
    };
  });
  const retained = retainedId
    ? previous.find(
        (session) => session.id === retainedId && !incomingIds.has(session.id),
      )
    : undefined;
  return retained ? [...merged, retained] : merged;
};
