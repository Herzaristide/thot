"use client";

import { Check, FolderPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { send } from "@/lib/offline/outbox";

type Col = { id: string; name: string; emoji: string | null; has: boolean };

/** Ajouter / retirer une œuvre des collections, ou en créer une nouvelle. */
export function AddToCollection({ workId, collections }: { workId: string; collections: Col[] }) {
  const [cols, setCols] = useState(collections);
  const [name, setName] = useState("");
  const router = useRouter();

  const toggle = async (c: Col) => {
    setCols((cs) => cs.map((x) => (x.id === c.id ? { ...x, has: !x.has } : x)));
    await send(
      c.has ? "DELETE" : "PUT",
      `/api/me/collections/${c.id}/items/${workId}`,
      c.has ? undefined : {},
      {
        key: `item:${c.id}:${workId}`,
      },
    );
    router.refresh();
  };

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
    await send(
      "PUT",
      `/api/me/collections/${id}/items/${workId}`,
      {},
      { key: `item:${id}:${workId}` },
    );
    setCols((cs) => [...cs, { id, name: trimmed, emoji: null, has: true }]);
    setName("");
    toast.success(`Ajoutée à « ${trimmed} »`);
    router.refresh();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="lg">
          <FolderPlus aria-hidden />
          <span className="max-sm:sr-only">Collection</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="px-2 pt-1 pb-2 text-sm font-medium">Ajouter à une collection</div>
        {cols.length > 0 && (
          <ul className="mb-2 max-h-60 overflow-y-auto">
            {cols.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  aria-pressed={c.has}
                >
                  <span className="flex size-4 items-center justify-center">
                    {c.has && <Check className="size-4 text-primary" aria-hidden />}
                  </span>
                  {c.emoji && <span>{c.emoji}</span>}
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="flex gap-1.5 border-t pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nouvelle collection"
            aria-label="Nom de la nouvelle collection"
            className="h-8"
            maxLength={80}
          />
          <Button type="submit" size="sm" disabled={!name.trim()} aria-label="Créer">
            <Plus aria-hidden />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
