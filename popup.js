const TOGGLE_KEYS = ['globalButton', 'perFlightButtons'];
const TOGGLE_DEFAULTS = { globalButton: true, perFlightButtons: true };

const FLEX_KEY = 'flexibleDaysNum';
const FLEX_DEFAULT = 0;
const CPP_KEY = 'minCpp';
const CPP_DEFAULT = 0;

function loadSettings() {
  chrome.storage.sync.get({ ...TOGGLE_DEFAULTS, [FLEX_KEY]: FLEX_DEFAULT, [CPP_KEY]: CPP_DEFAULT }, (settings) => {
    for (const key of TOGGLE_KEYS) {
      const el = document.getElementById(key);
      if (el) el.checked = settings[key];
    }
    const flexEl = document.getElementById(FLEX_KEY);
    if (flexEl) flexEl.value = String(settings[FLEX_KEY]);
    const cppEl = document.getElementById(CPP_KEY);
    if (cppEl) cppEl.value = String(settings[CPP_KEY]);
  });
}

// Migrate old boolean flexibleDays to new flexibleDaysNum, then load
chrome.storage.sync.get(['flexibleDays', FLEX_KEY], (result) => {
  if (result.flexibleDays === true && result[FLEX_KEY] === undefined) {
    chrome.storage.sync.set({ [FLEX_KEY]: 3 }, () => {
      chrome.storage.sync.remove('flexibleDays');
      loadSettings();
    });
  } else {
    loadSettings();
  }
});

// Save on change for toggles
for (const key of TOGGLE_KEYS) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: el.checked });
    });
  }
}

// Save on change for flexible days dropdown
const flexEl = document.getElementById(FLEX_KEY);
if (flexEl) {
  flexEl.addEventListener('change', () => {
    chrome.storage.sync.set({ [FLEX_KEY]: parseInt(flexEl.value, 10) });
  });
}

// Save on change for min CPP filter
const cppEl = document.getElementById(CPP_KEY);
if (cppEl) {
  cppEl.addEventListener('change', () => {
    chrome.storage.sync.set({ [CPP_KEY]: parseFloat(cppEl.value) || 0 });
  });
}
