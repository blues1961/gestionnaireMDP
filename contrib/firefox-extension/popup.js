(function popupMain() {
  'use strict';

  const B = typeof browser !== 'undefined' ? browser : chrome;
  const isPromiseAPI = typeof browser !== 'undefined' && browser.runtime && browser.tabs;

  const statusList = document.getElementById('status-list');
  const matchList = document.getElementById('match-list');
  const matchEmpty = document.getElementById('match-empty');
  const messageEl = document.getElementById('message');
  const refreshBtn = document.getElementById('refresh');
  const optionsBtn = document.getElementById('open-options');

  function setMessage(text, isError = true) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.style.color = isError ? '#b95000' : '#1f7a4d';
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

  function queryTabs(queryInfo) {
    if (isPromiseAPI) {
      return browser.tabs.query(queryInfo);
    }
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(queryInfo, (tabs) => {
          if (chrome.runtime.lastError) {
            resolve([]);
          } else {
            resolve(tabs || []);
          }
        });
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function getActiveTab() {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (!tabs || !tabs.length) return null;
    return tabs[0];
  }

  function renderStatus(state) {
    if (!statusList) return;
    statusList.innerHTML = '';
    if (!state || state.ok === false) {
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = state && state.error ? `Erreur: ${state.error}` : 'Extension inactive.';
      statusList.appendChild(li);
      return;
    }
    const items = [
      {
        label: 'API configurée',
        ok: !!state.hasConfig,
        extra: state.config?.apiBase || ''
      },
      {
        label: 'Authentification',
        ok: !!state.hasTokens,
        extra: state.hasTokens && state.tokenExpiresAt
          ? `expire ${new Date(state.tokenExpiresAt).toLocaleTimeString()}`
          : ''
      },
      {
        label: 'Clé importée',
        ok: !!state.hasKeyPair
      },
      {
        label: 'Entrées en cache',
        ok: (state.cachedEntries || 0) > 0,
        extra: state.cachedEntries ? `${state.cachedEntries}` : '0'
      }
    ];
    for (const item of items) {
      const li = document.createElement('li');
      li.className = item.ok ? 'ok' : 'warn';
      li.textContent = item.extra
        ? `${item.label} : ${item.extra}`
        : `${item.label} : ${item.ok ? 'OK' : 'manquant'}`;
      statusList.appendChild(li);
    }
  }

  function renderMatches(result) {
    if (!matchList || !matchEmpty) return;
    matchList.innerHTML = '';
    if (!result || result.ok === false) {
      matchEmpty.style.display = 'block';
      matchEmpty.textContent = result && result.error
        ? `Erreur: ${result.error}`
        : 'Aucun résultat pour cet onglet.';
      return;
    }
    const list = Array.isArray(result.logins) ? result.logins : [];
    if (!list.length) {
      matchEmpty.style.display = 'block';
      matchEmpty.textContent = 'Aucun résultat pour cet onglet.';
      return;
    }
    matchEmpty.style.display = 'none';
    for (const entry of list.slice(0, 5)) {
      const li = document.createElement('li');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = entry.title || entry.origin || entry.url || 'Entrée';
      const subtitle = document.createElement('div');
      subtitle.textContent = entry.username || '(nom d’utilisateur absent)';
      li.appendChild(title);
      li.appendChild(subtitle);
      matchList.appendChild(li);
    }
  }

  async function refreshData(force = false) {
    try {
      if (refreshBtn) refreshBtn.disabled = true;
      setMessage('');
      const state = await sendRuntimeMessage({ type: 'MonMDP:getState' });
      renderStatus(state);
      let activeTab = null;
      try {
        activeTab = await getActiveTab();
      } catch {
        activeTab = null;
      }
      if (!activeTab || !activeTab.url || !/^https?:/i.test(activeTab.url)) {
        renderMatches({ ok: true, logins: [] });
        return;
      }
      if (force) {
        await sendRuntimeMessage({ type: 'MonMDP:refreshVault' });
      }
      const urlObj = new URL(activeTab.url);
      const creds = await sendRuntimeMessage({
        type: 'MonMDP:getCredentials',
        payload: { origin: urlObj.origin, url: activeTab.url }
      });
      renderMatches(creds);
      if (creds && creds.ok === false && creds.error) {
        setMessage(creds.error, true);
      }
    } catch (err) {
      setMessage(err && err.message ? err.message : String(err));
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function openOptions() {
    try {
      if (B.runtime.openOptionsPage) {
        await B.runtime.openOptionsPage();
      } else if (B.tabs && B.tabs.create) {
        const url = B.runtime.getURL ? B.runtime.getURL('options.html') : 'options.html';
        await B.tabs.create({ url });
      }
    } catch (err) {
      setMessage(err && err.message ? err.message : String(err));
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      void refreshData(true);
    });
  }

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      void openOptions();
    });
  }

  void refreshData(false);
})();
