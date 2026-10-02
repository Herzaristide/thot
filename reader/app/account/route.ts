import { env } from "@/lib/env";

/** Console compte de Keycloak (profil, mot de passe, sessions). */
export function GET() {
  return Response.redirect(`${env().OIDC_ISSUER.replace(/\/$/, "")}/account`, 302);
}
