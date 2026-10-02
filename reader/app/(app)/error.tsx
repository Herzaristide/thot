"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-serif text-2xl font-semibold">Une erreur est survenue</h1>
      <p className="text-muted-foreground">
        Le corpus est peut-être momentanément injoignable.
        {error.digest && <span className="block text-xs">Réf. {error.digest}</span>}
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
