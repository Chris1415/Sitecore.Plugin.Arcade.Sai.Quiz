/* Sitecorex SAI Quiz — shared types for the hybrid (tenant + curated) quiz engine. */

export type QuestionSource = "curated" | "tenant";

export type Difficulty = "easy" | "medium" | "hard";

/** Difficulty the player can filter the round by ("all" = no filter). */
export type DifficultyFilter = "all" | Difficulty;

export type Topic =
  | "General Sitecore"
  | "SitecoreAI"
  | "Marketplace SDK"
  | "Content SDK"
  | "Fun";

export interface Question {
  /** stable id, used as React key */
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  q: string;
  /** answer options as authored — the engine shuffles them at render time */
  options: string[];
  /** index into `options` of the correct answer */
  answer: number;
  /** one-line payoff shown after answering */
  fact: string;
  source: QuestionSource;
}

/** Base points awarded for a correct answer, before time bonus + streak multiplier. */
export const BASE_POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 100,
  medium: 150,
  hard: 200,
};

/** A single site as the game cares about it. */
export interface TenantSite {
  name: string;
  displayName: string;
  pageCount: number;
  language: string;
}

/**
 * The slice of tenant state the quiz needs. Produced either from the live
 * Marketplace SDK (`live: true`) or from bundled sample data (`live: false`).
 */
export interface TenantSnapshot {
  live: boolean;
  /** human label for where the data came from, e.g. "Sample tenant" or a tenant display name */
  sourceLabel: string;
  sites: TenantSite[];
  languages: string[];
}
