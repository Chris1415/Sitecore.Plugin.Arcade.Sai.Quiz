/* Non-blocking Marketplace SDK connection.
 *
 * The scaffold's MarketplaceProvider BLOCKS rendering until it connects to the
 * portal — which never happens in standalone dev. This game must run either way,
 * so instead of gating on the provider we try to connect opportunistically and
 * fall back to "standalone" after a short timeout. The quiz then uses sample
 * tenant data (see tenant-source.ts) until a real portal connection appears.
 */
"use client";

import {
  ClientSDK,
  type ApplicationContext,
} from "@sitecore-marketplace-sdk/client";
import { XMC } from "@sitecore-marketplace-sdk/xmc";
import { useEffect, useState } from "react";

export type MarketplaceStatus = "connecting" | "connected" | "standalone";

export interface OptionalMarketplace {
  status: MarketplaceStatus;
  client: ClientSDK | null;
  appContext: ApplicationContext | null;
}

const CONNECT_TIMEOUT_MS = 2500;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

export function useOptionalMarketplace(): OptionalMarketplace {
  const [state, setState] = useState<OptionalMarketplace>({
    status: "connecting",
    client: null,
    appContext: null,
  });

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        // Only meaningful inside the portal iframe; standalone has no parent.
        const embedded = typeof window !== "undefined" && window.parent !== window.self;
        if (!embedded) throw new Error("not embedded");

        const client = (await Promise.race([
          ClientSDK.init({ target: window.parent, modules: [XMC] }),
          timeout(CONNECT_TIMEOUT_MS),
        ])) as ClientSDK;

        const ctxRes = (await Promise.race([
          client.query("application.context"),
          timeout(CONNECT_TIMEOUT_MS),
        ])) as { data?: ApplicationContext } | undefined;

        if (cancelled) return;
        setState({ status: "connected", client, appContext: ctxRes?.data ?? null });
      } catch {
        if (!cancelled) setState({ status: "standalone", client: null, appContext: null });
      }
    };

    void connect();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
