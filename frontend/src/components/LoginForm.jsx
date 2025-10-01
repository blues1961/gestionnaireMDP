import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginJWT, setAccessToken } from "../api";
import monSiteLogo from "../assets/mon-site-logo.png";

export default function LoginForm({ onLogin, appName = "Gestionnaire MDP" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    try {
      const { data } = await loginJWT(username, password); // { access, refresh }
      // Persistance + Bearer immédiat
      localStorage.setItem("mdp.jwt", JSON.stringify(data));
      setAccessToken(data.access);
      onLogin?.(data);
      navigate("/vault", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Échec de connexion");
    }
  };

  return (
    <main
      style={{
        width: "100%",
        maxWidth: 420,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "var(--bg-surface, #111)",
        border: "1px solid var(--border, #222)",
        borderRadius: "var(--radius, 12px)",
        boxShadow: "var(--shadow, 0 10px 30px rgba(0,0,0,.4))",
        padding: "32px",
        color: "var(--text, #eee)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <img src={monSiteLogo} alt="mon-site.ca" style={{ height: 56 }} />
        {appName && (
          <h1 style={{ margin: 0, fontSize: 22, textAlign: "center" }}>{appName}</h1>
        )}
        <p style={{ margin: 0, color: "var(--text-muted, #bbb)" }}>Connexion</p>
      </div>
      {/* on bloque toute soumission native */}
      <form
        action="#"
        method="post"
        onSubmit={(e) => e.preventDefault()}
        noValidate
        style={{ display: "grid", gap: 16 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--text-muted, #bbb)", fontSize: 14 }}>Utilisateur</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Identifiant"
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--text-muted, #bbb)", fontSize: 14 }}>Mot de passe</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Mot de passe"
          />
        </label>
        <button type="button" onClick={submit} className="btn btn--light">
          Se connecter
        </button>
      </form>
      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
      <p style={{ marginTop: 24, color: "var(--text-muted, #bbb)", fontSize: 13, textAlign: "center" }}>
        Utilisez les identifiants <code>ADMIN_*</code> (déclarés en DEV) pour la première connexion.
      </p>
    </main>
  );
}
