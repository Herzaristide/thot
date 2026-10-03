"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { AlignmentBadge, JOB_KIND, JobStatusBadge, STEP_LABEL } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { JobDetail } from "@/lib/api/types";
import { dateTime, duration, num, percent } from "@/lib/format";
import { JobProgress } from "./job-progress";
import { ReviewForm } from "./review-form";

type AlignReport = {
  status: string;
  source_file?: string;
  aligned_ratio?: number;
  edition_id?: string;
};

function ResultSummary({ job }: { job: JobDetail }) {
  const r = (job.result ?? {}) as Record<string, unknown>;
  const rows: [string, React.ReactNode][] = [];
  if (r.edition_id)
    rows.push([
      "Édition",
      <Link key="e" href={`/works/${r.work_id ?? job.work_id}`} className="underline">
        {job.edition_title ?? String(r.edition_id)}
      </Link>,
    ]);
  const index = r.index as
    | { chunks?: number; tokens?: number; collection?: string }
    | null
    | undefined;
  if (index)
    rows.push([
      "Indexation",
      `${num(index.chunks)} chunks, ${num(index.tokens)} tokens (${index.collection})`,
    ]);
  const align = r.align as { editions?: AlignReport[]; skipped?: string } | undefined;
  if (align?.skipped) rows.push(["Alignement", align.skipped]);
  if (align?.editions?.length)
    rows.push([
      "Alignement",
      <ul key="a" className="flex flex-col gap-0.5">
        {align.editions.map((e, i) => (
          <li key={e.edition_id ?? i} className="flex items-center gap-2">
            <AlignmentBadge status={e.status} />
            <span className="truncate text-xs text-muted-foreground">{e.source_file}</span>
            {e.aligned_ratio !== undefined && (
              <span className="text-xs tabular">{percent(e.aligned_ratio)}</span>
            )}
          </li>
        ))}
      </ul>,
    ]);
  const quality = r.quality as { score?: number; signals?: string[] } | undefined;
  if (quality?.score !== undefined)
    rows.push([
      "Qualité",
      `${quality.score}/100${quality.signals?.length ? ` — ${quality.signals.join(", ")}` : ""}`,
    ]);
  for (const key of [
    "extracted",
    "failed",
    "unchanged",
    "indexed",
    "aligned_works",
    "editions",
    "ok",
  ]) {
    if (typeof r[key] === "number") rows.push([key, num(r[key] as number)]);
  }
  if (r.rejected) rows.push(["Décision", "dépôt rejeté"]);
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JobDetailPage({ id }: { id: string }) {
  const {
    data: job,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["job", id],
    queryFn: async () =>
      unwrap(await api.GET("/v1/admin/jobs/{job_id}", { params: { path: { job_id: id } } })),
    // Filet de sécurité si le flux temps réel est coupé
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5000 : false),
  });
  if (isLoading) return <Loading />;
  if (error || !job) return <ErrorBox error={error} />;

  const act = async (action: "cancel" | "retry") => {
    try {
      unwrap(
        action === "cancel"
          ? await api.POST("/v1/admin/jobs/{job_id}/cancel", { params: { path: { job_id: id } } })
          : await api.POST("/v1/admin/jobs/{job_id}/retry", { params: { path: { job_id: id } } }),
      );
      toast.success(action === "cancel" ? "Annulation demandée" : "Tâche remise en file");
      void refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const canCancel =
    ["queued", "running", "needs_review"].includes(job.status) && job.kind !== "cli";
  const canRetry = ["failed", "cancelled"].includes(job.status) && job.kind !== "cli";
  const p = job.progress as { step?: string };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/jobs" className="hover:underline">
            Tâches
          </Link>
        }
        title={job.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <JobStatusBadge status={job.status} />
            <span>{JOB_KIND[job.kind]}</span>
            {job.work_id && (
              <Link
                href={`/works/${job.work_id}`}
                className="inline-flex items-center gap-1 underline"
              >
                {job.work_title} <ExternalLink className="size-3" aria-hidden />
              </Link>
            )}
          </span>
        }
        actions={
          <>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void act("cancel")}
                disabled={job.cancel_requested}
              >
                <Ban aria-hidden /> {job.cancel_requested ? "Annulation demandée" : "Annuler"}
              </Button>
            )}
            {canRetry && (
              <Button variant="outline" size="sm" onClick={() => void act("retry")}>
                <RotateCcw aria-hidden /> Relancer
              </Button>
            )}
          </>
        }
      />

      {job.status === "running" && (
        <div className="mb-4">
          <JobProgress job={job} />
        </div>
      )}
      {job.error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad"
        >
          {job.error}
        </div>
      )}

      {job.kind === "ingest" && job.status === "needs_review" && (
        <ReviewForm key={job.id} job={job} />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Déroulement</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Créée</dt>
              <dd>
                {dateTime(job.created_at)}{" "}
                {job.created_by_sub && (
                  <span className="text-muted-foreground">· {job.created_by_sub}</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Démarrée</dt>
              <dd>{dateTime(job.started_at)}</dd>
              <dt className="text-muted-foreground">Terminée</dt>
              <dd>
                {dateTime(job.finished_at)}
                {job.started_at && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {duration(job.started_at, job.finished_at)}
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Tentatives</dt>
              <dd className="tabular">{job.attempts}</dd>
              {p.step && (
                <>
                  <dt className="text-muted-foreground">Dernière étape</dt>
                  <dd>{STEP_LABEL[p.step] ?? p.step}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Résultat</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultSummary job={job} />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Paramètres et résultat bruts
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify({ params: job.params, result: job.result }, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>

      {job.ingestions.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Journal des ingestions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Étape</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Segments</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead>Durée</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.ingestions.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{STEP_LABEL[i.stage ?? ""] ?? i.stage}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs" title={i.source_file}>
                      {i.source_file}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          i.status === "failed"
                            ? "text-bad"
                            : i.status === "succeeded"
                              ? "text-ok"
                              : ""
                        }
                      >
                        {i.status}
                      </span>
                      {i.error && (
                        <div className="max-w-sm truncate text-xs text-bad" title={i.error}>
                          {i.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">{num(i.n_segments)}</TableCell>
                    <TableCell className="text-right tabular">{num(i.n_chunks)}</TableCell>
                    <TableCell className="text-xs tabular">
                      {duration(i.started_at, i.finished_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
