/** Petits formatages partagés (français). */

const languageNames = new Intl.DisplayNames(["fr"], { type: "language" });

export function languageName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    const name = languageNames.of(code) ?? code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
}

export function authorsLabel(authors: { name: string }[]): string {
  return new Intl.ListFormat("fr", { type: "conjunction" }).format(authors.map((a) => a.name));
}

export function lifespan(birth?: number | null, death?: number | null): string {
  if (!birth && !death) return "";
  return `${birth ?? "?"}–${death ?? ""}`;
}

export function percent(x: number): string {
  return `${Math.round(x * 100)} %`;
}

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function relativeTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = (d.getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
  }
  return "à l'instant";
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}

const numberFmt = new Intl.NumberFormat("fr");

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : numberFmt.format(n);
}

const dateTimeFmt = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });

export function dateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "–";
}

/** Durée entre deux instants (« 2 min 05 s »). */
export function duration(from: string | null | undefined, to?: string | null): string {
  if (!from) return "–";
  const ms = (to ? new Date(to) : new Date()).getTime() - new Date(from).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function score(x: number | null | undefined, digits = 2): string {
  return x === null || x === undefined ? "–" : x.toFixed(digits).replace(".", ",");
}
