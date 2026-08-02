import { TimeEntry } from "../api";

export const two = (n: number) => String(n).padStart(2, "0");
export const human = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${two(m)} min` : `${m} min`;
};
export const decH = (sec: number) => (sec / 3600).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const monthOf = (iso: string) => iso.slice(0, 7);
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  const n = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return `${n[Number(m)] || m} ${y}`;
};

export type RateOf = (clientId: string | null, projectId: string | null) => number;

export interface BillRow {
  clientId: string; name: string; sec: number; amount: number;
  projects: { projectId: string; title: string; sec: number; rate: number; amount: number }[];
}

export function buildRollup(entries: TimeEntry[], month: string, rateOf: RateOf) {
  const inMonth = entries.filter((e) => monthOf(e.started_at) === month);
  const map: Record<string, BillRow> = {};
  let grandSec = 0, grandAmount = 0;
  inMonth.forEach((e) => {
    const rate = rateOf(e.client_id, e.project_id);
    const amount = (e.billable_seconds / 3600) * rate;
    const ck = e.client_id || "_";
    const c = (map[ck] ||= { clientId: e.client_id || "", name: e.client_name || "ohne Kunde", sec: 0, amount: 0, projects: [] });
    c.sec += e.billable_seconds; c.amount += amount;
    let p = c.projects.find((x) => x.projectId === (e.project_id || ""));
    if (!p) { p = { projectId: e.project_id || "", title: e.project_title || "ohne Projekt", sec: 0, rate, amount: 0 }; c.projects.push(p); }
    p.sec += e.billable_seconds; p.amount += amount;
    grandSec += e.billable_seconds; grandAmount += amount;
  });
  const rows = Object.values(map).sort((a, b) => b.sec - a.sec);
  rows.forEach((r) => r.projects.sort((a, b) => b.sec - a.sec));
  return { rows, grandSec, grandAmount };
}

// CSV für die Buchhaltung (deutsches Excel: Semikolon, Komma-Dezimal, BOM).
export function toCsv(entries: TimeEntry[], month: string, rateOf: RateOf): string {
  const dec = (n: number, d = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\./g, "");
  const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
  const head = ["Datum", "Kunde", "Projekt", "Mitarbeiter", "Beschreibung", "Dauer (Min)", "Abrechenbar (Min)", "Stunden", "Stundensatz", "Betrag"];
  const rows = entries
    .filter((e) => monthOf(e.started_at) === month)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((e) => {
      const rate = rateOf(e.client_id, e.project_id);
      const amount = (e.billable_seconds / 3600) * rate;
      return [
        new Date(e.started_at).toLocaleDateString("de-DE"),
        esc(e.client_name || ""), esc(e.project_title || ""), esc(e.user_name || ""), esc(e.description || ""),
        String(Math.round(e.duration_seconds / 60)), String(Math.round(e.billable_seconds / 60)),
        dec(e.billable_seconds / 3600), dec(rate), dec(amount),
      ].join(";");
    });
  return "﻿" + [head.join(";"), ...rows].join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
