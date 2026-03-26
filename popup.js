const TOGGLE_KEYS = ['globalButton'];
const TOGGLE_DEFAULTS = { globalButton: true };

const CPP_KEY = 'minCpp';
const CPP_DEFAULT = 0;

function loadSettings() {
  chrome.storage.sync.get({ ...TOGGLE_DEFAULTS, [CPP_KEY]: CPP_DEFAULT }, (settings) => {
    for (const key of TOGGLE_KEYS) {
      const el = document.getElementById(key);
      if (el) el.checked = settings[key];
    }
    const cppEl = document.getElementById(CPP_KEY);
    if (cppEl) cppEl.value = String(settings[CPP_KEY]);
  });
}

loadSettings();

// Save on change for toggles
for (const key of TOGGLE_KEYS) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: el.checked });
    });
  }
}

// Save on change for min CPP filter
const cppEl = document.getElementById(CPP_KEY);
if (cppEl) {
  cppEl.addEventListener('change', () => {
    chrome.storage.sync.set({ [CPP_KEY]: parseFloat(cppEl.value) || 0 });
  });
}
