"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, unwrap } from "@/lib/api/client";
import type { FindHit } from "@/lib/api/types";
import { useDebounced } from "@/lib/hooks";

/** Recherche dans le livre (mots exacts, sans tenir compte de la casse ni des accents). */
export function FindDialog({
  editionId,
  revision,
  lang,
  onGo,
}: {
  editionId: string;
  revision: number;
  lang: string;
  onGo: (hit: FindHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const { data, isFetching } = useQuery({
    queryKey: ["find", editionId, revision, query],
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/v1/editions/{edition_id}/find", {
          params: {
            path: { edition_id: editionId },
            query: { q: query, limit: 100, rev: revision },
          },
          signal,
        }),
      ),
    enabled: open && query.length >= 2,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Chercher dans le livre">
          <Search aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[10%] translate-y-0 gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Chercher dans le livre</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mots, expression…"
            autoFocus
          />
          {isFetching && (
            <Loader2
              className="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
        {data && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {data.hits.length === 0
              ? "Aucun résultat."
              : `${data.hits.length}${data.truncated ? "+" : ""} résultat${data.hits.length > 1 ? "s" : ""}`}
          </p>
        )}
        <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
          {data?.hits.map((h) => (
            <li key={`${h.seq}-${h.offset}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  onGo(h);
                }}
              >
                <div className="truncate text-xs text-muted-foreground">
                  {h.section_path.join(" · ")}
                </div>
                <div className="font-serif text-sm" lang={lang}>
                  {h.snippet.slice(0, h.snippet_offset)}
                  <mark className="rounded-sm bg-highlight px-0.5">
                    {h.snippet.slice(h.snippet_offset, h.snippet_offset + h.length)}
                  </mark>
                  {h.snippet.slice(h.snippet_offset + h.length)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
