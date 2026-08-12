import { useEffect, useMemo, useState } from "react";
import { useToast } from "../toast";

// Reiner Frontend-Generator für eine KI-Transparenz-Seite (Art. 50 KI-VO,
// § 18 Abs. 2 MStV). Auswahl links, fertiger Text rechts – nichts wird
// serverseitig gespeichert; die Auswahl bleibt lokal im Browser erhalten.

type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "contact"; url: string };

const PLATFORMS = ["Instagram", "Facebook", "LinkedIn", "TikTok", "X (Twitter)", "YouTube", "Pinterest", "Threads"];
const STORE_KEY = "ki_transparenz_cfg";

type Cfg = {
  person: string; company: string; impressum: string; subject: string;
  research: boolean; images: boolean; imagesFullyAi: boolean; social: boolean;
  platforms: string[];
  noProductNumbers: boolean; noReviews: boolean; realPhotos: boolean;
  labelVisible: boolean; labelIptc: boolean; noRealPersons: boolean;
  aiActNote: boolean;
};

const DEFAULT: Cfg = {
  person: "", company: "", impressum: "", subject: "Beiträge und Social-Media-Posts",
  research: true, images: true, imagesFullyAi: true, social: true,
  platforms: ["Instagram", "Facebook", "LinkedIn"],
  noProductNumbers: true, noReviews: true, realPhotos: true,
  labelVisible: true, labelIptc: true, noRealPersons: true,
  aiActNote: true,
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

function buildBlocks(c: Cfg): Block[] {
  const b: Block[] = [];
  b.push({ t: "h1", text: "KI und Transparenz" });
  b.push({ t: "p", text: `Wir nutzen KI-Werkzeuge, wenn wir ${c.subject || "Inhalte"} erstellen. Nicht heimlich und nicht für alles. Hier steht, wo sie mitarbeiten, welche Schritte ein Mensch macht und wer am Ende mit Namen für den Text geradesteht.` });

  const areas: string[] = [];
  if (c.research) areas.push("Recherche und Entwurf: Themen sortieren, Quellen zusammentragen, Gliederungen und erste Rohfassungen schreiben, Titel und Beschreibungen variieren.");
  if (c.images) areas.push(c.imagesFullyAi
    ? "Bilder: Die Titelbilder unserer Beiträge und die Motive unserer Social-Media-Posts sind in der Regel vollständig mit KI erzeugt."
    : "Bilder: Wir setzen KI-Werkzeuge bei der Gestaltung und Bearbeitung einzelner Bilder ein.");
  if (c.social) areas.push(`Social Media: Die Texte für ${c.platforms.length ? joinList(c.platforms) : "unsere Kanäle"} entstehen im selben Verfahren wie die Beiträge.`);
  if (areas.length) {
    b.push({ t: "h2", text: "Wo wir KI einsetzen" });
    b.push({ t: "p", text: "Bereiche, in denen KI-Werkzeuge bei uns Arbeit übernehmen:" });
    b.push({ t: "ul", items: areas });
  }

  const noAi: string[] = [];
  if (c.noProductNumbers) noAi.push("Zahlen und Fakten zum Produkt kommen nicht aus einem Sprachmodell, sondern werden aus der Quelle übernommen, nicht geschätzt.");
  if (c.noReviews) noAi.push("Bewertungen, Erfahrungsberichte und Zitate werden weder erzeugt noch geglättet.");
  if (c.realPhotos) noAi.push("Fotos, die echte Menschen aus dem Team zeigen, sind echte Fotos.");
  if (noAi.length) {
    b.push({ t: "h2", text: "Wo wir keine KI einsetzen" });
    b.push({ t: "p", text: noAi.join(" ") });
  }

  b.push({ t: "h2", text: "Welche Kontrolle davorsteht" });
  const resp = c.person
    ? `Die redaktionelle Verantwortung nach § 18 Absatz 2 des Medienstaatsvertrags liegt bei ${c.person}${c.company ? `, ${c.company}` : ""}.`
    : "Die redaktionelle Verantwortung nach § 18 Absatz 2 des Medienstaatsvertrags liegt bei einer benannten Person (siehe Impressum).";
  b.push({ t: "p", text: `Kein Beitrag geht ohne menschliche Durchsicht online. Jeder Entwurf bleibt unveröffentlicht, bis ein Mensch ihn gelesen und freigegeben hat. ${resp}` });
  b.push({ t: "p", text: "Wir behaupten nicht, dass dabei nie ein Fehler durchrutscht. Fällt dir einer auf, schreib uns. Wir korrigieren und weisen bei inhaltlichen Änderungen im Beitrag darauf hin." });

  if (c.images) {
    b.push({ t: "h2", text: "Wie wir Bilder kennzeichnen" });
    const cases: string[] = [];
    if (c.labelVisible) cases.push("Vollständig mit KI erzeugte Bilder tragen sichtbar den Hinweis „KI unterstützt“ am Bild und zusätzlich im Alt-Text.");
    cases.push("Echte Fotos, deren Inhalt mit KI verändert wurde, kennzeichnen wir genauso.");
    cases.push("Echte Fotos, die nur technisch bearbeitet wurden – Zuschnitt, Helligkeit oder Freistellen – kennzeichnen wir nicht; der Inhalt ändert sich dadurch nicht.");
    b.push({ t: "p", text: "Wir unterscheiden:" });
    b.push({ t: "ul", items: cases });
    if (c.labelIptc) b.push({ t: "p", text: "Zusätzlich zur sichtbaren Kennzeichnung schreiben wir in jedes KI-Bild eine maschinenlesbare Herkunftsangabe nach dem IPTC-Standard. Programme, die Bilder auswerten, erkennen daran ohne Umweg, dass das Motiv aus einem Bildmodell stammt." });
    if (c.noRealPersons) b.push({ t: "p", text: "Wir erzeugen keine KI-Bilder, die eine bestimmte reale Person darstellen. Menschen auf unseren Motiven sind erfundene Figuren, keine Mitglieder und keine Mitarbeitenden." });
  }

  if (c.social) {
    b.push({ t: "h2", text: c.platforms.length ? joinList(c.platforms) : "Social Media" });
    b.push({ t: "p", text: "Auch dort steht der Hinweis am Beitrag. Er steht immer, sobald KI im Spiel war – also auch dann, wenn das Bild ein echtes Foto ist und nur der Text aus der Maschine kommt." });
  }

  if (c.aiActNote) {
    b.push({ t: "h2", text: "Was die KI-Verordnung verlangt" });
    b.push({ t: "p", text: "Artikel 50 der KI-Verordnung verpflichtet seit dem 2. August 2026 unter anderem dazu, künstlich erzeugte oder veränderte Bilder als solche kenntlich zu machen – sichtbar und maschinenlesbar. Für KI-gestützte Texte gilt eine Ausnahme, wenn ein Mensch redaktionell prüft und eine benannte Person die Verantwortung trägt. Genau das beschreibt diese Seite. Konkretisieren sich die Anforderungen in der Praxis, passen wir die Seite an und schreiben dazu, was sich geändert hat." });
  }

  b.push({ t: "contact", url: c.impressum });
  return b;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toHtml(blocks: Block[]): string {
  const parts = blocks.map((bl) => {
    if (bl.t === "h1") return `<h1>${esc(bl.text)}</h1>`;
    if (bl.t === "h2") return `<h2>${esc(bl.text)}</h2>`;
    if (bl.t === "p") return `<p>${esc(bl.text)}</p>`;
    if (bl.t === "ul") return `<ul>\n${bl.items.map((i) => `  <li>${esc(i)}</li>`).join("\n")}\n</ul>`;
    const url = bl.url || "#";
    return `<p>Fragen zu dieser Seite oder Hinweise auf Fehler: <a href="${esc(url)}">Kontakt im Impressum</a></p>`;
  });
  return `<section class="ki-transparenz">\n${parts.join("\n")}\n</section>`;
}

function toText(blocks: Block[]): string {
  return blocks.map((bl) => {
    if (bl.t === "h1") return `# ${bl.text}`;
    if (bl.t === "h2") return `## ${bl.text}`;
    if (bl.t === "p") return bl.text;
    if (bl.t === "ul") return bl.items.map((i) => `- ${i}`).join("\n");
    return `Fragen zu dieser Seite oder Hinweise auf Fehler: ${bl.url || "(Impressum-Link)"}`;
  }).join("\n\n");
}

export default function AiTransparency() {
  const toast = useToast();
  const [c, setC] = useState<Cfg>(() => {
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return DEFAULT; }
  });
  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(c)); }, [c]);

  const blocks = useMemo(() => buildBlocks(c), [c]);
  const set = (patch: Partial<Cfg>) => setC((p) => ({ ...p, ...patch }));
  const togglePlatform = (p: string) =>
    set({ platforms: c.platforms.includes(p) ? c.platforms.filter((x) => x !== p) : [...c.platforms, p] });

  const copy = async (kind: "text" | "html") => {
    const out = kind === "html" ? toHtml(blocks) : toText(blocks);
    try { await navigator.clipboard.writeText(out); toast(kind === "html" ? "HTML kopiert." : "Text kopiert."); }
    catch { toast("Kopieren nicht möglich – bitte manuell markieren.", "err"); }
  };
  const downloadHtml = () => {
    const doc = `<!DOCTYPE html>\n<html lang="de"><head><meta charset="utf-8"><title>KI und Transparenz</title></head>\n<body>\n${toHtml(blocks)}\n</body></html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    const a = document.createElement("a"); a.href = url; a.download = "ki-transparenz.html"; a.click(); URL.revokeObjectURL(url);
  };

  const Check = ({ k, label, hint }: { k: keyof Cfg; label: string; hint?: string }) => (
    <label className="ki-check">
      <input type="checkbox" checked={!!c[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Cfg>)} />
      <span><strong>{label}</strong>{hint && <span className="muted" style={{ fontWeight: 400 }}> · {hint}</span>}</span>
    </label>
  );

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>KI-Transparenz</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Erstellt den Transparenz-Text für deine Website (Art. 50 KI-VO, § 18 MStV). Wähle aus, wo du KI nutzt –
        rechts entsteht der fertige Text zum Kopieren.
      </p>

      <div className="ki-layout">
        {/* Auswahl */}
        <div className="section form-light">
          <h2 style={{ marginTop: 0 }}>Angaben</h2>

          <div className="field"><label>Verantwortliche Person (§ 18 MStV)</label>
            <input className="input" value={c.person} onChange={(e) => set({ person: e.target.value })} placeholder="Vor- und Nachname" /></div>
          <div className="field"><label>Firma / Anbieter</label>
            <input className="input" value={c.company} onChange={(e) => set({ company: e.target.value })} placeholder="z. B. North Lab GmbH" /></div>
          <div className="field"><label>Impressum-URL</label>
            <input className="input" value={c.impressum} onChange={(e) => set({ impressum: e.target.value })} placeholder="https://…/impressum" /></div>
          <div className="field"><label>Worüber wird berichtet?</label>
            <input className="input" value={c.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Beiträge und Social-Media-Posts" /></div>

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Wo wird KI eingesetzt?</h3>
          <Check k="research" label="Recherche & Entwurf" hint="Themen, Quellen, Rohfassungen" />
          <Check k="images" label="Bilder" hint="Titelbilder, Motive" />
          {c.images && <div style={{ marginLeft: 26 }}><Check k="imagesFullyAi" label="Bilder in der Regel vollständig KI-erzeugt" /></div>}
          <Check k="social" label="Social Media" hint="Post-Texte" />
          {c.social && (
            <div style={{ marginLeft: 26, marginTop: 4 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Plattformen:</div>
              <div className="ki-chips">
                {PLATFORMS.map((p) => (
                  <button key={p} type="button" className={`chip ${c.platforms.includes(p) ? "on" : ""}`} onClick={() => togglePlatform(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Wo ausdrücklich KEINE KI?</h3>
          <Check k="noProductNumbers" label="Produkt-Zahlen & Fakten" hint="aus der Quelle, nicht geschätzt" />
          <Check k="noReviews" label="Bewertungen & Zitate" hint="nicht erzeugt/geglättet" />
          <Check k="realPhotos" label="Team-Fotos sind echt" />

          {c.images && (
            <>
              <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Bild-Kennzeichnung</h3>
              <Check k="labelVisible" label="Sichtbarer Hinweis „KI unterstützt“ + Alt-Text" />
              <Check k="labelIptc" label="Maschinenlesbar (IPTC-Herkunft)" />
              <Check k="noRealPersons" label="Keine realen Personen dargestellt" />
            </>
          )}

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Rechtlicher Hinweis</h3>
          <Check k="aiActNote" label="Abschnitt zur KI-Verordnung (Art. 50)" />
        </div>

        {/* Vorschau */}
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Vorschau</h2>
            <div className="row-inline" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copy("text")}>Text kopieren</button>
              <button className="btn btn-ghost btn-sm" onClick={() => copy("html")}>HTML kopieren</button>
              <button className="btn btn-primary btn-sm" onClick={downloadHtml}>⬇ HTML</button>
            </div>
          </div>
          <div className="ki-preview">
            {blocks.map((bl, i) => {
              if (bl.t === "h1") return <h1 key={i} style={{ fontSize: 22 }}>{bl.text}</h1>;
              if (bl.t === "h2") return <h3 key={i} style={{ fontSize: 16, marginTop: 18 }}>{bl.text}</h3>;
              if (bl.t === "p") return <p key={i} style={{ lineHeight: 1.6 }}>{bl.text}</p>;
              if (bl.t === "ul") return <ul key={i} style={{ lineHeight: 1.55 }}>{bl.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
              return <p key={i} style={{ lineHeight: 1.6 }}>Fragen zu dieser Seite oder Hinweise auf Fehler: {bl.url ? <a href={bl.url} target="_blank" rel="noreferrer">Kontakt im Impressum</a> : <span className="muted">(Impressum-Link oben eintragen)</span>}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
