"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudCheck, CloudDownload, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Toc } from "@/lib/api/types";
import { bytes } from "@/lib/format";
import { localDb } from "@/lib/offline/db";
import { bookKey, downloadBook, removeBook } from "@/lib/reader/data";
import type { ReaderEdition } from "./reader";

/** Télécharger le livre pour le lire hors ligne (ou le retirer de l'appareil). */
export function DownloadButton({ edition, toc }: { edition: ReaderEdition; toc: Toc }) {
  const key = bookKey(edition.id, edition.revision);
  const book = useLiveQuery(() => localDb()?.books.get(key), [key]);
  const [progress, setProgress] = useState<number | null>(null);

  const download = async () => {
    setProgress(0);
    try {
      await downloadBook(
        {
          editionId: edition.id,
          revision: edition.revision,
          workId: edition.work.id,
          title: edition.title,
          authors: edition.work.authors,
          language: edition.language,
          toc,
          totalSegments: edition.totalSegments,
        },
        (p) => setProgress(p.done / p.total),
      );
      toast.success("Livre disponible hors ligne");
    } catch {
      toast.error("Téléchargement interrompu");
    } finally {
      setProgress(null);
    }
  };

  if (progress !== null) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        aria-label={`Téléchargement ${Math.round(progress * 100)} %`}
      >
        <Loader2 className="animate-spin" aria-hidden />
      </Button>
    );
  }
  if (book) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Disponible hors ligne (${bytes(book.bytes)}) — retirer de l'appareil`}
        title={`Hors ligne · ${bytes(book.bytes)} — cliquer pour retirer`}
        onClick={async () => {
          await removeBook(key);
          toast("Livre retiré de l'appareil");
        }}
        className="text-primary"
      >
        <CloudCheck aria-hidden />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Télécharger pour lire hors ligne"
      title="Télécharger pour lire hors ligne"
      onClick={download}
    >
      <CloudDownload aria-hidden />
    </Button>
  );
}
