import { STEP_LABEL } from "@/components/common/status";
import { Progress } from "@/components/ui/progress";
import type { JobSummary } from "@/lib/api/types";

type P = { step?: string; done?: number; total?: number; message?: string };

/** Étape en cours et avancement d'une tâche (progress JSON du worker). */
export function JobProgress({ job, compact = false }: { job: JobSummary; compact?: boolean }) {
  const p = job.progress as P;
  if (job.status !== "running" && job.status !== "queued") return null;
  if (job.status === "queued")
    return <span className="text-xs text-muted-foreground">en attente du worker</span>;
  const pct = p.total ? Math.round(((p.done ?? 0) / p.total) * 100) : null;
  const step = p.step ? (STEP_LABEL[p.step] ?? p.step) : "démarrage";
  return (
    <div className={compact ? "w-48" : "w-full"}>
      <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {step}
          {p.message && !compact ? ` — ${p.message}` : ""}
        </span>
        {p.total ? (
          <span className="tabular">
            {p.done ?? 0}/{p.total}
          </span>
        ) : null}
      </div>
      <Progress value={pct ?? 100} className={pct === null ? "animate-pulse" : undefined} />
    </div>
  );
}
