/// <reference lib="webworker" />
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/turbopack/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type RuntimeCaching,
  Serwist,
  type SerwistGlobalConfig,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Stratégies de cache :
 * - texte d'une révision (`rev=`) : immuable → CacheFirst, sans limite de durée ;
 * - autres réponses de la Corpus API : StaleWhileRevalidate ;
 * - /api/me et /api/auth : jamais en cache (la file d'écritures du client
 *   rejoue les écritures faites hors ligne) ;
 * - pages : NetworkFirst, repli sur le cache puis sur /offline.
 */
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && (url.pathname.startsWith("/api/me") || url.pathname.startsWith("/api/auth")),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin &&
      request.method === "GET" &&
      url.pathname.startsWith("/api/corpus/") &&
      url.searchParams.has("rev"),
    handler: new CacheFirst({
      cacheName: "corpus-text",
      plugins: [new ExpirationPlugin({ maxEntries: 2000, purgeOnQuotaError: true })],
    }),
  },
  {
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin && request.method === "GET" && url.pathname.startsWith("/api/corpus/"),
    handler: new StaleWhileRevalidate({
      cacheName: "corpus",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 7 * 24 * 3600,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE_NAME.html,
      networkTimeoutSeconds: 4,
      plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 })],
    }),
  },
  {
    matcher: ({ url }) =>
      url.pathname.startsWith("/_next/static/media/") || url.pathname.startsWith("/icons/"),
    handler: new CacheFirst({
      cacheName: "assets",
      plugins: [new ExpirationPlugin({ maxEntries: 100 })],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Mise à jour à la demande du lecteur (bandeau), jamais en pleine lecture
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
