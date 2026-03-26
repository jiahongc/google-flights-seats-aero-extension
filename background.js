// Background service worker — handles tab creation from content script messages.
// Using the background worker for chrome.tabs.create() avoids popup blocker issues,
// especially for round-trip searches that open 2 tabs.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'openSeatsAero') return;

  const { urls } = message;

  if (!urls || urls.length === 0) {
    sendResponse({ success: false, error: 'No URLs provided' });
    return true;
  }

  urls.forEach((url, index) => {
    chrome.tabs.create({ url, active: index === 0 });
  });

  sendResponse({ success: true, tabsOpened: urls.length });
  return true;
});
