import { useEffect, useState } from "react";
import { Client, ClientUpdate, Report, Todo, api } from "../api";

export default function Overview({ client, isAgency, onGo, onSaved }:
  { client: Client; isAgency: boolean; onGo: (s: string) => void; onSaved: (c: Client) => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);

  useEffect(() => {
    api.reports(client.id).then(setReports).catch(() => {});
    api.todos(client.id).then(setTodos).catch(() => {});
    api.updates(client.id).then(setUpdates).catch(() => {});
  }, [client.id]);

  const openTodos = todos.filter((t) => t.status !== "done").length;
  const lastReport = reports[0];
  const lastUpdate = updates[0];

  return (
    <>
      {isAgency && !client.onboarding_completed && (
        <div className="section form-light" style={{ borderLeft: "3px solid var(--coral)" }}>
          <h2>Onboarding offen</h2>
          <p className="muted" style={{ marginTop: 0 }}>Konten verknüpfen, Vertrags-/Kontaktdaten pflegen, ersten Report erzeugen.</p>
          <button className="btn btn-primary" onClick={async () => onSaved(await api.completeOnboarding(client.id))}>
            Onboarding abschließen
          </button>
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
    </>
  );
}
