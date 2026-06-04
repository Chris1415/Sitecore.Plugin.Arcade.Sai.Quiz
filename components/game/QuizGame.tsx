/* Sitecorex SAI Quiz — the game.
 * A pixel-arcade trivia engine that mixes LIVE tenant questions (read via the
 * Marketplace SDK) with curated Sitecore trivia. Runs standalone on sample data
 * and lights up with real data when embedded in the Cloud Portal.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot, type Mood } from "./Mascot";
import { Sound } from "@/lib/arcade/audio";
import { CURATED_QUESTIONS } from "@/lib/arcade/curated";
import {
  buildTenantQuestions,
  fetchTenantSnapshot,
} from "@/lib/arcade/tenant-source";
import {
  BASE_POINTS_BY_DIFFICULTY,
  type DifficultyFilter,
  type Question,
  type TenantSnapshot,
} from "@/lib/arcade/types";
import { addEntry, loadLeaderboard, type LeaderEntry } from "@/lib/arcade/leaderboard";
import { useOptionalMarketplace } from "@/lib/arcade/useOptionalMarketplace";

const QUESTIONS_PER_ROUND = 10;
const TIME_PER_Q = 15;
const TIME_BONUS_MAX = 100;
const MAX_TENANT_QUESTIONS = 4;

/** Track = the Fun vs Serious split. Serious = the four real Sitecore topics. */
type Track = "mixed" | "fun" | "serious";

const TRACKS: { id: Track; label: string }[] = [
  { id: "mixed", label: "MIXED" },
  { id: "fun", label: "FUN" },
  { id: "serious", label: "SERIOUS" },
];
const DIFFICULTIES: { id: DifficultyFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "easy", label: "EASY" },
  { id: "medium", label: "MEDIUM" },
  { id: "hard", label: "HARD" },
];

function inTrack(q: Question, track: Track): boolean {
  if (track === "mixed") return true;
  if (track === "fun") return q.topic === "Fun";
  return q.topic !== "Fun"; // serious
}

function filterPool(all: Question[], track: Track, difficulty: DifficultyFilter): Question[] {
  return all.filter((q) => inTrack(q, track) && (difficulty === "all" || q.difficulty === difficulty));
}

/**
 * Build the playable pool for a track + difficulty, with graceful fallbacks so a
 * thin or empty cell never strands the player on an empty deck.
 */
function buildPool(track: Track, difficulty: DifficultyFilter, tenantQs: Question[]): Question[] {
  const all = [...tenantQs, ...CURATED_QUESTIONS];
  let pool = filterPool(all, track, difficulty);
  if (pool.length === 0) pool = filterPool(all, track, "all"); // drop difficulty
  if (pool.length === 0) pool = filterPool(all, "mixed", difficulty); // drop track
  if (pool.length === 0) pool = all.slice();
  return pool;
}

const HOST_PROMPTS = [
  "Here's one for you…",
  "Ooh, a good one!",
  "Let's see what you've got.",
  "Quick — clock's ticking!",
  "You know this one.",
];
const HOST_RIGHT = ["Nailed it! 🎉", "Yes! Spot on.", "Sitecore wizard!", "Too easy!", "On fire! 🔥"];
const HOST_WRONG = ["Ah, not quite…", "Tricky one!", "So close!", "Next time!", "Don't sweat it."];

type Phase = "splash" | "title" | "quiz" | "results" | "leaderboard";

