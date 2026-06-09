"""Merchant-Center-Auswertung (Content API for Shopping).

Demo-Adapter erzeugt Produktstatus, Disapprovals, Feed-Qualität und
Preis-/Verfügbarkeits-Mismatches. Live-Adapter folgt in Schritt 7.
"""
from __future__ import annotations

import random

from app.config import get_settings

settings = get_settings()


def _rng(seed: str) -> random.Random:
    return random.Random(hash(seed) & 0xFFFFFFFF)


def _demo_merchant(external_id: str) -> dict:
    r = _rng(f"merchant-{external_id}")
    total = r.randint(500, 5000)
    disapproved = int(total * r.uniform(0.02, 0.12))
    warnings = int(total * r.uniform(0.05, 0.2))
    approved = total - disapproved

    disapproval_reasons = [
        {"reason": "Fehlende GTIN", "count": int(disapproved * 0.35)},
        {"reason": "Bild zu klein / fehlt", "count": int(disapproved * 0.25)},
        {"reason": "Preis-Mismatch zur Landingpage", "count": int(disapproved * 0.2)},
        {"reason": "Verstoß gegen Richtlinien", "count": int(disapproved * 0.1)},
        {"reason": "Fehlende Pflichtattribute", "count": int(disapproved * 0.1)},
    ]

    feed_quality = {
        "missing_gtin": int(total * r.uniform(0.03, 0.15)),
        "missing_description": int(total * r.uniform(0.02, 0.1)),
        "missing_image": int(total * r.uniform(0.01, 0.05)),
        "short_title": int(total * r.uniform(0.05, 0.2)),
    }

    price_mismatches = int(total * r.uniform(0.0, 0.04))
    out_of_stock = int(total * r.uniform(0.05, 0.25))

    top_products = []
    names = ["Trailrunner Pro 2", "Wanderjacke Alpin", "Fitness Band X3",
             "Outdoor Rucksack 30L", "Merino Socken 3er"]
    for name in names:
        pr = _rng(f"{external_id}-{name}")
        top_products.append({
            "title": name,
            "clicks": pr.randint(50, 2000),
            "conversions": round(pr.uniform(1, 60), 1),
            "impressions": pr.randint(1000, 50000),
        })

    recommendations = []
    if disapproved:
        recommendations.append(
            f"{disapproved} abgelehnte Produkte – zuerst 'Fehlende GTIN' und 'Bild' beheben "
            "(größter Hebel)."
        )
    if feed_quality["short_title"]:
        recommendations.append(
            f"{feed_quality['short_title']} Produkte mit zu kurzen Titeln – Titel mit "
            "Marke + Produkt + Merkmal anreichern."
        )
    if price_mismatches:
        recommendations.append(
            f"{price_mismatches} Preis-Mismatches – Feed-Preis und Shop-Preis synchronisieren."
        )
    if not recommendations:
        recommendations.append("Feed in gutem Zustand – Pflege fortführen.")

    return {
        "account": external_id,
        "summary": {
            "total_products": total,
            "approved": approved,
            "disapproved": disapproved,
            "warnings": warnings,
            "out_of_stock": out_of_stock,
            "price_mismatches": price_mismatches,
        },
        "disapproval_reasons": [d for d in disapproval_reasons if d["count"] > 0],
        "feed_quality": feed_quality,
        "top_products": sorted(top_products, key=lambda p: p["clicks"], reverse=True),
        "recommendations": recommendations,
    }


def collect_merchant_data(external_id: str) -> dict:
    if settings.use_live_data:
        pass  # TODO (Schritt 7): Content-API-Adapter
    return _demo_merchant(external_id)
