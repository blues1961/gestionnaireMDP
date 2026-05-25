import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import RevealDialog from "./RevealDialog";
import { useToast } from "./ToastProvider";
import { decryptPayload, hasKeyPair } from "../utils/crypto";

function exportStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function PasswordList() {
  const navigate = useNavigate();
  const toast = useToast?.() ?? { success(){}, error(){}, info(){}, add(){} };
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [active, setActive] = useState(null); // item sélectionné pour révélation
  const [query, setQuery] = useState("");
  const [dec, setDec] = useState({}); // id -> {login,password,notes}
  const [decBusy, setDecBusy] = useState(false);
  const [decDone, setDecDone] = useState(0);
  const [exportBusy, setExportBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      // mots de passe
      const list = await api.passwords?.list?.()
        .catch(async () => {
          // compat: fallback axios direct
          const pw = await api.get("passwords/");
          return Array.isArray(pw.data) ? pw.data : (pw.data?.results ?? []);
        });
      const arr = Array.isArray(list) ? list : [];
      setItems(arr);

      // catégories (optionnel)
      try {
        const catList = await api.categories?.list?.()
          .catch(async () => {
            const c = await api.get("categories/");
            return Array.isArray(c.data) ? c.data : (c.data?.results ?? []);
          });
        const map = {};
        (Array.isArray(catList) ? catList : []).forEach(
          (cat) => (map[cat.id] = cat.name || cat.title || `#${cat.id}`)
        );
        setCats(map);
      } catch (e) {
        // on ignore si l’endpoint n’existe pas
        console.warn("categories/ indisponible:", e?.response?.status || e);
      }
    } catch (e) {
      setErr(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function buildDecryptedExportRows() {
    const rows = [];
    let skipped = 0;
    for (const it of items) {
      try {
        const secret = it?.ciphertext ? await decryptPayload(it.ciphertext) : {};
        rows.push({
          id: it.id,
          title: it.title || "",
          url: it.url || "",
          category: cats[it.category] || "",
          login: secret?.login || "",
          password: secret?.password || "",
          notes: secret?.notes || "",
          created_at: it.created_at || "",
          updated_at: it.updated_at || "",
        });
      } catch (_) {
        skipped += 1;
      }
    }
    return { rows, skipped };
  }

  async function exportVault(format) {
    if (exportBusy) return;
    const hasKey = await hasKeyPair().catch(() => false);
    if (!hasKey) {
      toast.error("Clé privée introuvable dans ce navigateur");
      return;
    }
    const confirmed = window.confirm(
      `Exporter les mots de passe en clair au format ${format.toUpperCase()} ? Le fichier contiendra les secrets déchiffrés.`
    );
    if (!confirmed) return;

    setExportBusy(true);
    try {
      const { rows, skipped } = await buildDecryptedExportRows();
      if (!rows.length) {
        toast.error("Aucune entrée exportable avec la clé actuelle");
        return;
      }

      const stamp = exportStamp();
      if (format === "json") {
        downloadTextFile(
          JSON.stringify(rows, null, 2),
          `mdp-export-${stamp}.json`,
          "application/json"
        );
      } else {
        const header = ["id", "title", "url", "category", "login", "password", "notes", "created_at", "updated_at"];
        const lines = [
          header.map(csvCell).join(","),
          ...rows.map((row) => header.map((key) => csvCell(row[key])).join(",")),
        ];
        downloadTextFile(
          `\uFEFF${lines.join("\n")}\n`,
          `mdp-export-${stamp}.csv`,
          "text/csv;charset=utf-8"
        );
      }

      if (skipped > 0) {
        toast.info(`Export terminé, ${skipped} entrée(s) non déchiffrée(s) ignorée(s)`);
      } else {
        toast.success("Export terminé");
      }
    } catch (e) {
      console.error(e);
      toast.error("Échec de l’export");
    } finally {
      setExportBusy(false);
    }
  }

  // Construit un index déchiffré minimal pour la recherche dans les notes
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!items.length) { setDec({}); setDecBusy(false); setDecDone(0); return; }
      try {
        setDecBusy(true); setDecDone(0);
        const hasKey = await hasKeyPair().catch(() => false);
        if (!hasKey) { setDecBusy(false); return; }
        const out = {};
        let done = 0;
        for (const it of items) {
          try {
            if (it?.ciphertext) {
              const secret = await decryptPayload(it.ciphertext);
              out[it.id] = { login: secret?.login || '', password: secret?.password || '', notes: secret?.notes || '' };
            }
          } catch (_) {
            // ignore: entrée non déchiffrable avec la clé actuelle
          } finally {
            done += 1;
            if (!alive) return;
            setDecDone(done);
          }
        }
        if (alive) setDec(out);
      } finally {
        if (alive) setDecBusy(false);
      }
    })();
    return () => { alive = false };
  }, [items]);

  if (loading) return (
    <main className="container">
      <div className="card">Chargement…</div>
    </main>
  );
  if (err) {
    const msg = err?.response?.status
      ? `Erreur ${err.response.status} — ${err.response.statusText || ""}`
      : (err?.message || "Erreur inconnue");
    return (
      <main className="container">
        <div className="card error pre-wrap">
          {msg}
          <div className="row mt-3">
            <button className="btn" onClick={loadAll}>Réessayer</button>
          </div>
        </div>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="container">
        <header className="row row--between mb-3">
          <h2 className="m-0">Voûte</h2>
          <div className="row">
            <button className="btn" onClick={() => navigate('/vault/new')}>Ajouter une entrée</button>
            <button className="btn btn--light" onClick={loadAll}>Rafraîchir</button>
          </div>
        </header>
        <div className="card">
          <p className="dim m-0">Aucune entrée.</p>
        </div>
      </main>
    );
  }

  // Filtrage par titre, catégorie, notes (décryptées côté client)
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? items
    : items.filter((it) => {
        const t = (it.title || '').toLowerCase();
        const c = (cats[it.category] || '').toLowerCase();
        const n = (dec[it.id]?.notes || '').toLowerCase();
        return t.includes(q) || c.includes(q) || n.includes(q);
      });

  // Tri insensible à la casse sur le titre (conservant les accents)
  const collator = new Intl.Collator('fr', { sensitivity: 'accent', numeric: true });
  const sorted = filtered.slice().sort((a, b) => collator.compare(a?.title || '', b?.title || ''));

  return (
    <main className="container">
      <header className="row row--between mb-3">
        <h2 className="m-0">Voûte</h2>
        <div className="row">
          <button className="btn" onClick={() => navigate('/vault/new')}>Ajouter une entrée</button>
          <button className="btn btn--light" onClick={() => exportVault("json")} disabled={exportBusy}>
            {exportBusy ? "Export…" : "Exporter JSON"}
          </button>
          <button className="btn btn--light" onClick={() => exportVault("csv")} disabled={exportBusy}>
            {exportBusy ? "Export…" : "Exporter CSV"}
          </button>
          <button className="btn btn--light" onClick={loadAll}>Rafraîchir</button>
        </div>
      </header>

      <div className="small dim mb-3">
        Les exports JSON/CSV contiennent les mots de passe en clair. À stocker hors Git et dans un emplacement sûr.
      </div>

      <section className="card vault-search-card mb-3">
        <label className="label block mb-1">Rechercher (titre, catégorie, notes)</label>
        <div className="vault-search-controls">
          <input
            className="input"
            placeholder="ex: banque, perso, notes: VPN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--light vault-search-clear"
            onClick={() => setQuery("")}
            disabled={!query}
            aria-label="Effacer la recherche"
          >
            Effacer
          </button>
        </div>
        {decBusy && (
          <div className="small dim mt-1">
            Indexation du contenu chiffré… {decDone}/{items.length}
          </div>
        )}
      </section>

      <ul className="list">
        {sorted.map((it) => (
          <li key={it.id} className="item">
            <div className="row row--between row--start">
              <div>
                <div className="text-strong">{it.title || '(sans titre)'}</div>
                <div className="small dim">{cats[it.category] ?? '(Aucune catégorie)'}</div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setActive(it)} title="Révéler (décryptage local)">Révéler</button>
                <button className="btn" onClick={() => navigate(`/vault/${it.id}/edit`)} title="Modifier l’entrée">Modifier</button>
                <button
                  className="btn btn--danger"
                  onClick={async () => {
                    const ok = confirm(`Supprimer définitivement « ${it.title} » ?`);
                    if (!ok) return;
                    try {
                      await (api.passwords?.remove ? api.passwords.remove(it.id) : api.delete(`passwords/${it.id}/`));
                      toast.success('Entrée supprimée');
                      loadAll();
                    } catch (e) {
                      console.error(e);
                      toast.error("Échec de la suppression");
                    }
                  }}
                  title="Supprimer"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!filtered.length && (
        <div className="dim mt-3">Aucun résultat.</div>
      )}

      {active && (
        <RevealDialog item={active} onClose={() => setActive(null)} />
      )}
    </main>
  );
}
