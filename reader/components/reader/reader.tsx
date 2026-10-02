"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api/client";
import type { FindHit, Note, Toc } from "@/lib/api/types";
import { useOnline } from "@/lib/hooks";
import { usePreferences } from "@/lib/prefs/store";
import { prefetchRange, type RangeData, rangeQuery } from "@/lib/reader/data";
import { localProgress, useProgressSync } from "@/lib/reader/progress";
import { buildUnits, firstBodyUnit, type Unit, unitOf } from "@/lib/reader/units";
import { useViewer } from "@/lib/viewer";
import { DownloadButton } from "./download-button";
import { FindDialog } from "./find-dialog";
import { LanguagesMenu } from "./languages-menu";
import { NotePanel, type OpenNote } from "./note-panel";
import { ParallelView } from "./parallel-view";
import { Segments, useFlash } from "./segments";
import { SettingsPopover } from "./settings-popover";
import { TocSheet } from "./toc-sheet";

export type ReaderEdition = {
  id: string;
  title: string;
  language: string;
  revision: number;
  charLength: number;
  totalSegments: number;
  hasPageBreaks: boolean;
  isOriginal: boolean;
  work: { id: string; title: string; authors: string };
  siblings: {
    id: string;
    title: string;
    language: string;
    isOriginal: boolean;
    translators: string;
    alignment: "pending" | "reliable" | "doubtful" | "rejected" | null;
  }[];
};

export type StartPosition = { seq: number; offset: number; highlight: boolean };

type Target = { seq: number; offset: number; flash: boolean; key: number };

const WIDTHS = { narrow: "34rem", medium: "40rem", wide: "48rem" } as const;
const FONTS = {
  literata: "var(--font-serif)",
  "source-serif": "var(--font-serif-alt)",
  inter: "var(--font-sans)",
} as const;
const HEADER = 56;

