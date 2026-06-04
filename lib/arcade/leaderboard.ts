/* Dead-simple localStorage leaderboard.
 * Each finished game appends an entry; we keep the top scores sorted by score.
 * No backend — every browser has its own board. Safe to call only on the client.
 */

export interface LeaderEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  difficulty: string;
  track: string;
  ts: number;
}

const KEY = "sai-quiz-leaderboard";
const MAX_STORED = 50;

function makeId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Load all stored entries, newest sort applied (by score desc). Never throws. */
export function loadLeaderboard(): LeaderEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as LeaderEntry[]).slice().sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/**
 * Append a finished-game result and persist (capped to MAX_STORED).
 * Returns { id, board } — the new entry's id (for highlighting) + the sorted board.
 */
export function addEntry(input: Omit<LeaderEntry, "id" | "ts">): { id: string; board: LeaderEntry[] } {
  const entry: LeaderEntry = { ...input, id: makeId(), ts: Date.now() };
  const board = [...loadLeaderboard(), entry].sort((a, b) => b.score - a.score).slice(0, MAX_STORED);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(board));
    } catch {
      /* storage full / blocked — leaderboard is best-effort */
    }
  }
  return { id: entry.id, board };
}
