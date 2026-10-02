"use client";

import { LogIn, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signIn, signOut } from "@/lib/auth-client";
import { useViewer } from "@/lib/viewer";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const viewer = useViewer();
  const pathname = usePathname();

  if (!viewer) {
    return (
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        className={compact ? "" : "w-full justify-start"}
        onClick={() => signIn(pathname)}
      >
        <LogIn aria-hidden />
        Se connecter
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? "flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              : "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
          }
        >
          {compact ? (
            <>
              <span aria-hidden>{initials(viewer.name)}</span>
              <span className="sr-only">Compte</span>
            </>
          ) : (
            <>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials(viewer.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{viewer.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{viewer.email}</span>
              </span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{viewer.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> Réglages
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/account">
            <UserRound aria-hidden /> Mon compte
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
