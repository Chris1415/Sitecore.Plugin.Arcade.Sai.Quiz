/* Shared leaderboard API — backed by Vercel KV / Upstash Redis over its REST API.
 *
 * GET  /api/leaderboard        -> { ok, configured, entries[] }   (top 12, score desc)
 * POST /api/leaderboard {name,score,correct,total,difficulty,track}
 *                              -> { ok, configured, id, entries[] }
 *
 * If no KV store is connected (no env vars), both routes return `configured:false`
 * and the client falls back to its localStorage board — so the app still runs with
 * zero setup. Connect a Vercel KV store (or any Upstash Redis) to make it global.
 *
 * Storage model: a single Redis sorted set keyed by score; each member is the
 * entry JSON. ZRANGE … REV reads the top scores; we trim to the top 100.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // holds the REST token; KV/Upstash live off the Edge

const KEY = "sai-quiz:leaderboard";
const TOP_N = 12;
const KEEP = 100;

// Vercel KV injects KV_REST_API_*; a raw Upstash store uses UPSTASH_REDIS_REST_*.
const REST_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

function configured(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

interface Entry {
  id: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  difficulty: string;
  track: string;
  ts: number;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REST_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV REST ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function topEntries(): Promise<Entry[]> {
  const members = (await redis(["ZRANGE", KEY, 0, TOP_N - 1, "REV"])) as string[] | null;
  if (!Array.isArray(members)) return [];
  return members
    .map((m) => {
      try {
        return JSON.parse(m) as Entry;
      } catch {
        return null;
      }
    })
    .filter((e): e is Entry => e !== null);
}

export async function GET() {
  if (!configured()) {
    return NextResponse.json({ ok: false, configured: false, entries: [] });
  }
  try {
    return NextResponse.json({ ok: true, configured: true, entries: await topEntries() });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, entries: [], error: String(err) });
  }
}

export async function POST(req: Request) {
  if (!configured()) {
    return NextResponse.json({ ok: false, configured: false });
  }
  try {
    const body = (await req.json()) as Partial<Entry>;

    const name = String(body.name ?? "").trim().slice(0, 24);
    if (!name) {
      return NextResponse.json({ ok: false, configured: true, error: "name required" }, { status: 400 });
    }
    const num = (v: unknown, max: number) =>
      Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

    const entry: Entry = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
      name,
      score: num(body.score, 10_000_000),
      correct: num(body.correct, 1000),
      total: num(body.total, 1000),
      difficulty: String(body.difficulty ?? "").slice(0, 12),
      track: String(body.track ?? "").slice(0, 12),
      ts: Date.now(),
    };

    await redis(["ZADD", KEY, entry.score, JSON.stringify(entry)]);
    await redis(["ZREMRANGEBYRANK", KEY, 0, -(KEEP + 1)]); // keep the top KEEP scores

    return NextResponse.json({ ok: true, configured: true, id: entry.id, entries: await topEntries() });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, error: String(err) });
  }
}
