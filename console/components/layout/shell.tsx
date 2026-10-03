"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogOut, Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, unwrap } from "@/lib/api/client";
import { signOut } from "@/lib/auth-client";
import { type LiveState, useLiveUpdates } from "@/lib/live";
import { cn } from "@/lib/utils";
import { useIsAdmin, useViewer } from "@/lib/viewer";
import { isActive, NAV } from "./nav";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Dépôts en attente de validation (pastille du menu). */
function useReviewCount(enabled: boolean) {
  return useQuery({
    queryKey: ["jobs", "needs_review-count"],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/jobs", {
          params: { query: { status: ["needs_review"], limit: 100 } },
        }),
      ).items.length,
    enabled,
  });
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const admin = useIsAdmin();
  const reviews = useReviewCount(admin);
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-5">
      {NAV.map((group) => {
        const items = group.items.filter((i) => admin || !i.admin);
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href as never}
                  onClick={onNavigate}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    "aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="flex-1">{label}</span>
                  {href === "/jobs" && !!reviews.data && (
                    <span className="rounded-full bg-warn px-1.5 text-xs font-semibold text-background tabular">
                      {reviews.data}
                      <span className="sr-only"> à valider</span>
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

const LIVE_LABEL: Record<LiveState, string> = {
  open: "Temps réel actif",
  connecting: "Connexion au temps réel…",
  closed: "Temps réel coupé",
};

function LiveDot({ state }: { state: LiveState }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-6 items-center justify-center" role="status">
          <span
            className={cn(
              "size-2 rounded-full",
              state === "open" && "bg-ok",
              state === "connecting" && "animate-pulse bg-warn",
              state === "closed" && "bg-bad",
            )}
          />
          <span className="sr-only">{LIVE_LABEL[state]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{LIVE_LABEL[state]}</TooltipContent>
    </Tooltip>
  );
}

function UserBox() {
  const viewer = useViewer();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initials(viewer.name)}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block truncate font-medium">{viewer.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {viewer.roles.includes("corpus:admin") ? "administrateur" : "relecteur"}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Changer de thème"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {resolvedTheme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Se déconnecter"
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden />
      </Button>
    </div>
  );
}

export function Shell({ children, readerUrl }: { children: ReactNode; readerUrl: string }) {
  const live = useLiveUpdates();
  const [open, setOpen] = useState(false);
  const sidebar = (onNavigate?: () => void) => (
    <>
      <Link href="/" className="mb-6 flex items-center justify-between px-3" onClick={onNavigate}>
        <Logo />
      </Link>
      <div className="flex-1 overflow-y-auto">
        <Nav onNavigate={onNavigate} />
      </div>
      <div className="mt-4 flex flex-col gap-1 border-t pt-3">
        <a
          href={readerUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <BookOpen className="size-4" aria-hidden /> Ouvrir la liseuse
        </a>
        <UserBox />
      </div>
    </>
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r px-3 py-5 lg:flex">
        {sidebar()}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col px-3 py-5">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {sidebar(() => setOpen(false))}
            </SheetContent>
          </Sheet>
          <Logo compact />
          <span className="flex-1" />
          <LiveDot state={live} />
        </header>
        <div className="pointer-events-none fixed top-3 right-4 z-40 hidden lg:block">
          <div className="pointer-events-auto">
            <LiveDot state={live} />
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