interface Reveal {
  scoreNote: string | null;
  good: boolean;
  fact: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function multiplierFromStreak(s: number): number {
  if (s >= 6) return 3;
  if (s >= 4) return 2;
  if (s >= 2) return 1.5;
  return 1;
}

function gradeFor(pct: number): { g: string; title: string; mood: Mood } {
  if (pct >= 0.9) return { g: "S", title: "Sitecore Legend!", mood: "happy" };
  if (pct >= 0.75) return { g: "A", title: "Content Champion!", mood: "happy" };
  if (pct >= 0.5) return { g: "B", title: "Solid Editor.", mood: "host" };
  if (pct >= 0.3) return { g: "C", title: "Keep Practising!", mood: "idle" };
  return { g: "D", title: "Back to the Docs!", mood: "sad" };
}

export function QuizGame() {
  const mkt = useOptionalMarketplace();

  const [tenantSnap, setTenantSnap] = useState<TenantSnapshot | null>(null);
  const [tenantQs, setTenantQs] = useState<Question[]>([]);

  const [phase, setPhase] = useState<Phase>("splash");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [muted, setMuted] = useState(false);
  const [track, setTrack] = useState<Track>("mixed");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");

  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [myEntryId, setMyEntryId] = useState<string | null>(null);

  const [deck, setDeck] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [shownOptions, setShownOptions] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [mood, setMood] = useState<Mood>("host");
  const [speech, setSpeech] = useState("Let's play!");

  const timeLeftRef = useRef(TIME_PER_Q);
  const timerRef = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  // ---- tenant data (sample standalone, live in portal) ----
  useEffect(() => {
    if (mkt.status === "connecting") return;
    let cancelled = false;
    fetchTenantSnapshot(mkt.client, mkt.appContext).then((snap) => {
      if (cancelled) return;
      setTenantSnap(snap);
      setTenantQs(buildTenantQuestions(snap, MAX_TENANT_QUESTIONS));
    });
    return () => {
      cancelled = true;
    };
  }, [mkt.status, mkt.client, mkt.appContext]);

  // ---- splash: wait for the player ("press any key to continue") ----
  // Advancing here is the first user gesture, so it's also where we play the
  // brand S-chime (audio is blocked until a gesture).
  const continueFromSplash = useCallback(() => {
    Sound.resume();
    Sound.chime();
    setPhase("title");
  }, []);

  // ---- theme + mute side effects ----
  useEffect(() => {
    Sound.setMuted(muted);
  }, [muted]);

  // ---- timer (refs/DOM only; setState happens async via the interval) ----
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const bar = barRef.current;
    if (bar) {
      const w = window.getComputedStyle(bar).width;
      bar.style.transition = "none";
      bar.style.width = w;
    }
  }, []);

  const handleTimeout = useCallback(() => {
    Sound.timeout();
    setAnswered(true);
    setStreak(0);
    setMood("sad");
    setSpeech("Out of time! ⏱");
    setReveal({ scoreNote: "Time's up — no points", good: false, fact: deck[idx]?.fact ?? "" });
  }, [deck, idx]);

  const startTimer = useCallback(() => {
    timeLeftRef.current = TIME_PER_Q;
    const bar = barRef.current;
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      bar.classList.remove("danger");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!barRef.current) return;
          barRef.current.style.transition = `width ${TIME_PER_Q}s linear`;
          barRef.current.style.width = "0%";
        }),
      );
    }
    let tickAccum = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      timeLeftRef.current -= 0.1;
      if (timeLeftRef.current <= 5 && barRef.current && !barRef.current.classList.contains("danger")) {
        barRef.current.classList.add("danger");
      }
      tickAccum += 0.1;
      if (timeLeftRef.current <= 5 && tickAccum >= 1) {
        tickAccum = 0;
        Sound.tick();
      }
      if (timeLeftRef.current <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        handleTimeout();
      }
    }, 100);
  }, [handleTimeout]);

  useEffect(() => {
    if (phase !== "quiz") return;
    if (!deck[idx]) return;
    startTimer();
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  // ---- question presentation (called from handlers, not effects) ----
  const present = useCallback((d: Question[], i: number) => {
    const q = d[i];
    const pairs = q.options.map((text, k) => ({ text, correct: k === q.answer }));
    const sh = shuffle(pairs);
    setCorrectIndex(sh.findIndex((p) => p.correct));
    setShownOptions(sh.map((p) => p.text));
    setAnswered(false);
    setChosen(null);
    setReveal(null);
    setMood("host");
    setSpeech(pick(HOST_PROMPTS));
    setIdx(i);
  }, []);

  const startGame = useCallback(() => {
    Sound.resume();
    const pool = buildPool(track, difficulty, tenantQs);
    const tq = pool.filter((q) => q.source === "tenant").slice(0, MAX_TENANT_QUESTIONS);
    const rest = shuffle(pool.filter((q) => q.source !== "tenant"));
    const needed = Math.max(0, QUESTIONS_PER_ROUND - tq.length);
    const newDeck = shuffle([...tq, ...rest.slice(0, needed)]).slice(0, QUESTIONS_PER_ROUND);
    setDeck(newDeck);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    Sound.start();
    setPhase("quiz");
    present(newDeck, 0);
  }, [track, difficulty, tenantQs, present]);

  const answer = useCallback(
    (choice: number) => {
      if (answered) return;
      setAnswered(true);
      setChosen(choice);
      stopTimer();
      Sound.select();

      const q = deck[idx];
      const correct = choice === correctIndex;
      if (correct) {
        const mult = multiplierFromStreak(streak);
        const base = BASE_POINTS_BY_DIFFICULTY[q.difficulty];
        const timeBonus = Math.round((Math.max(0, timeLeftRef.current) / TIME_PER_Q) * TIME_BONUS_MAX);
        const gained = Math.round((base + timeBonus) * mult);
        setScore((v) => v + gained);
        setCorrectCount((v) => v + 1);
        setStreak((v) => {
          const ns = v + 1;
          setBestStreak((b) => Math.max(b, ns));
          return ns;
        });
        setMood("happy");
        setSpeech(pick(HOST_RIGHT));
        Sound.correct();
        setReveal({
          scoreNote: `+${gained} pts${mult > 1 ? `  (×${mult} streak!)` : ""}`,
          good: true,
          fact: q.fact,
        });
      } else {
        setStreak(0);
        setMood("sad");
        setSpeech(pick(HOST_WRONG));
        Sound.wrong();
        setReveal({ scoreNote: null, good: false, fact: q.fact });
      }
    },
    [answered, deck, idx, correctIndex, streak, stopTimer],
  );

  const next = useCallback(() => {
    const nextIdx = idx + 1;
    if (nextIdx >= deck.length) {
      setSubmitted(false);
      setPlayerName("");
      setMyEntryId(null);
      setPhase("results");
      Sound.fanfare();
    } else {
      present(deck, nextIdx);
    }
  }, [idx, deck, present]);

  // ---- quit / leaderboard ----
  const quitToTitle = useCallback(() => {
    stopTimer();
    Sound.select();
    setPhase("title");
  }, [stopTimer]);

  const saveScore = useCallback(() => {
    const name = playerName.trim().slice(0, 24);
    if (!name) return;
    const { id, board } = addEntry({
      name,
      score,
      correct: correctCount,
      total: deck.length,
      difficulty,
      track,
    });
    setLeaderboard(board.slice(0, 12));
    setMyEntryId(id);
    setSubmitted(true);
    Sound.correct();
  }, [playerName, score, correctCount, deck.length, difficulty, track]);

  const viewLeaderboard = useCallback(() => {
    setLeaderboard(loadLeaderboard().slice(0, 12));
    setMyEntryId(null);
    Sound.select();
    setPhase("leaderboard");
  }, []);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "splash") {
        // Any key advances — but ignore lone modifier presses.
        if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
        e.preventDefault();
        continueFromSplash();
      } else if (phase === "title" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        startGame();
      } else if (phase === "results" && submitted && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        startGame();
      } else if (phase === "leaderboard" && (e.key === "Enter" || e.key === " " || e.key === "Escape")) {
        e.preventDefault();
        setPhase("title");
      } else if (phase === "quiz") {
        if (e.key === "Escape") {
          quitToTitle();
        } else if (!answered && ["1", "2", "3", "4"].includes(e.key)) {
          const i = Number(e.key) - 1;
          if (i < shownOptions.length) answer(i);
        } else if (answered && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          next();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answered, submitted, shownOptions.length, startGame, answer, next, quitToTitle, continueFromSplash]);

  // arm audio on first pointer interaction (autoplay policy)
  useEffect(() => {
    const arm = () => {
      Sound.resume();
      window.removeEventListener("pointerdown", arm);
    };
    window.addEventListener("pointerdown", arm);
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  // ---- derived ----
  const mult = multiplierFromStreak(streak);
  const q = deck[idx];
  const live = tenantSnap?.live ?? false;
  const connClass = mkt.status === "connecting" ? "connecting" : live ? "live" : "";
  const connText =
    mkt.status === "connecting"
      ? "Connecting…"
      : live
        ? `Live: ${tenantSnap?.sourceLabel}`
        : "Sample tenant";

  const grade = gradeFor(deck.length ? correctCount / deck.length : 0);
  const availableCount = Math.min(QUESTIONS_PER_ROUND, buildPool(track, difficulty, tenantQs).length);

  const renderLeaderboard = (entries: LeaderEntry[], highlightId: string | null) =>
    entries.length === 0 ? (
      <div className="arcade-lb-empty">No scores yet — be the first to finish a round!</div>
    ) : (
      <ol className="arcade-lb">
        {entries.map((e, i) => (
          <li key={e.id} className={`arcade-lb-row${e.id === highlightId ? " me" : ""}`}>
            <span className="arcade-lb-rank">{i + 1}</span>
            <span className="arcade-lb-name">{e.name}</span>
            <span className="arcade-lb-meta">
              {e.correct}/{e.total} · {e.track} · {e.difficulty}
            </span>
            <span className="arcade-lb-score">{e.score}</span>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="arcade-root" data-arcade-theme={theme}>
      <div className="arcade-crt" aria-hidden />

      <header className="arcade-topbar">
        <div className="arcade-wordmark">
          <span className="arcade-red-ink">S</span>ITECORE <span className="arcade-red-ink">A</span>RCADE
        </div>
        <div className="arcade-topbar-right">
          {phase === "quiz" && (
            <button
              className="arcade-chip wide"
              onClick={quitToTitle}
              aria-label="Quit to start"
              title="Quit to start (Esc)"
            >
              ⤺ QUIT
            </button>
          )}
          <span className={`arcade-conn ${connClass}`} title="Tenant data source">
            <span className="dot" />
            <span className="label-text">{connText}</span>
          </span>
          <button
            className="arcade-chip"
            onClick={() => {
              setMuted((m) => !m);
              if (muted) Sound.select();
            }}
            aria-label="Toggle sound"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="arcade-chip"
            onClick={() => {
              setTheme((t) => (t === "dark" ? "light" : "dark"));
              Sound.select();
            }}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      <main className="arcade-stage">
        {phase === "splash" && (
          <section className="arcade-screen arcade-center">
            <div className="arcade-mascot arcade-splash-mascot bob">
              <Mascot mood="idle" />
            </div>
            <div className="arcade-splash-word">
              <span className="arcade-red-ink">S</span>ITECORE <span className="arcade-red-ink">A</span>RCADE
            </div>
            <div className="arcade-tag">Play with your tenant.</div>
            <button className="arcade-press-key" onClick={continueFromSplash} type="button">
              ▸ Press any key to continue
            </button>
          </section>
        )}

        {phase === "title" && (
          <section className="arcade-screen arcade-center">
            <div className="arcade-mascot arcade-title-mascot bob">
              <Mascot mood="host" />
            </div>
            <h1 className="arcade-game-title">
              SITECOREX
              <br />
              <span className="arcade-title-accent">SAI QUIZ</span>
            </h1>
            <p className="arcade-sub">
              {availableCount} questions ·{" "}
              {track === "fun" ? "Fun" : track === "serious" ? "Serious" : "Mixed"} ·{" "}
              {difficulty === "all" ? "All levels" : difficulty[0].toUpperCase() + difficulty.slice(1)}
              {live && (
                <>
                  {" "}
                  · live data from <strong>{tenantSnap?.sourceLabel}</strong>
                </>
              )}
            </p>

            <div className="arcade-pickers">
              <div className="arcade-pick-group">
                <span className="arcade-pick-label">TRACK</span>
                <div className="arcade-seg">
                  {TRACKS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`arcade-seg-btn ${track === t.id ? "sel" : ""}`}
                      onClick={() => {
                        setTrack(t.id);
                        Sound.select();
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="arcade-pick-group">
                <span className="arcade-pick-label">DIFFICULTY</span>
                <div className="arcade-seg">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`arcade-seg-btn ${difficulty === d.id ? "sel" : ""}`}
                      onClick={() => {
                        setDifficulty(d.id);
                        Sound.select();
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="arcade-title-actions">
              <button className="arcade-btn primary" onClick={startGame}>
                ▶ START GAME
              </button>
              <button className="arcade-btn small" onClick={viewLeaderboard} type="button">
                🏆 LEADERBOARD
              </button>
            </div>
            <p className="arcade-hint">
              Keys <span className="arcade-kbd">1</span>–<span className="arcade-kbd">4</span> to answer · harder = more
              points
              {tenantQs.length > 0 && (
                <>
                  {" "}
                  · <span style={{ color: "var(--arcade-mint)" }}>{tenantQs.length} tenant questions ready</span>
                </>
              )}
            </p>
          </section>
        )}

        {phase === "quiz" && q && (
          <section className="arcade-screen">
            <div className="arcade-hud">
              <div className="arcade-hud-cell">
                <span className="arcade-hud-label">QUESTION</span>
                <span className="arcade-hud-value">
                  {idx + 1}
                  <span className="arcade-hud-dim">/{deck.length}</span>
                </span>
              </div>
              <div className="arcade-hud-cell arcade-hud-streak">
                <span className="arcade-hud-label">STREAK</span>
                <span className="arcade-hud-value">
                  {streak}
                  <span className={`arcade-mult ${mult > 1 ? "hot" : ""}`}>{mult > 1 ? `×${mult}` : ""}</span>
                </span>
              </div>
              <div className="arcade-hud-cell arcade-hud-score">
                <span className="arcade-hud-label">SCORE</span>
                <span className="arcade-hud-value">{score}</span>
              </div>
            </div>

            <div className="arcade-timer-track" aria-hidden>
              <div className="arcade-timer-bar" ref={barRef} />
            </div>

            <div className="arcade-quiz-body">
              <div className="arcade-quiz-host">
                <div className="arcade-mascot arcade-quiz-mascot">
                  <Mascot mood={mood} />
                </div>
                <div className="arcade-speech">{speech}</div>
              </div>

              <div>
                <div className="arcade-tags">
                  <span className="arcade-pill cat">{q.topic}</span>
                  <span className={`arcade-pill diff-${q.difficulty}`}>{q.difficulty.toUpperCase()}</span>
                  {q.source === "tenant" && <span className="arcade-pill tenant">● from SDK</span>}
                </div>
                <h2 className="arcade-question">{q.q}</h2>
                <div className="arcade-options">
                  {shownOptions.map((opt, i) => {
                    const isCorrect = answered && i === correctIndex;
                    const isWrong = answered && i === chosen && chosen !== correctIndex;
                    return (
                      <button
                        key={i}
                        className={`arcade-option${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
                        disabled={answered}
                        onClick={() => answer(i)}
                        type="button"
                      >
                        <span className="arcade-option-key">{i + 1}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {answered && reveal && (
                  <div className="arcade-reveal">
                    {reveal.scoreNote && (
                      <div className={`arcade-reveal-points ${reveal.good ? "good" : "bad"}`}>{reveal.scoreNote}</div>
                    )}
                    <div className="arcade-reveal-text">{reveal.fact}</div>
                    <button className="arcade-btn" onClick={next} type="button">
                      {idx + 1 >= deck.length ? "SEE RESULTS →" : "NEXT →"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {phase === "results" && (
          <section className="arcade-screen arcade-center">
            <div className="arcade-mascot arcade-title-mascot">
              <Mascot mood={grade.mood} />
            </div>
            <div className="arcade-grade" data-grade={grade.g}>
              {grade.g}
            </div>
            <h2 className="arcade-results-title">{grade.title}</h2>
            <p className="arcade-results-score">
              You scored <strong>{score}</strong> points
            </p>
            <div className="arcade-results-stats">
              <div>
                <span>
                  {correctCount}/{deck.length}
                </span>
                <small>correct</small>
              </div>
              <div>
                <span>{bestStreak}</span>
                <small>best streak</small>
              </div>
              <div>
                <span>{deck.length ? Math.round((correctCount / deck.length) * 100) : 0}%</span>
                <small>accuracy</small>
              </div>
            </div>

            {!submitted ? (
              <div className="arcade-name-form">
                <label className="arcade-name-label" htmlFor="player-name">
                  Enter your name for the leaderboard
                </label>
                <div className="arcade-name-row">
                  <input
                    id="player-name"
                    className="arcade-input"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveScore();
                      }
                    }}
                    placeholder="AAA"
                    maxLength={24}
                    autoComplete="off"
                  />
                  <button
                    className="arcade-btn small primary"
                    onClick={saveScore}
                    type="button"
                    disabled={!playerName.trim()}
                  >
                    SAVE SCORE
                  </button>
                </div>
              </div>
            ) : (
              <div className="arcade-lb-wrap">
                <div className="arcade-lb-title">🏆 LEADERBOARD</div>
                {renderLeaderboard(leaderboard, myEntryId)}
              </div>
            )}

            <div className="arcade-title-actions">
              <button className="arcade-btn primary" onClick={startGame} type="button">
                ↻ PLAY AGAIN
              </button>
              {!submitted && (
                <button className="arcade-btn small" onClick={viewLeaderboard} type="button">
                  🏆 LEADERBOARD
                </button>
              )}
            </div>
            <p className="arcade-results-footer">
              {live
                ? `Powered by live data from ${tenantSnap?.sourceLabel}.`
                : "Running on sample data — connect a tenant in the Cloud Portal to play with yours."}
            </p>
          </section>
        )}

        {phase === "leaderboard" && (
          <section className="arcade-screen arcade-center">
            <div className="arcade-mascot arcade-title-mascot bob">
              <Mascot mood="happy" />
            </div>
            <h2 className="arcade-results-title">🏆 LEADERBOARD</h2>
            <p className="arcade-results-score">Top scores on this device</p>
            <div className="arcade-lb-wrap">{renderLeaderboard(leaderboard, myEntryId)}</div>
            <button className="arcade-btn primary" onClick={() => setPhase("title")} type="button">
              ← BACK
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
