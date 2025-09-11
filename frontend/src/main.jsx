import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/ToastProvider";

const el = document.getElementById("root");
if (!el) {
  // Aide au debug si index.html n’a pas la div#root
  const m = document.createElement("pre");
  m.textContent = "Erreur: #root introuvable dans index.html";
  document.body.appendChild(m);
} else {
  createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
