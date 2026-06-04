/* Tenant data seam.
 *
 * The "sai" in SAI Quiz = SitecoreAI / your tenant. This module turns a slice of
 * the connected XM Cloud tenant into quiz questions ("Which of YOUR sites has the
 * most pages?"). It is the ONE place that touches the Marketplace SDK.
 *
 * Design: MOCK-FIRST. `fetchTenantSnapshot` returns bundled SAMPLE data whenever
 * the SDK isn't connected (standalone dev, or any read failure), so the game
 * always runs. When embedded in the Cloud Portal it reads live data instead.
 *
 * ⚠ Rule 40-sdk-contracts: the `xmc.agent.*` response field shapes below are
 * coded defensively from the catalog (sitecore:marketplace-sdk-xmc). They MUST be
 * verified against node_modules/@sitecore-marketplace-sdk/xmc/dist types and a
 * real tenant before the live path is declared trustworthy. Until then the seam
 * degrades to SAMPLE on any shape mismatch — by design.
 */
import type { ClientSDK, ApplicationContext } from "@sitecore-marketplace-sdk/client";
import type { Question, TenantSite, TenantSnapshot } from "./types";

/** Bundled sample tenant — Sitecore-flavoured, used standalone or on any read failure. */
export const SAMPLE_SNAPSHOT: TenantSnapshot = {
  live: false,
  sourceLabel: "Sample tenant",
  sites: [
    { name: "marketing-site", displayName: "Marketing Site", pageCount: 128, language: "en" },
    { name: "docs-portal", displayName: "Docs Portal", pageCount: 342, language: "en" },
    { name: "careers", displayName: "Careers", pageCount: 47, language: "de" },
    { name: "events", displayName: "Events Hub", pageCount: 89, language: "en" },
    { name: "partner-hub", displayName: "Partner Hub", pageCount: 63, language: "ja" },
  ],
  languages: ["en", "de", "ja", "fr"],
};

type SdkResult = { data?: { data?: unknown } | unknown } | undefined;

/** Unwrap a Mode A xmc.* response (`result.data.data`), tolerating either depth. */
function unwrap(result: SdkResult): unknown {
  if (!result || typeof result !== "object") return undefined;
  const outer = (result as { data?: unknown }).data;
  if (outer && typeof outer === "object" && "data" in (outer as object)) {
    return (outer as { data?: unknown }).data;
  }
  return outer;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/**
 * Read a live snapshot from the tenant, or return SAMPLE_SNAPSHOT on any problem.
 * Never throws.
 */
export async function fetchTenantSnapshot(
  client: ClientSDK | null,
  appContext: ApplicationContext | null,
): Promise<TenantSnapshot> {
  if (!client || !appContext) return SAMPLE_SNAPSHOT;

  try {
    const access = appContext.resourceAccess?.[0];
    const contextId = access?.context?.live ?? access?.context?.preview;
    if (!contextId) return SAMPLE_SNAPSHOT;

    const sitesRes = (await client.query("xmc.agent.sitesGetSitesList", {
      params: { query: { sitecoreContextId: contextId } },
    })) as SdkResult;

    const rawSites = asArray(unwrap(sitesRes));
    if (rawSites.length === 0) return SAMPLE_SNAPSHOT;

    // Cap how many sites we hydrate with page counts (one call each).
    const top = rawSites.slice(0, 6);
    const sites: TenantSite[] = await Promise.all(
      top.map(async (s): Promise<TenantSite> => {
        const name = str(s.name ?? s.siteName ?? s.id, "site");
        const displayName = str(s.displayName ?? s.name ?? name, name);
        const language = str(s.language ?? s.defaultLanguage, "en");
        let pageCount = 0;
        try {
          const pagesRes = (await client.query("xmc.agent.sitesGetAllPagesBySite", {
            params: { path: { siteName: name }, query: { language, sitecoreContextId: contextId } },
          })) as SdkResult;
          pageCount = asArray(unwrap(pagesRes)).length;
        } catch {
          pageCount = 0;
        }
        return { name, displayName, pageCount, language };
      }),
    );

    const withPages = sites.filter((s) => s.pageCount > 0);
    if (withPages.length < 2) return SAMPLE_SNAPSHOT; // not enough signal for good questions

    const languages = Array.from(new Set(sites.map((s) => s.language))).filter(Boolean);
    const label =
      str((access as { tenantDisplayName?: string })?.tenantDisplayName) ||
      str((access as { tenantName?: string })?.tenantName) ||
      "Your tenant";

    return { live: true, sourceLabel: label, sites: withPages, languages: languages.length ? languages : ["en"] };
  } catch {
    return SAMPLE_SNAPSHOT;
  }
}

// ---- question generation from a snapshot -------------------------------------

function numberDistractors(answer: number, count: number): number[] {
  const set = new Set<number>([answer]);
  const spreads = [1, 2, 3, 5, 8, -1, -2];
  let i = 0;
  while (set.size < count + 1 && i < spreads.length * 3) {
    const cand = answer + spreads[i % spreads.length] * (1 + Math.floor(i / spreads.length));
    if (cand > 0) set.add(cand);
    i++;
  }
  return Array.from(set);
}

/** Build up to `max` tenant-derived questions. Returns [] if the snapshot is too thin. */
export function buildTenantQuestions(snap: TenantSnapshot, max = 4): Question[] {
  const out: Question[] = [];
  const sites = [...snap.sites];
  if (sites.length < 2) return out;

  const label = snap.sourceLabel;
  const byPagesDesc = [...sites].sort((a, b) => b.pageCount - a.pageCount);

  // Q1 — most pages
  {
    const top = byPagesDesc[0];
    const opts = [top, ...byPagesDesc.slice(1, 4)].map((s) => s.displayName);
    out.push({
      id: "t-most-pages",
      topic: "SitecoreAI",
      difficulty: "easy",
      q: `Which site in ${label} has the MOST pages?`,
      options: opts,
      answer: 0,
      fact: `${top.displayName} leads with ${top.pageCount} pages.`,
      source: "tenant",
    });
  }

  // Q2 — fewest pages
  {
    const bottom = byPagesDesc[byPagesDesc.length - 1];
    const opts = [bottom, ...byPagesDesc.slice(0, 3)].map((s) => s.displayName);
    out.push({
      id: "t-fewest-pages",
      topic: "SitecoreAI",
      difficulty: "easy",
      q: `Which site in ${label} has the FEWEST pages?`,
      options: opts,
      answer: 0,
      fact: `${bottom.displayName} is the smallest at ${bottom.pageCount} pages.`,
      source: "tenant",
    });
  }

  // Q3 — total site count
  {
    const n = snap.sites.length;
    const opts = numberDistractors(n, 3).map(String);
    out.push({
      id: "t-site-count",
      topic: "SitecoreAI",
      difficulty: "easy",
      q: `How many sites does ${label} expose to the quiz?`,
      options: opts,
      answer: 0,
      fact: `${n} site${n === 1 ? "" : "s"} were read from the tenant.`,
      source: "tenant",
    });
  }

  // Q4 — language of a specific site
  {
    const target = byPagesDesc[1] ?? sites[0];
    const others = snap.languages.filter((l) => l !== target.language);
    const opts = [target.language, ...others.slice(0, 3)];
    if (opts.length >= 2) {
      out.push({
        id: "t-site-language",
        topic: "SitecoreAI",
      difficulty: "easy",
        q: `What is the default language of “${target.displayName}”?`,
        options: opts,
        answer: 0,
        fact: `${target.displayName} is configured for “${target.language}”.`,
        source: "tenant",
      });
    }
  }

  return out.slice(0, max);
}
