"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { Pwa } from "@/components/pwa";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";
import { localDb } from "@/lib/offline/db";
import { startOutbox } from "@/lib/offline/outbox";
import type { Preferences } from "@/lib/prefs/schema";
import { PreferencesProvider } from "@/lib/prefs/store";
import { type Viewer, ViewerProvider } from "@/lib/viewer";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 24 * 60 * 60_000,
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
      },
      mutations: { networkMode: "offlineFirst" },
    },
  });
}

/** Cache TanStack Query gardé dans IndexedDB (requêtes marquées `meta.persist`). */
const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => ((await localDb()?.kv.get(key))?.value as string) ?? null,
    setItem: async (key, value) => void (await localDb()?.kv.put({ key, value })),
    removeItem: async (key) => void (await localDb()?.kv.delete(key)),
  },
  key: "query-cache",
  throttleTime: 2000,
});

export function Providers({
  children,
  viewer,
  prefs,
}: {
  children: ReactNode;
  viewer: Viewer | null;
  prefs: { data: Preferences; updatedAt: string } | null;
}) {
  const [queryClient] = useState(makeQueryClient);
  useEffect(() => startOutbox(), []);

  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * 24 * 60 * 60_000,
          // Un cache par lecteur : les droits (donc les réponses) en dépendent
          buster: `v1:${viewer?.sub ?? "anonymous"}`,
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success" && q.meta?.persist === true,
          },
        }}
      >
        <ThemeProvider
          attribute="class"
          themes={["light", "dark", "sepia"]}
          defaultTheme={prefs?.data.theme ?? "system"}
          enableSystem
          disableTransitionOnChange
        >
          <ViewerProvider viewer={viewer}>
            <PreferencesProvider signedIn={viewer !== null} initial={prefs}>
              <TooltipProvider delayDuration={300}>
                {children}
                <Toaster position="bottom-center" />
                <Pwa />
              </TooltipProvider>
            </PreferencesProvider>
          </ViewerProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SerwistProvider>
  );
}
