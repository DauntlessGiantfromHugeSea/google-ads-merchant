// Schmaler API-Client. Token im localStorage; alle Aufrufe gehen an /api.
const TOKEN_KEY = "reporting_token";
const REAL_TOKEN_KEY = "reporting_real_token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REAL_TOKEN_KEY);
  },
  get isImpersonating() {
    return !!localStorage.getItem(REAL_TOKEN_KEY);
  },
  startImpersonation(impToken: string) {
    if (!this.isImpersonating) localStorage.setItem(REAL_TOKEN_KEY, this.token || "");
    localStorage.setItem(TOKEN_KEY, impToken);
  },
  stopImpersonation() {
    const real = localStorage.getItem(REAL_TOKEN_KEY);
    if (real) localStorage.setItem(TOKEN_KEY, real);
    localStorage.removeItem(REAL_TOKEN_KEY);
  },
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (auth.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Fehler ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface User {
  id: string; email: string; full_name: string;
  role: "agency_admin" | "agency_member" | "client_user";
  organization_id: string; client_id: string | null; totp_enabled: boolean;
}
export interface TwoFASetup { secret: string; otpauth_uri: string; qr_svg: string; }
export interface Notification {
  id: string; type: string; title: string; body: string; link: string;
  read: boolean; client_id: string | null; created_at: string;
}
export interface Client {
  id: string; name: string; notes: string;
  onboarding_completed: boolean; created_at: string;
  status: string; tags: string; archived: boolean;
  contact_email: string; contact_person: string; phone: string; website: string; address: string;
  contract_package: string; contract_status: string; contract_start: string; contract_end: string;
  contract_fee: string; contract_billing: string; contract_notes: string;
  company: string; billing_address: string; vat_id: string; billing_email: string;
  participants_enabled: boolean;
  pipeline_stage: string; deal_value: number; next_followup: string;
  hourly_rate: number;
}
export interface Participant {
  id: string; form_name: string; name: string; email: string; status: string;
  data: Record<string, unknown>; created_at: string;
}
export interface ParticipantsStatus { enabled: boolean; webhook_url: string; count: number; notify_enabled: boolean; notify_agency: boolean; notify_client: boolean; notify_email: string; include_fields: boolean; include_link: boolean; confirm_enabled: boolean; confirm_subject: string; confirm_text: string; from_addr: string; has_logo: boolean; }
export interface IntakeForm {
  id: string; label: string; client_id: string | null; created_by: string;
  created_at: string; expires_at: string | null; submission_count: number;
}
export interface IntakeSubmission {
  id: string; data: Record<string, string>; applied: boolean; created_at: string;
}
export interface BriefingForm {
  id: string; briefing_type: string; label: string; intro: string; client_id: string | null;
  created_by: string; created_at: string; expires_at: string | null; submission_count: number;
}
export interface BriefingSubmission {
  id: string; briefing_type: string; data: Record<string, string>;
  converted: boolean; project_id: string | null; created_at: string;
}
export interface BriefingPublic {
  id: string; briefing_type: string; type_label: string; label: string;
  intro: string; format_hint: string; channel_hint: string;
}
export interface AdsActivity {
  id: string; client_id: string; date: string; category: string;
  title: string; body: string; author: string; created_at: string;
}
export interface MailStatus { connected: boolean; email: string; configured: boolean; }
export interface MailThread {
  id: string; reference: string; subject: string; contact_email: string; contact_name: string;
  status: string; unread: boolean; last_direction: string; last_message_at: string;
  client_id: string | null; message_count: number | null; created_by_name?: string;
}
export interface MailMessage {
  id: string; direction: string; from_email: string; to_email: string; subject: string;
  body: string; author: string; created_at: string;
}
export interface MailThreadDetail extends MailThread { messages: MailMessage[]; }
type MailAtt = { name: string; content_type: string; content_bytes: string };
export interface Monitor {
  id: string; name: string; url: string; status: string; message: string;
  client_id: string | null; client_name: string; changed_at: string;
}
export interface WpUpdate {
  id: string; type: string; name: string; slug: string; installed: string; latest: string;
  site: string; host: string; url: string; first_seen: string;
}
export interface WpSiteRow {
  host: string; site: string; url: string; client_id: string | null; client_name: string;
  pending: number; last_seen: string;
}
export interface ActivityEntry {
  id: string; occurred_at: string; author: string; source: string; text: string; client_visible: boolean;
}
export interface MonitorEvent {
  id: string; name: string; url: string; status: string; message: string; created_at: string;
}
export interface InviteResult {
  id: string; email: string; invite: boolean; invite_url?: string; emailed?: boolean; email_error?: string;
}
export interface Milestone {
  id: string; client_id: string; title: string; description: string;
  status: string; date: string; position: number; created_at: string;
}
export interface Approval {
  id: string; client_id: string; title: string; description: string; link: string;
  status: string; response_comment: string; responded_by: string; responded_at: string | null; created_at: string;
}
export interface Todo {
  id: string; title: string; description: string; status: string; priority: string;
  assignee: string; due_date: string; created_at: string; client_id: string;
  project_id: string | null; assignee_id: string | null; assignee_name: string;
  recurrence: string; checklist_total: number; checklist_done: number;
}
export interface ChecklistItem { id: string; text: string; done: boolean; position: number; }
export interface ProjectEvent { id: string; kind: string; text: string; actor: string; created_at: string; }
export interface Assignee {
  id: string; full_name: string; email: string;
  role: "agency_admin" | "agency_member" | "client_user"; kind: "agency" | "client";
}
export interface Project {
  id: string; client_id: string; title: string; description: string; type: string;
  status: string; assignee: string; due_date: string; created_at: string; client_name?: string;
  brief: string; budget: number; hours_quota: number; hourly_rate: number;
}
export interface Package {
  id: string; name: string; category: string; price: string; interval: string; description: string;
  unit: string; unit_price: number; active: boolean;
}
export interface OfferItem {
  id?: string; position?: number; description: string; quantity: number; unit: string; unit_price: number; line_total?: number;
}
export interface Offer {
  id: string; client_id: string; client_name: string; number: string; date: string; title: string;
  intro: string; status: string; vat_rate: number; public_token: string; accepted_by: string;
  created_at: string; sent_at: string | null; accepted_at: string | null;
  items: OfferItem[]; net: number; vat: number; gross: number;
}
export interface ContractService { description: string; qty: number; unit: string; price: number; }
export interface Contract {
  id: string; client_id: string; number: string; date: string; title: string; body: string;
  provider_block: string; client_block: string; services: ContractService[];
  status: string; public_token: string; signer_name: string; signer_email: string;
  signed_at: string | null; agency_signer_name: string; agency_signed_at: string | null;
  created_at: string; sent_at: string | null;
}
export interface SeoAuditBrief { id: string; url: string; score: number; grade: string; client_id: string | null; created_at: string; }
export interface Appointment {
  id: string; client_id: string; client_name: string; title: string; starts_at: string;
  link: string; note: string; protocol: string; assignees: string[]; assignee_names: string[]; created_at: string;
}
export type TodoGlobal = Todo & { client_name: string; project_title: string };
export type MyTodo = TodoGlobal;
export interface Doc {
  id: string; filename: string; content_type: string; size: number;
  uploaded_by: string; created_at: string; client_id: string;
}
export interface Invoice {
  id: string; number: string; amount: number; currency: string;
  issue_date: string; due_date: string; service_period: string; status: string; overdue: boolean;
  paid_at: string; note: string; source: string; filename: string; has_file: boolean;
  has_receipt: boolean; receipt_filename: string;
  client_id: string | null; client_name: string; created_at: string;
}
export interface Dashboard {
  id: string; label: string; url: string; position: number;
  client_id: string; created_at: string;
}
export interface Payment {
  id: string; date: string; direction: string; amount: number; currency: string;
  counterparty: string; iban: string; reference: string; note: string;
  client_id: string | null; client_name: string; invoice_id: string | null; invoice_number: string;
}
export interface DocBlock {
  id?: string; type: string; text?: string; title?: string; color?: string;
  rows?: any[]; columns?: string[];
}
export interface RichDoc {
  id: string; title: string; theme: string; accent: string; footer: string;
  blocks: DocBlock[]; client_id: string | null; client_name: string; updated_at: string | null;
}
export interface RichDocBrief { id: string; title: string; theme: string; client_name: string; updated_at: string | null; }
export interface Asset { id: string; token: string; label: string; filename: string; content_type: string; size: number; created_at: string; }
export interface UploadedFile {
  id: string; filename: string; content_type: string; size: number;
  uploader: string; created_at: string; expires_at: string | null;
}
export interface FileRequest {
  id: string; token: string; title: string; message: string; active: boolean;
  client_id: string | null; client_name: string; created_at: string;
  file_count: number; total_size: number; files: UploadedFile[];
}
export interface PublicUploadInfo {
  title: string; message: string; agency_name: string; active: boolean;
  max_bytes: number; retention_days: number;
}
export interface Credential {
  id: string; label: string; url: string; category: string;
  username: string; notes: string; has_password: boolean; created_by: string; updated_at: string | null;
}
export interface TimeEntry {
  id: string; client_id: string | null; client_name: string;
  project_id: string | null; project_title: string; user_name: string; description: string;
  started_at: string; ended_at: string | null; duration_seconds: number; billable_seconds: number; running: boolean;
}
export interface ChatMsg { id: string; author: string; text: string; created_at: string; }
export interface ProjectDoc { sections: Record<string, string>; log: ChatMsg[]; status: string; updated_at: string | null; }
export interface Anleitung { sections: Record<string, string>; status: string; updated_at: string | null; }
export interface ChecklistEntry { id: string; text: string; done: boolean; note: string; group: string; }
export interface Onboarding { data: Record<string, string>; checklist: ChecklistEntry[]; status: string; updated_at: string | null; }
export interface Kpi { period: string; metrics: Record<string, number>; extras: Record<string, number>; }
export interface KpiSource { url: string; has_url: boolean; synced_at: string | null; error: string; }
export interface DashboardData {
  clients_total: number; open_todos: number; reports_total: number;
  status_counts: Record<string, number>;
  packages: { package: string; count: number; clients: { id: string; name: string; fee: string }[] }[];
  recent_updates: { client_id: string; client_name: string; title: string; body: string; category: string; author_name: string; created_at: string }[];
  expiring_contracts?: { client_id: string; client_name: string; contract_end: string; days_left: number }[];
}
export interface ClientUpdate {
  id: string; title: string; body: string; category: string;
  author_name: string; created_at: string; client_id: string;
}
export interface Account {
  id: string; type: "google_ads" | "merchant_center" | "website";
  external_id: string; label: string; client_id: string;
  credentials_configured: boolean;
}
export interface AgencyContact {
  agency_contact_name: string; agency_contact_email: string;
  agency_contact_phone: string; agency_contact_note: string; agency_address: string;
  email_notifications: boolean; meeting_link: string; timezone: string;
}
export interface SecretInfo { id: string; views_left: number; note: string; created_by: string; expires_at: string | null; }
export interface SecretRequest { id: string; label: string; created_by: string; created_at: string; expires_at: string | null; submission_count: number; }
export interface Submission { id: string; secret: string; note: string; created_at: string; }
export interface CredentialStatus { configured: boolean; fields_present: string[]; }
export interface CredentialInput {
  developer_token?: string; client_id?: string; client_secret?: string;
  refresh_token?: string; login_customer_id?: string; service_account_json?: string;
}
export interface Report {
  id: string; type: string; status: string; period_start: string;
  period_end: string; data_source: string; client_id: string;
  created_at: string; completed_at: string | null; error: string;
}

export const api = {
  register: (d: { organization_name: string; email: string; password: string; full_name?: string }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(d) }),
  login: async (email: string, password: string, otp?: string) => {
    const form = new FormData();
    form.set("username", email);
    form.set("password", password);
    if (otp) form.set("otp", otp);
    const r = await request<{ access_token: string }>("/auth/login", { method: "POST", body: form });
    auth.set(r.access_token);
    return r;
  },
  me: () => request<User>("/auth/me"),
  loginInfo: () => request<{ tagline: string }>("/branding/login-info"),
  setLoginTagline: (tagline: string) => request<{ tagline: string }>("/branding/login-info", { method: "PATCH", body: JSON.stringify({ tagline }) }),
  twoFASetup: () => request<TwoFASetup>("/auth/2fa/setup", { method: "POST" }),
  twoFAEnable: (code: string) => request<User>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  twoFADisable: (code: string) => request<User>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),

  notifications: () => request<Notification[]>("/notifications"),
  notificationsUnread: () => request<{ count: number }>("/notifications/unread-count"),
  notificationsReadAll: () => request<void>("/notifications/read-all", { method: "POST" }),
  notificationRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: "POST" }),
  registrationOpen: () => request<{ open: boolean }>("/auth/registration-open"),
  inviteInfo: (token: string) => request<{ email: string; full_name: string }>(`/auth/invite/${token}`),
  setInvitePassword: async (token: string, password: string) => {
    const r = await request<{ access_token: string }>(`/auth/invite/${token}`, { method: "POST", body: JSON.stringify({ password }) });
    auth.set(r.access_token);
    return r;
  },

  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    return request<void>("/branding/logo", { method: "POST", body: fd });
  },
  deleteLogo: () => request<void>("/branding/logo", { method: "DELETE" }),

  dashboard: () => request<DashboardData>("/dashboard"),

  monitors: () => request<Monitor[]>("/monitoring"),
  monitoringWebhookUrl: () => request<{ url: string }>("/monitoring/webhook-url"),
  assignMonitor: (id: string, clientId: string | null) =>
    request<Monitor>(`/monitoring/${id}`, { method: "PATCH", body: JSON.stringify({ client_id: clientId }) }),
  deleteMonitor: (id: string) => request<void>(`/monitoring/${id}`, { method: "DELETE" }),
  // WordPress-Updates (WPMonitor-Digest)
  wpWebhookUrl: () => request<{ url: string; has_secret: boolean }>("/wp/webhook-url"),
  wpSetSecret: (secret: string) => request<{ has_secret: boolean }>("/wp/secret", { method: "POST", body: JSON.stringify({ secret }) }),
  wpClient: (cid: string) => request<{ has_site: boolean; updates: WpUpdate[] }>(`/clients/${cid}/wp`),
  activity: (cid: string) => request<ActivityEntry[]>(`/clients/${cid}/activity`),
  addActivity: (cid: string, d: { text: string; occurred_at?: string; client_visible?: boolean }) =>
    request<ActivityEntry>(`/clients/${cid}/activity`, { method: "POST", body: JSON.stringify(d) }),
  editActivity: (cid: string, id: string, d: { text?: string; occurred_at?: string; client_visible?: boolean }) =>
    request<ActivityEntry>(`/clients/${cid}/activity/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteActivity: (cid: string, id: string) => request<void>(`/clients/${cid}/activity/${id}`, { method: "DELETE" }),
  wpSites: () => request<WpSiteRow[]>("/wp/sites"),
  wpAssignSite: (host: string, clientId: string | null) =>
    request<{ ok: boolean }>("/wp/sites/assign", { method: "POST", body: JSON.stringify({ host, client_id: clientId }) }),

  clientMonitors: (cid: string) => request<Monitor[]>(`/monitoring/client/${cid}`),
  clientMonitorEvents: (cid: string) => request<MonitorEvent[]>(`/monitoring/client/${cid}/events`),
  async downloadMonitoringReport(cid: string, days: number, clientName: string) {
    const res = await fetch(`/api/monitoring/client/${cid}/report?days=${days}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Report fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url;
    a.download = `Monitoring-${clientName}-${days}T.pdf`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },

  projects: (cid: string) => request<Project[]>(`/clients/${cid}/projects`),
  createProject: (cid: string, d: Partial<Project>) =>
    request<Project>(`/clients/${cid}/projects`, { method: "POST", body: JSON.stringify(d) }),
  updateProject: (cid: string, pid: string, d: Partial<Project>) =>
    request<Project>(`/clients/${cid}/projects/${pid}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteProject: (cid: string, pid: string) =>
    request<void>(`/clients/${cid}/projects/${pid}`, { method: "DELETE" }),
  allProjects: () => request<Project[]>("/projects"),
  // Projekt-Dateien (für Kunden herunterladbar)
  projectFiles: (cid: string, pid: string) => request<Doc[]>(`/clients/${cid}/projects/${pid}/files`),
  uploadProjectFile: (cid: string, pid: string, file: File) => {
    const fd = new FormData(); fd.set("file", file);
    return request<Doc>(`/clients/${cid}/projects/${pid}/files`, { method: "POST", body: fd });
  },
  deleteProjectFile: (cid: string, pid: string, fid: string) =>
    request<void>(`/clients/${cid}/projects/${pid}/files/${fid}`, { method: "DELETE" }),
  async downloadProjectFile(cid: string, pid: string, fid: string, filename: string) {
    const res = await fetch(`/api/clients/${cid}/projects/${pid}/files/${fid}/download`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename || "datei"; a.click(); URL.revokeObjectURL(url);
  },
  appointments: (cid: string) => request<Appointment[]>(`/clients/${cid}/appointments`),
  createAppointment: (cid: string, d: { title: string; starts_at: string; link?: string; note?: string; assignees?: string[] }) =>
    request<Appointment>(`/clients/${cid}/appointments`, { method: "POST", body: JSON.stringify(d) }),
  updateAppointment: (cid: string, id: string, d: Partial<Appointment>) =>
    request<Appointment>(`/clients/${cid}/appointments/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteAppointment: (cid: string, id: string) => request<void>(`/clients/${cid}/appointments/${id}`, { method: "DELETE" }),
  allAppointments: () => request<Appointment[]>("/appointments"),
  projectEvents: (cid: string, pid: string) => request<ProjectEvent[]>(`/clients/${cid}/projects/${pid}/events`),
  addProjectEvent: (cid: string, pid: string, d: { text: string; kind?: string }) =>
    request<ProjectEvent>(`/clients/${cid}/projects/${pid}/events`, { method: "POST", body: JSON.stringify(d) }),

  allTodos: () => request<TodoGlobal[]>("/todos"),

  intakeForms: () => request<IntakeForm[]>("/intake"),
  createIntake: (d: { label: string; client_id?: string | null }) =>
    request<IntakeForm>("/intake", { method: "POST", body: JSON.stringify(d) }),
  deleteIntake: (id: string) => request<void>(`/intake/${id}`, { method: "DELETE" }),
  intakeSubmissions: (id: string) => request<IntakeSubmission[]>(`/intake/${id}/submissions`),
  applyIntake: (id: string, sid: string) =>
    request<{ client_id: string }>(`/intake/${id}/submissions/${sid}/apply`, { method: "POST" }),
  deleteIntakeSubmission: (id: string, sid: string) =>
    request<void>(`/intake/${id}/submissions/${sid}`, { method: "DELETE" }),
  intakePublic: (id: string) => request<{ id: string; label: string }>(`/intake/${id}/public`),
  submitIntake: (id: string, d: Record<string, string>) =>
    request<{ ok: boolean }>(`/intake/${id}/submit`, { method: "POST", body: JSON.stringify(d) }),

  briefingTypes: () => request<{ key: string; label: string }[]>("/briefings/types"),
  briefingForms: () => request<BriefingForm[]>("/briefings"),
  createBriefing: (d: { briefing_type: string; label?: string; intro?: string; client_id?: string | null }) =>
    request<BriefingForm>("/briefings", { method: "POST", body: JSON.stringify(d) }),
  deleteBriefing: (id: string) => request<void>(`/briefings/${id}`, { method: "DELETE" }),
  briefingSubmissions: (id: string) => request<BriefingSubmission[]>(`/briefings/${id}/submissions`),
  convertBriefing: (id: string, sid: string, client_id?: string | null) =>
    request<{ project_id: string; client_id: string | null }>(`/briefings/${id}/submissions/${sid}/convert`, { method: "POST", body: JSON.stringify({ client_id: client_id || null }) }),
  deleteBriefingSubmission: (id: string, sid: string) =>
    request<void>(`/briefings/${id}/submissions/${sid}`, { method: "DELETE" }),
  briefingPublic: (id: string) => request<BriefingPublic>(`/briefings/${id}/public`),
  submitBriefing: (id: string, d: Record<string, string>) =>
    request<{ ok: boolean }>(`/briefings/${id}/submit`, { method: "POST", body: JSON.stringify(d) }),

  participantsStatus: (cid: string) => request<ParticipantsStatus>(`/clients/${cid}/participants/status`),
  enableParticipants: (cid: string, enabled: boolean) =>
    request<ParticipantsStatus>(`/clients/${cid}/participants/enable`, { method: "POST", body: JSON.stringify({ enabled }) }),
  rotateParticipantToken: (cid: string) =>
    request<ParticipantsStatus>(`/clients/${cid}/participants/rotate`, { method: "POST" }),
  setWebhookNotify: (cid: string, d: { notify_enabled: boolean; notify_agency: boolean; notify_client: boolean; notify_email: string; include_fields: boolean; include_link: boolean }) =>
    request<ParticipantsStatus>(`/clients/${cid}/participants/notify`, { method: "POST", body: JSON.stringify(d) }),
  emailMeParticipants: (cid: string) =>
    request<{ ok: boolean; to: string; count: number }>(`/clients/${cid}/participants/email-me`, { method: "POST" }),
  setWebhookConfirm: (cid: string, d: { confirm_enabled: boolean; confirm_subject: string; confirm_text: string; from_addr: string }) =>
    request<ParticipantsStatus>(`/clients/${cid}/participants/confirm`, { method: "POST", body: JSON.stringify(d) }),
  uploadConfirmLogo: (cid: string, file: File) => {
    const fd = new FormData(); fd.set("file", file);
    return request<ParticipantsStatus>(`/clients/${cid}/participants/confirm-logo`, { method: "POST", body: fd });
  },
  deleteConfirmLogo: (cid: string) => request<ParticipantsStatus>(`/clients/${cid}/participants/confirm-logo`, { method: "DELETE" }),
  confirmLogoUrl: (cid: string) => `/api/participants/confirm-logo/${cid}`,
  participants: (cid: string) => request<Participant[]>(`/clients/${cid}/participants`),
  updateParticipant: (cid: string, pid: string, d: { status?: string; name?: string; email?: string }) =>
    request<Participant>(`/clients/${cid}/participants/${pid}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteParticipant: (cid: string, pid: string) =>
    request<void>(`/clients/${cid}/participants/${pid}`, { method: "DELETE" }),
  async downloadParticipantsCsv(cid: string, clientName: string) {
    const res = await fetch(`/api/clients/${cid}/participants/export.csv`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Export fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Teilnehmer-${clientName}.csv`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },

  adsActivities: (cid: string) => request<AdsActivity[]>(`/clients/${cid}/ads-activities`),
  createAdsActivity: (cid: string, d: { date?: string; category?: string; title: string; body?: string }) =>
    request<AdsActivity>(`/clients/${cid}/ads-activities`, { method: "POST", body: JSON.stringify(d) }),
  deleteAdsActivity: (cid: string, id: string) =>
    request<void>(`/clients/${cid}/ads-activities/${id}`, { method: "DELETE" }),

  mailStatus: () => request<MailStatus>("/mail/status"),
  mailConnect: () => request<{ url: string }>("/mail/connect"),
  mailDisconnect: () => request<void>("/mail/disconnect", { method: "POST" }),
  mailTest: () => request<{ ok: boolean; to: string }>("/mail/test", { method: "POST" }),
  mailPreview: () => request<{ html: string }>("/mail/preview"),
  mailSend: (d: { to: string; subject: string; body: string; html?: boolean; attachments?: { name: string; content_type: string; content_bytes: string }[] }) =>
    request<{ ok: boolean }>("/mail/send", { method: "POST", body: JSON.stringify(d) }),

  mailThreads: (clientId?: string) =>
    request<MailThread[]>(`/mail/threads${clientId ? `?client_id=${clientId}` : ""}`),
  mailThread: (id: string) => request<MailThreadDetail>(`/mail/threads/${id}`),
  startThread: (d: { to: string; contact_name?: string; subject: string; body: string; client_id?: string; attachments?: MailAtt[] }) =>
    request<MailThread>("/mail/threads", { method: "POST", body: JSON.stringify(d) }),
  replyThread: (id: string, d: { body: string; attachments?: MailAtt[] }) =>
    request<MailThreadDetail>(`/mail/threads/${id}/reply`, { method: "POST", body: JSON.stringify(d) }),
  setThreadStatus: (id: string, status: string) =>
    request<MailThread>(`/mail/threads/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  deleteThread: (id: string) => request<void>(`/mail/threads/${id}`, { method: "DELETE" }),
  syncThreads: () => request<{ new: number }>("/mail/threads/sync", { method: "POST" }),

  milestones: (cid: string) => request<Milestone[]>(`/clients/${cid}/milestones`),
  createMilestone: (cid: string, d: { title: string; description?: string; status?: string; date?: string }) =>
    request<Milestone>(`/clients/${cid}/milestones`, { method: "POST", body: JSON.stringify(d) }),
  updateMilestone: (cid: string, id: string, d: Partial<Milestone>) =>
    request<Milestone>(`/clients/${cid}/milestones/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteMilestone: (cid: string, id: string) =>
    request<void>(`/clients/${cid}/milestones/${id}`, { method: "DELETE" }),

  approvals: (cid: string) => request<Approval[]>(`/clients/${cid}/approvals`),
  createApproval: (cid: string, d: { title: string; description?: string; link?: string }) =>
    request<Approval>(`/clients/${cid}/approvals`, { method: "POST", body: JSON.stringify(d) }),
  respondApproval: (cid: string, id: string, d: { decision: string; comment?: string }) =>
    request<Approval>(`/clients/${cid}/approvals/${id}/respond`, { method: "POST", body: JSON.stringify(d) }),
  deleteApproval: (cid: string, id: string) =>
    request<void>(`/clients/${cid}/approvals/${id}`, { method: "DELETE" }),

  sendDocumentEmail: (cid: string, docId: string, d: { to: string; subject: string; body: string }) =>
    request<{ ok: boolean }>(`/clients/${cid}/documents/${docId}/send`, { method: "POST", body: JSON.stringify(d) }),

  packages: () => request<Package[]>("/packages"),
  createPackage: (d: { name: string; category?: string; price?: string; interval?: string; description?: string; unit?: string; unit_price?: number }) =>
    request<Package>("/packages", { method: "POST", body: JSON.stringify(d) }),

  offers: (cid: string) => request<Offer[]>(`/clients/${cid}/offers`),
  createOffer: (cid: string, d: Partial<Offer>) =>
    request<Offer>(`/clients/${cid}/offers`, { method: "POST", body: JSON.stringify(d) }),
  updateOffer: (cid: string, id: string, d: Partial<Offer>) =>
    request<Offer>(`/clients/${cid}/offers/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteOffer: (cid: string, id: string) => request<void>(`/clients/${cid}/offers/${id}`, { method: "DELETE" }),
  sendOffer: (cid: string, id: string) => request<{ ok: boolean; to: string; link: string }>(`/clients/${cid}/offers/${id}/send`, { method: "POST" }),
  publicOffer: (token: string) => request<any>(`/offers/${token}`),
  requestOfferCode: (token: string) => request<{ sent?: boolean; already?: boolean; email_hint?: string }>(`/offers/${token}/request-code`, { method: "POST" }),
  acceptOffer: (token: string, d: { name?: string; email?: string; code?: string }) =>
    request<{ ok: boolean }>(`/offers/${token}/accept`, { method: "POST", body: JSON.stringify(d) }),
  acceptOfferInApp: (cid: string, offerId: string) =>
    request<Offer>(`/clients/${cid}/offers/${offerId}/accept`, { method: "POST" }),

  contracts: (cid: string) => request<Contract[]>(`/clients/${cid}/contracts`),
  createContract: (cid: string, d: { title: string; body: string; number?: string; date?: string; services?: ContractService[] }) =>
    request<Contract>(`/clients/${cid}/contracts`, { method: "POST", body: JSON.stringify(d) }),
  updateContract: (cid: string, id: string, d: Partial<Contract>) =>
    request<Contract>(`/clients/${cid}/contracts/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteContract: (cid: string, id: string) => request<void>(`/clients/${cid}/contracts/${id}`, { method: "DELETE" }),
  sendContract: (cid: string, id: string) => request<{ to: string; link: string }>(`/clients/${cid}/contracts/${id}/send`, { method: "POST" }),
  signContractInApp: (cid: string, id: string, d: { name: string; signature_image: string; place?: string }) =>
    request<Contract>(`/clients/${cid}/contracts/${id}/sign`, { method: "POST", body: JSON.stringify(d) }),
  async downloadContractPdf(cid: string, id: string, number: string) {
    const res = await fetch(`/api/clients/${cid}/contracts/${id}/pdf`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Vertrag-${number}.pdf`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },
  publicContract: (token: string) => request<any>(`/contracts/${token}`),
  revealContract: (token: string, d: { code?: string; email?: string }) =>
    request<any>(`/contracts/${token}/reveal`, { method: "POST", body: JSON.stringify(d) }),
  publicContractPdfUrl: (token: string, code = "", email = "") => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (email) p.set("email", email);
    const qs = p.toString();
    return `/api/contracts/${token}/pdf${qs ? `?${qs}` : ""}`;
  },
  requestContractCode: (token: string) => request<{ sent?: boolean; already?: boolean; email_hint?: string }>(`/contracts/${token}/request-code`, { method: "POST" }),
  signContract: (token: string, d: { name?: string; email?: string; code?: string; signature_image?: string; place?: string }) =>
    request<{ ok: boolean }>(`/contracts/${token}/sign`, { method: "POST", body: JSON.stringify(d) }),
  async downloadOfferPdf(cid: string, id: string, number: string) {
    const res = await fetch(`/api/clients/${cid}/offers/${id}/pdf`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Angebot-${number}.pdf`; a.click(); URL.revokeObjectURL(url);
  },
  updatePackage: (id: string, d: Partial<Package>) =>
    request<Package>(`/packages/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deletePackage: (id: string) => request<void>(`/packages/${id}`, { method: "DELETE" }),
  importNorthlab: () => request<{ added: number; skipped: number }>("/packages/import-northlab", { method: "POST" }),

  runSeoAudit: (url: string, client_id?: string | null) =>
    request<any>("/seo/audit", { method: "POST", body: JSON.stringify({ url, client_id: client_id || null }) }),
  seoAudits: (clientId?: string) => request<SeoAuditBrief[]>(`/seo${clientId ? `?client_id=${clientId}` : ""}`),
  // Kunden-sichtbar: Audits eines Kunden + neu messen (URL nur aus den hinterlegten Websites)
  clientSeoAudits: (clientId: string) => request<any[]>(`/seo/for/${clientId}`),
  clientSeoSites: (clientId: string) => request<string[]>(`/seo/for/${clientId}/sites`),
  runClientSeoAudit: (clientId: string, url?: string) =>
    request<any>(`/seo/for/${clientId}/run`, { method: "POST", body: JSON.stringify({ url: url || null }) }),
  seoAudit: (id: string) => request<any>(`/seo/${id}`),
  deleteSeoAudit: (id: string) => request<void>(`/seo/${id}`, { method: "DELETE" }),
  async downloadSeoPdf(id: string, domain: string) {
    const res = await fetch(`/api/seo/${id}/pdf`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `SEO-${domain}.pdf`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },

  // Rechnungs-Register (extern erstellte Rechnungen verwalten)
  invoices: (clientId?: string, statusFilter?: string) => {
    const p = new URLSearchParams();
    if (clientId) p.set("client_id", clientId);
    if (statusFilter) p.set("status_filter", statusFilter);
    const qs = p.toString();
    return request<Invoice[]>(`/invoices${qs ? `?${qs}` : ""}`);
  },
  uploadInvoice: (fields: { file?: File | null; client_id?: string; number?: string; amount?: string; currency?: string; issue_date?: string; due_date?: string; service_period?: string; note?: string }) => {
    const fd = new FormData();
    if (fields.file) fd.set("file", fields.file);
    for (const k of ["client_id", "number", "amount", "currency", "issue_date", "due_date", "service_period", "note"] as const)
      if (fields[k] != null) fd.set(k, String(fields[k]));
    return request<Invoice>("/invoices", { method: "POST", body: fd });
  },
  updateInvoice: (id: string, d: Partial<Invoice>) =>
    request<Invoice>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteInvoice: (id: string) => request<void>(`/invoices/${id}`, { method: "DELETE" }),
  remindInvoice: (id: string) => request<{ ok: boolean; to: string }>(`/invoices/${id}/remind`, { method: "POST" }),
  async downloadInvoiceFile(id: string, filename: string) {
    const res = await fetch(`/api/invoices/${id}/file`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename || "rechnung"; a.click(); URL.revokeObjectURL(url);
  },
  uploadReceipt: (id: string, file: File) => {
    const fd = new FormData(); fd.set("file", file);
    return request<Invoice>(`/invoices/${id}/receipt`, { method: "POST", body: fd });
  },
  async downloadReceipt(id: string, filename: string) {
    const res = await fetch(`/api/invoices/${id}/receipt`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename || "beleg"; a.click(); URL.revokeObjectURL(url);
  },
  deleteReceipt: (id: string) => request<void>(`/invoices/${id}/receipt`, { method: "DELETE" }),
  async downloadKosten(kind: "pdf" | "zip", p: { year: string; month: number; basis: string; client: string }) {
    const q = new URLSearchParams({ year: p.year, month: String(p.month), basis: p.basis });
    if (p.client) q.set("client_id", p.client);
    const res = await fetch(`/api/invoices/report/${kind}?${q.toString()}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error(kind === "zip" ? "Keine Rechnungen im Zeitraum" : "PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Kostenaufstellung-${p.year}${p.month ? "-" + String(p.month).padStart(2, "0") : ""}.${kind}`; a.click(); URL.revokeObjectURL(url);
  },

  // Interne Zugangsdaten (Team-Tresor je Kunde)
  credentials: (clientId: string) => request<Credential[]>(`/clients/${clientId}/credentials`),
  createCredential: (clientId: string, d: { label: string; url?: string; category?: string; username?: string; password?: string; notes?: string }) =>
    request<Credential>(`/clients/${clientId}/credentials`, { method: "POST", body: JSON.stringify(d) }),
  updateCredential: (clientId: string, id: string, d: { label: string; url?: string; category?: string; username?: string; password?: string; notes?: string }) =>
    request<Credential>(`/clients/${clientId}/credentials/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  revealCredential: (clientId: string, id: string) => request<{ password: string }>(`/clients/${clientId}/credentials/${id}/reveal`),
  deleteCredential: (clientId: string, id: string) => request<void>(`/clients/${clientId}/credentials/${id}`, { method: "DELETE" }),

  // Zahlungen (Kassenbuch)
  payments: () => request<Payment[]>("/payments"),
  createPayment: (d: Partial<Payment>) => request<Payment>("/payments", { method: "POST", body: JSON.stringify(d) }),
  updatePayment: (id: string, d: Partial<Payment>) => request<Payment>(`/payments/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deletePayment: (id: string) => request<void>(`/payments/${id}`, { method: "DELETE" }),

  // Report-/Brief-Builder
  richdocs: () => request<RichDocBrief[]>("/richdocs"),
  richdoc: (id: string) => request<RichDoc>(`/richdocs/${id}`),
  createRichdoc: (d: Partial<RichDoc>) => request<RichDoc>("/richdocs", { method: "POST", body: JSON.stringify(d) }),
  updateRichdoc: (id: string, d: Partial<RichDoc>) => request<RichDoc>(`/richdocs/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteRichdoc: (id: string) => request<void>(`/richdocs/${id}`, { method: "DELETE" }),
  sendRichdoc: (id: string, d: { to?: string; subject?: string; message?: string }) =>
    request<{ ok: boolean; to: string }>(`/richdocs/${id}/send`, { method: "POST", body: JSON.stringify(d) }),
  async downloadRichdocPdf(id: string, title: string) {
    const res = await fetch(`/api/richdocs/${id}/pdf`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `${title || "Dokument"}.pdf`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },

  // Öffentliche Assets (Logo-Varianten)
  assets: () => request<Asset[]>("/assets"),
  uploadAsset: (label: string, file: File) => {
    const fd = new FormData(); fd.set("file", file); fd.set("label", label);
    return request<Asset>("/assets", { method: "POST", body: fd });
  },
  deleteAsset: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),
  assetUrl: (token: string) => `${location.origin}/api/assets/${token}`,

  // Datei-Anforderungen (öffentlicher Upload)
  fileRequests: () => request<FileRequest[]>("/filerequests"),
  fileRequest: (id: string) => request<FileRequest>(`/filerequests/${id}`),
  createFileRequest: (d: { title: string; message?: string; client_id?: string | null }) =>
    request<FileRequest>("/filerequests", { method: "POST", body: JSON.stringify(d) }),
  toggleFileRequest: (id: string, active: boolean) =>
    request<FileRequest>(`/filerequests/${id}?active=${active}`, { method: "PATCH" }),
  deleteFileRequest: (id: string) => request<void>(`/filerequests/${id}`, { method: "DELETE" }),
  deleteUploadedFile: (reqId: string, fileId: string) =>
    request<void>(`/filerequests/${reqId}/files/${fileId}`, { method: "DELETE" }),
  async downloadUploadedFile(reqId: string, fileId: string, filename: string) {
    const res = await fetch(`/api/filerequests/${reqId}/files/${fileId}/download`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  },
  async downloadAllFiles(reqId: string, title: string) {
    const res = await fetch(`/api/filerequests/${reqId}/download-all`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `${title || "dateien"}.zip`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },
  publicUploadInfo: (token: string) => request<PublicUploadInfo>(`/upload/${token}`),
  publicUpload(token: string, files: File[], uploader: string, onProgress?: (pct: number) => void): Promise<{ ok: boolean; count: number }> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("uploader", uploader);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload/${token}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({ ok: true, count: files.length }); } }
        else { try { reject(new Error(JSON.parse(xhr.responseText).detail || `Fehler ${xhr.status}`)); } catch { reject(new Error(`Fehler ${xhr.status}`)); } }
      };
      xhr.onerror = () => reject(new Error("Upload fehlgeschlagen (Netzwerk)."));
      xhr.send(fd);
    });
  },

  // Zeiterfassung (Stoppuhr)
  timeEntries: () => request<TimeEntry[]>("/time"),
  clientTime: (clientId: string) => request<TimeEntry[]>(`/clients/${clientId}/time`),
  projectTime: (clientId: string, projectId: string) =>
    request<TimeEntry[]>(`/clients/${clientId}/time?project_id=${projectId}`),
  async downloadNachweis(clientId: string, projectId: string | null, name: string) {
    const q = projectId ? `?project_id=${projectId}` : "";
    const res = await fetch(`/api/clients/${clientId}/time/nachweis.pdf${q}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Leistungsnachweis-${name}.pdf`.replace(/\s+/g, "_"); a.click(); URL.revokeObjectURL(url);
  },
  async downloadWorksheet(p: { client?: string; project?: string; title?: string; asset?: string; letterhead?: boolean }) {
    const q = new URLSearchParams();
    if (p.client) q.set("client_id", p.client);
    if (p.project) q.set("project_id", p.project);
    if (p.title) q.set("title", p.title);
    if (p.asset) q.set("asset_id", p.asset);
    if (p.letterhead) q.set("letterhead", "true");
    const res = await fetch(`/api/projects/worksheet.pdf?${q.toString()}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = "Arbeitsprotokoll.pdf"; a.click(); URL.revokeObjectURL(url);
  },
  runningTime: () => request<TimeEntry | null>("/time/running"),
  startTimer: (d: { client_id?: string | null; project_id?: string | null; description?: string }) =>
    request<TimeEntry>("/time/start", { method: "POST", body: JSON.stringify(d) }),
  stopTimer: (id: string) => request<TimeEntry>(`/time/${id}/stop`, { method: "POST" }),
  addManualTime: (d: { client_id?: string | null; project_id?: string | null; description?: string; date: string; minutes: number }) =>
    request<TimeEntry>("/time/manual", { method: "POST", body: JSON.stringify(d) }),
  updateTime: (id: string, d: { client_id?: string | null; project_id?: string | null; description?: string; minutes?: number; date?: string }) =>
    request<TimeEntry>(`/time/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteTime: (id: string) => request<void>(`/time/${id}`, { method: "DELETE" }),

  // Projekt-Doku: interner Verlauf-Chat + Kunden-Anleitung
  getProjectDoc: (clientId: string) => request<ProjectDoc>(`/clients/${clientId}/projectdoc`),
  saveProjectDoc: (clientId: string, d: { sections: Record<string, string>; status: string }) =>
    request<ProjectDoc>(`/clients/${clientId}/projectdoc`, { method: "PUT", body: JSON.stringify(d) }),
  addProjectDocChat: (clientId: string, text: string) =>
    request<ProjectDoc>(`/clients/${clientId}/projectdoc/chat`, { method: "POST", body: JSON.stringify({ text }) }),
  delProjectDocChat: (clientId: string, msgId: string) =>
    request<ProjectDoc>(`/clients/${clientId}/projectdoc/chat/${msgId}`, { method: "DELETE" }),
  clientAnleitung: (clientId: string) => request<Anleitung>(`/clients/${clientId}/projectdoc/anleitung`),
  async downloadProjectDocPdf(clientId: string, name: string, kind: "doc" | "verlauf" | "anleitung" | "technik" | "seo" | "sea" | "gesamt") {
    const paths: Record<string, string> = { verlauf: "verlauf.pdf", anleitung: "anleitung.pdf", technik: "technik.pdf", seo: "seo.pdf", sea: "sea.pdf", gesamt: "gesamt.pdf" };
    const res = await fetch(`/api/clients/${clientId}/projectdoc/${paths[kind] || "pdf"}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("PDF fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url;
    const prefix: Record<string, string> = { verlauf: "Verlauf", technik: "Technische-Doku", seo: "SEO-Doku", sea: "SEA-Doku", gesamt: "Gesamt-Doku" };
    a.download = `${prefix[kind] || "Anleitung"}-${name}.pdf`.replace(/\s+/g, "_");
    a.click(); URL.revokeObjectURL(url);
  },

  // Onboarding (Ist-Analyse + Anforderungen)
  getOnboarding: (clientId: string) => request<Onboarding>(`/clients/${clientId}/onboarding`),
  saveOnboarding: (clientId: string, d: { data: Record<string, string>; checklist: ChecklistEntry[]; status: string }) =>
    request<Onboarding>(`/clients/${clientId}/onboarding`, { method: "PUT", body: JSON.stringify(d) }),

  // Native Analytics-KPIs (Google-Sheet-Import)
  clientKpis: (clientId: string) => request<Kpi[]>(`/clients/${clientId}/kpis`),
  getKpiSource: (clientId: string) => request<KpiSource>(`/clients/${clientId}/kpis/source`),
  setKpiSource: (clientId: string, url: string) =>
    request<KpiSource>(`/clients/${clientId}/kpis/source`, { method: "PUT", body: JSON.stringify({ url }) }),
  syncKpis: (clientId: string) => request<KpiSource>(`/clients/${clientId}/kpis/sync`, { method: "POST" }),

  // Rechnungen im Kundenportal (Kunde sieht seine eigenen)
  clientInvoices: (clientId: string) => request<Invoice[]>(`/clients/${clientId}/invoices`),
  sendClientInvoices: (clientId: string) => request<{ ok: boolean; to: string; count: number }>(`/clients/${clientId}/invoices/send`, { method: "POST" }),
  async downloadClientInvoiceFile(clientId: string, invId: string, filename: string) {
    const res = await fetch(`/api/clients/${clientId}/invoices/${invId}/file`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename || "rechnung"; a.click(); URL.revokeObjectURL(url);
  },

  // Analytics-Dashboards (Embed je Kunde)
  clientDashboards: (clientId: string) => request<Dashboard[]>(`/clients/${clientId}/dashboards`),
  createDashboard: (clientId: string, d: { label: string; url: string }) =>
    request<Dashboard>(`/clients/${clientId}/dashboards`, { method: "POST", body: JSON.stringify(d) }),
  deleteDashboard: (clientId: string, id: string) =>
    request<void>(`/clients/${clientId}/dashboards/${id}`, { method: "DELETE" }),

  // Datensicherung (nur Admin, nur über Tailscale)
  backups: () => request<{ backups: { name: string; kind: string; size: number; modified: number }[]; count: number; latest: string | null }>("/admin/backups"),
  async downloadBackup(name: string) {
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}/download`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) throw new Error(res.status === 403 ? "Nur über Tailscale erreichbar." : "Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  },

  getAgencyContact: () => request<AgencyContact>("/org/contact"),
  setAgencyContact: (d: AgencyContact) => request<AgencyContact>("/org/contact", { method: "PATCH", body: JSON.stringify(d) }),

  createSecret: (d: { ciphertext: string; iv: string; views_left: number; note: string; ttl_hours: number }) =>
    request<{ id: string; views_left: number }>("/secrets", { method: "POST", body: JSON.stringify(d) }),
  secretInfo: (id: string) => request<SecretInfo>(`/secrets/${id}`),
  revealSecret: (id: string) => request<{ ciphertext: string; iv: string; views_left: number }>(`/secrets/${id}/reveal`, { method: "POST" }),

  createRequest: (d: { label: string; ttl_hours: number }) =>
    request<SecretRequest>("/requests", { method: "POST", body: JSON.stringify(d) }),
  listRequests: () => request<SecretRequest[]>("/requests"),
  deleteRequest: (id: string) => request<void>(`/requests/${id}`, { method: "DELETE" }),
  requestPublic: (id: string) => request<{ id: string; label: string }>(`/requests/${id}/public`),
  submitSecret: (id: string, d: { secret: string; note: string }) =>
    request<{ ok: boolean }>(`/requests/${id}/submit`, { method: "POST", body: JSON.stringify(d) }),
  listSubmissions: (id: string) => request<Submission[]>(`/requests/${id}/submissions`),
  deleteSubmission: (id: string, sid: string) => request<void>(`/requests/${id}/submissions/${sid}`, { method: "DELETE" }),

  team: () => request<User[]>("/team"),
  inviteMember: (d: { email: string; password: string; full_name?: string; role?: string }) =>
    request<User>("/team/invite", { method: "POST", body: JSON.stringify(d) }),
  setMemberRole: (uid: string, role: string) =>
    request<User>(`/team/${uid}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (uid: string) => request<void>(`/team/${uid}`, { method: "DELETE" }),

  documents: (clientId: string) => request<Doc[]>(`/clients/${clientId}/documents`),
  uploadDocument: (clientId: string, file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    return request<Doc>(`/clients/${clientId}/documents`, { method: "POST", body: fd });
  },
  deleteDocument: (clientId: string, docId: string) =>
    request<void>(`/clients/${clientId}/documents/${docId}`, { method: "DELETE" }),
  async downloadDocument(clientId: string, docId: string, filename: string) {
    const res = await fetch(`/api/clients/${clientId}/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },

  clients: () => request<Client[]>("/clients"),
  createClient: (d: { name: string; contact_email?: string; notes?: string }) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(d) }),
  client: (id: string) => request<Client>(`/clients/${id}`),
  updateClient: (id: string, d: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: "DELETE" }),
  completeOnboarding: (id: string) =>
    request<Client>(`/clients/${id}/complete-onboarding`, { method: "POST" }),
  impersonate: (id: string) =>
    request<{ access_token: string }>(`/clients/${id}/impersonate`, { method: "POST" }),

  todos: (id: string) => request<Todo[]>(`/clients/${id}/todos`),
  assignees: (id: string) => request<Assignee[]>(`/clients/${id}/assignees`),
  myTodos: () => request<MyTodo[]>("/todos/mine"),
  createTodo: (id: string, d: { title: string; description?: string; due_date?: string; priority?: string; assignee?: string; project_id?: string | null; assignee_id?: string | null; recurrence?: string }) =>
    request<Todo>(`/clients/${id}/todos`, { method: "POST", body: JSON.stringify(d) }),
  checklist: (cid: string, tid: string) => request<ChecklistItem[]>(`/clients/${cid}/todos/${tid}/checklist`),
  addChecklist: (cid: string, tid: string, text: string) =>
    request<ChecklistItem>(`/clients/${cid}/todos/${tid}/checklist`, { method: "POST", body: JSON.stringify({ text }) }),
  updateChecklist: (cid: string, tid: string, iid: string, d: { text?: string; done?: boolean }) =>
    request<ChecklistItem>(`/clients/${cid}/todos/${tid}/checklist/${iid}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteChecklist: (cid: string, tid: string, iid: string) =>
    request<void>(`/clients/${cid}/todos/${tid}/checklist/${iid}`, { method: "DELETE" }),
  updateTodo: (id: string, todoId: string, d: Partial<Todo>) =>
    request<Todo>(`/clients/${id}/todos/${todoId}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteTodo: (id: string, todoId: string) =>
    request<void>(`/clients/${id}/todos/${todoId}`, { method: "DELETE" }),

  updates: (id: string) => request<ClientUpdate[]>(`/clients/${id}/updates`),
  createUpdate: (id: string, d: { title?: string; body: string; category?: string }) =>
    request<ClientUpdate>(`/clients/${id}/updates`, { method: "POST", body: JSON.stringify(d) }),
  deleteUpdate: (id: string, updId: string) =>
    request<void>(`/clients/${id}/updates/${updId}`, { method: "DELETE" }),

  accounts: (clientId: string) => request<Account[]>(`/clients/${clientId}/accounts`),
  addAccount: (clientId: string, d: { type: string; external_id: string; label?: string }) =>
    request<Account>(`/clients/${clientId}/accounts`, { method: "POST", body: JSON.stringify(d) }),
  invite: (clientId: string, d: { email: string; password?: string; full_name?: string }) =>
    request<InviteResult>(`/clients/${clientId}/invite`, { method: "POST", body: JSON.stringify(d) }),
  clientAccess: (clientId: string) => request<{ id: string; email: string; full_name: string; status: string; two_factor: boolean; invite_url: string; created_at: string }[]>(`/clients/${clientId}/access`),
  revokeClientAccess: (clientId: string, uid: string) => request<void>(`/clients/${clientId}/access/${uid}`, { method: "DELETE" }),

  setCredentials: (clientId: string, accountId: string, d: CredentialInput) =>
    request<CredentialStatus>(`/clients/${clientId}/accounts/${accountId}/credentials`, {
      method: "PUT", body: JSON.stringify(d),
    }),
  deleteCredentials: (clientId: string, accountId: string) =>
    request<void>(`/clients/${clientId}/accounts/${accountId}/credentials`, { method: "DELETE" }),

  reports: (clientId: string) => request<Report[]>(`/clients/${clientId}/reports`),
  createReport: (clientId: string, d: { type: string; period_start: string; period_end: string }) =>
    request<Report>(`/clients/${clientId}/reports`, { method: "POST", body: JSON.stringify(d) }),
  deleteReport: (clientId: string, reportId: string) =>
    request<void>(`/clients/${clientId}/reports/${reportId}`, { method: "DELETE" }),

  async downloadPdf(clientId: string, reportId: string, filename: string) {
    const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/pdf`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) throw new Error("PDF-Download fehlgeschlagen");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url); // flüchtig: nur Download, nichts gespeichert
  },
};
