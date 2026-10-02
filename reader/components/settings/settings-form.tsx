"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink, HardDrive, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SwitchField } from "@/components/switch-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { signOut } from "@/lib/auth-client";
import { bytes, languageName } from "@/lib/format";
import { localDb } from "@/lib/offline/db";
import type { Preferences } from "@/lib/prefs/schema";
import { usePreferences } from "@/lib/prefs/store";
import { removeBook } from "@/lib/reader/data";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border bg-card p-5">
      <h2 className="mb-4 font-serif text-lg font-semibold">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function SettingsForm({
  languages,
  user,
}: {
  languages: string[];
  user: { name: string; email: string };
}) {
  const { prefs, setPrefs, reset } = usePreferences();
  const books = useLiveQuery(
    () => localDb()?.books.orderBy("downloadedAt").reverse().toArray() ?? [],
    [],
  );
  const pending = useLiveQuery(() => localDb()?.outbox.count() ?? 0, []);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  return (
    <>
      <Card title="Lecture">
        <div className="space-y-2">
          <Label>Thème</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={prefs.theme}
            onValueChange={(v) => v && setPrefs({ theme: v as Preferences["theme"] })}
          >
            <ToggleGroupItem value="system">Automatique</ToggleGroupItem>
            <ToggleGroupItem value="light">Clair</ToggleGroupItem>
            <ToggleGroupItem value="sepia">Sépia</ToggleGroupItem>
            <ToggleGroupItem value="dark">Sombre</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label>Mode de lecture</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={prefs.mode}
            onValueChange={(v) => v && setPrefs({ mode: v as Preferences["mode"] })}
          >
            <ToggleGroupItem value="scroll">Défilement</ToggleGroupItem>
            <ToggleGroupItem value="paged">Pages</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label>Langues de lecture</Label>
          <p className="text-sm text-muted-foreground">
            Édition ouverte par défaut, et traductions jointes aux résultats de recherche, dans cet
            ordre.
          </p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            className="flex-wrap justify-start"
            value={prefs.readingLangs}
            onValueChange={(v) => {
              // Garde l'ordre des choix : les langues déjà choisies d'abord
              const kept = prefs.readingLangs.filter((l) => v.includes(l));
              setPrefs({ readingLangs: [...kept, ...v.filter((l) => !kept.includes(l))] });
            }}
          >
            {languages.map((l) => (
              <ToggleGroupItem key={l} value={l} className="px-3">
                {languageName(l)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <SwitchField
          label="Césure automatique"
          checked={prefs.hyphens}
          onChange={(v) => setPrefs({ hyphens: v })}
        />
        <SwitchField
          label="Numéros de page de l'édition papier"
          checked={prefs.showPageNumbers}
          onChange={(v) => setPrefs({ showPageNumbers: v })}
        />
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw aria-hidden /> Rétablir les réglages par défaut
        </Button>
      </Card>

      <Card title="Hors ligne">
        <div className="flex items-start gap-3 text-sm">
          <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            {estimate
              ? `${bytes(estimate.usage)} utilisés sur cet appareil.`
              : "Espace utilisé inconnu."}
            {persisted === false && " Le navigateur peut effacer ces données s'il manque de place."}
            {persisted === true && " Stockage persistant accordé."}
            {pending ? (
              <div className="text-muted-foreground">
                {pending} modification(s) en attente d'envoi.
              </div>
            ) : null}
          </div>
        </div>
        {books && books.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {books.map((b) => (
              <li key={b.key} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {b.authors} · {languageName(b.language)} · {bytes(b.bytes)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBook(b.key)}
                  aria-label={`Retirer ${b.title} de l'appareil`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun livre téléchargé. Dans la liseuse, le bouton nuage garde un livre sur l'appareil.
          </p>
        )}
      </Card>

      <Card title="Compte">
        <div className="text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground">{user.email}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/account">
              Profil et mot de passe <ExternalLink aria-hidden />
            </a>
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden /> Se déconnecter
          </Button>
        </div>
      </Card>
    </>
  );
}
