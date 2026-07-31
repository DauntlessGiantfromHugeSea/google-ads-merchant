import { useState } from "react";
import { useEffect } from "react";
import { Contract, Offer, Package, api } from "../api";
import { useToast } from "../toast";
import SignaturePad from "../components/SignaturePad";

type LRow = { description: string; qty: number; unit: string; price: number };
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const ST: Record<string, string> = { draft: "Entwurf", sent: "gesendet", signed: "unterschrieben", declined: "abgelehnt" };
const stCls = (s: string) => s === "signed" ? "st-aktiv" : s === "sent" ? "st-lead" : s === "declined" ? "st-pausiert" : "st-beendet";

const TPL_SEO = `§ 1 Vertragsgegenstand
(1) Der Dienstleister übernimmt für den Auftraggeber SEO-Dienstleistungen der Unternehmenswebseite.
(2) Die Leistungen umfassen insbesondere technische und inhaltliche Suchmaschinenoptimierung, Monitoring definierter SEO-Kennzahlen sowie Empfehlungen für weitere Optimierungsmaßnahmen.

§ 2 Vergütung und Leistungsumfang
(1) Der Dienstleister stellt dem Auftraggeber monatlich 2 Arbeitsstunden zur Verfügung.
(2) Der Stundensatz beträgt 65,00 € netto.
(3) Die monatliche Vergütung beträgt somit 130,00 € netto zzgl. gesetzlicher Umsatzsteuer.
(4) Nicht genutzte Stunden werden nicht in den Folgemonat übertragen.

§ 3 Laufzeit und Kündigung
(1) Der Vertrag beginnt am ______ und läuft auf unbestimmte Zeit.
(2) Er kann von beiden Parteien mit einer Frist von vier Wochen zum Monatsende schriftlich gekündigt werden.
(3) Das Recht zur fristlosen Kündigung aus wichtigem Grund bleibt unberührt.`;

