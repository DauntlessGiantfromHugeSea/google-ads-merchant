"""E-Rechnung (XRechnung/ZUGFeRD) best-effort auslesen.

Unterstützt UBL- und CII-XML sowie in PDF (ZUGFeRD/Factur-X) eingebettetes XML.
Alle Felder sind optional – gelingt das Parsen nicht, bleibt das Feld leer und
der Nutzer trägt es von Hand nach.
"""
import io
from xml.etree import ElementTree as ET


def _ln(tag: str) -> str:
    """Local-Name eines (ggf. namespaced) Tags, klein."""
    return tag.rsplit("}", 1)[-1].lower()


def _iter_local(root, name: str) -> list:
    name = name.lower()
    return [el for el in root.iter() if _ln(el.tag) == name]


def _to_float(text: str | None) -> float:
    if not text:
        return 0.0
    t = text.strip().replace(" ", "")
    # Dezimalkomma tolerieren
    if "," in t and "." not in t:
        t = t.replace(",", ".")
    try:
        return round(float(t), 2)
    except ValueError:
        return 0.0


def _norm_date(text: str | None) -> str:
    if not text:
        return ""
    t = text.strip()
    if len(t) >= 10 and t[4] == "-" and t[7] == "-":
        return t[:10]
    digits = "".join(c for c in t if c.isdigit())
    if len(digits) >= 8:
        return f"{digits[0:4]}-{digits[4:6]}-{digits[6:8]}"
    return ""


def parse_xml(xml_bytes: bytes) -> dict:
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return {}
    rn = _ln(root.tag)
    out: dict = {}

    if rn == "invoice":  # UBL (XRechnung)
        for ch in list(root):
            ln = _ln(ch.tag)
            if ln == "id" and not out.get("number"):
                out["number"] = (ch.text or "").strip()
            elif ln == "issuedate":
                out["issue_date"] = (ch.text or "").strip()
            elif ln == "duedate":
                out["due_date"] = (ch.text or "").strip()
            elif ln == "documentcurrencycode" and not out.get("currency"):
                out["currency"] = (ch.text or "").strip()
        pa = _iter_local(root, "payableamount")
        if pa:
            out["amount"] = _to_float(pa[0].text)
            if pa[0].get("currencyID"):
                out.setdefault("currency", pa[0].get("currencyID"))
        if not out.get("due_date"):
            dd = _iter_local(root, "paymentduedate")
            if dd:
                out["due_date"] = (dd[0].text or "").strip()

    elif rn == "crossindustryinvoice":  # CII (ZUGFeRD/Factur-X)
        exdoc = _iter_local(root, "exchangeddocument")
        if exdoc:
            ids = _iter_local(exdoc[0], "id")
            if ids:
                out["number"] = (ids[0].text or "").strip()
            dts = _iter_local(exdoc[0], "datetimestring")
            if dts:
                out["issue_date"] = (dts[0].text or "").strip()
        for name in ("duepayableamount", "grandtotalamount"):
            amt = _iter_local(root, name)
            if amt:
                out["amount"] = _to_float(amt[0].text)
                if amt[0].get("currencyID"):
                    out.setdefault("currency", amt[0].get("currencyID"))
                break
        cur = _iter_local(root, "invoicecurrencycode")
        if cur:
            out.setdefault("currency", (cur[0].text or "").strip())
        for p in _iter_local(root, "specifiedtradepaymentterms"):
            dts = _iter_local(p, "datetimestring")
            if dts:
                out["due_date"] = (dts[0].text or "").strip()
                break

    for k in ("issue_date", "due_date"):
        if out.get(k):
            out[k] = _norm_date(out[k])
    return {k: v for k, v in out.items() if v}


def _embedded_xml_from_pdf(pdf_bytes: bytes) -> bytes | None:
    try:
        from pypdf import PdfReader  # noqa: PLC0415
        reader = PdfReader(io.BytesIO(pdf_bytes))
        attachments = getattr(reader, "attachments", None) or {}
        for name, content in attachments.items():
            if str(name).lower().endswith(".xml"):
                return content[0] if isinstance(content, list) else content
    except Exception:
        return None
    return None


def parse_einvoice(data: bytes, content_type: str, filename: str = "") -> dict:
    """Gibt {number, amount, currency, issue_date, due_date} zurück (alle optional)."""
    ct = (content_type or "").lower()
    fn = (filename or "").lower()
    if "xml" in ct or fn.endswith(".xml"):
        return parse_xml(data)
    if "pdf" in ct or fn.endswith(".pdf"):
        xml = _embedded_xml_from_pdf(data)
        if xml:
            return {**parse_xml(xml), "source": "xrechnung"}
    return {}
