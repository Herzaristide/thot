"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, TextSearch, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api, unwrap } from "@/lib/api/client";
import { useDebounced } from "@/lib/hooks";

/** Barre de commande ⌘K / Ctrl K : œuvres, auteurs, recherche de passages. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 150);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["suggest", query],
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/v1/suggest", { params: { query: { q: query, limit: 8 } }, signal })),
    enabled: open && query.length >= 2,
    staleTime: 5 * 60_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href as Parameters<typeof router.push>[0]);
  };

  const works = data?.filter((s) => s.kind === "work") ?? [];
  const persons = data?.filter((s) => s.kind === "person") ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted max-lg:size-9 max-lg:justify-center max-lg:px-0 lg:w-80"
        aria-label="Rechercher une œuvre, un auteur, un passage"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 text-left lg:inline">Œuvre, auteur, passage…</span>
        <kbd className="hidden rounded border bg-background px-1.5 font-sans text-[10px] lg:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Rechercher"
        description="Œuvres, auteurs, passages"
        shouldFilter={false}
      >
        <CommandInput placeholder="Œuvre, auteur, citation…" value={q} onValueChange={setQ} />
        <CommandList>
          {query.length >= 2 && !isFetching && works.length + persons.length === 0 && (
            <CommandEmpty>Aucune œuvre ni aucun auteur.</CommandEmpty>
          )}
          {query.length >= 2 && (
            <CommandGroup heading="Passages">
              <CommandItem
                value={`search:${query}`}
                onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)}
              >
                <TextSearch aria-hidden />
                Chercher « {query} » dans le corpus
              </CommandItem>
            </CommandGroup>
          )}
          {works.length > 0 && (
            <CommandGroup heading="Œuvres">
              {works.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`work:${s.id}`}
                  onSelect={() => go(`/works/${s.id}`)}
                >
                  <BookOpen aria-hidden />
                  <span className="truncate">{s.label}</span>
                  {s.detail && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {s.detail}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {persons.length > 0 && (
            <CommandGroup heading="Personnes">
              {persons.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`person:${s.id}`}
                  onSelect={() => go(`/authors/${s.id}`)}
                >
                  <UserRound aria-hidden />
                  <span className="truncate">{s.label}</span>
                  {s.detail && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {s.detail}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {query.length < 2 && (
            <CommandGroup heading="Aller à">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <CommandItem key={href} value={`nav:${href}`} onSelect={() => go(href)}>
                  <Icon aria-hidden />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
