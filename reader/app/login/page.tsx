import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/login-button";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Connexion" };

function safeNext(next: string | string[] | undefined): string {
  const n = Array.isArray(next) ? next[0] : next;
  // Uniquement des chemins internes (pas de redirection ouverte)
  return n?.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next as never);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo />
      <div>
        <h1 className="font-serif text-2xl font-semibold">Connexion</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Retrouvez votre progression, vos favoris et vos collections sur tous vos appareils.
        </p>
      </div>
      <LoginButton next={next} auto />
    </main>
  );
}
