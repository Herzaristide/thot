import { cn } from "@/lib/utils";

/**
 * Couverture générative : le corpus n'a pas d'images. Teinte dérivée du
 * courant (même courant = même famille de couleurs), motif dérivé de
 * l'identifiant de l'œuvre, titre, auteur et date composés en SVG/CSS.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export type CoverWork = {
  id: string;
  title: string;
  authors: { name: string }[];
  first_published_year?: number | null;
  movements?: { slug: string }[];
};

export function Cover({
  work,
  size = "md",
  className,
}: {
  work: CoverWork;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const movement = work.movements?.[0]?.slug ?? "none";
  const hue = hash(movement) % 360;
  const rand = rng(hash(work.id));
  const variant = Math.floor(rand() * 4);
  const author = work.authors.map((a) => a.name).join(", ");

  const shapes: React.ReactNode[] = [];
  if (variant === 0) {
    // Arcs concentriques
    const cx = 20 + rand() * 60;
    for (let i = 0; i < 7; i++) {
      shapes.push(
        <circle key={i} cx={cx} cy={130} r={18 + i * 11} fill="none" strokeWidth={0.8} />,
      );
    }
  } else if (variant === 1) {
    // Lignes obliques
    for (let i = 0; i < 14; i++) {
      const x = -60 + i * 12;
      shapes.push(<line key={i} x1={x} y1={150} x2={x + 70} y2={60} strokeWidth={0.7} />);
    }
  } else if (variant === 2) {
    // Grille de points
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) {
        if (rand() > 0.35) {
          shapes.push(
            <circle key={`${x}-${y}`} cx={8 + x * 14} cy={86 + y * 13} r={1.6} stroke="none" />,
          );
        }
      }
    }
  } else {
    // Bandes horizontales
    for (let i = 0; i < 6; i++) {
      const h = 2 + rand() * 7;
      shapes.push(
        <rect
          key={i}
          x={0}
          y={88 + i * 12}
          width={100}
          height={h}
          stroke="none"
          opacity={0.5 + rand() * 0.5}
        />,
      );
    }
  }

  const titleSize = size === "sm" ? "text-[0.7rem]" : size === "lg" ? "text-xl" : "text-sm";
  const metaSize = size === "sm" ? "text-[0.55rem]" : size === "lg" ? "text-sm" : "text-[0.65rem]";

  return (
    <div
      className={cn(
        "@container relative aspect-[2/3] overflow-hidden rounded-md shadow-sm ring-1 ring-black/5 select-none",
        className,
      )}
      style={{
        background: `linear-gradient(160deg, oklch(0.42 0.09 ${hue}), oklch(0.3 0.07 ${(hue + 25) % 360}))`,
        color: `oklch(0.96 0.02 ${hue})`,
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 150"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        stroke={`oklch(0.85 0.06 ${hue} / 0.35)`}
        fill={`oklch(0.85 0.06 ${hue} / 0.25)`}
      >
        {shapes}
      </svg>
      <div className="absolute inset-0 flex flex-col p-[8%]">
        <div className={cn("font-sans tracking-wide uppercase opacity-80", metaSize)}>
          <span className="line-clamp-2">{author}</span>
        </div>
        <div
          className={cn("mt-[6%] font-serif leading-tight font-semibold text-balance", titleSize)}
        >
          <span className="line-clamp-4">{work.title}</span>
        </div>
        {work.first_published_year && (
          <div className={cn("mt-auto font-sans opacity-70", metaSize)}>
            {work.first_published_year}
          </div>
        )}
      </div>
    </div>
  );
}
