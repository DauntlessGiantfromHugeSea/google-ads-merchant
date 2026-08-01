import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, api } from "../api";
import { useToast } from "../toast";

const STAGES = [
  { key: "lead", label: "Lead", color: "#94a3b8" },
  { key: "kontaktiert", label: "Kontaktiert", color: "#38bdf8" },
  { key: "angebot", label: "Angebot", color: "#f59e0b" },
  { key: "gewonnen", label: "Gewonnen", color: "#10b981" },
  { key: "verloren", label: "Verloren", color: "#ef4444" },
];
// Wahrscheinlichkeit je Stufe für den gewichteten Forecast.
const WEIGHT: Record<string, number> = {
  lead: 0.1, kontaktiert: 0.3, angebot: 0.6, gewonnen: 1, verloren: 0,
};

function effectiveStage(c: Client): string {
  if (c.pipeline_stage) return c.pipeline_stage;
  if (c.status === "aktiv") return "gewonnen";
  if (c.status === "beendet") return "verloren";
  return "lead";
}
const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function followupInfo(due: string): { cls: string; label: string } | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { cls: "fu-red", label: `überfällig · ${due}` };
  if (days === 0) return { cls: "fu-amber", label: "heute" };
  if (days <= 3) return { cls: "fu-amber", label: `in ${days} T.` };
  return { cls: "fu-green", label: due };
}

export default function Crm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [edit, setEdit] = useState<Client | null>(null);

  const load = () => api.clients().then(setClients).catch((e) => setError((e as Error).message));
  useEffect(() => { load(); }, []);

  const active = useMemo(() => clients.filter((c) => !c.archived), [clients]);
  const byStage = useMemo(() => {
    const map: Record<string, Client[]> = {};
    STAGES.forEach((s) => (map[s.key] = []));
    active.forEach((c) => { const s = effectiveStage(c); (map[s] || (map[s] = [])).push(c); });
    return map;
  }, [active]);

  const openValue = active
    .filter((c) => ["lead", "kontaktiert", "angebot"].includes(effectiveStage(c)))
    .reduce((a, c) => a + (c.deal_value || 0), 0);
  const weighted = active.reduce((a, c) => a + (c.deal_value || 0) * (WEIGHT[effectiveStage(c)] ?? 0), 0);
  const won = (byStage["gewonnen"] || []).reduce((a, c) => a + (c.deal_value || 0), 0);

  const move = async (c: Client, stage: string) => {
    if (effectiveStage(c) === stage) return;
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, pipeline_stage: stage } : x)));
    try {
      await api.updateClient(c.id, { pipeline_stage: stage });
      toast(`${c.name} → ${STAGES.find((s) => s.key === stage)?.label}`, "ok");
    } catch (e) {
      toast((e as Error).message, "err");
      load();
    }
  };

  const saveEdit = async (patch: Partial<Client>) => {
    if (!edit) return;
    try {
      await api.updateClient(edit.id, patch);
      setEdit(null);
      load();
    } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <>
      <div className="page-head">
        <h1>CRM · Pipeline</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>Kundenliste</button>
      </div>

      <div className="hero-stats" style={{ marginBottom: 18 }}>
        <div className="hero-stat"><div className="v">{eur(openValue)}</div><div className="l">Offene Pipeline</div></div>
        <div className="hero-stat"><div className="v">{eur(weighted)}</div><div className="l">Gewichteter Forecast</div></div>
        <div className="hero-stat"><div className="v">{eur(won)}</div><div className="l">Gewonnen</div></div>
        <div className="hero-stat"><div className="v">{active.length}</div><div className="l">Kunden gesamt</div></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="crm-board">
        {STAGES.map((s) => {
          const list = byStage[s.key] || [];
          const sum = list.reduce((a, c) => a + (c.deal_value || 0), 0);
          return (
            <div key={s.key}
              className={`crm-col ${over === s.key ? "crm-col-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
              onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
              onDrop={() => { setOver(null); const c = clients.find((x) => x.id === drag); if (c) move(c, s.key); setDrag(null); }}>
              <div className="crm-col-head">
                <span className="crm-dot" style={{ background: s.color }} />
                <strong>{s.label}</strong>
                <span className="crm-count">{list.length}</span>
              </div>
              <div className="crm-col-sum">{sum ? eur(sum) : "—"}</div>
              <div className="crm-col-body">
                {list.map((c) => {
                  const fu = followupInfo(c.next_followup);
                  return (
                    <div key={c.id} className="crm-card" draggable
                      onDragStart={() => setDrag(c.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => navigate(`/clients/${c.id}`)}>
                      <div className="crm-card-top">
                        <span className="avatar avatar-sm">{initials(c.name) || "?"}</span>
                        <span className="crm-name">{c.name}</span>
                      </div>
                      {c.contract_package && <div className="crm-pkg">{c.contract_package}</div>}
                      <div className="crm-card-foot">
                        <span className="crm-value">{c.deal_value ? eur(c.deal_value) : "kein Wert"}</span>
                        {fu && <span className={`crm-fu ${fu.cls}`}>⏰ {fu.label}</span>}
                      </div>
                      <button className="crm-edit" title="Deal bearbeiten"
                        onClick={(e) => { e.stopPropagation(); setEdit(c); }}>✎</button>
                    </div>
                  );
                })}
                {list.length === 0 && <div className="crm-empty">leer</div>}
              </div>
            </div>
          );
        })}
      </div>

      {edit && (
        <DealEditor client={edit} onClose={() => setEdit(null)} onSave={saveEdit} />
      )}
    </>
  );
}

function DealEditor({ client, onClose, onSave }: {
  client: Client; onClose: () => void; onSave: (p: Partial<Client>) => void;
}) {
  const [value, setValue] = useState(String(client.deal_value || ""));
  const [followup, setFollowup] = useState(client.next_followup || "");
  const [stage, setStage] = useState(effectiveStage(client));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{client.name}</h2>
        <div className="field"><label>Phase</label>
          <select className="select form-light" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Deal-Wert (€ / Jahr)</label>
          <input className="input form-light" type="number" min="0" value={value}
            onChange={(e) => setValue(e.target.value)} placeholder="z. B. 6000" />
        </div>
        <div className="field"><label>Nächstes Follow-up</label>
          <input className="input form-light" type="date" value={followup}
            onChange={(e) => setFollowup(e.target.value)} />
        </div>
        <div className="row-inline" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary"
            onClick={() => onSave({ pipeline_stage: stage, deal_value: Number(value) || 0, next_followup: followup })}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
