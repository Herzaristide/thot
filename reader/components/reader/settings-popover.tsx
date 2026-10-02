"use client";

import { AlignJustify, AlignLeft, BookOpenText, Minus, Plus, ScrollText, Type } from "lucide-react";
import { SwitchField } from "@/components/switch-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Preferences } from "@/lib/prefs/schema";
import { usePreferences } from "@/lib/prefs/store";
import { cn } from "@/lib/utils";

const THEMES: { value: Preferences["theme"]; label: string; swatch: string }[] = [
  {
    value: "light",
    label: "Clair",
    swatch: "bg-[oklch(0.99_0.004_85)] text-[oklch(0.22_0.012_60)]",
  },
  {
    value: "sepia",
    label: "Sépia",
    swatch: "bg-[oklch(0.945_0.03_85)] text-[oklch(0.3_0.035_60)]",
  },
  {
    value: "dark",
    label: "Sombre",
    swatch: "bg-[oklch(0.17_0.006_60)] text-[oklch(0.93_0.008_85)]",
  },
  {
    value: "system",
    label: "Auto",
    swatch:
      "bg-gradient-to-br from-[oklch(0.99_0.004_85)] from-50% to-[oklch(0.17_0.006_60)] to-50% text-[oklch(0.5_0.01_60)]",
  },
];

const FONTS: { value: Preferences["font"]; label: string; className: string }[] = [
  { value: "literata", label: "Literata", className: "font-serif" },
  { value: "source-serif", label: "Source Serif", className: "font-serif-alt" },
  { value: "inter", label: "Inter", className: "font-sans" },
];

/** Réglages rapides « Aa », appliqués en direct. */
export function SettingsPopover({ hasPageBreaks }: { hasPageBreaks: boolean }) {
  const { prefs, setPrefs } = usePreferences();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Réglages d'affichage">
          <Type aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-5">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Thème">
          {THEMES.map((t) => (
            // biome-ignore lint/a11y/useSemanticElements: pastilles de thème, plus lisibles que des boutons radio natifs
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={prefs.theme === t.value}
              onClick={() => setPrefs({ theme: t.value })}
              className="flex flex-col items-center gap-1 text-xs"
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-full border font-serif text-base",
                  t.swatch,
                  prefs.theme === t.value &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                )}
              >
                Aa
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Police</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full"
            value={prefs.font}
            onValueChange={(v) => v && setPrefs({ font: v as Preferences["font"] })}
          >
            {FONTS.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className={cn("flex-1 text-xs", f.className)}
              >
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Taille</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{prefs.size} px</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Plus petit"
              onClick={() => setPrefs({ size: Math.max(14, prefs.size - 1) })}
            >
              <Minus aria-hidden />
            </Button>
            <Slider
              min={14}
              max={30}
              step={1}
              value={[prefs.size]}
              onValueChange={([v]) => v && setPrefs({ size: v })}
              aria-label="Taille du texte"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Plus grand"
              onClick={() => setPrefs({ size: Math.min(30, prefs.size + 1) })}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Interlignage</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {prefs.lineHeight.toFixed(2)}
            </span>
          </div>
          <Slider
            min={1.2}
            max={2.2}
            step={0.05}
            value={[prefs.lineHeight]}
            onValueChange={([v]) => v && setPrefs({ lineHeight: v })}
            aria-label="Interlignage"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Largeur</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={prefs.width}
              onValueChange={(v) => v && setPrefs({ width: v as Preferences["width"] })}
            >
              <ToggleGroupItem value="narrow" aria-label="Étroite">
                S
              </ToggleGroupItem>
              <ToggleGroupItem value="medium" aria-label="Moyenne">
                M
              </ToggleGroupItem>
              <ToggleGroupItem value="wide" aria-label="Large">
                L
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>Alignement</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={prefs.align}
              onValueChange={(v) => v && setPrefs({ align: v as Preferences["align"] })}
            >
              <ToggleGroupItem value="start" aria-label="À gauche">
                <AlignLeft aria-hidden />
              </ToggleGroupItem>
              <ToggleGroupItem value="justify" aria-label="Justifié">
                <AlignJustify aria-hidden />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mode de lecture</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full"
            value={prefs.mode}
            onValueChange={(v) => v && setPrefs({ mode: v as Preferences["mode"] })}
          >
            <ToggleGroupItem value="scroll" className="flex-1 text-xs">
              <ScrollText aria-hidden /> Défilement
            </ToggleGroupItem>
            <ToggleGroupItem value="paged" className="flex-1 text-xs">
              <BookOpenText aria-hidden /> Pages
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-3">
          <SwitchField
            label="Césure"
            checked={prefs.hyphens}
            onChange={(v) => setPrefs({ hyphens: v })}
          />
          {hasPageBreaks && (
            <SwitchField
              label="Numéros de page de l'édition papier"
              checked={prefs.showPageNumbers}
              onChange={(v) => setPrefs({ showPageNumbers: v })}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
