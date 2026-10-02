"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Note } from "@/lib/api/types";
import { fetchNote } from "@/lib/reader/data";
import { segmentHtml } from "@/lib/reader/render";

export type OpenNote = { noteId: string; rect: DOMRect } | null;

/**
 * Contenu d'une note : carte flottante près de l'appel sur grand écran,
 * panneau en bas de l'écran sur téléphone.
 */
export function NotePanel({
  open,
  onClose,
  editionId,
  revision,
  known,
  lang,
}: {
  open: OpenNote;
  onClose: () => void;
  editionId: string;
  revision: number;
  known: Record<string, Note>;
  lang: string;
}) {
  const noteId = open?.noteId ?? null;
  const { data, isPending } = useQuery({
    queryKey: ["note", editionId, revision, noteId],
    queryFn: () => fetchNote(editionId, noteId as string, revision),
    enabled: noteId !== null && !(noteId in known),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const note = noteId ? (known[noteId] ?? data) : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const desktop = typeof window !== "undefined" && window.innerWidth >= 768;
  const style =
    open && desktop
      ? {
          left: Math.min(Math.max(16, open.rect.left - 160), window.innerWidth - 400),
          top:
            open.rect.bottom + 260 > window.innerHeight
              ? Math.max(16, open.rect.top - 260)
              : open.rect.bottom + 8,
        }
      : undefined;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/10 md:bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label={`Note ${note?.label ?? ""}`}
            initial={desktop ? { opacity: 0, y: 4 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, y: 4 } : { y: "100%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={style}
            className="fixed z-50 max-h-[50vh] overflow-y-auto border bg-popover p-4 pr-10 text-popover-foreground shadow-lg max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:pb-[calc(1rem+env(safe-area-inset-bottom))] md:w-96 md:rounded-xl"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 size-7"
              onClick={onClose}
              aria-label="Fermer la note"
            >
              <X aria-hidden />
            </Button>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Note {note?.label}
              {note?.origin === "translator" && " · du traducteur"}
              {note?.origin === "editor" && " · de l'éditeur"}
              {note?.origin === "author" && " · de l'auteur"}
            </div>
            {isPending && !note ? (
              <div className="h-12 animate-pulse rounded bg-muted" />
            ) : (
              <div className="reader-text space-y-2 text-[0.95em]" lang={lang}>
                {note?.segments.map((s) => (
                  <p
                    key={s.seq}
                    className="no-indent"
                    dangerouslySetInnerHTML={{ __html: segmentHtml(s, { showPages: false }) }}
                  />
                ))}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
