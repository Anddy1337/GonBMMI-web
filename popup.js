/* Popup logic for YT Smart Skip */
(async function () {
  const statusEl = document.getElementById('status');
  const autoSkipEl = document.getElementById('autoSkipEnabled');

  // Color inputs mapping
  const colorInputs = {
    sponsor: document.getElementById('color-sponsor'),
    selfpromo: document.getElementById('color-selfpromo'),
    interaction: document.getElementById('color-interaction'),
    intro: document.getElementById('color-intro'),
    outro: document.getElementById('color-outro'),
    music_offtopic: document.getElementById('color-music_offtopic'),
  };

  // Visibility chips mapping
  const visInputs = {
    sponsor: document.getElementById('vis-sponsor'),
    selfpromo: document.getElementById('vis-selfpromo'),
    interaction: document.getElementById('vis-interaction'),
    intro: document.getElementById('vis-intro'),
    outro: document.getElementById('vis-outro'),
    music_offtopic: document.getElementById('vis-music_offtopic'),
  };

  const keys = {
    autoSkipEnabled: 'autoSkipEnabled',
    categories: 'categories', // { [category]: { visible: boolean, color: string } }
  };

  function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    setTimeout(() => { statusEl.style.opacity = '0.8'; }, 700);
  }

  // Load stored state
  const stored = await chrome.storage.sync.get([keys.autoSkipEnabled, keys.categories]);
  autoSkipEl.checked = !!stored[keys.autoSkipEnabled];

  const defaultCategories = {
    sponsor: { visible: true, color: '#FFD700' },
    selfpromo: { visible: true, color: '#FFA500' },
    interaction: { visible: true, color: '#FF69B4' },
    intro: { visible: true, color: '#1E90FF' },
    outro: { visible: true, color: '#8A2BE2' },
    music_offtopic: { visible: true, color: '#00CED1' },
  };
  const categories = { ...defaultCategories, ...(stored[keys.categories] || {}) };

  // Initialize UI
  for (const [cat, cfg] of Object.entries(categories)) {
    if (colorInputs[cat]) colorInputs[cat].value = cfg.color;
    if (visInputs[cat]) visInputs[cat].checked = !!cfg.visible;
  }

  // Persist helpers
  async function saveCategories() {
    await chrome.storage.sync.set({ [keys.categories]: categories });
    setStatus('Saved');
    // Notify content script to refetch and rerender
    chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'categories_updated' });
    });
  }

  autoSkipEl.addEventListener('change', async () => {
    const enabled = autoSkipEl.checked;
    await chrome.storage.sync.set({ [keys.autoSkipEnabled]: enabled });
    setStatus(enabled ? 'Auto skip enabled' : 'Auto skip disabled');
    chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'auto_skip_toggled', enabled });
    });
  });

  for (const [cat, input] of Object.entries(visInputs)) {
    input.addEventListener('change', () => {
      categories[cat].visible = input.checked;
      saveCategories();
    });
  }

  for (const [cat, input] of Object.entries(colorInputs)) {
    input.addEventListener('input', () => {
      categories[cat].color = input.value;
      saveCategories();
    });
  }
})();
