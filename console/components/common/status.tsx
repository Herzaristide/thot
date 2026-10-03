import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  Hand,
  Loader2,
  XCircle,
} from "lucide-react";
import type { JobKind, JobStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const JOB_STATUS: Record<JobStatus, { label: string; className: string; icon: typeof Clock }> = {
  queued: { label: "En file", className: "text-muted-foreground", icon: Clock },
  running: { label: "En cours", className: "text-info", icon: Loader2 },
  needs_review: { label: "À valider", className: "text-warn", icon: Hand },
  succeeded: { label: "Terminée", className: "text-ok", icon: CheckCircle2 },
  failed: { label: "Échec", className: "text-bad", icon: XCircle },
  cancelled: { label: "Annulée", className: "text-muted-foreground", icon: CircleSlash },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const s = JOB_STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        s.className,
      )}
    >
      <Icon className={cn("size-3.5", status === "running" && "animate-spin")} aria-hidden />
      {s.label}
    </span>
  );
}

export const JOB_KIND: Record<JobKind, string> = {
  ingest: "Dépôt",
  reprocess: "Retraitement",
  align: "Alignement",
  sync_payload: "Fiches → Qdrant",
  trash_edition: "Corbeille",
  restore_edition: "Restauration",
  purge: "Purge",
  import_books: "Import books/",
  quality: "Qualité",
  cli: "Ligne de commande",
};

export const STEP_LABEL: Record<string, string> = {
  read: "lecture",
  identify: "classement",
  save: "enregistrement",
  extract: "extraction",
  index: "indexation",
  align: "alignement",
  quality: "qualité",
  reprocess: "retraitement",
  trash: "corbeille",
  purge: "purge",
  sync_payload: "payload Qdrant",
  reparse: "relecture",
};

const ALIGN_STATUS: Record<string, { label: string; className: string }> = {
  reliable: { label: "fiable", className: "bg-ok/15 text-ok" },
  doubtful: { label: "douteux", className: "bg-warn/15 text-warn" },
  rejected: { label: "rejeté", className: "bg-bad/15 text-bad" },
  pending: { label: "en attente", className: "bg-muted text-muted-foreground" },
  reference: { label: "référence", className: "bg-info/15 text-info" },
};

export function AlignmentBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashed className="size-3" aria-hidden /> non aligné
      </span>
    );
  }
  const s = ALIGN_STATUS[status] ?? { label: status, className: "bg-muted" };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined)
    return <span className="text-xs text-muted-foreground">–</span>;
  const tone =
    score >= 85 ? "bg-ok/15 text-ok" : score >= 60 ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad";
  return (
    <span
      className={cn(
        "inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular",
        tone,
      )}
    >
      {score}
    </span>
  );
}

export function AccessBadge({ access }: { access: string }) {
  const labels: Record<string, string> = {
    open: "libre",
    excerpt: "extraits",
    restricted: "restreint",
  };
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-xs",
        access === "open" ? "border-ok/40 text-ok" : "text-muted-foreground",
      )}
    >
      {labels[access] ?? access}
    </span>
  );
}
