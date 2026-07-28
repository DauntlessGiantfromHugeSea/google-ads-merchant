import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./toast";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// PWA: Service Worker registrieren (installierbar, offline-Shell).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Favicon = Seitenlogo auf schwarzem Grund. Das hochgeladene Logo wird auf
// eine schwarze, abgerundete Kachel gezeichnet und als Favicon gesetzt.
// Fällt auf /icon.svg zurück, wenn kein Logo vorhanden ist.
(() => {
  const setIcon = (href: string, type: string) => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.type = type;
    link.href = href;
    const apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (apple) apple.href = href;
  };

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const S = 128, pad = 18;
      const canvas = document.createElement("canvas");
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // schwarzer, abgerundeter Hintergrund
      const r = 28;
      ctx.fillStyle = "#0a0a0e";
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.arcTo(S, 0, S, S, r); ctx.arcTo(S, S, 0, S, r);
      ctx.arcTo(0, S, 0, 0, r); ctx.arcTo(0, 0, S, 0, r); ctx.closePath(); ctx.fill();
      // Logo mittig einpassen (Seitenverhältnis erhalten)
      const box = S - pad * 2;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      setIcon(canvas.toDataURL("image/png"), "image/png");
    } catch { /* Canvas tainted o. Ä. – Standard-Icon behalten */ }
  };
  img.src = "/api/branding/logo";
})();
