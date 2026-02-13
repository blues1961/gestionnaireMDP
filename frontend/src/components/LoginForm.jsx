import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginJWT, setAccessToken } from "../api";
import monSiteSymbol from "../assets/mon-site-symbol.png";

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
    <main className="login-card">
      <div className="login-head">
        <img src={monSiteSymbol} alt="mon-site.ca" className="login-logo" />
        {appName && (
          <h1 className="login-title">{appName}</h1>
        )}
        <p className="login-sub">Connexion</p>
      </div>
      {/* on bloque toute soumission native */}
      <form
        action="#"
        method="post"
        onSubmit={(e) => e.preventDefault()}
        noValidate
        className="login-form"
      >
        <label className="login-label">
          <span>Utilisateur</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Identifiant"
          />
        </label>
        <label className="login-label">
          <span>Mot de passe</span>
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
      <p className="login-foot">
        Utilisez les identifiants <code>ADMIN_*</code> (déclarés en DEV) pour la première connexion.
      </p>
    </main>
  );
}
