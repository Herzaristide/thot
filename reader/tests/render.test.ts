import { describe, expect, it } from "vitest";
import type { Segment } from "@/lib/api/types";
import { segmentHtml } from "@/lib/reader/render";

function seg(p: Partial<Segment>): Segment {
  return {
    seq: 1,
    section_id: null,
    kind: "paragraph",
    speaker: null,
    char_start: 0,
    char_end: 0,
    text: "",
    markup: null,
    notes: [],
    pages: [],
    ...p,
  };
}

describe("segmentHtml", () => {
  it("échappe le texte brut", () => {
    const el = document.createElement("p");
    el.innerHTML = segmentHtml(seg({ text: "a <b>x</b> & c" }), { showPages: false });
    expect(el.textContent).toBe("a <b>x</b> & c");
    expect(el.children).toHaveLength(0);
  });

  it("retire les balises et attributs dangereux du balisage", () => {
    const html = segmentHtml(
      seg({
        text: "Bonjour",
        markup: '<em onclick="x()">Bon</em>jour<script>alert(1)</script><img src=x onerror=y>',
      }),
      { showPages: false },
    );
    expect(html).toBe("<em>Bon</em>jour");
  });

  it("place l'appel de note à son décalage dans le texte, à travers le balisage", () => {
    const html = segmentHtml(
      seg({
        text: "Je suis un homme malade.",
        markup: "Je <em>suis</em> un homme malade.",
        notes: [{ offset: 7, label: "1", note_id: "n1", origin: "translator" }],
      }),
      { showPages: false },
    );
    expect(html).toMatch(
      /^Je <em>suis<\/em><sup class="note-ref"><button[^>]*data-note="n1"[^>]*>1<\/button><\/sup> un homme/,
    );
  });

  it("n'affiche les numéros de page que sur demande", () => {
    const s = seg({ text: "abcdef", pages: [{ offset: 3, label: "57" }] });
    expect(segmentHtml(s, { showPages: false })).toBe("abcdef");
    expect(segmentHtml(s, { showPages: true })).toContain(
      'abc<span class="page-mark" aria-label="Page 57">57</span>def',
    );
  });

  it("surligne une plage", () => {
    expect(
      segmentHtml(seg({ text: "un deux trois" }), { showPages: false, highlight: [3, 7] }),
    ).toBe("un <mark>deux</mark> trois");
  });
});
