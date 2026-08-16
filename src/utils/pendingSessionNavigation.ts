export const NAVIGATION_DATABASE = "hermes-chat-badge";
export const NAVIGATION_DATABASE_VERSION = 2;
export const NAVIGATION_STORE = "navigation";
export const NAVIGATION_KEY = "pending-session";
export const NAVIGATION_TARGET_TTL_MS = 15 * 60 * 1000;

export type PendingSessionTarget = {
  sessionId: string;
  clickedAt: number;
};

const openNavigationDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(
      NAVIGATION_DATABASE,
      NAVIGATION_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("state")) {
        database.createObjectStore("state");
      }
      if (!database.objectStoreNames.contains(NAVIGATION_STORE)) {
        database.createObjectStore(NAVIGATION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const isPendingSessionTarget = (
  value: unknown,
): value is PendingSessionTarget => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === "string" &&
    Boolean(record.sessionId) &&
    typeof record.clickedAt === "number" &&
    Number.isFinite(record.clickedAt)
  );
};

export const validPendingSessionTarget = (
  value: unknown,
  now = Date.now(),
): PendingSessionTarget | null => {
  if (
    !isPendingSessionTarget(value) ||
    now - value.clickedAt > NAVIGATION_TARGET_TTL_MS ||
    value.clickedAt > now + 60_000
  ) {
    return null;
  }
  return value;
};

export const clearPendingSessionTarget = async (
  expectedSessionId?: string,
): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  const database = await openNavigationDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(NAVIGATION_STORE, "readwrite");
      const store = transaction.objectStore(NAVIGATION_STORE);
      if (!expectedSessionId) {
        store.delete(NAVIGATION_KEY);
      } else {
        const request = store.get(NAVIGATION_KEY);
        request.onsuccess = () => {
          if (
            isPendingSessionTarget(request.result) &&
            request.result.sessionId === expectedSessionId
          ) {
            store.delete(NAVIGATION_KEY);
          }
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const readPendingSessionTarget = async (
  now = Date.now(),
): Promise<PendingSessionTarget | null> => {
  if (typeof indexedDB === "undefined") return null;
  const database = await openNavigationDatabase();
  let value: unknown;
  try {
    value = await new Promise((resolve, reject) => {
      const request = database
        .transaction(NAVIGATION_STORE, "readonly")
        .objectStore(NAVIGATION_STORE)
        .get(NAVIGATION_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }

  const target = validPendingSessionTarget(value, now);
  if (!target) {
    await clearPendingSessionTarget();
    return null;
  }
  return target;
};
