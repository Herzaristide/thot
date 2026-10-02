import DOMPurify from "dompurify";
import type { Segment } from "@/lib/api/types";

/**
 * HTML d'un segment : `markup` assaini (liste blanche de balises) ou texte
 * échappé, avec les appels de note et, en option, les numéros de page de
 * l'édition papier. Les `offset` des notes et des pages sont comptés dans
 * `text` : on les reporte dans le HTML en parcourant ses nœuds texte.
 * Côté navigateur uniquement (DOMPurify a besoin du DOM).
 */

const ALLOWED_TAGS = [
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
];
const ALLOWED_ATTR = ["lang", "title"];

type Marker = { offset: number; html: string };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function segmentHtml(
  seg: Segment,
  opts: { showPages: boolean; highlight?: [number, number] | null },
): string {
  const markers: Marker[] = seg.notes.map((n) => ({
    offset: n.offset,
    html: `<sup class="note-ref"><button type="button" data-note="${escapeHtml(n.note_id)}" aria-label="Note ${escapeHtml(n.label)}">${escapeHtml(n.label)}</button></sup>`,
  }));
  if (opts.showPages) {
    for (const p of seg.pages) {
      markers.push({
        offset: p.offset,
        html: `<span class="page-mark" aria-label="Page ${escapeHtml(p.label)}">${escapeHtml(p.label)}</span>`,
      });
    }
  }

  const source = seg.markup ?? escapeHtml(seg.text);
  const clean = DOMPurify.sanitize(source, { ALLOWED_TAGS, ALLOWED_ATTR });
  const hl = opts.highlight;
  if (markers.length === 0 && !hl) return clean;

  const tpl = document.createElement("template");
  tpl.innerHTML = clean;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  // Position (nœud, décalage) de chaque offset du texte
  const locate = (offset: number): [Text, number] | null => {
    let acc = 0;
    for (const node of nodes) {
      const len = node.data.length;
      if (offset < acc + len) return [node, offset - acc];
      acc += len;
    }
    const last = nodes[nodes.length - 1];
    return last ? [last, last.data.length] : null;
  };

  if (hl) {
    const a = locate(hl[0]);
    const b = locate(hl[1]);
    if (a && b) {
      const range = document.createRange();
      range.setStart(a[0], a[1]);
      range.setEnd(b[0], b[1]);
      const mark = document.createElement("mark");
      try {
        range.surroundContents(mark);
      } catch {
        // La plage traverse une balise : on surligne au moins le début
        mark.append(range.extractContents());
        range.insertNode(mark);
      }
    }
  }

  // De la fin vers le début, pour ne pas décaler les positions suivantes
  for (const m of [...markers].sort((x, y) => y.offset - x.offset)) {
    const fresh: Text[] = [];
    const w = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) fresh.push(n as Text);
    nodes.splice(0, nodes.length, ...fresh);
    const at = locate(m.offset);
    const frag = document.createRange().createContextualFragment(m.html);
    if (!at) {
      tpl.content.append(frag);
      continue;
    }
    const [node, off] = at;
    const after = node.splitText(off);
    after.parentNode?.insertBefore(frag, after);
  }
  return tpl.innerHTML;
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
