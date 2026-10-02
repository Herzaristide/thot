"use client";

import { Heart } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { send } from "@/lib/offline/outbox";
import { cn } from "@/lib/utils";

export function FavoriteButton({ workId, initial }: { workId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const router = useRouter();

  const toggle = async () => {
    const next = !on;
    setOn(next);
    await send(next ? "PUT" : "DELETE", `/api/me/favorites/${workId}`, undefined, {
      key: `favorite:${workId}`,
    });
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      <motion.span
        key={String(on)}
        initial={{ scale: on ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        className="inline-flex"
      >
        <Heart className={cn(on && "fill-primary text-primary")} aria-hidden />
      </motion.span>
      <span className="max-sm:sr-only">Favori</span>
    </Button>
  );
}
