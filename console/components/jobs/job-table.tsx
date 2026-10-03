import Link from "next/link";
import { JOB_KIND, JobStatusBadge } from "@/components/common/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobSummary } from "@/lib/api/types";
import { duration, relativeTime } from "@/lib/format";
import { JobProgress } from "./job-progress";

export function JobTable({ jobs, showError = true }: { jobs: JobSummary[]; showError?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tâche</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="hidden md:table-cell">Avancement</TableHead>
          <TableHead className="hidden sm:table-cell">Créée</TableHead>
          <TableHead className="hidden lg:table-cell">Durée</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="max-w-md">
              <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                {job.title}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {JOB_KIND[job.kind]}
                {job.work_title ? ` · ${job.work_title}` : ""}
                {job.edition_title && job.edition_title !== job.work_title
                  ? ` · ${job.edition_title}`
                  : ""}
              </div>
              {showError && job.error && job.status === "failed" && (
                <div className="mt-0.5 truncate text-xs text-bad" title={job.error}>
                  {job.error}
                </div>
              )}
            </TableCell>
            <TableCell>
              <JobStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <JobProgress job={job} compact />
            </TableCell>
            <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
              {relativeTime(job.created_at)}
              {job.created_by_sub === "cli" && " · CLI"}
            </TableCell>
            <TableCell className="hidden text-xs text-muted-foreground tabular lg:table-cell">
              {job.started_at ? duration(job.started_at, job.finished_at) : "–"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
