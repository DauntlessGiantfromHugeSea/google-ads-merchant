"""WordPress-Update-Monitoring per Webhook (z. B. WPMonitor).

WPMonitor sendet EINEN Digest fürs ganze Konto (alle Seiten) an eine
Webhook-URL. Wir ordnen jede Seite per Host dem passenden Kunden zu und
halten die aktuell fälligen Updates (Core/Plugins/Themes) vor.
"""
import hashlib
import hmac
import re
import secrets as pysecrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_admin, require_agency
from app.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.database import get_db
from app.models import Client, Organization, User, WpSite, WpUpdate
from app.services import notify

settings = get_settings()
router = APIRouter(prefix="/api/wp", tags=["wp"])
client_router = APIRouter(prefix="/api/clients/{client_id}/wp", tags=["wp"])


def _host(url: str) -> str:
    """Nackter Host: ohne Schema, www., Port, Pfad."""
    h = re.sub(r"^https?://", "", (url or "").strip().lower())
    h = h.split("/")[0].split(":")[0]
    return h[4:] if h.startswith("www.") else h


def _base(request: Request) -> str:
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{proto}://{host}" if host and "localhost" not in host and "127.0.0.1" not in host \
        else settings.public_base_url.rstrip("/")


def _item_dict(u: WpUpdate) -> dict:
    return {"id": u.id, "type": u.type, "name": u.name, "slug": u.slug,
            "installed": u.installed, "latest": u.latest, "site": u.site,
            "host": u.host, "url": u.url, "first_seen": u.first_seen}


