"""Briefing-Arten: Label + Zuordnung zum Projekt-Typ + Format/Kanal-Hinweis."""

# key -> (Label, Projekt-Typ, Format-Beispiel, Kanal-Beispiel)
BRIEFING_TYPES = {
    "social":       ("Social-Media-Beitrag", "social", "z.B. Post, Reel, Story", "z.B. Instagram, LinkedIn"),
    "print":        ("Printprodukt", "design", "z.B. Flyer A5, Plakat A1", "z.B. Druck, Auslage"),
    "website":      ("Website / Landingpage", "web", "z.B. Landingpage, 5 Seiten", "z.B. Desktop & Mobile"),
    "google_ads":   ("Google-Ads-Kampagne", "marketing", "z.B. Such-/Display-Anzeigen", "z.B. Google Suche"),
    "video":        ("Video", "design", "z.B. 60s Imagefilm", "z.B. YouTube, Website"),
    "presentation": ("Präsentation", "design", "z.B. 12 Folien Pitch", "z.B. Keynote, PDF"),
    "newsletter":   ("Newsletter", "marketing", "z.B. Monats-Newsletter", "z.B. E-Mail / Mailchimp"),
    "corporate":    ("Corporate Design", "design", "z.B. Logo + Guidelines", "z.B. alle Medien"),
    "photo":        ("Foto-/Baustellendokumentation", "sonstiges", "z.B. Vor-Ort-Shooting", "z.B. Web, Doku"),
    "general":      ("Allgemeine Anfrage", "sonstiges", "", ""),
}


def label_for(key: str) -> str:
    return BRIEFING_TYPES.get(key, BRIEFING_TYPES["general"])[0]


def project_type_for(key: str) -> str:
    return BRIEFING_TYPES.get(key, BRIEFING_TYPES["general"])[1]
