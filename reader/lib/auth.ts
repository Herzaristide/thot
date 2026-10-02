import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
import { headers } from "next/headers";
import { cache } from "react";
import { db, schema } from "@/lib/db";
import { discoveryBase, env } from "@/lib/env";

const e = env();

/**
 * Better Auth : sessions de la liseuse (cookie httpOnly, base `reader`,
 * schéma `auth`), connexion par Keycloak (OIDC, PKCE). Les jetons Keycloak
 * restent côté serveur et sont rafraîchis à la demande (`getAccessToken`).
 */
export const auth = betterAuth({
  baseURL: e.BETTER_AUTH_URL,
  secret: e.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Comptes gérés par Keycloak : pas de mot de passe local
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      // Rempli depuis le profil Keycloak à la création du compte. `input: false`
      // l'en empêcherait ; c'est la désactivation de /update-user (ci-dessous)
      // qui interdit au navigateur de le modifier.
      sub: { type: "string", required: true },
    },
  },
  // Comptes gérés dans Keycloak : aucune modification locale du profil
  disabledPaths: [
    "/update-user",
    "/change-email",
    "/change-password",
    "/set-password",
    "/delete-user",
    "/link-social",
    "/unlink-account",
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Évite une requête en base à chaque appel (session relue toutes les 5 min)
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: {
    accountLinking: { enabled: false },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          ...keycloak({
            issuer: e.OIDC_ISSUER,
            clientId: e.READER_CLIENT_ID,
            clientSecret: e.READER_CLIENT_SECRET,
            scopes: ["openid", "profile", "email", "offline_access"],
            pkce: true,
            postLogoutRedirectURI: "/",
          }),
          // En conteneur, Keycloak est joint par le réseau interne ; les URL
          // publiées (autorisation, émetteur) restent publiques.
          discoveryUrl: `${discoveryBase()}/.well-known/openid-configuration`,
          mapProfileToUser: (profile) => ({
            sub: String(profile.sub),
            name:
              (profile.name as string | undefined) ||
              (profile.preferred_username as string | undefined) ||
              String(profile.email ?? "Lecteur"),
          }),
        },
      ],
    }),
    // Doit rester le dernier plugin : pose les cookies dans les Server Actions
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** Session courante (une seule lecture par requête). */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** `sub` Keycloak du lecteur connecté, ou null. */
export async function getUserSub(): Promise<string | null> {
  const session = await getSession();
  return session?.user.sub ?? null;
}
