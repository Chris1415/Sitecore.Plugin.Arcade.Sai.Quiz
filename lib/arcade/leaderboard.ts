/* Leaderboard client.
 *
 * Prefers the SHARED server board (/api/leaderboard, backed by Vercel KV) so
 * everyone sees the same entries. Falls back to a per-browser localStorage board
 * when the server isn't configured or is unreachable — so the game always runs.
 *
 * `source` tells the UI which board it's showing ("server" = global, "local" =
 * this device only).
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

export type BoardSource = "server" | "local";

export interface BoardResult {
  entries: LeaderEntry[];
  source: BoardSource;
  /** id of the just-submitted entry, for highlighting (null when only viewing) */
  myId: string | null;
}

const KEY = "sai-quiz-leaderboard";
const MAX_STORED = 50;
const TOP_N = 12;

function makeId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// ---- localStorage fallback ---------------------------------------------------

function loadLocal(): LeaderEntry[] {
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

function addLocal(input: Omit<LeaderEntry, "id" | "ts">): { id: string; board: LeaderEntry[] } {
  const entry: LeaderEntry = { ...input, id: makeId(), ts: Date.now() };
  const board = [...loadLocal(), entry].sort((a, b) => b.score - a.score).slice(0, MAX_STORED);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(board));
    } catch {
      /* storage full / blocked — best effort */
    }
  }
  return { id: entry.id, board };
}

// ---- shared API --------------------------------------------------------------

interface ApiResponse {
  ok?: boolean;
  configured?: boolean;
  id?: string;
  entries?: LeaderEntry[];
}

/** Read the board: shared server board if available, else the local one. */
export async function fetchBoard(): Promise<BoardResult> {
  try {
    const res = await fetch("/api/leaderboard", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse;
      if (json.ok && json.configured && Array.isArray(json.entries)) {
        return { entries: json.entries.slice(0, TOP_N), source: "server", myId: null };
      }
    }
  } catch {
    /* offline / no server — fall through to local */
  }
  return { entries: loadLocal().slice(0, TOP_N), source: "local", myId: null };
}

/**
 * Submit a finished-game result. Always records it locally (instant + offline),
 * and also POSTs to the shared board; if that succeeds the shared board is
 * returned, otherwise the local board is.
 */
export async function submitScore(input: Omit<LeaderEntry, "id" | "ts">): Promise<BoardResult> {
  const local = addLocal(input);
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse;
      if (json.ok && json.configured && Array.isArray(json.entries)) {
        return { entries: json.entries.slice(0, TOP_N), source: "server", myId: json.id ?? null };
      }
    }
  } catch {
    /* offline / no server — fall through to local */
  }
  return { entries: local.board.slice(0, TOP_N), source: "local", myId: local.id };
}
