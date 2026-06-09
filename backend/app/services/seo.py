"""SEO-Bewertung einer Website.

Holt die Seite (httpx), parst sie (BeautifulSoup) und bewertet On-Page-,
technische und Content-Kriterien. Ergibt einen gewichteten Gesamt-Score
(0–100) plus priorisierte Empfehlungen. Fällt der Abruf aus (kein Netz /
Demo-Modus), wird ein realistischer Demo-Audit erzeugt.
"""
from __future__ import annotations

import random
import re

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

settings = get_settings()

# Kriterium -> (Gewicht, Kategorie)
WEIGHTS = {
    "title": (10, "onpage"),
    "title_length": (6, "onpage"),
    "meta_description": (8, "onpage"),
    "h1": (8, "onpage"),
    "heading_structure": (6, "onpage"),
    "image_alt": (6, "onpage"),
    "internal_links": (5, "onpage"),
    "https": (8, "technical"),
    "canonical": (5, "technical"),
    "viewport_mobile": (7, "technical"),
    "structured_data": (6, "technical"),
    "robots_meta": (4, "technical"),
    "content_length": (8, "content"),
    "text_html_ratio": (5, "content"),
    "lang_attribute": (3, "content"),
    "page_speed": (5, "technical"),
}


def _check(passed: bool, label: str, detail: str, key: str, partial: float | None = None) -> dict:
    weight = WEIGHTS[key][0]
    score = weight if passed else 0
    if partial is not None:
        score = round(weight * max(0.0, min(1.0, partial)), 1)
    return {
        "key": key,
        "label": label,
        "category": WEIGHTS[key][1],
        "passed": passed,
        "detail": detail,
        "weight": weight,
        "score": score,
    }


def _analyze_html(url: str, html: str, status_code: int) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    checks: list[dict] = []

    title = (soup.title.string or "").strip() if soup.title else ""
    checks.append(_check(bool(title), "Title-Tag vorhanden",
                         title or "Kein Title gefunden", "title"))
    tl = len(title)
    checks.append(_check(30 <= tl <= 60, "Title-Länge (30–60 Zeichen)",
                         f"{tl} Zeichen", "title_length",
                         partial=1.0 if 30 <= tl <= 60 else (0.5 if title else 0.0)))

    meta_desc = soup.find("meta", attrs={"name": "description"})
    desc = (meta_desc.get("content", "").strip() if meta_desc else "")
    checks.append(_check(70 <= len(desc) <= 160, "Meta-Description (70–160 Zeichen)",
                         f"{len(desc)} Zeichen" if desc else "Fehlt", "meta_description",
                         partial=1.0 if 70 <= len(desc) <= 160 else (0.5 if desc else 0.0)))

    h1s = soup.find_all("h1")
    checks.append(_check(len(h1s) == 1, "Genau eine H1",
                         f"{len(h1s)} H1-Tags", "h1"))

    headings = soup.find_all(re.compile("^h[1-6]$"))
    checks.append(_check(len(headings) >= 3, "Überschriften-Struktur",
                         f"{len(headings)} Überschriften", "heading_structure",
                         partial=min(1.0, len(headings) / 5)))

    imgs = soup.find_all("img")
    with_alt = [i for i in imgs if i.get("alt", "").strip()]
    ratio = (len(with_alt) / len(imgs)) if imgs else 1.0
    checks.append(_check(ratio >= 0.9, "Bild-Alt-Texte",
                         f"{len(with_alt)}/{len(imgs)} mit Alt-Text", "image_alt", partial=ratio))

    links = soup.find_all("a", href=True)
    internal = [a for a in links if a["href"].startswith("/") or url.split("//")[-1].split("/")[0] in a["href"]]
    checks.append(_check(len(internal) >= 3, "Interne Verlinkung",
                         f"{len(internal)} interne Links", "internal_links",
                         partial=min(1.0, len(internal) / 5)))

    checks.append(_check(url.startswith("https://"), "HTTPS aktiv",
                         "Verschlüsselt" if url.startswith("https://") else "Nur HTTP", "https"))

    canonical = soup.find("link", attrs={"rel": "canonical"})
    checks.append(_check(canonical is not None, "Canonical-Tag",
                         "Vorhanden" if canonical else "Fehlt", "canonical"))

    viewport = soup.find("meta", attrs={"name": "viewport"})
    checks.append(_check(viewport is not None, "Mobile Viewport",
                         "Gesetzt" if viewport else "Fehlt", "viewport_mobile"))

    structured = soup.find_all("script", attrs={"type": "application/ld+json"})
    checks.append(_check(len(structured) > 0, "Strukturierte Daten (JSON-LD)",
                         f"{len(structured)} Blöcke" if structured else "Keine", "structured_data"))

    robots = soup.find("meta", attrs={"name": "robots"})
    noindex = robots and "noindex" in robots.get("content", "").lower()
    checks.append(_check(not noindex, "Indexierung erlaubt",
                         "noindex gesetzt!" if noindex else "Indexierbar", "robots_meta"))

    text = soup.get_text(" ", strip=True)
    words = len(text.split())
    checks.append(_check(words >= 300, "Textumfang",
                         f"{words} Wörter", "content_length", partial=min(1.0, words / 600)))

    ratio_th = len(text) / max(1, len(html))
    checks.append(_check(ratio_th >= 0.1, "Text-zu-HTML-Verhältnis",
                         f"{round(ratio_th * 100, 1)} %", "text_html_ratio",
                         partial=min(1.0, ratio_th / 0.25)))

    html_tag = soup.find("html")
    has_lang = bool(html_tag and html_tag.get("lang"))
    checks.append(_check(has_lang, "Sprach-Attribut (lang)",
                         html_tag.get("lang") if has_lang else "Fehlt", "lang_attribute"))

    # Ladezeit hier nur Platzhalter ohne PageSpeed-Key.
    checks.append(_check(True, "Ladezeit (Schätzung)",
                         "PageSpeed-API nicht konfiguriert", "page_speed", partial=0.6))

    return checks


