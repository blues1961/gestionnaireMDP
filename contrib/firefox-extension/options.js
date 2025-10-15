(function optionsMain() {
  'use strict';

  const B = typeof browser !== 'undefined' ? browser : chrome;
  const isPromiseAPI = typeof browser !== 'undefined' && browser.runtime;

  const statusList = document.getElementById('status-info');
  const messageEl = document.getElementById('status-message');
  const apiBaseInput = document.getElementById('api-base');
  const configForm = document.getElementById('config-form');
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const keyForm = document.getElementById('key-form');
  const keyFileInput = document.getElementById('key-file');
  const keyPassInput = document.getElementById('key-passphrase');
  const forgetKeyBtn = document.getElementById('forget-key-btn');
  const forceRefreshBtn = document.getElementById('force-refresh');

  function setMessage(text, ok = false) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.className = ok ? 'message ok' : text ? 'message err' : 'message';
  }

  function sendRuntimeMessage(payload) {
    if (isPromiseAPI) {
      return browser.runtime.sendMessage(payload);
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    });
  }

  function renderStatus(state) {
    if (!statusList) return;
    statusList.innerHTML = '';
    const items = [];
    if (!state || state.ok === false) {
      items.push({
        label: 'Extension',
        value: state && state.error ? `Erreur: ${state.error}` : 'États indisponibles',
        ok: false
      });
    } else {
      items.push({
        label: 'API configurée',
        value: state.config?.apiBase || 'non définie',
        ok: !!state.hasConfig
      });
      items.push({
        label: 'Authentification',
        value: state.hasTokens
          ? `Token actif (expire ${state.tokenExpiresAt ? new Date(state.tokenExpiresAt).toLocaleTimeString() : 'inconnu'})`
          : 'non authentifié',
        ok: !!state.hasTokens
      });
      items.push({
        label: 'Clé privée',
        value: state.hasKeyPair ? 'importée' : 'absente',
        ok: !!state.hasKeyPair
      });
      items.push({
        label: 'Entrées en cache',
        value: `${state.cachedEntries || 0}`,
        ok: (state.cachedEntries || 0) > 0
      });
    }
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = `${item.label} : ${item.value}`;
      if (!item.ok) {
        li.style.color = '#b95000';
      }
      statusList.appendChild(li);
    }
  }

  async function loadState() {
    try {
      const state = await sendRuntimeMessage({ type: 'MonMDP:getState' });
      renderStatus(state);
      if (state && state.ok !== false) {
        if (apiBaseInput && state.config?.apiBase) {
          apiBaseInput.value = state.config.apiBase;
        }
        if (usernameInput && state.config?.username) {
          usernameInput.value = state.config.username;
        }
      }
    } catch (err) {
      setMessage(err && err.message ? err.message : String(err), false);
    }
  }

  if (configForm) {
    configForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!apiBaseInput) return;
      const apiBase = apiBaseInput.value.trim();
      if (!apiBase) {
        setMessage('Merci de renseigner une URL d’API.', false);
        return;
      }
      const saveBtn = document.getElementById('save-config');
      if (saveBtn) saveBtn.disabled = true;
      setMessage('');
      try {
        const res = await sendRuntimeMessage({
          type: 'MonMDP:saveConfig',
          payload: { apiBase }
        });
        if (res && res.ok === false) {
          throw new Error(res.error || 'Impossible de sauvegarder la configuration');
        }
        setMessage('Configuration enregistrée.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!usernameInput || !passwordInput || !apiBaseInput) return;
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const apiBase = apiBaseInput.value.trim();
      if (!apiBase) {
        setMessage('Veuillez enregistrer l’URL de l’API avant de vous authentifier.', false);
        return;
      }
      if (!username || !password) {
        setMessage('Identifiants requis.', false);
        return;
      }
      if (loginBtn) loginBtn.disabled = true;
      setMessage('');
      try {
        const res = await sendRuntimeMessage({
          type: 'MonMDP:login',
          payload: { baseUrl: apiBase, username, password }
        });
        if (res && res.ok === false) {
          throw new Error(res.error || 'Authentification échouée');
        }
        passwordInput.value = '';
        setMessage('Authentification réussie.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        if (loginBtn) loginBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      setMessage('');
      try {
        await sendRuntimeMessage({ type: 'MonMDP:logout' });
        setMessage('Jetons supprimés.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        logoutBtn.disabled = false;
      }
    });
  }

  if (keyForm) {
    keyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!keyFileInput || !keyPassInput) return;
      const file = keyFileInput.files && keyFileInput.files[0];
      if (!file) {
        setMessage('Sélectionnez un fichier vault-key.json.', false);
        return;
      }
      const passphrase = keyPassInput.value;
      if (!passphrase) {
        setMessage('La passphrase est requise pour déchiffrer le keybundle.', false);
        return;
      }
      const importBtn = document.getElementById('import-key-btn');
      if (importBtn) importBtn.disabled = true;
      setMessage('');
      try {
        const text = await file.text();
        const bundle = JSON.parse(text);
        const res = await sendRuntimeMessage({
          type: 'MonMDP:importKeyBundle',
          payload: { bundle, passphrase }
        });
        if (res && res.ok === false) {
          throw new Error(res.error || 'Import du keybundle échoué');
        }
        keyPassInput.value = '';
        keyFileInput.value = '';
        setMessage('Clé importée avec succès.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        if (importBtn) importBtn.disabled = false;
      }
    });
  }

  if (forgetKeyBtn) {
    forgetKeyBtn.addEventListener('click', async () => {
      forgetKeyBtn.disabled = true;
      setMessage('');
      try {
        const res = await sendRuntimeMessage({ type: 'MonMDP:forgetKeyPair' });
        if (res && res.ok === false) {
          throw new Error(res.error || 'Impossible de supprimer la clé');
        }
        if (keyPassInput) keyPassInput.value = '';
        if (keyFileInput) keyFileInput.value = '';
        setMessage('Clé oubliée.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        forgetKeyBtn.disabled = false;
      }
    });
  }

  if (forceRefreshBtn) {
    forceRefreshBtn.addEventListener('click', async () => {
      forceRefreshBtn.disabled = true;
      setMessage('');
      try {
        const res = await sendRuntimeMessage({ type: 'MonMDP:refreshVault' });
        if (res && res.ok === false) {
          throw new Error(res.error || 'Impossible de rafraîchir le coffre');
        }
        setMessage('Coffre rafraîchi.', true);
        await loadState();
      } catch (err) {
        setMessage(err && err.message ? err.message : String(err), false);
      } finally {
        forceRefreshBtn.disabled = false;
      }
    });
  }

  void loadState();
})();
