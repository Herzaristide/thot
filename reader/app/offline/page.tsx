import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { OfflineBooks } from "@/components/offline-books";

export const metadata: Metadata = { title: "Hors ligne" };

/** Page de repli du service worker quand une page n'est pas en cache. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="font-serif text-2xl font-semibold">Vous êtes hors ligne</h1>
      <p className="text-muted-foreground">
        Cette page n'a pas été gardée sur l'appareil. Les livres téléchargés restent lisibles :
      </p>
      <OfflineBooks />
    </main>
  );
}
