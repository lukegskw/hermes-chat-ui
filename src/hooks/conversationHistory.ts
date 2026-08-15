import type { ChatMessage, SessionMessageRow } from "../types";
import { normalizeSessionMessages } from "../utils";

export const HISTORY_PAGE_SIZE = 30;
export const HISTORY_RAW_PAGE_SIZE = 30;

export const prependHistoryRows = (
  current: SessionMessageRow[],
  older: SessionMessageRow[],
): SessionMessageRow[] => {
  const currentIds = new Set(
    current.flatMap((row) =>
      row.id === undefined ? [] : [`${typeof row.id}:${String(row.id)}`],
    ),
  );
  return [
    ...older.filter(
      (row) =>
        row.id === undefined ||
        !currentIds.has(`${typeof row.id}:${String(row.id)}`),
    ),
    ...current,
  ];
};

export const buildHistoryWindow = (
  sessionId: string,
  rows: SessionMessageRow[],
  requestedVisualCount: number,
): {
  messages: ChatMessage[];
  normalizedCount: number;
  visibleCount: number;
} => {
  const normalized = normalizeSessionMessages(sessionId, rows);
  const visibleCount = Math.min(requestedVisualCount, normalized.length);
  return {
    messages: visibleCount === 0 ? [] : normalized.slice(-visibleCount),
    normalizedCount: normalized.length,
    visibleCount,
  };
};

export const hasMoreRawHistory = (
  offset: number,
  returned: number,
  pageSize: number,
  totalRows?: number,
): boolean =>
  typeof totalRows === "number" && totalRows >= 0
    ? offset < totalRows
    : returned === pageSize;
