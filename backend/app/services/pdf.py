"""Flüchtige PDF-Erzeugung aus einem gespeicherten Report-Snapshot.

Briefpapier: Eigene Vorlage wird verwendet (NICHT neu gebaut). Lege sie als
`backend/app/templates/letterhead.pdf` ab (oder setze LETTERHEAD_PATH).
- PDF-Vorlage  -> der Report-Inhalt wird per Overlay auf JEDE Seite des
  Briefpapiers gelegt (skaliert auf A4). Mehrseitige Reports nutzen die erste
  Briefpapier-Seite als Hintergrund für jede Seite.
- PNG/JPG/SVG  -> wird als vollflächiges Hintergrundbild eingebettet.
- keine Datei  -> reiner Inhalt ohne Briefpapier.

Es wird nichts auf der Platte gespeichert; die Funktion liefert PDF-Bytes,
die direkt an den Browser gestreamt werden.
"""
from __future__ import annotations

import io
from app.services import timeutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import get_settings

settings = get_settings()

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".svg"}
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _find_letterhead() -> Path | None:
    if settings.letterhead_path:
        p = Path(settings.letterhead_path)
        return p if p.exists() else None
    for ext in ("pdf", "png", "jpg", "jpeg", "svg"):
        cand = _TEMPLATE_DIR / f"letterhead.{ext}"
        if cand.exists():
            return cand
    return None


def render_report_html(report: dict, letterhead_image: str | None = None,
                       tz_name: str = timeutil.DEFAULT_TZ) -> str:
    template = _env.get_template("report.html")
    return template.render(
        report=report,
        letterhead_image=letterhead_image,
        generated_at=timeutil.now_local_str("%d.%m.%Y %H:%M", tz_name, with_tz=True),
    )


def _overlay_on_pdf(content_pdf: bytes, letterhead: Path) -> bytes:
    """Legt jede Inhaltsseite auf das Briefpapier (erste Seite der Vorlage)."""
    from pypdf import PdfReader, PdfWriter  # noqa: PLC0415

    lh_bytes = letterhead.read_bytes()
    content = PdfReader(io.BytesIO(content_pdf))
    writer = PdfWriter()
    for content_page in content.pages:
        base = PdfReader(io.BytesIO(lh_bytes)).pages[0]  # frische Kopie je Seite
        base.merge_page(content_page)  # Inhalt liegt oben auf dem Briefpapier
        writer.add_page(base)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _pdf_from_html(html: str, letterhead: Path | None) -> bytes:
    """Rendert HTML zu PDF und legt es (bei PDF-Briefpapier) aufs Briefpapier."""
    try:
        from weasyprint import HTML  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"WeasyPrint nicht verfügbar: {exc}") from exc
    content_pdf = HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()
    if letterhead and letterhead.suffix.lower() == ".pdf":
        return _overlay_on_pdf(content_pdf, letterhead)
    return content_pdf


def render_report_pdf(report: dict, tz_name: str = timeutil.DEFAULT_TZ) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    html = render_report_html(report, letterhead_image=image_url, tz_name=tz_name)
    return _pdf_from_html(html, letterhead)


def render_offer_html(offer: dict, letterhead_image: str | None = None) -> str:
    template = _env.get_template("offer.html")
    return template.render(offer=offer, letterhead_image=letterhead_image)


