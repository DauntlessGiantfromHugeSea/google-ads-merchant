"""SEO-Audit im Stil von Claude SEO – rein deterministisch (ohne KI).

Erzeugt das gleiche Ergebnis-Format: Kategorien mit Findings (Severity +
Empfehlung + Prüffrage), priorisierter Action-Plan und ein Health-Score 0–100.
Setzt auf dem vorhandenen Multi-Page-Crawler (services/seo.py) auf und ergänzt
Site-Level-Checks: Security-Header, robots/AI-Crawler, Schema-Typen, llms.txt und
optional Core Web Vitals über die Google-PageSpeed-API (falls Key hinterlegt).
"""
from __future__ import annotations

import json
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings
from app.services import seo

settings = get_settings()

CATEGORIES = ["Technik & Crawling", "Indexierung", "Sicherheit",
              "Mobile & Performance", "Onpage & Content", "Strukturierte Daten", "AI-Suche (GEO)"]

# Page-Level-Checks (aus dem Crawl): key -> (Kategorie, Severity, Gewicht, Empfehlung, Prüffrage)
_PAGE = {
    "https":            ("Sicherheit", "Critical", 10, "Alle Seiten per HTTPS ausliefern und HTTP→HTTPS weiterleiten.", "Lädt die Seite ohne Zertifikatswarnung über https://?"),
    "robots_meta":      ("Indexierung", "Critical", 10, "noindex nur auf Seiten setzen, die wirklich nicht in den Index sollen.", "Erscheint die Seite in der Google-Abdeckung als „indexiert“?"),
    "title":            ("Onpage & Content", "High", 8, "Jeder Seite einen einzigartigen, sprechenden Title geben.", "Zeigt Google in den Suchergebnissen den gewünschten Titel?"),
    "viewport_mobile":  ("Mobile & Performance", "High", 7, "Meta-Viewport ergänzen: width=device-width, initial-scale=1.", "Ist die Seite im Mobil-Test von Google ohne Fehler?"),
    "meta_description": ("Onpage & Content", "Medium", 6, "Meta-Description mit 70–160 Zeichen und Call-to-Action ergänzen.", "Steigt die Klickrate (CTR) in der Search Console?"),
    "h1":               ("Onpage & Content", "Medium", 6, "Genau eine aussagekräftige H1 pro Seite verwenden.", "Beschreibt die H1 das Hauptthema der Seite eindeutig?"),
    "image_alt":        ("Onpage & Content", "Medium", 6, "Allen inhaltlich relevanten Bildern beschreibende Alt-Texte geben.", "Tauchen die Bilder in der Google-Bildersuche auf?"),
    "canonical":        ("Indexierung", "Medium", 5, "Selbstreferenzierendes Canonical-Tag setzen, Duplikate vermeiden.", "Wählt Google die gewünschte URL als kanonisch?"),
    "structured_data":  ("Strukturierte Daten", "Medium", 6, "JSON-LD (z. B. Organization/LocalBusiness) ergänzen.", "Werden Rich-Results im Test von Google erkannt?"),
    "content_length":   ("Onpage & Content", "Medium", 6, "Dünne Seiten inhaltlich ausbauen (Ziel: 300+ Wörter, wo sinnvoll).", "Beantwortet die Seite die Suchintention vollständig?"),
    "heading_structure":("Onpage & Content", "Low", 4, "Klare H2/H3-Gliederung einführen.", "Lässt sich die Seite anhand der Überschriften überfliegen?"),
    "internal_links":   ("Onpage & Content", "Low", 4, "Mehr thematisch passende interne Links setzen.", "Erreicht Google wichtige Seiten in ≤3 Klicks?"),
    "title_length":     ("Onpage & Content", "Low", 3, "Title auf 30–60 Zeichen bringen (nicht abgeschnitten).", "Wird der Title in den SERPs voll angezeigt?"),
    "text_html_ratio":  ("Onpage & Content", "Low", 3, "Verhältnis von Text zu Code verbessern (weniger Inline-Code).", "Bleibt der Hauptinhalt in den ersten 2 MB HTML?"),
    "lang_attribute":   ("Onpage & Content", "Low", 3, "<html lang=\"de\"> setzen.", "Erkennt Google die Sprache der Seite korrekt?"),
}
_SEV_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
_AI_TOKENS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bytespider", "CCBot"]


