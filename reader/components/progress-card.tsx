import Link from "next/link";
import { Cover } from "@/components/covers/cover";
import { percent, relativeTime } from "@/lib/format";
import type { ProgressWithWork } from "@/lib/reader-data";

/** Carte « Continuer la lecture » : couverture, chapitre, avancement. */
export function ProgressCard({ p }: { p: ProgressWithWork }) {
  const work = p.work ?? {
    id: p.workId,
    title: "Œuvre",
    authors: [],
    first_published_year: null,
    movements: [],
  };
  return (
    <Link
      href={`/read/${p.editionId}`}
      className="group flex gap-4 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/60"
    >
      <Cover work={work} size="sm" className="w-16 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="line-clamp-1 font-serif font-medium">{work.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {work.authors.map((a) => a.name).join(", ")}
        </div>
        {p.sectionPath && p.sectionPath.length > 0 && (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {p.sectionPath.join(" · ")}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: percent(p.progress) }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {percent(p.progress)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{relativeTime(p.updatedAt)}</div>
      </div>
    </Link>
  );
}
