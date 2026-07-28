"""Standard-Preisliste North Lab (2025) zum einmaligen Import in den Katalog.

Jeder Eintrag: (category, name, description, unit, unit_price, interval, price).
"""

NORTHLAB_PRICES = [
    # Webdesign & Hosting
    ("Webdesign & Hosting", "North Start", "Moderne OnePage für kompakte Inhalte.", "Pauschal", 1000.0, "einmalig", "1.000 €"),
    ("Webdesign & Hosting", "North Core", "Business-Website mit bis zu 6 Seiten.", "Pauschal", 1500.0, "einmalig", "1.500 €"),
    ("Webdesign & Hosting", "North Scale", "Erweiterte Website mit mehr Struktur.", "Pauschal", 2500.0, "einmalig", "2.500 €"),
    ("Webdesign & Hosting", "North Prime", "Premium-Website mit Betreuung.", "Pauschal", 4000.0, "einmalig", "4.000 €"),
    ("Webdesign & Hosting", "North Host", "Monatliche Hostingpauschale pro Website.", "Monat", 10.0, "monatlich", "10 €/Monat"),
    # Texterstellung & Inhalte
    ("Texterstellung & Inhalte", "Textpaket Basis", "Website-Texte (ca. 600 Wörter).", "Pauschal", 300.0, "einmalig", "300 €"),
    ("Texterstellung & Inhalte", "Textpaket Premium", "Längere Website-Inhalte.", "Pauschal", 700.0, "einmalig", "700 €"),
    ("Texterstellung & Inhalte", "Freie Texte", "Texte für Print, Social Media oder PR.", "Stunde", 90.0, "einmalig", "90 €/h"),
    # Grafik & Branding
    ("Grafik & Branding", "Logo Design", "Logoentwicklung ohne Nutzungsrechte.", "Pauschal", 400.0, "einmalig", "400 €"),
    ("Grafik & Branding", "Logo Animation", "Animiertes Logo (2D oder 3D).", "Pauschal", 400.0, "einmalig", "400 €"),
    ("Grafik & Branding", "Erklärvideo", "Animiertes Video (ca. 1 Minute).", "Pauschal", 800.0, "einmalig", "800 €"),
    ("Grafik & Branding", "Corporate Design Manual", "Gestaltungsrichtlinien und Farbcodes.", "Pauschal", 350.0, "einmalig", "350 €"),
    # Print & Drucksorten
    ("Print & Drucksorten", "Visitenkarten-Design", "Design von Visitenkarten.", "Pauschal", 200.0, "einmalig", "200 €"),
    ("Print & Drucksorten", "Briefpapier-Design", "Layout für Briefpapier.", "Pauschal", 200.0, "einmalig", "200 €"),
    ("Print & Drucksorten", "Flyer-Design", "Flyer- oder Handout-Gestaltung.", "Pauschal", 400.0, "einmalig", "400 €"),
    ("Print & Drucksorten", "Faltbroschüre-Design", "Broschüre mit mehreren Seiten.", "Pauschal", 500.0, "einmalig", "500 €"),
    ("Print & Drucksorten", "Stempel-Design", "Gestaltung von Firmenstempeln.", "Pauschal", 150.0, "einmalig", "150 €"),
    ("Print & Drucksorten", "Roll-Up-Design", "Design für mobile Banner.", "Pauschal", 250.0, "einmalig", "250 €"),
    # Support & Schulung
    ("Support & Schulung", "WordPress Einführung", "Einführung in WordPress.", "Pauschal", 200.0, "einmalig", "200 €"),
    ("Support & Schulung", "Wartungspaket", "Technische Kontrolle & Updates + Wartung.", "Monat", 60.0, "monatlich", "60 €/Monat"),
    ("Support & Schulung", "Wartung + Building", "Wartung, Frontend-Anpassungen, …", "Monat", 120.0, "monatlich", "120 €/Monat"),
    ("Support & Schulung", "Google My Business", "Unternehmenseintrag bei Google.", "Pauschal", 180.0, "einmalig", "180 €"),
    ("Support & Schulung", "Impressum & Datenschutz", "Rechtssichere Seitenerstellung.", "Pauschal", 200.0, "einmalig", "200 €"),
    # SEO & Online-Marketing
    ("SEO & Online-Marketing", "SEO-Erstanalyse & Maßnahmenplan", "Analyse der Website und Strategieplanung.", "Pauschal", 500.0, "einmalig", "500 €"),
    ("SEO & Online-Marketing", "Technische SEO-Optimierung", "Verbesserung technischer Website-Faktoren.", "Pauschal", 700.0, "einmalig", "700 €"),
    ("SEO & Online-Marketing", "Keyword-Analyse & Strategie", "Recherche relevanter Suchbegriffe.", "Pauschal", 400.0, "einmalig", "400 €"),
    ("SEO & Online-Marketing", "Pagespeed-Optimierung", "Optimierung der Ladezeiten.", "Pauschal", 600.0, "einmalig", "600 €"),
    ("SEO & Online-Marketing", "Google Analytics & Search Console", "Tracking-Implementierung.", "Pauschal", 400.0, "einmalig", "400 €"),
    ("SEO & Online-Marketing", "Google Ads Setup", "Ersteinrichtung von Google Ads.", "Pauschal", 500.0, "einmalig", "500 €"),
    ("SEO & Online-Marketing", "Google Ads Betreuung", "Laufende Betreuung & Optimierung.", "Monat", 150.0, "monatlich", "150 €/Monat"),
    ("SEO & Online-Marketing", "SEO-Monitoring", "Monatliche Kontrolle & Reporting.", "Monat", 200.0, "monatlich", "200 €/Monat"),
    # Stundenleistung
    ("Stundenleistung", "Stundensatz", "Allgemeiner Stundensatz.", "Stunde", 60.0, "einmalig", "60 €/h"),
]
