import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Logo } from "@/components/logo";
import { viewer } from "@/lib/api/server";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { ViewerProvider } from "@/lib/viewer";

/** Pages de la console : session obligatoire, rôle corpus:admin ou corpus:review. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { token, roles } = await viewer();
  if (!token) redirect("/login?auto=0");
  if (!roles.includes("corpus:admin") && !roles.includes("corpus:review")) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo />
        <div>
          <h1 className="font-serif text-2xl font-semibold">Accès refusé</h1>
          <p className="mt-2 max-w-md text-muted-foreground">
            Le compte {session.user.email} n'a ni le rôle corpus:admin ni corpus:review. Un
            administrateur Keycloak peut l'attribuer (client corpus-api).
          </p>
        </div>
        <SignOutButton />
      </main>
    );
  }
  return (
    <ViewerProvider
      viewer={{ name: session.user.name, email: session.user.email, sub: session.user.sub, roles }}
    >
      <Shell readerUrl={env().READER_URL}>{children}</Shell>
    </ViewerProvider>
  );
}