const TPL_WEB = `§ 1 Vertragsgegenstand
(1) Der Dienstleister erstellt für den Auftraggeber eine einseitige Webseite (One-Pager) unter der Domain: ______________________
(2) Die Leistungen umfassen insbesondere:
- Konzeption und Gestaltung einer einzelnen Seite mit mehreren Inhaltsabschnitten,
- technische Umsetzung und Einrichtung auf dem vom Auftraggeber bereitgestellten Webspace,
- responsive Darstellung für Desktop-, Tablet- und Mobilansicht,
- Einbindung der vom Auftraggeber gelieferten Texte, Bilder und Logos,
- Einrichtung eines Kontaktbereichs sowie Verlinkung von Impressum und Datenschutzerklärung.
(3) Nicht Gegenstand dieses Vertrags sind insbesondere die Erstellung von Texten, Fotografien oder Logos, die laufende Betreuung, Wartung und Aktualisierung, Hosting- und Domainkosten, Suchmaschinenoptimierung sowie die rechtliche Prüfung der Webseiteninhalte.

§ 2 Leistungsumfang und Ablauf
(1) Der Dienstleister erbringt die Leistungen nach Vorlage aller erforderlichen Inhalte durch den Auftraggeber.
(2) Im Leistungsumfang enthalten sind ein Gestaltungsentwurf sowie eine Korrekturrunde mit zusammenhängend übermittelten Änderungswünschen.
(3) Weitergehende Änderungen, zusätzliche Unterseiten oder Funktionen werden gesondert nach Aufwand vereinbart und abgerechnet.
(4) Die Fertigstellung erfolgt voraussichtlich innerhalb von ______ Werktagen nach vollständigem Erhalt der Inhalte. Verzögerungen, die auf ausstehende Zulieferungen des Auftraggebers zurückgehen, verlängern diese Frist entsprechend.

§ 3 Mitwirkungspflichten des Auftraggebers
(1) Der Auftraggeber stellt alle zur Durchführung erforderlichen Inhalte, Zugänge und Informationen rechtzeitig und in verwendbarer Form bereit. Freigaben und Rückmeldungen erfolgen zeitnah, um die Fertigstellung nicht zu verzögern.
(2) Der Auftraggeber versichert, dass er an allen bereitgestellten Texten, Bildern, Logos und sonstigen Inhalten die erforderlichen Nutzungsrechte besitzt. Er stellt den Dienstleister von Ansprüchen Dritter frei, die aus der Verwendung dieser Inhalte entstehen.
(3) Die Verantwortung für die rechtliche Zulässigkeit der Inhalte, insbesondere für Impressum, Datenschutzerklärung und Cookie-Hinweise, liegt beim Auftraggeber.

§ 4 Vergütung und Zahlung
(1) Für die in § 1 beschriebenen Leistungen wird ein Pauschalhonorar von 250,00 € (in Worten: zweihundertfünfzig Euro) vereinbart.
(2) Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer erhoben und in Rechnung gestellt. Der genannte Betrag ist somit der Endbetrag.
(3) Die Rechnungsstellung erfolgt nach Abnahme der Webseite. Rechnungen sind innerhalb von 14 Tagen ohne Abzug zur Zahlung fällig.

§ 5 Abnahme
(1) Nach Fertigstellung stellt der Dienstleister die Webseite zur Prüfung bereit.
(2) Der Auftraggeber teilt etwaige Mängel innerhalb von 7 Tagen in Textform mit. Erfolgt innerhalb dieser Frist keine Rückmeldung oder wird die Webseite produktiv genutzt, gilt sie als abgenommen.

§ 6 Nutzungsrechte
(1) Mit vollständiger Zahlung der Vergütung überträgt der Dienstleister dem Auftraggeber das einfache, zeitlich und räumlich unbeschränkte Recht zur Nutzung der erstellten Webseite für eigene Zwecke.
(2) Von der Übertragung ausgenommen bleiben eingesetzte Fremdkomponenten (z. B. Themes, Plugins, Schriften, Stockmaterial), für die die Lizenzbedingungen der jeweiligen Anbieter gelten.
(3) An zugrunde liegenden Arbeitsmethoden, Vorlagen und wiederverwendbaren Bausteinen behält der Dienstleister seine Rechte.

§ 7 Haftung
(1) Der Dienstleister haftet bei Vorsatz und grober Fahrlässigkeit unbeschränkt.
(2) Die Haftung für einfache Fahrlässigkeit ist ausgeschlossen, soweit keine wesentliche Vertragspflicht verletzt wird; in diesem Fall ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt, höchstens jedoch auf die Höhe der vereinbarten Vergütung.
(3) Eine Haftung für entgangenen Gewinn, ausbleibende Besucher- oder Auftragszahlen, Rankings oder sonstige wirtschaftliche Erfolge wird nicht übernommen. Der Dienstleister schuldet die vereinbarte Leistung, nicht einen bestimmten wirtschaftlichen Erfolg.
(4) Für Inhalte, die der Auftraggeber bereitgestellt oder freigegeben hat, übernimmt der Dienstleister keine Haftung.
(5) Ebenfalls ausgeschlossen ist die Haftung für Ausfälle, Störungen oder Sicherheitslücken beim Hosting-Anbieter, für Schäden durch Eingriffe Dritter oder eigene Änderungen des Auftraggebers sowie für Funktionsstörungen infolge künftiger Updates von Software, Plugins oder Browsern.
(6) Der Dienstleister erbringt keine Rechtsberatung. Eine Haftung für die rechtliche Bewertung der Webseiteninhalte ist ausgeschlossen.
(7) Gesetzlich zwingende Haftungstatbestände, insbesondere bei Verletzung von Leben, Körper und Gesundheit, bleiben unberührt.

§ 8 Nutzung als Referenzprojekt
(1) Der Dienstleister ist berechtigt, das im Rahmen dieses Vertrags erstellte Projekt zu eigenen Werbezwecken als Referenz zu nennen und darzustellen.
(2) Dies umfasst insbesondere die Nennung des Auftraggebers, die Verwendung von Bildschirmaufnahmen der Webseite, die Verlinkung der Domain sowie die Verwendung des Logos des Auftraggebers – jeweils auf der eigenen Webseite, in Portfolios, Präsentationen, Bewerbungsunterlagen und in sozialen Netzwerken.
(3) Vertrauliche Informationen, interne Daten und nicht öffentlich zugängliche Inhalte werden dabei nicht offengelegt.
(4) Der Auftraggeber kann diese Erlaubnis jederzeit in Textform ohne Angabe von Gründen widerrufen. Bereits veröffentlichte Darstellungen werden nach Widerruf innerhalb angemessener Frist entfernt; eine Pflicht zur Rückholung bereits verbreiteter Druckerzeugnisse besteht nicht.
(5) Der Dienstleister ist berechtigt, im Fußbereich der Webseite einen dezenten Hinweis auf seine Urheberschaft mit Verlinkung anzubringen.

§ 9 Vertraulichkeit
(1) Beide Parteien verpflichten sich zur vertraulichen Behandlung aller im Rahmen des Vertrags erlangten Informationen und Zugangsdaten.
(2) Diese Pflicht besteht über die Vertragslaufzeit hinaus fort. § 8 bleibt hiervon unberührt.

§ 10 Schlussbestimmungen
(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Schriftform; Textform (z. B. E-Mail) genügt.
(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam.
(3) Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist, soweit zulässig, ______________________.`;

