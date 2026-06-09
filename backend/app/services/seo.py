"""SEO-Analyse einer ganzen Website (Multi-Page-Crawl).

Ablauf:
1. Sitemap finden (robots.txt → Sitemap:, sonst /sitemap.xml, inkl. Sitemap-Index).
2. Falls keine Sitemap: interne Links der Startseite einsammeln.
3. Jede Seite live abrufen und On-Page-/Technik-/Content-Kriterien prüfen.
4. Aggregieren: Gesamt-Score, Score je Seite, und – wichtig – pro Problemtyp
   eine Liste, WELCHE Seiten betroffen sind (z. B. fehlende Alt-Texte).

Es werden echte Daten gecrawlt (keine Demodaten). Keine Google-Credentials nötig.
"""
from __future__ import annotations

import concurrent.futures
import gzip
import re
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

settings = get_settings()

UA = {"User-Agent": "NorthFlowSEO/1.0 (+https://north-flow.de)"}

# Kriterium -> (Gewicht, Kategorie)
WEIGHTS = {
    "title": (10, "onpage"),
    "title_length": (6, "onpage"),
    "meta_description": (8, "onpage"),
    "h1": (8, "onpage"),
    "heading_structure": (6, "onpage"),
    "image_alt": (8, "onpage"),
    "internal_links": (4, "onpage"),
    "https": (8, "technical"),
    "canonical": (5, "technical"),
    "viewport_mobile": (7, "technical"),
    "structured_data": (6, "technical"),
    "robots_meta": (5, "technical"),
    "content_length": (8, "content"),
    "text_html_ratio": (4, "content"),
    "lang_attribute": (3, "content"),
}

# Problemtypen, die im Report als "wo fehlt was" hervorgehoben werden.
ISSUE_LABELS = {
    "image_alt": "Fehlende Bild-Alt-Texte",
    "meta_description": "Meta-Description fehlt / nicht optimal",
    "title": "Title-Tag fehlt",
    "title_length": "Title-Länge nicht optimal (30–60 Zeichen)",
    "h1": "H1 fehlt oder mehrfach vorhanden",
    "canonical": "Canonical-Tag fehlt",
    "viewport_mobile": "Mobile-Viewport fehlt",
    "structured_data": "Keine strukturierten Daten (JSON-LD)",
    "content_length": "Zu wenig Textinhalt (< 300 Wörter)",
    "https": "Seite nicht über HTTPS",
    "lang_attribute": "Sprach-Attribut (lang) fehlt",
    "heading_structure": "Schwache Überschriften-Struktur",
    "robots_meta": "Seite auf noindex",
}


def _check(passed, label, detail, key, partial=None) -> dict:
    weight = WEIGHTS[key][0]
    score = weight if passed else 0
    if partial is not None:
        score = round(weight * max(0.0, min(1.0, partial)), 1)
    return {"key": key, "label": label, "category": WEIGHTS[key][1],
            "passed": passed, "detail": detail, "weight": weight, "score": score}


def _grade(score: float) -> str:
    return ("A" if score >= 90 else "B" if score >= 75 else
            "C" if score >= 60 else "D" if score >= 40 else "F")


