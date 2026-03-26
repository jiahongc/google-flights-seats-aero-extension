const TOGGLE_KEYS = ['globalButton', 'perFlightButtons'];
const TOGGLE_DEFAULTS = { globalButton: true, perFlightButtons: true };

const FLEX_KEY = 'flexibleDaysNum';
const FLEX_DEFAULT = 0;

// Migrate old boolean flexibleDays to new flexibleDaysNum
chrome.storage.sync.get(['flexibleDays', FLEX_KEY], (result) => {
  if (result.flexibleDays === true && result[FLEX_KEY] === undefined) {
    chrome.storage.sync.set({ [FLEX_KEY]: 3 });
    chrome.storage.sync.remove('flexibleDays');
  }
});

// Load saved settings and apply to UI
chrome.storage.sync.get({ ...TOGGLE_DEFAULTS, [FLEX_KEY]: FLEX_DEFAULT }, (settings) => {
  for (const key of TOGGLE_KEYS) {
    const el = document.getElementById(key);
    if (el) el.checked = settings[key];
  }
  const flexEl = document.getElementById(FLEX_KEY);
  if (flexEl) flexEl.value = String(settings[FLEX_KEY]);
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
