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
