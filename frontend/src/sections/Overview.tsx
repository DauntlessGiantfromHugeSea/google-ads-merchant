import { useEffect, useState } from "react";
import { Account, AgencyContact, Client, ClientUpdate, Monitor, Report, Todo, api } from "../api";
import { useToast } from "../toast";

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export default function Overview({ client, isAgency, onGo, onSaved }:
  { client: Client; isAgency: boolean; onGo: (s: string) => void; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [agency, setAgency] = useState<AgencyContact | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  useEffect(() => {
    api.reports(client.id).then(setReports).catch(() => {});
    api.todos(client.id).then(setTodos).catch(() => {});
    api.updates(client.id).then(setUpdates).catch(() => {});
    api.accounts(client.id).then(setAccounts).catch(() => {});
    api.getAgencyContact().then(setAgency).catch(() => {});
    if (isAgency) api.monitors().then((all) => setMonitors(all.filter((m) => m.client_id === client.id))).catch(() => {});
  }, [client.id]);

  const hasAgency = agency && (agency.agency_contact_name || agency.agency_contact_email || agency.agency_contact_phone);

  const openTodos = todos.filter((t) => t.status !== "done").length;
  const lastReport = reports[0];
  const lastUpdate = updates[0];

  const steps = [
    { ok: !!(client.contact_email || client.contact_person), label: "Kontaktdaten hinterlegen", go: "contact" },
    { ok: accounts.length > 0, label: "Konto verknüpfen (Ads / Merchant / Website)", go: "reportings" },
    { ok: !!client.contract_package, label: "Vertrag/Paket hinterlegen", go: "contract" },
    { ok: reports.length > 0, label: "Ersten Report erzeugen", go: "reportings" },
  ];
  const doneCount = steps.filter((s) => s.ok).length;

  return (
    <>
      <div className="section" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div className="avatar">{initials(client.name) || "?"}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 2 }}>{client.name}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {client.contract_package || "Kein Paket"} · {client.contact_email || "keine E-Mail"}
          </div>
        </div>
        <span className={`status-badge st-${["lead","aktiv","pausiert","beendet"].includes(client.status) ? client.status : "aktiv"}`}>
          {client.status || "aktiv"}
        </span>
      </div>

      {isAgency && doneCount < steps.length && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <h2>Onboarding · {doneCount}/{steps.length}</h2>
            {!client.onboarding_completed && (
              <button className="btn btn-ghost btn-sm" onClick={async () => { onSaved(await api.completeOnboarding(client.id)); toast("Onboarding abgeschlossen."); }}>
                Als abgeschlossen markieren
              </button>
            )}
          </div>
          {steps.map((s) => (
            <div key={s.label} className={`check ${s.ok ? "done" : "todo"}`}>
              <span className="dot">{s.ok ? "✓" : ""}</span>
              <span className="lbl">{s.label}</span>
              {!s.ok && <button className="btn btn-ghost btn-sm go" onClick={() => onGo(s.go)}>Erledigen</button>}
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        <div className="card clickable" onClick={() => onGo("contract")}>
          <div className="meta">Vertrag</div>
          <h3>{client.contract_status || "—"}</h3>
          <div className="meta">{client.contract_package || "kein Paket hinterlegt"}</div>
        </div>
        <div className="card clickable" onClick={() => onGo("todos")}>
          <div className="meta">Offene To-Dos</div>
          <h3>{openTodos}</h3>
          <div className="meta">{todos.length} insgesamt</div>
        </div>
        <div className="card clickable" onClick={() => onGo("reportings")}>
          <div className="meta">Letzter Report</div>
          <h3>{lastReport ? lastReport.type : "—"}</h3>
          <div className="meta">{lastReport ? `${lastReport.period_start} – ${lastReport.period_end}` : "noch keiner"}</div>
        </div>
        <div className="card clickable" onClick={() => onGo("updates")}>
          <div className="meta">Letztes Update</div>
          <h3 style={{ fontSize: 15 }}>{lastUpdate ? (lastUpdate.title || lastUpdate.body.slice(0, 40)) : "—"}</h3>
          <div className="meta">{lastUpdate ? new Date(lastUpdate.created_at).toLocaleDateString("de-DE") : "noch keins"}</div>
        </div>
      </div>

      {isAgency && monitors.length > 0 && (
        <div className="section" style={{ marginTop: 18 }}>
          <h2>Website-Status</h2>
          {monitors.map((m) => (
            <div key={m.id} className="list-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`due-dot ${m.status === "down" ? "due-red" : m.status === "up" ? "due-green" : "due-none"}`} />
                <div><strong>{m.name}</strong><div className="muted" style={{ fontSize: 12 }}>{m.url}{m.message ? ` · ${m.message}` : ""}</div></div>
              </div>
              <span className={`status-badge ${m.status === "down" ? "st-pausiert" : "st-aktiv"}`}>
                {m.status === "down" ? "offline" : m.status === "up" ? "online" : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasAgency && (
        <div className="section" style={{ marginTop: 18 }}>
          <h2>Kontakt zur Agentur</h2>
          <dl className="kv">
            {agency!.agency_contact_name && <><dt>Ansprechpartner</dt><dd>{agency!.agency_contact_name}</dd></>}
            {agency!.agency_contact_email && <><dt>E-Mail</dt><dd><a className="switch-link" href={`mailto:${agency!.agency_contact_email}`}>{agency!.agency_contact_email}</a></dd></>}
            {agency!.agency_contact_phone && <><dt>Telefon</dt><dd>{agency!.agency_contact_phone}</dd></>}
            {agency!.agency_contact_note && <><dt>Hinweis</dt><dd style={{ whiteSpace: "pre-line" }}>{agency!.agency_contact_note}</dd></>}
          </dl>
        </div>
      )}
    </>
  );
}
