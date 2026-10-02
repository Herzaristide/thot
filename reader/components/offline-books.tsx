"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "@/lib/offline/db";

export function OfflineBooks() {
  const books = useLiveQuery(() => localDb()?.books.toArray() ?? [], []);
  if (!books) return null;
  if (books.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun livre téléchargé.</p>;
  return (
    <ul className="w-full divide-y rounded-xl border text-left">
      {books.map((b) => (
        <li key={b.key}>
          <a href={`/read/${b.editionId}`} className="block p-3 hover:bg-accent">
            <div className="font-serif font-medium">{b.title}</div>
            <div className="text-sm text-muted-foreground">{b.authors}</div>
          </a>
        </li>
      ))}
    </ul>
  );
}