def _demo_seo(url: str) -> list[dict]:
    r = random.Random(hash(url) & 0xFFFFFFFF)
    checks = []
    for key, (weight, cat) in WEIGHTS.items():
        partial = r.choice([1.0, 1.0, 0.5, 0.0, 0.75])
        checks.append({
            "key": key, "label": key.replace("_", " ").title(), "category": cat,
            "passed": partial >= 0.9, "detail": "(Demo)", "weight": weight,
            "score": round(weight * partial, 1),
        })
    return checks


def _build_recommendations(checks: list[dict]) -> list[str]:
    recs = []
    for c in sorted(checks, key=lambda x: x["weight"], reverse=True):
        if c["score"] < c["weight"]:
            recs.append(f"[{c['category']}] {c['label']}: {c['detail']} — verbessern.")
    return recs[:8] or ["Keine kritischen SEO-Mängel gefunden."]


def analyze_url(url: str) -> dict:
    if not url.startswith("http"):
        url = "https://" + url

    checks: list[dict]
    fetched = False
    if settings.use_live_data or settings.data_source_mode != "demo":
        try:
            resp = httpx.get(url, timeout=15, follow_redirects=True,
                             headers={"User-Agent": "ReportingBot/1.0"})
            checks = _analyze_html(str(resp.url), resp.text, resp.status_code)
            fetched = True
        except Exception:
            checks = _demo_seo(url)
    else:
        checks = _demo_seo(url)

    total_weight = sum(c["weight"] for c in checks)
    total_score = sum(c["score"] for c in checks)
    score = round(total_score / total_weight * 100, 1) if total_weight else 0.0

    by_category: dict[str, dict] = {}
    for c in checks:
        cat = by_category.setdefault(c["category"], {"weight": 0, "score": 0})
        cat["weight"] += c["weight"]
        cat["score"] += c["score"]
    category_scores = {
        cat: round(v["score"] / v["weight"] * 100, 1) if v["weight"] else 0.0
        for cat, v in by_category.items()
    }

    grade = ("A" if score >= 90 else "B" if score >= 75 else
             "C" if score >= 60 else "D" if score >= 40 else "F")

    return {
        "url": url,
        "fetched_live": fetched,
        "score": score,
        "grade": grade,
        "category_scores": category_scores,
        "checks": checks,
        "recommendations": _build_recommendations(checks),
    }
