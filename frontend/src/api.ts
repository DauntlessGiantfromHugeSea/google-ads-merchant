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
  organization_id: string; client_id: string | null;
}
export interface Client {
  id: string; name: string; notes: string;
  onboarding_completed: boolean; created_at: string;
  status: string; tags: string;
  contact_email: string; contact_person: string; phone: string; website: string; address: string;
  contract_package: string; contract_status: string; contract_start: string; contract_end: string;
  contract_fee: string; contract_billing: string; contract_notes: string;
  company: string; billing_address: string; vat_id: string; billing_email: string;
}
export interface IntakeForm {
  id: string; label: string; client_id: string | null; created_by: string;
  created_at: string; expires_at: string | null; submission_count: number;
}
export interface IntakeSubmission {
  id: string; data: Record<string, string>; applied: boolean; created_at: string;
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
}
export interface Project {
  id: string; client_id: string; title: string; description: string; type: string;
  status: string; assignee: string; due_date: string; created_at: string; client_name?: string;
}
export interface Package {
  id: string; name: string; price: string; interval: string; description: string; active: boolean;
}
export type TodoGlobal = Todo & { client_name: string };
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
  login: async (email: string, password: string) => {
    const form = new FormData();
    form.set("username", email);
    form.set("password", password);
    const r = await request<{ access_token: string }>("/auth/login", { method: "POST", body: form });
    auth.set(r.access_token);
    return r;
  },
  me: () => request<User>("/auth/me"),
  registrationOpen: () => request<{ open: boolean }>("/auth/registration-open"),

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

  projects: (cid: string) => request<Project[]>(`/clients/${cid}/projects`),
  createProject: (cid: string, d: Partial<Project>) =>
    request<Project>(`/clients/${cid}/projects`, { method: "POST", body: JSON.stringify(d) }),
  updateProject: (cid: string, pid: string, d: Partial<Project>) =>
    request<Project>(`/clients/${cid}/projects/${pid}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteProject: (cid: string, pid: string) =>
    request<void>(`/clients/${cid}/projects/${pid}`, { method: "DELETE" }),
  allProjects: () => request<Project[]>("/projects"),

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

  adsActivities: (cid: string) => request<AdsActivity[]>(`/clients/${cid}/ads-activities`),
  createAdsActivity: (cid: string, d: { date?: string; category?: string; title: string; body?: string }) =>
    request<AdsActivity>(`/clients/${cid}/ads-activities`, { method: "POST", body: JSON.stringify(d) }),
  deleteAdsActivity: (cid: string, id: string) =>
    request<void>(`/clients/${cid}/ads-activities/${id}`, { method: "DELETE" }),

  mailStatus: () => request<MailStatus>("/mail/status"),
  mailConnect: () => request<{ url: string }>("/mail/connect"),
  mailDisconnect: () => request<void>("/mail/disconnect", { method: "POST" }),
  mailTest: () => request<{ ok: boolean; to: string }>("/mail/test", { method: "POST" }),
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
  createPackage: (d: { name: string; price?: string; interval?: string; description?: string }) =>
    request<Package>("/packages", { method: "POST", body: JSON.stringify(d) }),
  updatePackage: (id: string, d: Partial<Package>) =>
    request<Package>(`/packages/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deletePackage: (id: string) => request<void>(`/packages/${id}`, { method: "DELETE" }),

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
  completeOnboarding: (id: string) =>
    request<Client>(`/clients/${id}/complete-onboarding`, { method: "POST" }),
  impersonate: (id: string) =>
    request<{ access_token: string }>(`/clients/${id}/impersonate`, { method: "POST" }),

  todos: (id: string) => request<Todo[]>(`/clients/${id}/todos`),
  createTodo: (id: string, d: { title: string; description?: string; due_date?: string; priority?: string; assignee?: string }) =>
    request<Todo>(`/clients/${id}/todos`, { method: "POST", body: JSON.stringify(d) }),
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
  invite: (clientId: string, d: { email: string; password: string; full_name?: string }) =>
    request<User>(`/clients/${clientId}/invite`, { method: "POST", body: JSON.stringify(d) }),

  setCredentials: (clientId: string, accountId: string, d: CredentialInput) =>
    request<CredentialStatus>(`/clients/${clientId}/accounts/${accountId}/credentials`, {
      method: "PUT", body: JSON.stringify(d),
    }),
  deleteCredentials: (clientId: string, accountId: string) =>
    request<void>(`/clients/${clientId}/accounts/${accountId}/credentials`, { method: "DELETE" }),

  reports: (clientId: string) => request<Report[]>(`/clients/${clientId}/reports`),
  createReport: (clientId: string, d: { type: string; period_start: string; period_end: string }) =>
    request<Report>(`/clients/${clientId}/reports`, { method: "POST", body: JSON.stringify(d) }),

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
