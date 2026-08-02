"""KPI-Import aus einem veröffentlichten Google-Sheet (CSV).

Erwartetes Format: erste Spalte = Zeitraum/Monat, weitere Spalten = Kennzahlen
(Überschriften). Die Überschriften werden tolerant auf kanonische Schlüssel
gemappt (deutsch/englisch), damit die native Anzeige gruppieren kann.
"""
import csv
import io
import re

# Kanonische Kennzahl -> Liste von Schlüsselwörtern (in der Überschrift enthalten)
_ALIASES: dict[str, list[str]] = {
    "users": ["nutzer", "user", "besucher", "visitor"],
    "sessions": ["sitzung", "session"],
    "pageviews": ["seitenaufruf", "pageview", "aufrufe", "views"],
    "conversions": ["conversion", "zielabschluss", "abschluss", "conversions"],
    "leads": ["lead", "anfrage", "formular", "kontaktanfrage"],
    "revenue": ["umsatz", "revenue", "erlös", "erloes", "sales"],
    "orders": ["bestellung", "transaktion", "transaction", "order", "kauf"],
    "conv_rate": ["conversion-rate", "conversion rate", "conv rate", "cr", "rate"],
    "src_organic": ["organic", "organisch"],
    "src_paid": ["paid", "bezahlt", "ads", "sea", "cpc"],
    "src_direct": ["direct", "direkt"],
    "src_social": ["social", "sozial"],
    "src_referral": ["referral", "verweis", "empfehlung"],
}

# Reihenfolge/Gruppierung ist im Frontend hinterlegt; hier nur die Erkennung.
CANONICAL = list(_ALIASES.keys())

_MONTHS = {
    "jan": 1, "feb": 2, "mär": 3, "maer": 3, "mar": 3, "apr": 4, "mai": 5, "may": 5,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "okt": 10, "oct": 10, "nov": 11, "dez": 12, "dec": 12,
}


def _canonical(header: str) -> str | None:
    h = (header or "").strip().lower()
    if not h:
        return None
    # exakte/enthaltene Treffer; längere Schlüsselwörter zuerst prüfen
    for key, words in _ALIASES.items():
        for w in sorted(words, key=len, reverse=True):
            if w in h:
                return key
    return None


def normalize_period(text: str) -> str:
    """Verschiedene Zeitraum-Schreibweisen zu 'YYYY-MM'."""
    t = (text or "").strip().lower()
    if not t:
        return ""
    # 2026-08 / 2026-08-01 / 2026/08
    m = re.match(r"(\d{4})[-/.](\d{1,2})", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    # 08/2026 oder 08.2026
    m = re.match(r"(\d{1,2})[-/.](\d{4})", t)
    if m:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    # "Aug 2026", "August 2026"
    m = re.match(r"([a-zäöü]{3,})\.?\s+(\d{4})", t)
    if m:
        mon = _MONTHS.get(m.group(1)[:3])
        if mon:
            return f"{m.group(2)}-{mon:02d}"
    # reines Jahr
    m = re.match(r"^(\d{4})$", t)
    if m:
        return f"{m.group(1)}-01"
    return ""


def _to_number(text: str) -> float | None:
    if text is None:
        return None
    t = str(text).strip().replace("€", "").replace("%", "").replace(" ", "").replace(" ", "")
    if not t:
        return None
    if "," in t and "." in t:
        # deutsches Format: Punkt = Tausender, Komma = Dezimal
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    elif t.count(".") > 1:
        # mehrere Punkte = Tausendertrennung (1.234.567)
        t = t.replace(".", "")
    elif "." in t:
        # ein Punkt, 3 Nachkommastellen, kein Komma = Tausender (1.605 -> 1605)
        if len(t.split(".")[-1]) == 3:
            t = t.replace(".", "")
    try:
        return round(float(t), 2)
    except ValueError:
        return None


def parse_csv(text: str) -> list[dict]:
    """CSV-Text -> Liste {period, metrics:{canonical:value}, extras:{name:value}}."""
    # Trennzeichen automatisch erkennen (Komma/Semikolon/Tab)
    sample = text[:2048]
    delim = ","
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
    except csv.Error:
        if sample.count(";") > sample.count(","):
            delim = ";"
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [r for r in reader if any((c or "").strip() for c in r)]
    if len(rows) < 2:
        return []
    header = rows[0]
    # Spalten-Mapping: Index -> (canonical|None, roher_name)
    col_map = [(_canonical(h), (h or "").strip()) for h in header]
    out: list[dict] = []
    for row in rows[1:]:
        if not row:
            continue
        period = normalize_period(row[0]) if row else ""
        if not period:
            continue
        metrics: dict[str, float] = {}
        extras: dict[str, float] = {}
        for i, cell in enumerate(row[1:], start=1):
            if i >= len(col_map):
                break
            key, raw = col_map[i]
            val = _to_number(cell)
            if val is None:
                continue
            if key:
                metrics[key] = val
            elif raw:
                extras[raw] = val
        if metrics or extras:
            out.append({"period": period, "metrics": metrics, "extras": extras})
    return out


def to_csv_url(url: str) -> str:
    """Google-Sheet-Link in eine CSV-Abruf-URL umwandeln.

    Unterstützt bereits veröffentlichte /pub-Links und normale /edit-Links
    (Letztere erfordern Freigabe „Jeder mit dem Link")."""
    u = (url or "").strip()
    if not u:
        return ""
    # Schon veröffentlicht (…/pub?…): output=csv sicherstellen
    if "/pubhtml" in u or "/pub?" in u or "output=csv" in u:
        if "output=csv" in u:
            return u
        sep = "&" if "?" in u else "?"
        return f"{u}{sep}output=csv"
    # /spreadsheets/d/<ID>/edit#gid=<gid>  ->  /export?format=csv&gid=<gid>
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", u)
    if m:
        sheet_id = m.group(1)
        gid_m = re.search(r"[#&?]gid=(\d+)", u)
        gid = gid_m.group(1) if gid_m else "0"
        return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    return u
