import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginJWT, setAccessToken } from "../api";
import ThemeToggle from "./ThemeToggle";
import monSiteLogo from "../assets/mon-site-logo.png";

export default function LoginForm({
  onLogin,
  appName = "Gestionnaire MDP",
  theme = "dark",
  onThemeChange,
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [capsLockOn, setCapsLockOn] = useState(false);
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

  const syncCapsLock = (e) => {
    setCapsLockOn(Boolean(e?.getModifierState?.("CapsLock")));
  };

  return (
    <main className="login-card">
      <div className="login-head">
        <img src={monSiteLogo} alt="mon-site.ca" className="login-logo" />
        {appName && (
          <h1 className="login-title">{appName}</h1>
        )}
        <p className="login-sub">Connexion</p>
        <ThemeToggle theme={theme} onChange={onThemeChange} className="login-theme-toggle" />
      </div>
      <form
        action="#"
        method="post"
        onSubmit={submit}
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
            onKeyDown={syncCapsLock}
            onKeyUp={syncCapsLock}
            onBlur={() => setCapsLockOn(false)}
            required
            placeholder="Mot de passe"
          />
          {capsLockOn && (
            <span className="login-warning" role="status" aria-live="polite">
              Verr. Maj activée
            </span>
          )}
        </label>
        <button type="submit" className="btn btn--light">
          Se connecter
        </button>
      </form>
      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
    </main>
  );
}