const TEMPLATES: Record<string, { label: string; title: string; body: string }> = {
  seo: { label: "SEO-Betreuung", title: "Vertrag über SEO-Dienstleistungen", body: TPL_SEO },
  web: { label: "Webseite (One-Pager)", title: "Vertrag über die Erstellung einer Webseite", body: TPL_WEB },
};

export default function Contracts({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<Contract[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [signId, setSignId] = useState<string | null>(null);
  const [sigName, setSigName] = useState("");
  const [sig, setSig] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [rows, setRows] = useState<LRow[]>([]);

  const load = () => api.contracts(clientId).then(setList).catch(() => {});
  useEffect(() => {
    load();
    if (isAgency) { api.offers(clientId).then(setOffers).catch(() => {}); api.packages().then(setPkgs).catch(() => {}); }
  }, [clientId]);

  const setRow = (i: number, patch: Partial<LRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const fromOffer = (id: string) => {
    const o = offers.find((x) => x.id === id); if (!o) return;
    setRows(o.items.map((it) => ({ description: (it.description || "").split("\n")[0], qty: it.quantity || 1, unit: it.unit || "", price: it.unit_price || 0 })));
  };
  const fromPkg = (id: string) => {
    const p = pkgs.find((x) => x.id === id); if (!p) return;
    setRows((r) => [...r, { description: p.name, qty: 1, unit: p.unit || "", price: p.unit_price || 0 }]);
  };
  const insertLeistungen = () => {
    const lines = rows.filter((r) => r.description.trim()).map((r) => {
      const per = /monat/i.test(r.unit) ? " / Monat" : "";
      const q = r.qty && r.qty !== 1 ? `${r.qty} × ` : "";
      return `- ${r.description} – ${q}${eur(r.price)}${per}`;
    });
    if (!lines.length) { toast("Keine Leistungen ausgewählt.", "err"); return; }
    const block = `§ 1 Vertragsgegenstand\n(1) Der Dienstleister erbringt für den Auftraggeber folgende Leistungen:\n${lines.join("\n")}`;
    setBody((b) => (b.trim() ? `${block}\n\n${b}` : block));
    setRows([]); toast("Leistungen eingefügt.");
  };

  const applyTpl = (key: string) => { const t = TEMPLATES[key]; if (!t) return; if (!title.trim()) setTitle(t.title); setBody(t.body); };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast("Titel fehlt.", "err"); return; }
    await api.createContract(clientId, { title, body });
    setTitle(""); setBody(""); setShow(false); load(); toast("Vertrag angelegt.");
  };
  const send = async (c: Contract) => { try { const r = await api.sendContract(clientId, c.id); load(); toast(`An ${r.to} gesendet.`); } catch (err) { toast((err as Error).message, "err"); } };
  const copyLink = (c: Contract) => { navigator.clipboard.writeText(`${location.origin}/vertrag/${c.public_token}`); toast("Link kopiert."); };
  const del = async (c: Contract) => { if (!confirm(`Vertrag ${c.number} löschen?`)) return; await api.deleteContract(clientId, c.id); load(); toast("Gelöscht."); };
  const openSign = (c: Contract) => window.open(`/vertrag/${c.public_token}`, "_blank");
  const doAgencySign = async (c: Contract) => {
    if (!sig) { toast("Bitte unterschreiben.", "err"); return; }
    await api.signContractInApp(clientId, c.id, { name: sigName, signature_image: sig });
    setSignId(null); setSigName(""); setSig(""); load(); toast("Unterschrieben.");
  };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Verträge</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Abbrechen" : "+ Vertrag"}</button>}
      </div>

      {show && isAgency && (
        <form className="form-light" style={{ margin: "12px 0 18px" }} onSubmit={create}>
          <div className="field"><label>Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Vertrag über SEO-Dienstleistungen" required /></div>
          <div className="field">
            <label>§ 1 Leistungen (aus Angebot oder Katalog – Preis & Text änderbar)</label>
            <div className="row-inline">
              <select className="select" defaultValue="" onChange={(e) => { fromOffer(e.target.value); e.target.value = ""; }}>
                <option value="">Aus Angebot übernehmen…</option>
                {offers.map((o) => <option key={o.id} value={o.id}>{o.number}{o.title ? ` · ${o.title}` : ""}</option>)}
              </select>
              <select className="select" defaultValue="" onChange={(e) => { fromPkg(e.target.value); e.target.value = ""; }}>
                <option value="">+ Leistung aus Katalog…</option>
                {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.unit_price ? ` (${eur(p.unit_price)})` : ""}</option>)}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((r) => [...r, { description: "", qty: 1, unit: "", price: 0 }])}>+ Zeile</button>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="row-inline" style={{ marginTop: 6 }}>
                <input className="input" style={{ flex: 2 }} value={r.description} placeholder="Leistung / Text" onChange={(e) => setRow(i, { description: e.target.value })} />
                <input className="input" style={{ width: 70 }} type="number" step="0.5" value={r.qty} onChange={(e) => setRow(i, { qty: parseFloat(e.target.value) || 0 })} title="Menge" />
                <input className="input" style={{ width: 100 }} value={r.unit} placeholder="Einheit" onChange={(e) => setRow(i, { unit: e.target.value })} />
                <input className="input" style={{ width: 110 }} type="number" step="0.01" value={r.price} onChange={(e) => setRow(i, { price: parseFloat(e.target.value) || 0 })} title="Preis €" />
                <button type="button" className="del" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {rows.length > 0 && <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={insertLeistungen}>In Vertragstext einfügen</button>}
          </div>

          <div className="field">
            <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <label>Vertragstext (Zeilen mit „§" werden fett)</label>
              <span className="row-inline">
                <span className="muted" style={{ fontSize: 12 }}>Vorlage:</span>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <button key={k} type="button" className="link-btn" onClick={() => applyTpl(k)}>{t.label}</button>
                ))}
              </span>
            </div>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={12} /></div>
          <p className="muted" style={{ fontSize: 12 }}>Die Vertragsparteien (deine Agentur & der Kunde) werden automatisch aus den Stammdaten eingesetzt. Deine Agentur-Anschrift pflegst du in den Einstellungen.</p>
          <button className="btn btn-primary">Vertrag anlegen</button>
        </form>
      )}

      {list.length === 0 ? <div className="empty">Noch keine Verträge.</div> : list.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
          <div className="list-row" style={{ border: "none", padding: 0 }}>
            <div>
              <strong>{c.number}</strong> <span className="muted">· {c.date}{c.title ? ` · ${c.title}` : ""}</span>
              <div className="muted" style={{ fontSize: 12 }}>
                Dienstleister: {c.agency_signed_at ? `✓ ${c.agency_signer_name}` : "ausstehend"} · Kunde: {c.signed_at ? `✓ ${c.signer_name}` : "ausstehend"}
              </div>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <span className={`status-badge ${stCls(c.status)}`}>{ST[c.status] || c.status}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => api.downloadContractPdf(clientId, c.id, c.number)}>PDF</button>
              {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => copyLink(c)}>Link</button>}
              {isAgency && !c.signed_at && <button className="btn btn-ghost btn-sm" onClick={() => send(c)}>senden</button>}
              {isAgency && !c.agency_signed_at && <button className="btn btn-primary btn-sm" onClick={() => { setSignId(signId === c.id ? null : c.id); setSigName(""); setSig(""); }}>Ich unterschreibe</button>}
              {!isAgency && !c.signed_at && <button className="btn btn-primary btn-sm" onClick={() => openSign(c)}>Jetzt unterschreiben</button>}
              {isAgency && <button className="del" onClick={() => del(c)}>löschen</button>}
            </div>
          </div>
          {isAgency && signId === c.id && (
            <div className="card form-light" style={{ marginTop: 10, boxShadow: "none" }}>
              <div className="field"><label>Dein Name</label>
                <input className="input" value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Name der/des Unterzeichnenden" /></div>
              <div className="field"><label>Unterschrift (Dienstleister)</label>
                <SignaturePad onChange={setSig} /></div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => doAgencySign(c)}>Verbindlich unterschreiben</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
