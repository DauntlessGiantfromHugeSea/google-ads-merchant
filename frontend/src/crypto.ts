// Ende-zu-Ende-Verschlüsselung für den Passwort-Safe (AES-GCM, Web Crypto).
// Der Schlüssel verlässt nie den Browser – er wird nur im Link-Fragment geteilt.

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: ArrayBuffer) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/"));

export async function encryptSecret(text: string): Promise<{ ciphertext: string; iv: string; key: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const raw = await crypto.subtle.exportKey("raw", key);
  return { ciphertext: b64(ct), iv: b64(iv.buffer), key: b64url(raw) };
}

export async function decryptSecret(ciphertext: string, iv: string, keyUrl: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", unb64url(keyUrl), { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ciphertext));
  return new TextDecoder().decode(pt);
}
