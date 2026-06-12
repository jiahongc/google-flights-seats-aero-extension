// Popup settings — element IDs match storage keys.
// Defaults must stay in sync with content.js / seats-content.js.

const TOGGLE_DEFAULTS = { globalButton: true, minCppHideRow: false };
const NUMBER_DEFAULTS = { minCpp: 0, flexibleDaysNum: 0, goodCpp: 2 };
const SELECT_DEFAULTS = { currency: 'USD' };

const ALL_DEFAULTS = { ...TOGGLE_DEFAULTS, ...NUMBER_DEFAULTS, ...SELECT_DEFAULTS };

chrome.storage.sync.get(ALL_DEFAULTS, (settings) => {
  for (const key of Object.keys(TOGGLE_DEFAULTS)) {
    const el = document.getElementById(key);
    if (el) el.checked = settings[key];
  }
  for (const key of Object.keys(NUMBER_DEFAULTS)) {
    const el = document.getElementById(key);
    if (el) el.value = String(settings[key]);
  }
  for (const key of Object.keys(SELECT_DEFAULTS)) {
    const el = document.getElementById(key);
    if (el) el.value = settings[key];
  }
});

for (const key of Object.keys(TOGGLE_DEFAULTS)) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: el.checked });
    });
  }
}

for (const key of Object.keys(NUMBER_DEFAULTS)) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      const min = parseFloat(el.min) || 0;
      const max = parseFloat(el.max) || Infinity;
      const value = Math.min(Math.max(parseFloat(el.value) || 0, min), max);
      el.value = String(value);
      chrome.storage.sync.set({ [key]: value });
    });
  }
}

for (const key of Object.keys(SELECT_DEFAULTS)) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: el.value });
    });
  }
}
