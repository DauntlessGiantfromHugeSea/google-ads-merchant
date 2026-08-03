import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Client, Package, api } from "../api";
import { useToast } from "../toast";

// Vier Handlungsfelder für die Gap-Analyse. keywords ordnen Pakete automatisch zu.
const AREAS = [
  { key: "website", icon: "🌐", label: "Website",
    hint: "Auftritt, Technik, Ladezeit, mobile Darstellung, Conversion.",
    keywords: ["web", "seite", "website", "landing", "shop", "relaunch", "design"] },
  { key: "seo", icon: "🔍", label: "SEO / Sichtbarkeit",
    hint: "Auffindbarkeit bei Google, Content, Rankings, technisches SEO.",
    keywords: ["seo", "sichtbar", "content", "ranking", "onpage", "audit"] },
  { key: "ads", icon: "📣", label: "Google Ads / Performance",
    hint: "Bezahlte Kampagnen, Leads, Kosten pro Anfrage, Tracking.",
    keywords: ["ads", "sea", "kampagne", "performance", "werb", "leads", "tracking"] },
  { key: "local", icon: "📍", label: "Local / Google Business",
    hint: "Unternehmensprofil, Bewertungen, lokale Präsenz, Maps.",
    keywords: ["local", "maps", "business", "profil", "bewertung", "gmb", "eintrag"] },
];
// Reifegrade: 0 fehlt … 3 stark
const LEVELS = ["fehlt", "Basis", "gut", "stark"];

function ampel(gap: number): { color: string; label: string } {
  if (gap <= 0) return { color: "#34d399", label: "erfüllt" };
  if (gap === 1) return { color: "#fbbf24", label: "Luft nach oben" };
  return { color: "#f87171", label: "großer Hebel" };
}
const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function pkgPrice(p: Package): number {
  if (p.unit_price) return p.unit_price;
  const m = String(p.price || "").replace(/\./g, "").replace(",", ".").match(/[\d.]+/);
  return m ? Number(m[0]) : 0;
}
function matchArea(p: Package, areaKey: string): boolean {
  const area = AREAS.find((a) => a.key === areaKey);
  if (!area) return false;
  const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
  return area.keywords.some((k) => hay.includes(k));
}

type State = Record<string, { ist: number; soll: number; note: string }>;
// Neutraler Start: Ist = Soll -> keine Lücke, also nichts vorausgewählt,
// bis du die Bereiche im Gespräch bewertest.
const initState = (): State => {
  const s: State = {};
  AREAS.forEach((a) => (s[a.key] = { ist: 1, soll: 1, note: "" }));
  return s;
};

