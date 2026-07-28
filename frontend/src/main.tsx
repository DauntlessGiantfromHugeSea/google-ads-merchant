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

// Favicon auf das hochgeladene Logo setzen (Fallback bleibt /icon.svg).
(() => {
  const test = new Image();
  test.onload = () => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = "/api/branding/logo";
    const apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (apple) apple.href = "/api/branding/logo";
  };
  test.src = "/api/branding/logo?fav=1";
})();
