import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function Section({
  title,
  href,
  action,
  children,
}: {
  title: string;
  href?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl font-semibold tracking-tight">{title}</h2>
        {href ? (
          <Link
            href={href as never}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Tout voir <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          action
        )}
      </div>
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
