import React from "react";

export default function ThemeToggle({ theme = "dark", onChange, className = "" }) {
  const rootClass = ["theme-toggle", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass} role="group" aria-label="Thème">
      <button
        type="button"
        className={`theme-toggle__btn ${theme === "light" ? "is-active" : ""}`}
        onClick={() => onChange?.("light")}
        aria-pressed={theme === "light"}
      >
        CLAIR
      </button>
      <button
        type="button"
        className={`theme-toggle__btn ${theme === "dark" ? "is-active" : ""}`}
        onClick={() => onChange?.("dark")}
        aria-pressed={theme === "dark"}
      >
        SOMBRE
      </button>
    </div>
  );
}
