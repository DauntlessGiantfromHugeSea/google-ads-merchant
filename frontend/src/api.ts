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
}
export interface Participant {
  id: string; form_name: string; name: string; email: string; status: string;
  data: Record<string, unknown>; created_at: string;
}
export interface ParticipantsStatus { enabled: boolean; webhook_url: string; count: number; }
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
export interface Monitor {
  id: string; name: string; url: string; status: string; message: string;
  client_id: string | null; client_name: string; changed_at: string;
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
  brief: string; budget: number; hours_quota: number;
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
export type TodoGlobal = Todo & { client_name: string; project_title: string };
export type MyTodo = TodoGlobal;
export interface Doc {
  id: string; filename: string; content_type: string; size: number;
  uploaded_by: string; created_at: string; client_id: string;
}
export interface DashboardData {
  clients_total: number; open_todos: number; reports_total: number;
  status_counts: Record<string, number>;
  packages: { package: string; count: number; clients: { id: string; name: string; fee: string }[] }[];
  recent_updates: { client_id: string; client_name: string; title: string; body: string; category: string; author_name: string; created_at: string }[];
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
  agency_contact_phone: string; agency_contact_note: string;
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
  mailSend: (d: { to: string; subject: string; body: string; html?: boolean }) =>
    request<{ ok: boolean }>("/mail/send", { method: "POST", body: JSON.stringify(d) }),

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
