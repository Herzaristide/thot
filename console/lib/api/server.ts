import "server-only";
import { headers } from "next/headers";
import createClient, { type Middleware } from "openapi-fetch";
import { cache } from "react";
import { env } from "@/lib/env";
import type { paths } from "./schema";
import { rolesOf, userToken } from "./token";

/** Jeton et rôles de l'admin, une fois par requête. */
export const viewer = cache(async () => {
  const token = await userToken(await headers());
  return { token, roles: rolesOf(token) };
});

/** Client de la Corpus API pour un Server Component, au nom de l'admin connecté. */
export const corpus = cache(async () => {
  const { token } = await viewer();
  const c = createClient<paths>({ baseUrl: env().CORPUS_API_URL });
  const mw: Middleware = {
    async onRequest({ request }) {
      if (token) request.headers.set("authorization", `Bearer ${token}`);
      return request;
    },
  };
  c.use(mw);
  return c;
});
