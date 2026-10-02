import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-6xl text-muted-foreground">404</p>
      <h1 className="font-serif text-2xl font-semibold">Page introuvable</h1>
      <p className="max-w-sm text-muted-foreground">
        Cette page n'existe pas, ou l'œuvre n'est pas accessible avec votre compte.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Retour à l'accueil</Link>
      </Button>
    </main>
  );
}
