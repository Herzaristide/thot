import Link from "next/link";
import { Cover, type CoverWork } from "@/components/covers/cover";
import { authorsLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Vignette d'œuvre : couverture, titre, auteur. */
export function WorkCard({
  work,
  className,
  footer,
}: {
  work: CoverWork;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Link
      href={`/works/${work.id}`}
      className={cn("group flex flex-col gap-2 rounded-lg outline-none", className)}
    >
      <Cover
        work={work}
        className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring"
      />
      <div className="min-w-0">
        <div className="line-clamp-2 font-serif text-sm leading-snug font-medium">{work.title}</div>
        <div className="truncate text-xs text-muted-foreground">{authorsLabel(work.authors)}</div>
        {footer}
      </div>
    </Link>
  );
}

export function WorkGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
      {children}
    </div>
  );
}

/** Rangée défilante horizontalement (accueil). */
export function WorkRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8 [&>*]:w-32 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-40">
      {children}
    </div>
  );
}
