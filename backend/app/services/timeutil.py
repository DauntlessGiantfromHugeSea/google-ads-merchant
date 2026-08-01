"""Zeitzonen-Helfer: UTC-Zeitstempel für Anzeige/Reports in die konfigurierte
Zeitzone der Agentur umrechnen (Standard: Europe/Berlin)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TZ = "Europe/Berlin"


def _aware(dt: datetime | None) -> datetime | None:
    """In der DB liegen (teils) naive UTC-Zeitstempel – hier vereinheitlicht."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def to_local(dt: datetime | None, tz_name: str | None = DEFAULT_TZ) -> datetime | None:
    dt = _aware(dt)
    if dt is None:
        return None
    try:
        return dt.astimezone(ZoneInfo(tz_name or DEFAULT_TZ))
    except (ZoneInfoNotFoundError, ValueError):
        return dt.astimezone(ZoneInfo(DEFAULT_TZ))


def fmt_local(dt: datetime | None, fmt: str = "%d.%m.%Y %H:%M",
              tz_name: str | None = DEFAULT_TZ, with_tz: bool = False) -> str:
    loc = to_local(dt, tz_name)
    if loc is None:
        return ""
    s = loc.strftime(fmt)
    if with_tz:
        s = f"{s} {loc.tzname()}"
    return s


def now_local_str(fmt: str = "%d.%m.%Y %H:%M", tz_name: str | None = DEFAULT_TZ,
                  with_tz: bool = True) -> str:
    return fmt_local(datetime.now(timezone.utc), fmt, tz_name, with_tz)
