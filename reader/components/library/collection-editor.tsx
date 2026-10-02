"use client";

import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Cover } from "@/components/covers/cover";
import { EmptyState } from "@/components/section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authorsLabel } from "@/lib/format";
import { send } from "@/lib/offline/outbox";
import type { CachedWork } from "@/lib/reader-data";
import { SortableList } from "./sortable";

type Item = { id: string; position: string; note: string | null; work: CachedWork | null };

export function CollectionEditor({
  collection,
}: {
  collection: {
    id: string;
    name: string;
    description: string | null;
    emoji: string | null;
    items: Item[];
  };
}) {
  const [meta, setMeta] = useState({
    name: collection.name,
    description: collection.description ?? "",
    emoji: collection.emoji ?? "",
  });
  const [items, setItems] = useState(collection.items);
  const router = useRouter();
  const base = `/api/me/collections/${collection.id}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await send(
      "PATCH",
      base,
      {
        name: meta.name.trim(),
        description: meta.description.trim() || null,
        emoji: meta.emoji.trim() || null,
      },
      { key: `collection-meta:${collection.id}` },
    );
    if (res && !res.ok)
      toast.error(
        res.status === 409 ? "Une collection porte déjà ce nom." : "Enregistrement impossible.",
      );
    else router.refresh();
  };

  const remove = async (workId: string) => {
    setItems((xs) => xs.filter((x) => x.id !== workId));
    await send("DELETE", `${base}/items/${workId}`, undefined, {
      key: `item:${collection.id}:${workId}`,
    });
    router.refresh();
  };

  const destroy = async () => {
    await send("DELETE", base, undefined, { key: `collection:${collection.id}` });
    router.push("/library?tab=collections");
    router.refresh();
  };

  return (
    <>
      <Link
        href="/library?tab=collections"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Bibliothèque
      </Link>
      <div className="mb-8 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            {meta.emoji && <span className="mr-2">{meta.emoji}</span>}
            {collection.name}
          </h1>
          {collection.description && (
            <p className="mt-2 text-muted-foreground">{collection.description}</p>
          )}
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Modifier la collection">
              <Pencil aria-hidden />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={save} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Modifier la collection</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2">
                <Input
                  value={meta.emoji}
                  onChange={(e) => setMeta({ ...meta, emoji: e.target.value })}
                  className="w-16 text-center"
                  maxLength={4}
                  aria-label="Emoji"
                  placeholder="📚"
                />
                <Input
                  value={meta.name}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                  maxLength={80}
                  aria-label="Nom"
                  required
                />
              </div>
              <Textarea
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                maxLength={500}
                placeholder="Description (facultative)"
                aria-label="Description"
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="submit" disabled={!meta.name.trim()}>
                    Enregistrer
                  </Button>
                </DialogClose>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Supprimer la collection">
              <Trash2 aria-hidden />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer « {collection.name} » ?</DialogTitle>
              <DialogDescription>
                Les œuvres restent dans le catalogue et dans vos favoris.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <Button variant="destructive" onClick={destroy}>
                Supprimer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Collection vide">
          Ajoutez des œuvres depuis leur fiche (bouton « Collection »).
        </EmptyState>
      ) : (
        <SortableList
          items={items}
          onChange={setItems}
          onMove={(workId, position) =>
            void send(
              "PATCH",
              `${base}/items/${workId}`,
              { position },
              { key: `item-pos:${collection.id}:${workId}` },
            )
          }
          render={(i) => (
            <div className="flex items-center gap-4">
              <Link href={`/works/${i.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                {i.work && <Cover work={i.work} size="sm" className="w-10 shrink-0" />}
                <div className="min-w-0">
                  <div className="truncate font-serif font-medium">
                    {i.work?.title ?? "Œuvre indisponible"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {i.work && authorsLabel(i.work.authors)}
                    {i.work?.first_published_year && ` · ${i.work.first_published_year}`}
                  </div>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(i.id)}
                aria-label="Retirer de la collection"
              >
                <X aria-hidden />
              </Button>
            </div>
          )}
        />
      )}
    </>
  );
}
