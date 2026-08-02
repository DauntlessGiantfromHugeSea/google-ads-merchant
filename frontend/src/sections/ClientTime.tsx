import { useEffect, useState } from "react";
import { Client, Project, TimeEntry, api } from "../api";
import { decH, human } from "../lib/timeBilling";
import BillingTable from "./BillingTable";

// Zeiten & Abrechnung im Kundenprofil.
export default function ClientTime({ client }: { client: Client }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.clientTime(client.id).then(setEntries).catch(() => {});
    api.projects(client.id).then(setProjects).catch(() => {});
  }, [client.id]);

  const total = entries.reduce((a, e) => a + e.duration_seconds, 0);
  const bill = entries.reduce((a, e) => a + e.billable_seconds, 0);

  return (
    <>
      <div className="section">
        <h2 style={{ marginBottom: 2 }}>Zeiten &amp; Abrechnung</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          Alle erfassten Zeiten dieses Kunden (ganzes Team) · gesamt {human(total)} · abrechenbar {decH(bill)} h
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="empty">Noch keine Zeiten für diesen Kunden erfasst. Starte die Stoppuhr im Bereich „Zeit".</div>
      ) : (
        <BillingTable entries={entries} clients={[client]} projects={projects} filenameBase={`Zeiten-${client.name}`} />
      )}
    </>
  );
}
