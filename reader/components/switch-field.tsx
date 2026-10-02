"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Interrupteur avec son libellé (cliquable, associé pour les lecteurs d'écran). */
export function SwitchField({
  label,
  checked,
  onChange,
  className,
  reverse = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  reverse?: boolean;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-sm",
        reverse ? "flex-row-reverse justify-end" : "justify-between",
        className,
      )}
    >
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