/** Liseuse : chapitre par chapitre, en défilement ou en pages. */
export function Reader({
  edition,
  toc,
  start,
  startedAt,
  initialRange,
}: {
  edition: ReaderEdition;
  toc: Toc;
  start: StartPosition | null;
  startedAt: string | null;
  /** Premier chapitre, déjà chargé par le serveur (pas d'aller-retour au démarrage). */
  initialRange: { from: number; to: number; data: RangeData } | null;
}) {
  const viewer = useViewer();
  const { prefs, setPrefs } = usePreferences();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const units = useMemo(
    () => buildUnits(toc.sections, edition.totalSegments),
    [toc, edition.totalSegments],
  );

  // ------------------------------------------------------------ position
  const [target, setTarget] = useState<Target | null>(() =>
    start ? { seq: start.seq, offset: start.offset, flash: start.highlight, key: 0 } : null,
  );
  const [ready, setReady] = useState(start !== null);
  const [current, setCurrent] = useState(() => start?.seq ?? firstBodyUnit(units)?.from ?? 0);

  // Visiteur ou hors ligne : dernière position connue de cet appareil
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void localProgress(edition.id).then((p) => {
      if (cancelled) return;
      const seq = p && p.revision === edition.revision ? p.seq : (firstBodyUnit(units)?.from ?? 0);
      setTarget({ seq, offset: p?.offset ?? 0, flash: false, key: 0 });
      setCurrent(seq);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, edition.id, edition.revision, units]);

  const unit: Unit | undefined = unitOf(units, current) ?? units[0];
  const [flash, setFlash] = useFlash(start?.highlight ? start.seq : null);

  const goTo = useCallback(
    (seq: number, offset = 0, opts: { flash?: boolean } = {}) => {
      setTarget((t) => ({ seq, offset, flash: Boolean(opts.flash), key: (t?.key ?? 0) + 1 }));
      setCurrent(seq);
      if (opts.flash) setFlash(seq);
    },
    [setFlash],
  );
  const goUnit = useCallback(
    (index: number, atEnd = false) => {
      const u = units[index];
      if (u) goTo(atEnd ? u.to : u.from, 0);
    },
    [units, goTo],
  );

  // ------------------------------------------------------------ données
  const range = useQuery({
    ...rangeQuery(edition.id, edition.revision, unit?.from ?? 0, unit?.to ?? 0),
    enabled: ready && unit !== undefined,
    initialData:
      initialRange && unit && initialRange.from === unit.from && initialRange.to === unit.to
        ? initialRange.data
        : undefined,
  });

  // Précharge le chapitre suivant (et le précédent)
  useEffect(() => {
    if (!range.data || !unit) return;
    for (const u of [units[unit.index + 1], units[unit.index - 1]]) {
      if (u) void prefetchRange(qc, edition.id, edition.revision, u.from, u.to);
    }
  }, [range.data, unit, units, qc, edition.id, edition.revision]);

  // ------------------------------------------------------------ progression
  const { report, flush } = useProgressSync({
    editionId: edition.id,
    workId: edition.work.id,
    revision: edition.revision,
    charLength: edition.charLength,
    signedIn: viewer !== null,
    startedAt,
  });
  const segBySeq = useMemo(
    () => new Map(range.data?.segments.map((s) => [s.seq, s]) ?? []),
    [range.data],
  );

  const onVisible = useCallback(
    (seq: number, offset: number) => {
      const seg = segBySeq.get(seq);
      if (!seg || !unit) return;
      setCurrent(seq);
      report({ seq, offset, text: seg.text, charStart: seg.char_start, path: unit.path });
    },
    [segBySeq, unit, report],
  );

  // ------------------------------------------------------------ interface
  const [chrome, setChrome] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [note, setNote] = useState<OpenNote>(null);
  const parallelTarget =
    prefs.parallel.enabled && prefs.parallel.targetLang
      ? (edition.siblings.find((s) => s.language === prefs.parallel.targetLang) ?? null)
      : null;
  const mode = parallelTarget ? "scroll" : prefs.mode;

  // Masque l'interface après quelques secondes de lecture, sauf pendant qu'on
  // s'en sert (menu, panneau ou dialogue ouvert, focus ou pointeur sur une barre)
  useEffect(() => {
    if (!chrome || tocOpen) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        const busy =
          document.querySelector(
            "[data-radix-popper-content-wrapper], [role=dialog], [role=menu]",
          ) ||
          document.querySelector("[data-reader-chrome]:hover, [data-reader-chrome]:focus-within");
        if (busy) schedule();
        else setChrome(false);
      }, 3500);
    };
    schedule();
    return () => clearTimeout(t);
  }, [chrome, tocOpen]);

  const onContentClick = useCallback((e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-note]");
    if (btn?.dataset.note) {
      e.stopPropagation();
      setNote({ noteId: btn.dataset.note, rect: btn.getBoundingClientRect() });
      return true;
    }
    return false;
  }, []);

  const switchEdition = async (targetId: string) => {
    try {
      const c = unwrap(
        await api.GET("/v1/editions/{edition_id}/counterpart", {
          params: { path: { edition_id: edition.id }, query: { seq: current, target: targetId } },
        }),
      );
      router.push(`/read/${targetId}?seq=${c.seq_start}`);
    } catch {
      toast("Passage correspondant introuvable : ouverture au début");
      router.push(`/read/${targetId}`);
    }
  };

  const onFind = (hit: FindHit) => goTo(hit.seq, hit.offset, { flash: true });

  const style = {
    "--reader-size": `${prefs.size}px`,
    "--reader-leading": prefs.lineHeight,
    "--reader-font": FONTS[prefs.font],
    "--reader-align": prefs.align === "justify" ? "justify" : "start",
    "--reader-hyphens": prefs.hyphens ? "auto" : "manual",
    "--reader-max": parallelTarget ? "72rem" : WIDTHS[prefs.width],
  } as CSSProperties;

  const progress = (() => {
    const seg = segBySeq.get(current);
    return seg ? seg.char_start / Math.max(1, edition.charLength) : null;
  })();

  return (
    <div className="min-h-dvh bg-reader-bg" style={style}>
      {/* En-tête */}
      <AnimatePresence>
        {chrome && (
          <motion.header
            initial={{ y: -HEADER }}
            animate={{ y: 0 }}
            exit={{ y: -HEADER }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-reader-chrome
            className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-4"
          >
            <Button asChild variant="ghost" size="icon" aria-label="Retour à la fiche de l'œuvre">
              <Link
                href={`/works/${edition.work.id}`}
                onClick={async (e) => {
                  // La fiche affiche la progression : on l'enregistre avant d'y aller
                  e.preventDefault();
                  await flush();
                  router.push(`/works/${edition.work.id}`);
                }}
              >
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
            <TocSheet
              sections={toc.sections}
              currentSeq={current}
              onGo={(seq) => goTo(seq)}
              open={tocOpen}
              onOpenChange={setTocOpen}
            />
            <div className="min-w-0 flex-1 px-2 text-center">
              <div className="truncate font-serif text-sm font-medium">{edition.title}</div>
              <div className="truncate text-xs text-muted-foreground">{unit?.path.join(" · ")}</div>
            </div>
            {!online && (
              <WifiOff className="size-4 text-muted-foreground" aria-label="Hors ligne" />
            )}
            <FindDialog
              editionId={edition.id}
              revision={edition.revision}
              lang={edition.language}
              onGo={onFind}
            />
            <LanguagesMenu
              edition={edition}
              parallelTarget={parallelTarget?.id ?? null}
              onSwitch={switchEdition}
              onParallel={(id) => {
                const s = edition.siblings.find((x) => x.id === id);
                setPrefs({ parallel: { enabled: Boolean(s), targetLang: s?.language ?? null } });
              }}
            />
            <div className="max-sm:hidden">
              <DownloadButton edition={edition} toc={toc} />
            </div>
            <SettingsPopover hasPageBreaks={edition.hasPageBreaks} />
          </motion.header>
        )}
      </AnimatePresence>

      {/* Texte */}
      {!ready || range.isPending ? (
        <div className="flex h-dvh items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Chargement" />
        </div>
      ) : range.isError ? (
        <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-medium">Ce chapitre n'a pas pu être chargé.</p>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Le corpus est peut-être indisponible."
              : "Vous êtes hors ligne et ce livre n'a pas été téléchargé."}
          </p>
          <Button variant="outline" onClick={() => range.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : mode === "paged" ? (
        <PagedView
          key={`${unit?.index}-${prefs.size}-${prefs.lineHeight}-${prefs.font}-${prefs.width}`}
          unit={unit as Unit}
          units={units}
          target={target}
          onVisible={onVisible}
          onPrevUnit={() => unit && goUnit(unit.index - 1, true)}
          onNextUnit={() => unit && goUnit(unit.index + 1)}
          onToggleChrome={() => setChrome((c) => !c)}
          onContentClick={onContentClick}
          lang={edition.language}
        >
          <Segments
            segments={range.data.segments}
            showPages={prefs.showPageNumbers}
            flashSeq={flash}
          />
        </PagedView>
      ) : (
        <ScrollView
          unit={unit as Unit}
          units={units}
          target={target}
          onVisible={onVisible}
          onUnit={goUnit}
          onToggleChrome={() => setChrome((c) => !c)}
          onScrollDir={(down) => setChrome(!down)}
          onContentClick={onContentClick}
          lang={parallelTarget ? undefined : edition.language}
        >
          {parallelTarget && unit ? (
            <ParallelView
              editionId={edition.id}
              from={unit.from}
              to={unit.to}
              sourceSegments={range.data.segments}
              sourceLang={edition.language}
              target={parallelTarget}
              showPages={prefs.showPageNumbers}
              flashSeq={flash}
            />
          ) : (
            <Segments
              segments={range.data.segments}
              showPages={prefs.showPageNumbers}
              flashSeq={flash}
            />
          )}
        </ScrollView>
      )}

      {/* Pied : avancement */}
      <AnimatePresence>
        {chrome && unit && (
          <motion.footer
            initial={{ y: 64 }}
            animate={{ y: 0 }}
            exit={{ y: 64 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-reader-chrome
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
          >
            <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={unit.index === 0}
                onClick={() => goUnit(unit.index - 1)}
                aria-label="Chapitre précédent"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <div
                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Avancement"
                aria-valuenow={Math.round((progress ?? 0) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${(progress ?? 0) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                {progress !== null ? `${Math.round(progress * 100)} %` : ""}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={unit.index >= units.length - 1}
                onClick={() => goUnit(unit.index + 1)}
                aria-label="Chapitre suivant"
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      <NotePanel
        open={note}
        onClose={() => setNote(null)}
        editionId={edition.id}
        revision={edition.revision}
        known={(range.data?.notes ?? {}) as Record<string, Note>}
        lang={edition.language}
      />
    </div>
  );
}

// ======================================================================
// Défilement
// ======================================================================

/** Premier segment visible sous l'en-tête et position approximative dedans. */
function firstVisible(root: HTMLElement): { seq: number; offset: number } | null {
  const ps = root.querySelectorAll<HTMLElement>("p[data-seq]");
  for (const p of ps) {
    if (p.closest("[data-parallel-target]")) continue;
    const r = p.getBoundingClientRect();
    if (r.bottom > HEADER + 8) {
      const len = p.textContent?.length ?? 0;
      const hidden = Math.max(0, HEADER + 8 - r.top);
      const offset = r.height > 0 ? Math.floor((len * hidden) / r.height) : 0;
      return { seq: Number(p.dataset.seq), offset };
    }
  }
  return null;
}

function scrollToSeq(root: HTMLElement, seq: number, offset: number) {
  const p = root.querySelector<HTMLElement>(`p[data-seq="${seq}"]`);
  if (!p) return;
  const len = p.textContent?.length || 1;
  const r = p.getBoundingClientRect();
  const y = window.scrollY + r.top - HEADER - 16 + (r.height * Math.min(offset, len)) / len;
  window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
}

function ScrollView({
  unit,
  units,
  target,
  onVisible,
  onUnit,
  onToggleChrome,
  onScrollDir,
  onContentClick,
  lang,
  children,
}: {
  unit: Unit;
  units: Unit[];
  target: Target | null;
  onVisible: (seq: number, offset: number) => void;
  onUnit: (index: number) => void;
  onToggleChrome: () => void;
  onScrollDir: (down: boolean) => void;
  onContentClick: (e: React.MouseEvent) => boolean;
  lang: string | undefined;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastY = useRef(0);

  // Va à la position demandée (ou en haut du chapitre)
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (target && target.seq >= unit.from && target.seq <= unit.to && target.seq !== unit.from) {
      scrollToSeq(el, target.seq, target.offset);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    lastY.current = window.scrollY;
  }, [target, unit.from, unit.to]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastY.current) > 24) {
          onScrollDir(y > lastY.current);
          lastY.current = y;
        }
        const el = root.current;
        const v = el && firstVisible(el);
        if (v) onVisible(v.seq, v.offset);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [onVisible, onScrollDir]);

  const prev = units[unit.index - 1];
  const next = units[unit.index + 1];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: le toucher au centre affiche l'interface ; le clavier a ses propres raccourcis
    <div
      ref={root}
      onClick={(e) => {
        if (onContentClick(e)) return;
        if (window.getSelection()?.toString()) return;
        onToggleChrome();
      }}
      className="mx-auto max-w-[var(--reader-max)] px-5 pt-20 pb-32 sm:px-8"
    >
      {prev && unit.index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnit(prev.index);
          }}
          className="mb-10 flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {prev.path.at(-1)}
        </button>
      )}
      <article className="reader-text" lang={lang}>
        {children}
      </article>
      {next && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnit(next.index);
          }}
          className="mt-16 flex w-full flex-col items-center gap-1 rounded-xl border bg-card p-6 text-center transition-colors hover:bg-accent"
        >
          <span className="text-xs tracking-wide text-muted-foreground uppercase">Suite</span>
          <span className="font-serif text-lg">{next.path.join(" · ")}</span>
        </button>
      )}
      {!next && <p className="mt-16 text-center font-serif text-muted-foreground">Fin</p>}
    </div>
  );
}

