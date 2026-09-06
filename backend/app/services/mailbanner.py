"""Erzeugt das Mail-Kopf-Banner als PNG: Marken-Gradient (navy -> coral) mit
zentriertem Logo. Als gehostetes Bild eingebunden sieht der Header in JEDEM
Mail-Client gleich aus – auch in Outlook (das CSS-Gradienten nicht rendert).

Das Ergebnis wird pro Logo im Speicher gecacht (Logo ändert sich selten)."""
import base64
import hashlib
import io

from PIL import Image

# 2x-Auflösung für scharfe Darstellung auf Retina; angezeigt bei 560px Breite.
_W, _H = 1120, 200
_NAVY = (28, 33, 64)    # #1c2140
_CORAL = (196, 85, 63)  # #c4553f
_LOGO_H = 104           # Logo-Höhe im 2x-Raum (~52px angezeigt)

_cache: dict[str, bytes] = {}
_grad_cache: Image.Image | None = None


def _gradient() -> Image.Image:
    """Waagerechter Verlauf navy -> coral (einmalig erzeugt, dann wiederverwendet)."""
    global _grad_cache
    if _grad_cache is None:
        row = Image.new("RGB", (_W, 1))
        px = row.load()
        for x in range(_W):
            t = x / (_W - 1)
            px[x, 0] = tuple(round(_NAVY[i] + (_CORAL[i] - _NAVY[i]) * t) for i in range(3))
        _grad_cache = row.resize((_W, _H))
    return _grad_cache.copy()


def _load_logo(logo_b64: str, content_type: str) -> Image.Image | None:
    if not logo_b64 or "svg" in (content_type or "").lower():
        return None  # SVG kann Pillow nicht rastern -> ohne Logo (nur Verlauf)
    try:
        img = Image.open(io.BytesIO(base64.b64decode(logo_b64)))
        return img.convert("RGBA")
    except Exception:
        return None


def build_banner(logo_b64: str, content_type: str) -> bytes:
    """PNG-Bytes des Kopf-Banners (Verlauf + zentriertes Logo)."""
    key = hashlib.sha1(f"{content_type}|{logo_b64}".encode()).hexdigest()
    cached = _cache.get(key)
    if cached is not None:
        return cached

    canvas = _gradient().convert("RGBA")
    logo = _load_logo(logo_b64, content_type)
    if logo is not None:
        target_h = _LOGO_H
        ratio = target_h / logo.height
        target_w = max(1, round(logo.width * ratio))
        if target_w > _W - 120:  # nicht zu breit werden lassen
            target_w = _W - 120
            target_h = max(1, round(logo.height * (target_w / logo.width)))
        logo = logo.resize((target_w, target_h), Image.LANCZOS)
        canvas.alpha_composite(logo, ((_W - target_w) // 2, (_H - target_h) // 2))

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    data = out.getvalue()
    _cache[key] = data
    return data