def _grade(score: float) -> str:
    return ("A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F")


def _pagespeed(url: str) -> dict | None:
    key = settings.pagespeed_api_key
    if not key:
        return None
    try:
        r = httpx.get("https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                      params={"url": url, "key": key, "strategy": "mobile",
                              "category": "performance"}, timeout=45)
        d = r.json()
        le = (d.get("loadingExperience") or {}).get("metrics") or {}
        lh = ((d.get("lighthouseResult") or {}).get("categories") or {}).get("performance") or {}
        def m(name):
            v = le.get(name) or {}
            return {"category": v.get("category"), "percentile": v.get("percentile")}
        return {
            "perf_score": round((lh.get("score") or 0) * 100),
            "lcp": m("LARGEST_CONTENTFUL_PAINT_MS"),
            "inp": m("INTERACTION_TO_NEXT_PAINT") or m("EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT"),
            "cls": m("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
            "has_field": bool(le),
        }
    except Exception:
        return None


def _schema_types(html: str) -> list[str]:
    types: list[str] = []
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "{}")
        except Exception:
            continue
        for obj in (data if isinstance(data, list) else [data]):
            t = obj.get("@type") if isinstance(obj, dict) else None
            if isinstance(t, list):
                types += [str(x) for x in t]
            elif t:
                types.append(str(t))
    return sorted(set(types))


