import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

/** Connexion par Keycloak, retour sur `next` ensuite. */
export function signIn(next = "/") {
  return authClient.signIn.social({ provider: "keycloak", callbackURL: next });
}

/**
 * Déconnexion : session locale, puis fin de session Keycloak
 * (RP-initiated logout) pour ne pas être reconnecté automatiquement.
 */
export async function signOut() {
  const res = await authClient.signOut({ fetchOptions: { body: { disableRedirect: true } } });
  window.location.href = res.data?.url ?? "/";
}