export default function Sales() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [clientId, setClientId] = useState(params.get("client") || "");
  const [state, setState] = useState<State>(initState);
  const [manual, setManual] = useState<Record<string, boolean>>({});  // nur explizite Ein-/Ausschalter
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.clients().then((c) => setClients(c.filter((x) => !x.archived))).catch(() => {});
    api.packages().then((p) => setPackages(p.filter((x) => x.active !== false))).catch(() => {});
  }, []);

  const set = (k: string, patch: Partial<State[string]>) =>
    setState((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  // Bereiche mit Lücke, größte zuerst
  const gaps = useMemo(() =>
    AREAS.map((a) => ({ ...a, gap: state[a.key].soll - state[a.key].ist }))
      .filter((a) => a.gap > 0).sort((x, y) => y.gap - x.gap),
  [state]);

  // Empfohlene Pakete: passen zu einem Bereich mit Lücke (größte Lücke zuerst).
  const recommended = useMemo(() => {
    const gapKeys = new Set(gaps.map((g) => g.key));
    return packages.filter((p) => AREAS.some((a) => gapKeys.has(a.key) && matchArea(p, a.key)));
  }, [packages, gaps]);
  const recommendedIds = useMemo(() => new Set(recommended.map((p) => p.id)), [recommended]);

  // Auswahl folgt der Gap-Analyse: empfohlen = angehakt, außer du überschreibst
  // es manuell. Ändert sich die Analyse, ändert sich auch die Vorauswahl.
  const isPicked = (id: string) => (manual[id] !== undefined ? manual[id] : recommendedIds.has(id));
  const toggle = (id: string, v: boolean) => setManual((m) => ({ ...m, [id]: v }));
  const resetSelection = () => setManual({});

  // Empfohlene Pakete zuerst anzeigen.
  const sortedPkgs = useMemo(() =>
    [...packages].sort((a, b) => Number(recommendedIds.has(b.id)) - Number(recommendedIds.has(a.id))),
  [packages, recommendedIds]);

  const chosen = packages.filter((p) => isPicked(p.id));
  const total = chosen.reduce((a, p) => a + pkgPrice(p), 0);

  const summaryText = () => {
    const lines = gaps.map((g) =>
      `• ${g.label}: aktuell „${LEVELS[state[g.key].ist]}", Ziel „${LEVELS[state[g.key].soll]}"` +
      (state[g.key].note ? ` – ${state[g.key].note}` : ""));
    return `Im gemeinsamen Gespräch haben wir folgende Potenziale identifiziert:\n\n${lines.join("\n")}\n\n` +
      `Unser Vorschlag zur Umsetzung:`;
  };

  const createOffer = async () => {
    if (!clientId) { toast("Bitte zuerst einen Kunden wählen.", "err"); return; }
    if (chosen.length === 0) { toast("Bitte mindestens eine Leistung auswählen.", "err"); return; }
    setCreating(true);
    try {
      const offer = await api.createOffer(clientId, {
        title: "Angebot aus Gap-Analyse",
        intro: summaryText(),
        items: chosen.map((p) => ({
          description: p.name + (p.description ? ` – ${p.description}` : ""),
          quantity: 1, unit: p.unit || p.interval || "Pauschal", unit_price: pkgPrice(p),
        })),
      });
      toast("Angebot erstellt.", "ok");
      navigate(`/clients/${clientId}?tab=offers&offer=${offer.id}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally { setCreating(false); }
  };

  return (
    <>
      <div className="page-head">
        <h1>Sales · Gap-Analyse</h1>
        <select className="select form-light" style={{ maxWidth: 260 }}
          value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— ohne Kunde (Vorbereitung) —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="section">
        <h2>1 · Wo steht der Kunde heute?</h2>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
          Gemeinsam den Ist-Zustand einschätzen und das Ziel festlegen. Die Ampel zeigt den Hebel.
        </p>
        <div className="gap-grid">
          {AREAS.map((a) => {
            const g = state[a.key];
            const amp = ampel(g.soll - g.ist);
            return (
              <div key={a.key} className="gap-row">
                <div className="gap-head">
                  <span className="gap-icon">{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{a.label}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{a.hint}</div>
                  </div>
                  <span className="gap-amp" style={{ background: amp.color }} title={amp.label} />
                </div>
                <div className="gap-scales">
                  <Scale label="Ist" value={g.ist} onChange={(v) => set(a.key, { ist: v })} />
                  <Scale label="Soll" value={g.soll} onChange={(v) => set(a.key, { soll: v })} accent />
                </div>
                <input className="input form-light" placeholder="Notiz (optional)"
                  value={g.note} onChange={(e) => set(a.key, { note: e.target.value })}
                  style={{ marginTop: 8 }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>2 · Handlungsempfehlung</h2>
        {gaps.length === 0 ? (
          <div className="empty">Kein Handlungsbedarf – alle Bereiche auf Zielniveau. 🎉</div>
        ) : (
          <div className="gap-reco">
            {gaps.map((g) => {
              const amp = ampel(g.gap);
              return (
                <div key={g.key} className="gap-reco-row">
                  <span className="gap-amp" style={{ background: amp.color }} />
                  <div>
                    <strong>{g.icon} {g.label}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                      {LEVELS[state[g.key].ist]} → {LEVELS[state[g.key].soll]} · {amp.label}
                    </span>
                    {state[g.key].note && <div className="muted" style={{ fontSize: 12 }}>{state[g.key].note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>3 · Passende Leistungen</h2>
          {Object.keys(manual).length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={resetSelection}>Auswahl zurücksetzen</button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {gaps.length === 0
            ? "Bewerte oben die Bereiche – passende Leistungen werden dann automatisch vorgeschlagen."
            : `Vorgeschlagen anhand deiner Gap-Analyse (${gaps.map((g) => g.label).join(", ")}). Du kannst frei an-/abwählen.`}
        </p>
        {packages.length === 0 ? (
          <div className="empty">Noch keine Pakete angelegt. Lege sie in den Einstellungen an.</div>
        ) : (
          <>
            <div className="gap-pkgs">
              {sortedPkgs.map((p) => {
                const rec = recommendedIds.has(p.id);
                return (
                  <label key={p.id} className={`gap-pkg ${isPicked(p.id) ? "on" : ""}`}>
                    <input type="checkbox" checked={isPicked(p.id)}
                      onChange={(e) => toggle(p.id, e.target.checked)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-inline" style={{ gap: 8, alignItems: "center" }}>
                        <strong>{p.name}</strong>
                        {rec && <span className="tag coral" style={{ fontSize: 10 }}>empfohlen</span>}
                      </div>
                      {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
                    </div>
                    <span className="gap-pkg-price">{pkgPrice(p) ? eur(pkgPrice(p)) : "—"}</span>
                  </label>
                );
              })}
            </div>
            <div className="gap-total">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>{chosen.length} Leistung(en) · netto</div>
                <div style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 700 }}>{eur(total)}</div>
              </div>
              <button className="btn btn-primary" disabled={creating || !clientId || chosen.length === 0}
                onClick={createOffer}>
                {creating ? "Erstelle…" : "→ Angebot erstellen"}
              </button>
            </div>
            {!clientId && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Wähle oben einen Kunden, um daraus direkt ein Angebot zu erzeugen.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Scale({ label, value, onChange, accent }: {
  label: string; value: number; onChange: (v: number) => void; accent?: boolean;
}) {
  return (
    <div className="gap-scale">
      <span className="gap-scale-label">{label}</span>
      <div className="gap-seg">
        {LEVELS.map((lv, i) => (
          <button key={i} type="button"
            className={`gap-seg-btn ${value === i ? (accent ? "on-accent" : "on") : ""}`}
            onClick={() => onChange(i)}>{lv}</button>
        ))}
      </div>
    </div>
  );
}
