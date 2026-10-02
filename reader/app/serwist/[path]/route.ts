import { createSerwistRoute } from "@serwist/turbopack";

/** Service worker compilé (esbuild) depuis app/sw.ts, servi à /serwist/sw.js. */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
    // Enveloppe hors ligne : la page de repli
    additionalPrecacheEntries: [{ url: "/offline", revision: "1" }],
  },
);
