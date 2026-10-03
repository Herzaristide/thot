"use client";

import { Loader2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

/** Lance la connexion Keycloak ; `auto` la déclenche dès l'affichage. */
export function LoginButton({ next, auto = false }: { next: string; auto?: boolean }) {
  const [busy, setBusy] = useState(auto);
  useEffect(() => {
    if (auto) void signIn(next);
  }, [auto, next]);
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn(next);
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
      Se connecter
    </Button>
  );
}
