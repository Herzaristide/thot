"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Cover } from "@/components/covers/cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { send } from "@/lib/offline/outbox";
import type { CollectionSummary } from "@/lib/reader-data";
import { SortableList } from "./sortable";

export function CollectionsList({ collections }: { collections: CollectionSummary[] }) {
  const [items, setItems] = useState(collections);
  const [name, setName] = useState("");
  const router = useRouter();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const res = await send(
      "POST",
      "/api/me/collections",
      { id, name: trimmed },
      { key: `collection:${id}` },
    );
    if (res && !res.ok) {
      toast.error(
        res.status === 409 ? "Une collection porte déjà ce nom." : "Création impossible.",
      );
      return;
    }
    setName("");
    router.refresh();
    router.push(`/library/collections/${id}`);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex max-w-md gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nouvelle collection"
          maxLength={80}
          aria-label="Nom de la nouvelle collection"
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus aria-hidden /> Créer
        </Button>
      </form>
      {items.length > 0 && (
        <SortableList
          items={items}
          onChange={setItems}
          onMove={(id, position) =>
            void send(
              "PATCH",
              `/api/me/collections/${id}`,
              { position },
              { key: `collection-pos:${id}` },
            )
          }
          render={(c) => (
            <Link
              href={`/library/collections/${c.id}`}
              className="flex items-center gap-4 rounded-md"
            >
              <div className="flex shrink-0 -space-x-6">
                {c.preview.length === 0 ? (
                  <div className="aspect-[2/3] w-10 rounded-md border border-dashed" />
                ) : (
                  c.preview
                    .slice(0, 3)
                    .map((w) => (
                      <Cover key={w.id} work={w} size="sm" className="w-10 ring-2 ring-card" />
                    ))
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {c.emoji && <span className="mr-1.5">{c.emoji}</span>}
                  {c.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.count} œuvre{c.count > 1 ? "s" : ""}
                  {c.description && ` · ${c.description}`}
                </div>
              </div>
            </Link>
          )}
        />
      )}
    </div>
  );
}
