// Schmaler API-Client. Token im localStorage; alle Aufrufe gehen an /api.
const TOKEN_KEY = "reporting_token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
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
  id: string; name: string; contact_email: string; notes: string;
  onboarding_completed: boolean; created_at: string;
}
export interface Account {
  id: string; type: "google_ads" | "merchant_center" | "website";
  external_id: string; label: string; client_id: string;
  credentials_configured: boolean;
}
export interface CredentialStatus { configured: boolean; fields_present: string[]; }
export interface CredentialInput {
  developer_token?: string; client_id?: string; client_secret?: string;
  refresh_token?: string; login_customer_id?: string;
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

  clients: () => request<Client[]>("/clients"),
  createClient: (d: { name: string; contact_email?: string; notes?: string }) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(d) }),
  client: (id: string) => request<Client>(`/clients/${id}`),
  completeOnboarding: (id: string) =>
    request<Client>(`/clients/${id}/complete-onboarding`, { method: "POST" }),

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
