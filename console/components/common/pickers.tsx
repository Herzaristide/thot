"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, unwrap } from "@/lib/api/client";
import { lifespan } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export type WorkRef = { id: string; title: string; authors?: string[] };

/** Recherche d'une œuvre (titre, titre traduit, auteur). */
export function WorkPicker({
  value,
  onChange,
  placeholder = "Choisir une œuvre…",
  exclude,
}: {
  value: WorkRef | null;
  onChange: (w: WorkRef | null) => void;
  placeholder?: string;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: ["works", "picker", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/works", {
          params: { query: { q: query || undefined, limit: 20 } },
        }),
      ).items,
    enabled: open,
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value
              ? `${value.title}${value.authors?.length ? ` — ${value.authors.join(", ")}` : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Titre ou auteur…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{isFetching ? "Recherche…" : "Aucune œuvre."}</CommandEmpty>
            <CommandGroup>
              {data
                ?.filter((w) => w.id !== exclude)
                .map((w) => (
                  <CommandItem
                    key={w.id}
                    value={w.id}
                    onSelect={() => {
                      onChange({ id: w.id, title: w.title, authors: w.authors });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(value?.id === w.id ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{w.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {w.authors.join(", ")} · {w.languages.join(", ")}
                      </span>
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type PersonRef = { id?: string | null; name: string; wikidata_id?: string | null };

/** Recherche d'une personne existante, ou saisie d'un nouveau nom. */
export function PersonPicker({
  onSelect,
  placeholder = "Ajouter une personne…",
  allowNew = true,
}: {
  onSelect: (p: PersonRef) => void;
  placeholder?: string;
  allowNew?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: ["persons", "picker", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/persons", {
          params: { query: { q: query || undefined, limit: 20 } },
        }),
      ).items,
    enabled: open,
  });
  const pick = (p: PersonRef) => {
    onSelect(p);
    setQ("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="font-normal text-muted-foreground">
          <Plus aria-hidden /> {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nom (toutes langues)…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{isFetching ? "Recherche…" : "Aucune personne."}</CommandEmpty>
            {allowNew && q.trim().length > 1 && (
              <CommandGroup heading="Nouvelle personne">
                <CommandItem value={`new:${q}`} onSelect={() => pick({ name: q.trim() })}>
                  <Plus aria-hidden /> Créer « {q.trim()} »
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="En base">
              {data?.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() =>
                    pick({ id: p.id, name: p.display_name, wikidata_id: p.wikidata_id })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate">{p.display_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lifespan(p.birth_year, p.death_year)} · {p.n_works} œuvre(s),{" "}
                      {p.n_translations} traduction(s)
                      {p.wikidata_id ? ` · ${p.wikidata_id}` : ""}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Liste ordonnée de personnes (auteurs, traducteurs), avec retrait. */
export function PersonList({
  value,
  onChange,
  placeholder,
  allowNew = true,
}: {
  value: PersonRef[];
  onChange: (v: PersonRef[]) => void;
  placeholder?: string;
  allowNew?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((p, i) => (
        <span
          key={`${p.id ?? p.name}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-2.5 text-sm"
        >
          {p.name}
          {!p.id && <span className="text-xs text-warn">nouvelle</span>}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-accent"
            aria-label={`Retirer ${p.name}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <PersonPicker
        placeholder={placeholder}
        allowNew={allowNew}
        onSelect={(p) => {
          if (!value.some((v) => (p.id ? v.id === p.id : v.name === p.name)))
            onChange([...value, p]);
        }}
      />
    </div>
  );
}
