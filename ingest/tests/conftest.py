"""Fabrique de petits EPUB 3 synthétiques pour les tests."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>t</title></head>
<body>{body}</body></html>"""


def _toc_html(entries) -> str:
    items = []
    for entry in entries:
        label, href, *children = entry
        sub = f"<ol>{_toc_html(children[0])}</ol>" if children and children[0] else ""
        items.append(f'<li><a href="{href}">{label}</a>{sub}</li>')
    return "".join(items)


def build_epub(
    path: Path,
    docs: dict[str, str],
    toc: list | None = None,
    *,
    language: str = "fr",
    title: str = "Livre de test",
    landmarks: list[tuple[str, str]] | None = None,
    extra_files: dict[str, str] | None = None,
) -> Path:
    """docs : nom de fichier -> contenu du <body>. toc : [(libellé, href, [enfants])]."""
    manifest = [
        f'<item id="d{i}" href="{name}" media-type="application/xhtml+xml"/>' for i, name in enumerate(docs)
    ]
    spine = [f'<itemref idref="d{i}"/>' for i in range(len(docs))]
    nav_body = ""
    if toc is not None:
        nav_body += f'<nav epub:type="toc"><ol>{_toc_html(toc)}</ol></nav>'
    if landmarks:
        links = "".join(f'<li><a epub:type="{t}" href="{h}">{t}</a></li>' for t, h in landmarks)
        nav_body += f'<nav epub:type="landmarks"><ol>{links}</ol></nav>'
    if nav_body:
        manifest.append(
            '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
        )
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">test</dc:identifier><dc:title>{title}</dc:title>
    <dc:language>{language}</dc:language><dc:creator>Auteur Test</dc:creator>
  </metadata>
  <manifest>{"".join(manifest)}</manifest>
  <spine>{"".join(spine)}</spine>
</package>"""
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/container.xml", CONTAINER)
        zf.writestr("OEBPS/content.opf", opf)
        if nav_body:
            zf.writestr("OEBPS/nav.xhtml", XHTML.format(body=nav_body))
        for name, body in docs.items():
            zf.writestr(f"OEBPS/{name}", XHTML.format(body=body))
        for name, content in (extra_files or {}).items():
            zf.writestr(name, content)
    return path


@pytest.fixture
def make_epub(tmp_path):
    counter = iter(range(1000))

    def factory(docs, toc=None, **kwargs) -> Path:
        return build_epub(tmp_path / f"book{next(counter)}.epub", docs, toc, **kwargs)

    return factory


def lorem(n: int = 3, word: str = "texte") -> str:
    """Paragraphe de prose assez long pour être classé dans le corps."""
    return " ".join([f"Voici une phrase de {word} numéro {i}." for i in range(n)])