# ---------- Agentur: Webhook-URL & Secret ----------
@router.get("/webhook-url")
def webhook_url(request: Request, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    if not org.wp_token:
        org.wp_token = pysecrets.token_urlsafe(24)
        db.commit()
    return {"url": f"{_base(request)}/api/wp/webhook/{org.wp_token}", "has_secret": bool(org.wp_secret)}


@router.post("/secret")
def set_secret(data: dict, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    sec = (data.get("secret") or "").strip()
    org.wp_secret = encrypt(sec) if sec else ""
    db.commit()
    return {"has_secret": bool(org.wp_secret)}


@router.get("/overview")
def overview(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    """Alle fälligen Updates, nach Seite gruppiert (inkl. nicht zugeordneter)."""
    rows = (db.query(WpUpdate).filter(WpUpdate.organization_id == user.organization_id)
            .order_by(WpUpdate.host, WpUpdate.type).all())
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == user.organization_id).all()}
    groups: dict[str, dict] = {}
    for u in rows:
        g = groups.setdefault(u.host or u.site, {
            "host": u.host, "site": u.site, "url": u.url,
            "client_id": u.client_id, "client_name": names.get(u.client_id or "", ""), "items": []})
        g["items"].append(_item_dict(u))
    return list(groups.values())


# ---------- Kundenansicht ----------
@client_router.get("")
def client_wp(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    host = _host(client.website)
    q = db.query(WpUpdate).filter(WpUpdate.organization_id == client.organization_id)
    rows = [u for u in q.all() if u.client_id == client_id or (host and u.host == host)]
    rows.sort(key=lambda u: (u.type, u.name))
    return {"has_site": bool(host), "updates": [_item_dict(u) for u in rows]}


# ---------- Zentrale Seiten-Übersicht & Zuordnung ----------
@router.get("/sites")
def list_sites(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    """Alle gemeldeten WordPress-Seiten + Zuordnung + Anzahl offener Updates."""
    sites = (db.query(WpSite).filter(WpSite.organization_id == user.organization_id)
             .order_by(WpSite.host).all())
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == user.organization_id).all()}
    pending: dict[str, int] = {}
    for u in db.query(WpUpdate).filter(WpUpdate.organization_id == user.organization_id).all():
        pending[u.host] = pending.get(u.host, 0) + 1
    return [{"host": s.host, "site": s.site, "url": s.url, "client_id": s.client_id,
             "client_name": names.get(s.client_id or "", ""), "pending": pending.get(s.host, 0),
             "last_seen": s.last_seen} for s in sites]


@router.post("/sites/assign")
def assign_site(data: dict, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    """Eine Seite (Host) manuell einem Kunden zuordnen (oder Zuordnung lösen)."""
    host = (data.get("host") or "").strip().lower()
    cid = data.get("client_id") or None
    s = db.query(WpSite).filter(WpSite.organization_id == user.organization_id, WpSite.host == host).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seite nicht gefunden")
    if cid:
        get_scoped_client(cid, user, db)  # Zugehörigkeit prüfen
    s.client_id = cid
    # Bestehende Updates dieser Seite mitziehen.
    for u in db.query(WpUpdate).filter(WpUpdate.organization_id == user.organization_id, WpUpdate.host == host).all():
        u.client_id = cid
    db.commit()
    return {"ok": True, "host": host, "client_id": cid}


# ---------- Öffentlich: Digest-Webhook ----------
def _norm(items) -> list[dict]:
    out = []
    for it in (items or []):
        if not isinstance(it, dict):
            continue
        url = it.get("url") or ""
        host = _host(url) or (it.get("host") or "").lower()
        typ = (it.get("type") or "plugin").lower()
        if typ not in ("core", "plugin", "theme"):
            typ = "plugin"
        slug = str(it.get("slug") or it.get("name") or typ)[:200]
        out.append({
            "host": host, "url": url, "site": str(it.get("site") or host)[:255],
            "type": typ, "slug": slug, "name": str(it.get("name") or slug)[:255],
            "installed": str(it.get("installed") or it.get("current") or "")[:40],
            "latest": str(it.get("latest") or it.get("new") or "")[:40],
            "first_seen": str(it.get("firstSeenAt") or it.get("first_seen") or "")[:40],
        })
    return out


@router.post("/webhook/{token}")
async def wp_webhook(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    org = db.query(Organization).filter(Organization.wp_token == token).first()
    if not org or not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannter Token")
    raw = await request.body()
    # Optionale Signaturprüfung (nur wenn Secret gesetzt UND Header vorhanden).
    if org.wp_secret:
        sig = request.headers.get("x-wpud-signature", "")
        ts = request.headers.get("x-wpud-timestamp", "")
        if sig and ts:
            expected = "sha256=" + hmac.new(decrypt(org.wp_secret).encode(),
                                            f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signatur ungültig")
    try:
        import json  # noqa: PLC0415
        p = json.loads(raw or b"{}")
    except Exception:
        p = {}
    if not isinstance(p, dict):
        p = {}

    # Auto-Zuordnung Host -> Kunde (über die hinterlegte Website).
    auto_map = {}
    for c in db.query(Client).filter(Client.organization_id == org.id).all():
        h = _host(c.website)
        if h:
            auto_map[h] = c.id

    new_items = _norm(p.get("newUpdates"))
    recoveries = _norm(p.get("recoveries"))
    now = datetime.now(timezone.utc)

    def site_client(it) -> str | None:
        """Seite (Host) kennen/aktualisieren und den zugeordneten Kunden liefern.
        Manuelle Zuordnung bleibt bestehen; solange keine da ist, Auto-Match."""
        s = db.query(WpSite).filter(WpSite.organization_id == org.id, WpSite.host == it["host"]).first()
        if not s:
            s = WpSite(organization_id=org.id, host=it["host"], client_id=auto_map.get(it["host"]))
            db.add(s)
        elif not s.client_id:
            s.client_id = auto_map.get(it["host"])
        s.site = it["site"] or s.site
        s.url = it["url"] or s.url
        s.last_seen = now
        return s.client_id

    added = 0
    for it in new_items:
        cid = site_client(it)
        existing = (db.query(WpUpdate).filter(
            WpUpdate.organization_id == org.id, WpUpdate.host == it["host"],
            WpUpdate.type == it["type"], WpUpdate.slug == it["slug"]).first())
        if not existing:
            existing = WpUpdate(organization_id=org.id, created_at=now)
            db.add(existing)
            added += 1
        it["client_id"] = cid
        for k in ("client_id", "site", "host", "url", "type", "slug", "name", "installed", "latest", "first_seen"):
            setattr(existing, k, it[k])
    # Erledigte Updates entfernen + als Systemeintrag ins Protokoll schreiben.
    from app.api.routes.activity import log_activity  # noqa: PLC0415
    TL = {"core": "WordPress-Core", "plugin": "Plugin", "theme": "Theme"}
    for it in recoveries:
        db.query(WpUpdate).filter(
            WpUpdate.organization_id == org.id, WpUpdate.host == it["host"],
            WpUpdate.type == it["type"], WpUpdate.slug == it["slug"]).delete()
        s = db.query(WpSite).filter(WpSite.organization_id == org.id, WpSite.host == it["host"]).first()
        if s and s.client_id:
            ver = f" {it['installed']} → {it['latest']}" if it["installed"] and it["latest"] else ""
            log_activity(db, org_id=org.id, client_id=s.client_id,
                         text=f"WordPress-Update erledigt: {TL.get(it['type'], it['type'])} „{it['name']}“{ver}",
                         source="system", author="WordPress-Monitor", client_visible=True, occurred_at=now)

    if added:
        by_client: dict[str, int] = {}
        for it in new_items:
            by_client[it["client_id"] or ""] = by_client.get(it["client_id"] or "", 0) + 1
        for cid, n in by_client.items():
            notify.notify_users(
                db, notify._agency_user_ids(db, org.id),  # noqa: SLF001
                org_id=org.id, client_id=cid or None, type_="wp_update",
                title="WordPress-Updates fällig",
                body=f"{n} neue(s) Update(s)",
                link=(f"/clients/{cid}" if cid else "/"))
    db.commit()
    return {"ok": True, "new": added, "recovered": len(recoveries)}