def _analyze_html(url: str, html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    checks: list[dict] = []

    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    checks.append(_check(bool(title), "Title-Tag", title or "fehlt", "title"))
    tl = len(title)
    checks.append(_check(30 <= tl <= 60, "Title-Länge", f"{tl} Zeichen", "title_length",
                         partial=1.0 if 30 <= tl <= 60 else (0.5 if title else 0.0)))

    md = soup.find("meta", attrs={"name": "description"})
    desc = (md.get("content", "").strip() if md else "")
    checks.append(_check(70 <= len(desc) <= 160, "Meta-Description",
                         f"{len(desc)} Zeichen" if desc else "fehlt", "meta_description",
                         partial=1.0 if 70 <= len(desc) <= 160 else (0.5 if desc else 0.0)))

    h1s = soup.find_all("h1")
    checks.append(_check(len(h1s) == 1, "Genau eine H1", f"{len(h1s)} H1-Tags", "h1"))

    headings = soup.find_all(re.compile("^h[1-6]$"))
    checks.append(_check(len(headings) >= 3, "Überschriften-Struktur",
                         f"{len(headings)} Überschriften", "heading_structure",
                         partial=min(1.0, len(headings) / 5)))

    imgs = soup.find_all("img")
    without_alt = [i for i in imgs if not i.get("alt", "").strip()]
    ratio = ((len(imgs) - len(without_alt)) / len(imgs)) if imgs else 1.0
    detail = (f"{len(without_alt)} von {len(imgs)} Bildern ohne Alt-Text"
              if imgs else "keine Bilder")
    checks.append(_check(len(without_alt) == 0, "Bild-Alt-Texte", detail, "image_alt", partial=ratio))

    host = urlparse(url).netloc
    links = soup.find_all("a", href=True)
    internal = [a for a in links if a["href"].startswith("/") or host in a["href"]]
    checks.append(_check(len(internal) >= 3, "Interne Verlinkung",
                         f"{len(internal)} interne Links", "internal_links",
                         partial=min(1.0, len(internal) / 5)))

    checks.append(_check(url.startswith("https://"), "HTTPS",
                         "ok" if url.startswith("https://") else "nur HTTP", "https"))

    canonical = soup.find("link", attrs={"rel": "canonical"})
    checks.append(_check(canonical is not None, "Canonical-Tag",
                         "vorhanden" if canonical else "fehlt", "canonical"))

    viewport = soup.find("meta", attrs={"name": "viewport"})
    checks.append(_check(viewport is not None, "Mobile-Viewport",
                         "gesetzt" if viewport else "fehlt", "viewport_mobile"))

    structured = soup.find_all("script", attrs={"type": "application/ld+json"})
    checks.append(_check(len(structured) > 0, "Strukturierte Daten",
                         f"{len(structured)} JSON-LD-Blöcke" if structured else "keine",
                         "structured_data"))

    robots = soup.find("meta", attrs={"name": "robots"})
    noindex = bool(robots and "noindex" in robots.get("content", "").lower())
    checks.append(_check(not noindex, "Indexierbar",
                         "noindex gesetzt!" if noindex else "ja", "robots_meta"))

    text = soup.get_text(" ", strip=True)
    words = len(text.split())
    checks.append(_check(words >= 300, "Textumfang", f"{words} Wörter",
                         "content_length", partial=min(1.0, words / 600)))

    th = len(text) / max(1, len(html))
    checks.append(_check(th >= 0.1, "Text/HTML-Verhältnis", f"{round(th * 100, 1)} %",
                         "text_html_ratio", partial=min(1.0, th / 0.25)))

    html_tag = soup.find("html")
    has_lang = bool(html_tag and html_tag.get("lang"))
    checks.append(_check(has_lang, "Sprach-Attribut",
                         html_tag.get("lang") if has_lang else "fehlt", "lang_attribute"))

    return checks


def _normalize_base(url: str) -> str:
    if not url.startswith("http"):
        url = "https://" + url
    return url.rstrip("/")


def _fetch(client: httpx.Client, url: str) -> httpx.Response:
    return client.get(url, headers=UA)


def _sitemap_text(resp: httpx.Response, url: str) -> str:
    data = resp.content
    if url.endswith(".gz") or data[:2] == b"\x1f\x8b":
        try:
            data = gzip.decompress(data)
        except Exception:
            pass
    return data.decode(errors="ignore")


def _find_sitemaps(client: httpx.Client, base: str) -> list[str]:
    found: list[str] = []
    try:
        r = _fetch(client, base + "/robots.txt")
        if r.status_code == 200:
            for line in r.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    found.append(line.split(":", 1)[1].strip())
    except Exception:
        pass
    if not found:
        found.append(base + "/sitemap.xml")
    return found


def _parse_sitemap(client: httpx.Client, sm_url: str, depth: int = 0) -> list[str]:
    urls: list[str] = []
    try:
        r = _fetch(client, sm_url)
        if r.status_code != 200:
            return urls
        soup = BeautifulSoup(_sitemap_text(r, sm_url), "xml")
        locs = [loc.text.strip() for loc in soup.find_all("loc")]
        if soup.find("sitemapindex") and depth < 1:
            for sub in locs[:25]:
                urls += _parse_sitemap(client, sub, depth + 1)
        else:
            urls += locs
    except Exception:
        pass
    return urls


def _links_from_home(client: httpx.Client, base: str) -> list[str]:
    urls = [base]
    try:
        r = _fetch(client, base)
        soup = BeautifulSoup(r.text, "lxml")
        host = urlparse(base).netloc
        for a in soup.find_all("a", href=True):
            u = urljoin(base, a["href"]).split("#")[0].rstrip("/")
            if urlparse(u).netloc == host and u not in urls:
                urls.append(u)
    except Exception:
        pass
    return urls


def analyze_site(url: str, max_pages: int | None = None) -> dict:
    max_pages = max_pages or settings.seo_max_pages
    base = _normalize_base(url)
    host = urlparse(base).netloc
    client = httpx.Client(timeout=10, follow_redirects=True)
    try:
        sitemaps = _find_sitemaps(client, base)
        sm_urls: list[str] = []
        for sm in sitemaps:
            sm_urls += _parse_sitemap(client, sm)
        # nur gleiche Domain, dedupliziert
        seen: list[str] = []
        for u in sm_urls:
            cu = u.split("#")[0].rstrip("/")
            if urlparse(cu).netloc == host and cu not in seen:
                seen.append(cu)
        sitemap_found = len(seen) > 0
        sitemap_url = sitemaps[0] if sitemap_found else ""

        if not seen:
            seen = _links_from_home(client, base)

        total = len(seen)
        if base not in seen:
            seen = [base] + seen
        targets = seen[:max_pages]

        def work(u: str):
            try:
                r = _fetch(client, u)
                if r.status_code >= 400 or "html" not in r.headers.get("content-type", ""):
                    return (u, None, f"Status {r.status_code}")
                return (str(r.url), _analyze_html(str(r.url), r.text), None)
            except Exception as exc:
                return (u, None, str(exc)[:80])

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
            results = list(ex.map(work, targets))
    finally:
        client.close()

    pages: list[dict] = []
    issues_by_type: dict[str, list[dict]] = {}
    cat_acc: dict[str, list[float]] = {}
    score_sum = weight_sum = 0.0
    analyzed = 0

    for (u, checks, err) in results:
        if checks is None:
            pages.append({"url": u, "score": None, "grade": "–",
                          "issues": [f"nicht analysierbar ({err})"]})
            continue
        analyzed += 1
        tw = sum(c["weight"] for c in checks)
        ts = sum(c["score"] for c in checks)
        score = round(ts / tw * 100, 1) if tw else 0.0
        page_issues = []
        for c in checks:
            acc = cat_acc.setdefault(c["category"], [0.0, 0.0])
            acc[0] += c["score"]; acc[1] += c["weight"]
            if c["score"] < c["weight"]:
                page_issues.append(f"{c['label']}: {c['detail']}")
                if c["key"] in ISSUE_LABELS:
                    issues_by_type.setdefault(c["key"], []).append(
                        {"url": u, "detail": c["detail"]})
        score_sum += ts; weight_sum += tw
        pages.append({"url": u, "score": score, "grade": _grade(score),
                      "issues": page_issues[:6]})

    overall = round(score_sum / weight_sum * 100, 1) if weight_sum else 0.0
    category_scores = {cat: round(v[0] / v[1] * 100, 1) if v[1] else 0.0
                       for cat, v in cat_acc.items()}
    issue_groups = [
        {"key": k, "label": ISSUE_LABELS[k], "count": len(v), "examples": v[:20]}
        for k, v in sorted(issues_by_type.items(), key=lambda kv: len(kv[1]), reverse=True)
    ]
    recommendations = [f"{g['label']}: {g['count']} Seite(n) betroffen" for g in issue_groups[:8]] \
        or ["Keine kritischen SEO-Mängel auf den geprüften Seiten gefunden."]

    return {
        "site": base,
        "fetched_live": analyzed > 0,
        "sitemap_found": sitemap_found,
        "sitemap_url": sitemap_url,
        "pages_total": total,
        "pages_analyzed": analyzed,
        "score": overall,
        "grade": _grade(overall),
        "category_scores": category_scores,
        "issue_groups": issue_groups,
        "pages": sorted(pages, key=lambda p: (p["score"] is not None, -(p["score"] or 0))),
        "recommendations": recommendations,
    }


# Rückwärtskompatibel: Einzel-URL-Aufruf nutzt jetzt den Site-Crawl.
def analyze_url(url: str) -> dict:
    return analyze_site(url)
