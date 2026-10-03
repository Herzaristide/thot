"""Vérification de la langue d'une édition (lingua)."""

from functools import lru_cache

from lingua import LanguageDetectorBuilder


@lru_cache(maxsize=1)
def _detector():
    return LanguageDetectorBuilder.from_all_languages().with_low_accuracy_mode().build()


def detect_language(text: str) -> str | None:
    """Code ISO 639-1 (ex : "fr") de la langue majoritaire du texte, ou None."""
    if len(text.strip()) < 50:
        return None
    language = _detector().detect_language_of(text)
    if language is None:
        return None
    return language.iso_code_639_1.name.lower()


def same_language(declared: str, detected: str | None) -> bool:
    return detected is None or declared.split("-")[0].lower() == detected


def detect_majority(paragraphs: list[str]) -> str | None:
    """Langue majoritaire sur trois extraits (début, milieu, fin du corps) :
    un seul extrait plein de noms propres trompe parfois la détection."""
    from collections import Counter

    if not paragraphs:
        return None
    votes = []
    for frac in (0.25, 0.5, 0.75):
        i = int(len(paragraphs) * frac)
        sample, j = [], i
        while j < len(paragraphs) and sum(map(len, sample)) < 3000:
            sample.append(paragraphs[j])
            j += 1
        if lang := detect_language("\n".join(sample)):
            votes.append(lang)
    return Counter(votes).most_common(1)[0][0] if votes else None
