"""Google-Ads-Auswertung.

Adapter-Pattern: `collect_ads_data` liefert ausgewertete Kennzahlen. Ohne
Live-Credentials wird ein deterministischer Demo-Datensatz erzeugt, der den
echten Datenstrukturen entspricht. Der Live-Adapter (google-ads) wird in
Schritt 7 ergänzt – die Schnittstelle bleibt identisch.
"""
from __future__ import annotations

import random

from app.config import get_settings

settings = get_settings()


def _rng(seed: str) -> random.Random:
    return random.Random(hash(seed) & 0xFFFFFFFF)


def _demo_ads(external_id: str, period_start: str, period_end: str) -> dict:
    r = _rng(f"ads-{external_id}-{period_start}")
    impressions = r.randint(80_000, 400_000)
    clicks = int(impressions * r.uniform(0.02, 0.06))
    cost = round(clicks * r.uniform(0.45, 1.80), 2)
    conversions = round(clicks * r.uniform(0.03, 0.09), 1)
    conv_value = round(conversions * r.uniform(25, 120), 2)
    ctr = round(clicks / impressions * 100, 2)
    cpc = round(cost / clicks, 2) if clicks else 0.0
    cost_per_conv = round(cost / conversions, 2) if conversions else 0.0
    roas = round(conv_value / cost, 2) if cost else 0.0

    campaign_names = [
        "Brand Search", "Shopping – Hauptkatalog", "Performance Max",
        "Generic Search", "Remarketing Display",
    ]
    campaigns = []
    for name in campaign_names:
        cr = _rng(f"{external_id}-{name}")
        c_clicks = cr.randint(200, clicks // 2 or 200)
        c_cost = round(c_clicks * cr.uniform(0.4, 1.9), 2)
        c_conv = round(c_clicks * cr.uniform(0.02, 0.1), 1)
        campaigns.append({
            "name": name,
            "impressions": cr.randint(5_000, impressions // 3 or 5_000),
            "clicks": c_clicks,
            "cost": c_cost,
            "conversions": c_conv,
            "ctr": round(cr.uniform(1.5, 7.0), 2),
            "cpc": round(c_cost / c_clicks, 2) if c_clicks else 0.0,
            "roas": round(cr.uniform(1.5, 8.0), 2),
        })

    search_terms = [
        {"term": "günstige laufschuhe herren", "clicks": r.randint(50, 400),
         "conversions": round(r.uniform(1, 20), 1), "quality_score": r.randint(6, 10)},
        {"term": "wasserdichte wanderjacke", "clicks": r.randint(30, 300),
         "conversions": round(r.uniform(0, 12), 1), "quality_score": r.randint(4, 9)},
        {"term": "fitness tracker test", "clicks": r.randint(20, 200),
         "conversions": round(r.uniform(0, 6), 1), "quality_score": r.randint(3, 7)},
        {"term": "marke X gutschein", "clicks": r.randint(10, 150),
         "conversions": round(r.uniform(0, 3), 1), "quality_score": r.randint(2, 6)},
    ]
    weak_keywords = [t for t in search_terms if t["quality_score"] <= 4 or t["conversions"] < 1]

    recommendations = []
    if cost_per_conv > 30:
        recommendations.append(
            f"Kosten/Conversion bei {cost_per_conv} € – Gebote für schwache Keywords senken."
        )
    if weak_keywords:
        recommendations.append(
            f"{len(weak_keywords)} Keywords mit niedrigem Qualitätsfaktor/Conversions prüfen "
            "(ggf. als auszuschließende Keywords aufnehmen)."
        )
    if ctr < 3:
        recommendations.append("CTR unter 3 % – Anzeigentexte und Assets testen (A/B).")
    if not recommendations:
        recommendations.append("Performance solide – Budget auf Top-Kampagnen umschichten.")

    return {
        "account": external_id,
        "summary": {
            "impressions": impressions,
            "clicks": clicks,
            "cost": cost,
            "conversions": conversions,
            "conversion_value": conv_value,
            "ctr": ctr,
            "cpc": cpc,
            "cost_per_conversion": cost_per_conv,
            "roas": roas,
        },
        "campaigns": sorted(campaigns, key=lambda c: c["cost"], reverse=True),
        "search_terms": search_terms,
        "weak_keywords": weak_keywords,
        "recommendations": recommendations,
    }


def _live_ads(external_id: str, period_start: str, period_end: str, creds: dict) -> dict:
    """Echte Google-Ads-API (best effort). Nutzt die pro Kunde hinterlegten
    Zugangsdaten. google-ads wird lazy importiert."""
    from google.ads.googleads.client import GoogleAdsClient  # noqa: PLC0415

    cfg = {
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "use_proto_plus": True,
    }
    if creds.get("login_customer_id"):
        cfg["login_customer_id"] = str(creds["login_customer_id"]).replace("-", "")
    client = GoogleAdsClient.load_from_dict(cfg)
    customer_id = external_id.replace("-", "")
    ga_service = client.get_service("GoogleAdsService")

    query = f"""
      SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value, metrics.ctr,
             metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '{period_start}' AND '{period_end}'
      ORDER BY metrics.cost_micros DESC
    """
    campaigns, tot = [], {"impr": 0, "clk": 0, "cost": 0.0, "conv": 0.0, "val": 0.0}
    for row in ga_service.search(customer_id=customer_id, query=query):
        m = row.metrics
        cost = m.cost_micros / 1_000_000
        campaigns.append({
            "name": row.campaign.name,
            "impressions": m.impressions, "clicks": m.clicks, "cost": round(cost, 2),
            "conversions": round(m.conversions, 1), "ctr": round(m.ctr * 100, 2),
            "cpc": round(m.average_cpc / 1_000_000, 2),
            "roas": round(m.conversions_value / cost, 2) if cost else 0.0,
        })
        tot["impr"] += m.impressions; tot["clk"] += m.clicks; tot["cost"] += cost
        tot["conv"] += m.conversions; tot["val"] += m.conversions_value

    ctr = round(tot["clk"] / tot["impr"] * 100, 2) if tot["impr"] else 0.0
    cpc = round(tot["cost"] / tot["clk"], 2) if tot["clk"] else 0.0
    cpconv = round(tot["cost"] / tot["conv"], 2) if tot["conv"] else 0.0
    return {
        "account": external_id,
        "summary": {
            "impressions": tot["impr"], "clicks": tot["clk"], "cost": round(tot["cost"], 2),
            "conversions": round(tot["conv"], 1), "conversion_value": round(tot["val"], 2),
            "ctr": ctr, "cpc": cpc, "cost_per_conversion": cpconv,
            "roas": round(tot["val"] / tot["cost"], 2) if tot["cost"] else 0.0,
        },
        "campaigns": campaigns,
        "search_terms": [],
        "weak_keywords": [],
        "recommendations": ["Live-Daten aus der Google Ads API."],
    }


def collect_ads_data(external_id: str, period_start: str, period_end: str, creds: dict | None = None) -> dict:
    """Liefert Ads-Auswertung. Mit gültigen Credentials live, sonst Demo."""
    if creds and creds.get("developer_token") and creds.get("refresh_token"):
        try:
            return _live_ads(external_id, period_start, period_end, creds)
        except Exception as exc:  # pragma: no cover – Demo-Fallback bei API-Fehler
            data = _demo_ads(external_id, period_start, period_end)
            data["live_error"] = str(exc)
            return data
    return _demo_ads(external_id, period_start, period_end)
