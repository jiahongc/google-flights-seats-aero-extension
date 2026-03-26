const DEFAULTS = {
  globalButton: true,
  perFlightButtons: true,
  flexibleDays: false,
};

const KEYS = Object.keys(DEFAULTS);

// Load saved settings and apply to toggles
chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const key of KEYS) {
    const el = document.getElementById(key);
    if (el) {
      el.checked = settings[key];
    }
  }
});

// Save on change for each toggle
for (const key of KEYS) {
  const el = document.getElementById(key);
  if (el) {
    el.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: el.checked });
    });
  }
}
