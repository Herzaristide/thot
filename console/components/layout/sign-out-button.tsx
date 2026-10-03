"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <Button variant="outline" onClick={() => void signOut()}>
      <LogOut aria-hidden /> Se déconnecter
    </Button>
  );
}