def build_envelope(crawl: dict, home_headers: dict, home_html: str, robots_txt: str,
                   llms_found: bool, cwv: dict | None) -> dict:
    """Baut das Audit-Envelope aus Crawl-Ergebnis + Homepage-Signalen."""
    checks: list[dict] = []  # {category, severity, weight, frac, title, description, recommendation, verification}
    pa = max(1, crawl.get("pages_analyzed", 1))
    issue_by_key = {g["key"]: g for g in crawl.get("issue_groups", [])}

    # 1) Page-Level aus dem Crawl
    for key, (cat, sev, w, rec, ver) in _PAGE.items():
        g = issue_by_key.get(key)
        cnt = g["count"] if g else 0
        frac = 1.0 - min(1.0, cnt / pa)
        if cnt == 0:
            desc = "Auf allen geprüften Seiten in Ordnung."
        else:
            ex = ", ".join(urlparse(e["url"]).path or "/" for e in (g["examples"][:3]))
            desc = f"{cnt} von {pa} geprüften Seiten betroffen (z. B. {ex})."
        checks.append({"category": cat, "severity": sev, "weight": w, "frac": frac,
                       "title": (g["label"] if g else _PAGE_LABEL.get(key, key)),
                       "description": desc, "recommendation": rec, "verification": ver,
                       "count": cnt})

    def add(cat, sev, w, ok, title, desc, rec, ver):
        checks.append({"category": cat, "severity": sev, "weight": w, "frac": 1.0 if ok else 0.0,
                       "title": title, "description": desc, "recommendation": rec, "verification": ver, "count": 0 if ok else 1})

    # 2) Technik & Crawling
    add("Technik & Crawling", "High", 8, crawl.get("robots_found"), "robots.txt",
        "robots.txt vorhanden." if crawl.get("robots_found") else "Keine robots.txt gefunden.",
        "robots.txt bereitstellen und Sitemap darin verlinken.", "Lädt /robots.txt mit Status 200?")
    add("Technik & Crawling", "High", 8, crawl.get("sitemap_found"), "XML-Sitemap",
        f"Sitemap gefunden ({crawl.get('pages_total', 0)} URLs)." if crawl.get("sitemap_found") else "Keine XML-Sitemap gefunden.",
        "XML-Sitemap erzeugen und in der Search Console + robots.txt hinterlegen.", "Ist die Sitemap in der Search Console ohne Fehler eingereicht?")
    html_kb = round(len(home_html) / 1024)
    add("Technik & Crawling", "Low", 3, len(home_html) < 2_000_000, "HTML-Größe (2-MB-Grenze)",
        f"Startseite ~{html_kb} KB HTML.", "Inline-CSS/JS/Base64 reduzieren, damit Inhalt & JSON-LD in den ersten 2 MB bleiben.",
        "Steht der Hauptinhalt im gerenderten HTML vor Byte 2.000.000?")
    ai_rules = [t for t in _AI_TOKENS if t.lower() in (robots_txt or "").lower()]
    add("AI-Suche (GEO)", "Info", 2, True, "AI-Crawler in robots.txt",
        f"Regeln für: {', '.join(ai_rules)}." if ai_rules else "Keine AI-spezifischen robots-Regeln (alle AI-Crawler erlaubt).",
        "Bewusst entscheiden, welche AI-Crawler (GPTBot, ClaudeBot, Google-Extended …) du zulässt.",
        "Entspricht der Zugriff der AI-Crawler deiner Sichtbarkeitsstrategie?")
    add("AI-Suche (GEO)", "Low", 3, llms_found, "llms.txt",
        "llms.txt vorhanden." if llms_found else "Keine llms.txt gefunden.",
        "Optional eine /llms.txt mit den wichtigsten Inhalten für AI-Suchen bereitstellen.",
        "Wird deine Firma in AI-Antworten (z. B. AI Overviews) genannt?")

    # 3) Sicherheit (Header von der Startseite)
    h = {k.lower(): v for k, v in (home_headers or {}).items()}
    for hd, sev, w, name, rec in [
        ("strict-transport-security", "Medium", 5, "HSTS-Header", "Strict-Transport-Security aktivieren (max-age ≥ 1 Jahr)."),
        ("content-security-policy", "Low", 3, "Content-Security-Policy", "CSP-Header definieren, um XSS-Risiken zu senken."),
        ("x-content-type-options", "Low", 2, "X-Content-Type-Options", "X-Content-Type-Options: nosniff setzen."),
        ("x-frame-options", "Low", 2, "X-Frame-Options / Framing-Schutz", "X-Frame-Options: SAMEORIGIN (oder CSP frame-ancestors) setzen."),
    ]:
        ok = hd in h
        add("Sicherheit", sev, w, ok, name, "gesetzt." if ok else "fehlt.", rec, f"Ist „{name}“ in den HTTP-Response-Headern vorhanden?")

    # 4) Strukturierte Daten – Typen
    types = _schema_types(home_html)
    has_org = any(t in types for t in ("Organization", "LocalBusiness")) if types else False
    add("Strukturierte Daten", "Medium", 5, has_org, "Organisation/LocalBusiness-Schema",
        f"Erkannte Typen: {', '.join(types)}." if types else "Kein JSON-LD auf der Startseite.",
        "Organization- bzw. LocalBusiness-JSON-LD mit Name, Logo, Kontakt und sameAs ergänzen.",
        "Zeigt der Rich-Results-Test gültige Entitäten an?")
    add("AI-Suche (GEO)", "Medium", 4, has_org, "Entitäten-Klarheit",
        "Klare Entität über Schema vorhanden." if has_org else "Entität für AI-Suchen nicht klar ausgezeichnet.",
        "Marke als eindeutige Entität auszeichnen (Organization-Schema + konsistente Angaben).",
        "Erkennen AI-Suchen deine Firma als eindeutige Entität?")

    # 5) Mobile & Performance – CWV
    if cwv:
        cats = [x.get("category") for x in (cwv.get("lcp"), cwv.get("inp"), cwv.get("cls")) if x]
        good = sum(1 for c in cats if c == "FAST")
        ok = cwv.get("has_field") and good >= 2
        desc = (f"Feld-Daten (CrUX): LCP {cwv['lcp'].get('category') or '–'}, INP {cwv['inp'].get('category') or '–'}, "
                f"CLS {cwv['cls'].get('category') or '–'}.") if cwv.get("has_field") else \
               f"Keine Feld-Daten. Labor-Performance-Score: {cwv.get('perf_score')}/100."
        add("Mobile & Performance", "High", 7, bool(ok), "Core Web Vitals",
            desc, "LCP < 2,5 s, INP < 200 ms, CLS < 0,1 anstreben (Bilder/Fonts/JS optimieren).",
            "Sind alle drei Core Web Vitals im Feld auf „gut“?")
    else:
        checks.append({"category": "Mobile & Performance", "severity": "Info", "weight": 0, "frac": 1.0,
                       "title": "Core Web Vitals", "description": "Keine Messung (kein PageSpeed-API-Key hinterlegt).",
                       "recommendation": "Optional einen kostenlosen Google-PageSpeed-API-Key in den Einstellungen hinterlegen.",
                       "verification": "", "count": 0})

    # --- Kategorien + Scores ---
    categories = []
    for cat in CATEGORIES:
        cc = [c for c in checks if c["category"] == cat]
        wsum = sum(c["weight"] for c in cc)
        sc = round(sum(c["weight"] * c["frac"] for c in cc) / wsum * 100) if wsum else 100
        findings = sorted([c for c in cc if c["frac"] < 1.0 and c["weight"] > 0],
                          key=lambda c: _SEV_ORDER.get(c["severity"], 9))
        what_works = [c["title"] for c in cc if c["frac"] >= 1.0 and c["weight"] > 0]
        categories.append({"name": cat, "score": sc,
                           "findings": [{"title": f["title"], "severity": f["severity"],
                                         "description": f["description"], "recommendation": f["recommendation"],
                                         "verification": f["verification"]} for f in findings],
                           "what_works": what_works})

    scored = [c for c in checks if c["weight"] > 0]
    wsum = sum(c["weight"] for c in scored)
    health = round(sum(c["weight"] * c["frac"] for c in scored) / wsum * 100) if wsum else 0

    all_findings = [f for cat in categories for f in cat["findings"]]
    def phase(sevs):
        return [{"title": f["title"], "recommendation": f["recommendation"]}
                for f in all_findings if f["severity"] in sevs]
    action_plan = [
        {"name": "Phase 1 · Kritische Fixes", "timeframe": "Woche 1", "items": phase(("Critical", "High"))},
        {"name": "Phase 2 · Wichtige Verbesserungen", "timeframe": "Woche 2–3", "items": phase(("Medium",))},
        {"name": "Phase 3 · Feinschliff", "timeframe": "später", "items": phase(("Low",))},
    ]
    action_plan = [p for p in action_plan if p["items"]]
    quick_wins = [f["title"] for f in all_findings if f["severity"] in ("Critical", "High")][:5]

    return {
        "url": crawl.get("site"), "domain": urlparse(crawl.get("site", "")).netloc,
        "health_score": health, "grade": _grade(health),
        "pages_analyzed": crawl.get("pages_analyzed", 0), "pages_total": crawl.get("pages_total", 0),
        "cwv": cwv, "categories": categories, "action_plan": action_plan,
        "summary": {"critical": len([f for f in all_findings if f["severity"] == "Critical"]),
                    "high": len([f for f in all_findings if f["severity"] == "High"]),
                    "medium": len([f for f in all_findings if f["severity"] == "Medium"]),
                    "low": len([f for f in all_findings if f["severity"] == "Low"]),
                    "quick_wins": quick_wins},
    }


_PAGE_LABEL = {k: seo.ISSUE_LABELS.get(k, k) for k in _PAGE}


def run_audit(url: str) -> dict:
    """Kompletter Audit: crawlt die Seite und baut das Envelope."""
    base = seo._normalize_base(url)
    crawl = seo.analyze_site(base)
    home_headers: dict = {}
    home_html = ""
    robots_txt = crawl.get("robots_txt", "")
    llms_found = False
    try:
        with httpx.Client(timeout=12, follow_redirects=True, headers=seo.UA) as c:
            r = c.get(base)
            home_headers = dict(r.headers)
            home_html = r.text
            try:
                llms_found = c.get(base + "/llms.txt").status_code == 200
            except Exception:
                llms_found = False
    except Exception:
        pass
    cwv = _pagespeed(base)
    return build_envelope(crawl, home_headers, home_html, robots_txt, llms_found, cwv)
