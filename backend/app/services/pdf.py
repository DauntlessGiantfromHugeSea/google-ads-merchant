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
