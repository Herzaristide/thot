import type { Segment } from "@/lib/api/types";

/**
 * HTML d'un segment : `markup` assaini (liste blanche de balises, seuls
 * `lang` et `title` gardés) ou texte échappé, avec les appels de note, le
 * surlignage et, en option, les numéros de page de l'édition papier.
 *
 * Les `offset` des notes et des pages sont comptés dans `text` : on parcourt
 * le balisage en ne comptant que le texte (entités décodées). Pur calcul sur
 * chaînes, sans DOM : même résultat au rendu serveur et dans le navigateur.
 */

const ALLOWED = new Set([
  "em",
  "i",
  "strong",
  "b",
  "sup",
  "sub",
  "br",
  "span",
  "small",
  "u",
  "s",
  "q",
  "cite",
  "abbr",
]);
const VOID = new Set(["br"]);
// Balises dont le contenu est retiré avec elles
const DROP_CONTENT = new Set([
  "script",
  "style",
  "template",
  "iframe",
  "object",
  "noscript",
  "textarea",
  "title",
]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

type Token = { tag: string; close: boolean; attrs: string } | { text: string };

function tokenize(markup: string): Token[] {
  const out: Token[] = [];
  let skip: string | null = null;
  for (const part of markup.replace(/<!--[\s\S]*?-->/g, "").split(/(<[^>]*>)/)) {
    if (!part) continue;
    const m = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>$/.exec(part);
    if (m) {
      const tag = (m[2] ?? "").toLowerCase();
      const close = Boolean(m[1]);
      if (skip) {
        if (close && tag === skip) skip = null;
        continue;
      }
      if (DROP_CONTENT.has(tag)) {
        if (!close && !/\/\s*$/.test(m[3] ?? "")) skip = tag;
        continue;
      }
      if (!ALLOWED.has(tag)) continue;
      const attrs = [...(m[3] ?? "").matchAll(/\b(lang|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
        .map((a) => ` ${(a[1] ?? "").toLowerCase()}="${escapeHtml(decode(a[2] ?? a[3] ?? ""))}"`)
        .join("");
      out.push({ tag, close, attrs });
    } else if (!skip && !part.startsWith("<")) {
      out.push({ text: decode(part) });
    }
  }
  return out;
}

export function segmentHtml(
  seg: Segment,
  opts: { showPages: boolean; highlight?: [number, number] | null },
): string {
  const markers = new Map<number, string[]>();
  const addMarker = (offset: number, html: string) => {
    const list = markers.get(offset) ?? [];
    list.push(html);
    markers.set(offset, list);
  };
  for (const n of seg.notes) {
    addMarker(
      n.offset,
      `<sup class="note-ref"><button type="button" data-note="${escapeHtml(n.note_id)}" aria-label="Note ${escapeHtml(n.label)}">${escapeHtml(n.label)}</button></sup>`,
    );
  }
  if (opts.showPages) {
    for (const p of seg.pages) {
      addMarker(
        p.offset,
        `<span class="page-mark" aria-label="Page ${escapeHtml(p.label)}">${escapeHtml(p.label)}</span>`,
      );
    }
  }
  const [hlStart, hlEnd] = opts.highlight ?? [-1, -1];

  const tokens = seg.markup ? tokenize(seg.markup) : [{ text: seg.text }];
  const stack: string[] = [];
  let out = "";
  let pos = 0;
  let inMark = false;

  const emitMarkers = (at: number) => {
    const list = markers.get(at);
    if (!list) return;
    if (inMark) out += "</mark>";
    out += list.join("");
    if (inMark) out += "<mark>";
    markers.delete(at);
  };

  for (const t of tokens) {
    if ("text" in t) {
      for (const ch of t.text) {
        emitMarkers(pos);
        if (pos === hlStart && !inMark) {
          out += "<mark>";
          inMark = true;
        }
        if (pos === hlEnd && inMark) {
          out += "</mark>";
          inMark = false;
        }
        out += escapeHtml(ch);
        pos += 1; // offsets de l'API : en points de code
      }
      continue;
    }
    // Les balises coupent le surlignage, rouvert ensuite (imbrication valide)
    if (inMark) out += "</mark>";
    if (t.close) {
      const i = stack.lastIndexOf(t.tag);
      if (i >= 0) {
        for (const tag of stack.splice(i).reverse()) out += `</${tag}>`;
      }
    } else if (VOID.has(t.tag)) {
      out += `<${t.tag}>`;
    } else {
      out += `<${t.tag}${t.attrs}>`;
      stack.push(t.tag);
    }
    if (inMark) out += "<mark>";
  }
  if (pos === hlEnd && inMark) {
    out += "</mark>";
    inMark = false;
  }
  if (inMark) out += "</mark>";
  for (const tag of stack.reverse()) out += `</${tag}>`;
  // Marqueurs en fin de segment (ou au-delà du texte)
  for (const [, list] of [...markers.entries()].sort((a, b) => a[0] - b[0])) out += list.join("");
  return out;
}

/** Classe CSS d'un segment selon son genre. */
export function segmentClass(seg: Segment): string {
  switch (seg.kind) {
    case "heading":
      return "heading";
    case "verse":
      return "verse";
    case "epigraph":
    case "quote":
      return "verse no-indent";
    case "speech":
      return "speech";
    case "separator":
      return "separator";
    default:
      return "";
  }
}
