// Loads extension scripts into an isolated vm context with browser API stubs,
// and collects the helpers exposed via the __SEATS_AERO_TEST__ hook.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function chromeStub() {
  return {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
    },
    storage: {
      sync: { get: (_defaults, cb) => cb && cb({}), set: () => {} },
      onChanged: { addListener: () => {} },
    },
    tabs: { create: () => {}, query: () => {}, sendMessage: () => {} },
    commands: { onCommand: { addListener: () => {} } },
  };
}

function documentStub() {
  const noopEl = () => ({
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild: () => {},
    addEventListener: () => {},
    setAttribute: () => {},
  });
  return {
    readyState: 'complete',
    title: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: noopEl,
    createElementNS: noopEl,
    createTextNode: () => ({}),
    body: { classList: { toggle: () => {} }, appendChild: () => {} },
  };
}

function loadScripts(files, { locationHref = 'https://example.com/' } = {}) {
  const exportsBag = {};
  const sandbox = {
    __SEATS_AERO_TEST__: exportsBag,
    chrome: chromeStub(),
    document: documentStub(),
    location: new URL(locationHref),
    history: { pushState: () => {}, replaceState: () => {} },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    getComputedStyle: () => ({ backgroundColor: '' }),
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortSignal,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return { sandbox, exports: exportsBag };
}

module.exports = { loadScripts, ROOT };
