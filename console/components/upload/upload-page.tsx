"use client";

import { useQueries } from "@tanstack/react-query";
import { CheckCircle2, CopyX, FileUp, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { WorkPicker, type WorkRef } from "@/components/common/pickers";
import { JobStatusBadge, STEP_LABEL } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import type { UploadResult } from "@/lib/api/types";
import { bytes } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = UploadResult["items"][number];
type Entry = {
  key: string;
  file: File;
  progress: number;
  state: "pending" | "sending" | "done" | "error";
  result?: Item;
  error?: string;
};

/** Envoi d'un fichier avec suivi de la progression (fetch ne la donne pas). */
function send(file: File, options: string, onProgress: (p: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/corpus/v1/admin/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail ?? body.title ?? `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("réseau indisponible"));
    const form = new FormData();
    form.append("files", file);
    form.append("options", options);
    xhr.send(form);
  });
}

function JobLine({ jobId }: { jobId: string }) {
  const [q] = useQueries({
    queries: [
      {
        queryKey: ["job", jobId],
        queryFn: async () =>
          unwrap(await api.GET("/v1/admin/jobs/{job_id}", { params: { path: { job_id: jobId } } })),
      },
    ],
  });
  const job = q.data;
  if (!job) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />;
  const step = (job.progress as { step?: string }).step;
  return (
    <span className="flex items-center gap-2">
      <JobStatusBadge status={job.status} />
      {job.status === "running" && step && (
        <span className="text-xs text-muted-foreground">{STEP_LABEL[step] ?? step}</span>
      )}
      {job.status === "needs_review" ? (
        <Link href={`/jobs/${job.id}`} className="text-xs font-medium underline">
          valider le classement
        </Link>
      ) : (
        <Link href={`/jobs/${job.id}`} className="text-xs text-muted-foreground underline">
          détail
        </Link>
      )}
    </span>
  );
}

export function UploadPage() {
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [work, setWork] = useState<WorkRef | null>(null);
  const [language, setLanguage] = useState("");
  const [access, setAccess] = useState("restricted");
  const busy = entries.some((e) => e.state === "sending");

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const add = async (files: File[]) => {
    const epubs = files.filter((f) => f.name.toLowerCase().endsWith(".epub"));
    const fresh = epubs.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      progress: 0,
      state: "pending" as const,
    }));
    setEntries((list) => [...fresh, ...list]);
    const options = JSON.stringify({
      work_id: work?.id,
      language: language.trim() || undefined,
      access,
    });
    // Un fichier à la fois : progression lisible, serveur ménagé
    for (const e of fresh) {
      update(e.key, { state: "sending" });
      try {
        const res = await send(e.file, options, (p) => update(e.key, { progress: p }));
        update(e.key, { state: "done", progress: 1, result: res.items[0] });
      } catch (err) {
        update(e.key, { state: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  return (
    <>
      <PageHeader
        title="Déposer des livres"
        description="Glissez des EPUB : chacun est lu, classé dans son œuvre (ou une nouvelle œuvre), puis attend votre validation avant d'entrer dans le corpus."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void add(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "hover:bg-accent/40",
          )}
        >
          <FileUp className="size-10 text-muted-foreground" aria-hidden />
          <span className="font-medium">Déposer des fichiers .epub ici</span>
          <span className="text-sm text-muted-foreground">
            ou cliquer pour choisir (plusieurs à la fois)
          </span>
          <input
            ref={input}
            type="file"
            accept=".epub,application/epub+zip"
            multiple
            hidden
            onChange={(e) => {
              void add(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </button>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Indications (facultatives)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Œuvre visée</Label>
              <WorkPicker value={work} onChange={setWork} placeholder="Classement automatique" />
              {work && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto self-start p-0"
                  onClick={() => setWork(null)}
                >
                  revenir au classement automatique
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lang" className="text-xs text-muted-foreground">
                Langue (si l'EPUB se trompe)
              </Label>
              <Input
                id="lang"
                placeholder="fr, en, ru…"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Droits</Label>
              <Select value={access} onValueChange={setAccess}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">restreint</SelectItem>
                  <SelectItem value="excerpt">extraits</SelectItem>
                  <SelectItem value="open">libre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Appliquées aux prochains fichiers déposés.
            </p>
          </CardContent>
        </Card>
      </div>

      {entries.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Fichiers déposés</CardTitle>
            {busy && <span className="text-xs text-muted-foreground">envoi en cours…</span>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.file.name}</span>
                    <span className="text-xs text-muted-foreground">{bytes(e.file.size)}</span>
                  </span>
                  <span className="flex min-w-60 justify-end">
                    {e.state === "pending" && (
                      <span className="text-xs text-muted-foreground">en attente</span>
                    )}
                    {e.state === "sending" && (
                      <Progress value={e.progress * 100} className="w-48" />
                    )}
                    {e.state === "error" && (
                      <span className="flex items-center gap-1 text-xs text-bad">
                        <XCircle className="size-4" aria-hidden /> {e.error}
                      </span>
                    )}
                    {e.state === "done" && e.result?.status === "queued" && e.result.job_id && (
                      <JobLine jobId={e.result.job_id} />
                    )}
                    {e.state === "done" && e.result?.status === "duplicate" && (
                      <span className="flex items-center gap-1 text-xs text-warn">
                        <CopyX className="size-4" aria-hidden /> {e.result.message}
                        {e.result.job_id && (
                          <Link href={`/jobs/${e.result.job_id}`} className="underline">
                            tâche
                          </Link>
                        )}
                      </span>
                    )}
                    {e.state === "done" && e.result?.status === "invalid" && (
                      <span className="flex items-center gap-1 text-xs text-bad">
                        <XCircle className="size-4" aria-hidden /> {e.result.message}
                      </span>
                    )}
                    {e.state === "done" && !e.result && (
                      <CheckCircle2 className="size-4 text-ok" aria-hidden />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