// ======================================================================
// Pages (colonnes CSS)
// ======================================================================

function PagedView({
  unit,
  units,
  target,
  onVisible,
  onPrevUnit,
  onNextUnit,
  onToggleChrome,
  onContentClick,
  lang,
  children,
}: {
  unit: Unit;
  units: Unit[];
  target: Target | null;
  onVisible: (seq: number, offset: number) => void;
  onPrevUnit: () => void;
  onNextUnit: () => void;
  onToggleChrome: () => void;
  onContentClick: (e: React.MouseEvent) => boolean;
  lang: string;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [box, setBox] = useState({ w: 0, gap: 64 });
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Mesure : une colonne = une page de la largeur de la zone de texte
  const measure = useCallback(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return null;
    const w = o.clientWidth;
    const gap = w < 640 ? 40 : 64;
    i.style.columnWidth = `${w}px`;
    i.style.columnGap = `${gap}px`;
    const n = Math.max(1, Math.round((i.scrollWidth + gap) / (w + gap)));
    setBox({ w, gap });
    setPages(n);
    return { w, gap, n };
  }, []);

  const pageOf = useCallback((seq: number, offset: number) => {
    const i = inner.current;
    const m = {
      w: outer.current?.clientWidth ?? 0,
      gap: (outer.current?.clientWidth ?? 0) < 640 ? 40 : 64,
    };
    if (!i || m.w === 0) return 0;
    const p = i.querySelector<HTMLElement>(`p[data-seq="${seq}"]`);
    if (!p) return 0;
    const rects = [...p.getClientRects()];
    const len = p.textContent?.length || 1;
    const rect =
      rects[Math.min(rects.length - 1, Math.floor((rects.length * offset) / len))] ?? rects[0];
    if (!rect) return 0;
    const base = i.getBoundingClientRect().left;
    return Math.max(0, Math.floor((rect.left - base + 1) / (m.w + m.gap)));
  }, []);

  useLayoutEffect(() => {
    const m = measure();
    if (!m) return;
    let p = 0;
    if (target && target.seq >= unit.from && target.seq <= unit.to) {
      p =
        target.seq === unit.to && target.offset === 0 && target.seq !== unit.from
          ? m.n - 1
          : pageOf(target.seq, target.offset);
    }
    setPage(Math.min(p, m.n - 1));
  }, [measure, pageOf, target, unit.from, unit.to]);

  useEffect(() => {
    const o = outer.current;
    if (!o) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(o);
    return () => ro.disconnect();
  }, [measure]);

  // Position : premier segment présent sur la page courante
  // biome-ignore lint/correctness/useExhaustiveDependencies: `page` déclenche la mesure après chaque tour de page
  useEffect(() => {
    const i = inner.current;
    const o = outer.current;
    if (!i || !o || box.w === 0) return;
    const t = setTimeout(() => {
      const left = o.getBoundingClientRect().left;
      for (const p of i.querySelectorAll<HTMLElement>("p[data-seq]")) {
        const rects = [...p.getClientRects()];
        const idx = rects.findIndex((r) => r.right > left + 1 && r.left < left + box.w);
        if (idx >= 0) {
          const len = p.textContent?.length ?? 0;
          onVisible(Number(p.dataset.seq), Math.floor((len * idx) / Math.max(1, rects.length)));
          return;
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [page, box.w, onVisible]);

  const next = useCallback(() => {
    if (page < pages - 1) setPage(page + 1);
    else if (unit.index < units.length - 1) onNextUnit();
  }, [page, pages, unit.index, units.length, onNextUnit]);
  const prev = useCallback(() => {
    if (page > 0) setPage(page - 1);
    else if (unit.index > 0) onPrevUnit();
  }, [page, unit.index, onPrevUnit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [role=dialog]")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  return (
    <div className="fixed inset-0 flex justify-center px-5 pt-16 pb-14 sm:px-10 sm:pt-20 sm:pb-16">
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: zones de toucher (bords = pages, centre = interface) ; flèches au clavier */}
      <div
        ref={outer}
        className="relative h-full w-full max-w-[var(--reader-max)] overflow-hidden"
        onClick={(e) => {
          if (onContentClick(e)) return;
          if (window.getSelection()?.toString()) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          if (x < 0.3) prev();
          else if (x > 0.7) next();
          else onToggleChrome();
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = touch.current;
          const t = e.changedTouches[0];
          touch.current = null;
          if (!s || !t) return;
          const dx = t.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s.y)) {
            e.preventDefault();
            if (dx < 0) next();
            else prev();
          }
        }}
      >
        <div
          ref={inner}
          lang={lang}
          className="reader-text reader-paged h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${page * (box.w + box.gap)}px)` }}
        >
          {children}
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums">
        {page + 1} / {pages}
      </div>
    </div>
  );
}

export type { Unit };