def render_offer_pdf(offer: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    html = render_offer_html(offer, letterhead_image=image_url)
    return _pdf_from_html(html, letterhead)


def render_seo_pdf(audit: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("seo_audit.html")
    html = template.render(audit=audit, letterhead_image=image_url)
    return _pdf_from_html(html, letterhead)


def render_contract_pdf(contract: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("contract.html")
    html = template.render(contract=contract, letterhead_image=image_url)
    return _pdf_from_html(html, letterhead)


def render_monitoring_pdf(report: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("monitoring_report.html")
    html = template.render(report=report, letterhead_image=image_url)
    return _pdf_from_html(html, letterhead)


def _doc_fmt(text: str):
    """Absätze (Leerzeile), Aufzählungen (- / * / •) und **fett** zu HTML."""
    import html as _html  # noqa: PLC0415
    import re as _re  # noqa: PLC0415
    from markupsafe import Markup  # noqa: PLC0415

    def inline(s: str) -> str:
        s = _html.escape(s)
        return _re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

    out: list[str] = []
    para: list[str] = []
    bul: list[str] = []
    def flush_para():
        if para:
            out.append("<p>" + "<br>".join(para) + "</p>"); para.clear()
    def flush_bul():
        if bul:
            out.append("<ul>" + "".join(f"<li>{b}</li>" for b in bul) + "</ul>"); bul.clear()
    for raw in (text or "").split("\n"):
        line = raw.strip()
        if not line:
            flush_bul(); flush_para(); continue
        if line[:2] in ("- ", "* ") or line[:1] == "•":
            flush_para(); bul.append(inline(line.lstrip("-*• ").strip()))
        else:
            flush_bul(); para.append(inline(line))
    flush_bul(); flush_para()
    return Markup("".join(out))


def render_projectdoc_pdf(doc: dict, tz_name: str = timeutil.DEFAULT_TZ) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    secs = [{**s, "text": _doc_fmt(s.get("text", ""))} for s in (doc.get("sections") or [])]
    template = _env.get_template("projectdoc.html")
    html = template.render(doc={**doc, "sections": secs}, letterhead_image=image_url,
                           generated_at=timeutil.now_local_str("%d.%m.%Y %H:%M", tz_name, with_tz=True))
    return _pdf_from_html(html, letterhead)


def _rich_fmt(text: str):
    """Mini-Markdown: **fett** + Zeilenumbrüche, HTML-sicher."""
    import html as _html  # noqa: PLC0415
    import re as _re  # noqa: PLC0415
    from markupsafe import Markup  # noqa: PLC0415
    t = _html.escape(text or "")
    t = _re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = t.replace("\n", "<br>")
    return Markup(t)


def render_worksheet_pdf(doc: dict, use_letterhead: bool = False) -> bytes:
    """Druckbares Web-Arbeitsprotokoll (leere Felder zum Ausfüllen). Optional
    auf dem Briefpapier."""
    letterhead = _find_letterhead() if use_letterhead else None
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("worksheet.html")
    html = template.render(doc=doc, letterhead_image=image_url, letterhead=use_letterhead)
    return _pdf_from_html(html, letterhead)


def render_kostenaufstellung_pdf(doc: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("kostenaufstellung.html")
    html = template.render(doc=doc, letterhead_image=image_url)
    return _pdf_from_html(html, letterhead)


def render_richdoc_pdf(doc: dict) -> bytes:
    """Report/Brief aus Blöcken rendern. Theme 'letterhead' legt es aufs
    Briefpapier, 'editorial' ist eine eigenständige, saubere Seite."""
    theme = doc.get("theme", "editorial")
    accent = doc.get("accent") or "#4a7c2f"
    letterhead = _find_letterhead() if theme == "letterhead" else None
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None

    rendered, num = [], 0
    for b in (doc.get("blocks") or []):
        t = b.get("type")
        out = {"type": t}
        if t in ("eyebrow", "title", "lead", "heading", "text", "badge", "quote"):
            out["html"] = _rich_fmt(b.get("text", ""))
            out["color"] = b.get("color", "green")
        elif t == "callout":
            out["html"] = _rich_fmt(b.get("text", ""))
            out["title_html"] = _rich_fmt(b.get("title", "")) if b.get("title") else ""
        elif t == "numbered":
            num += 1
            out["n"] = num
            out["title_html"] = _rich_fmt(b.get("title", ""))
            out["html"] = _rich_fmt(b.get("text", ""))
        elif t == "meta":
            out["rows"] = [{"k": r.get("k", ""), "v": _rich_fmt(r.get("v", ""))} for r in (b.get("rows") or [])]
        elif t == "table":
            out["columns"] = b.get("columns") or ["", ""]
            out["rows"] = [[_rich_fmt(c) for c in row] for row in (b.get("rows") or [])]
        rendered.append(out)

    template = _env.get_template("richdoc.html")
    footer_css = (doc.get("footer") or "").replace('"', "'")
    html = template.render(blocks=rendered, accent=accent, letterhead_image=image_url,
                           footer_css=footer_css, show_rule=(theme == "editorial"))
    return _pdf_from_html(html, letterhead)


def render_worklog_pdf(doc: dict, tz_name: str = timeutil.DEFAULT_TZ) -> bytes:
    letterhead = _find_letterhead()
    image_url = letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    template = _env.get_template("worklog.html")
    html = template.render(doc=doc, letterhead_image=image_url,
                           generated_at=timeutil.now_local_str("%d.%m.%Y %H:%M", tz_name, with_tz=True))
    return _pdf_from_html(html, letterhead)
