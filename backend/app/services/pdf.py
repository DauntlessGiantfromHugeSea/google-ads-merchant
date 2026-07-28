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
from datetime import datetime, timezone
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


def render_report_html(report: dict, letterhead_image: str | None = None) -> str:
    template = _env.get_template("report.html")
    return template.render(
        report=report,
        letterhead_image=letterhead_image,
        generated_at=datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC"),
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


def render_report_pdf(report: dict) -> bytes:
    letterhead = _find_letterhead()
    image_url = (
        letterhead.name if letterhead and letterhead.suffix.lower() in _IMAGE_EXTS else None
    )

    html = render_report_html(report, letterhead_image=image_url)
    try:
        from weasyprint import HTML  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"WeasyPrint nicht verfügbar: {exc}") from exc

    content_pdf = HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()

    if letterhead and letterhead.suffix.lower() == ".pdf":
        return _overlay_on_pdf(content_pdf, letterhead)
    return content_pdf
