import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginJWT, persistJWT } from "../api";
import { hasKeyPair } from "../utils/crypto";
import KeyImportForm from "./KeyImportForm";
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
  const [needsKeyImport, setNeedsKeyImport] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    try {
      const { data } = await loginJWT(username, password); // { access, refresh }
      persistJWT(data);
      onLogin?.(data);
      if (!(await hasKeyPair())) {
        setNeedsKeyImport(true);
        return;
      }
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
      {needsKeyImport ? (
        <section className="key-import-panel">
          <p className="note">
            Session ouverte. Aucune clé de coffre locale n’a été trouvée dans ce navigateur.
            Importe le fichier de clé JSON et sa passphrase pour lire la voûte.
          </p>
          <KeyImportForm
            submitLabel="Importer et ouvrir la voûte"
            successMessage="Clé importée"
            onImported={() => navigate("/vault", { replace: true })}
          />
          <div className="row row--end mt-3">
            <button type="button" className="btn btn--light" onClick={() => navigate("/vault", { replace: true })}>
              Continuer sans importer
            </button>
          </div>
        </section>
      ) : (
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
      )}
      {error && <p className="error mt-4">{error}</p>}
    </main>
  );
}
