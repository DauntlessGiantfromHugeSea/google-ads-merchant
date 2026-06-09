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


def collect_ads_data(external_id: str, period_start: str, period_end: str) -> dict:
    if settings.use_live_data:
        # TODO (Schritt 7): echter google-ads-Adapter. Bis dahin Demo-Fallback.
        pass
    return _demo_ads(external_id, period_start, period_end)
