export {};

const BROWSER_SESSION_STORAGE_KEY = "structuredqueries.browserSessionId";
const LEGACY_BROWSER_SESSION_STORAGE_KEY = "telepathy.browserSessionId";

async function ensureBrowserSessionId() {
  const stored = await chrome.storage.local.get([
    BROWSER_SESSION_STORAGE_KEY,
    LEGACY_BROWSER_SESSION_STORAGE_KEY
  ]);
  const existing = stored[BROWSER_SESSION_STORAGE_KEY];
  const legacy = stored[LEGACY_BROWSER_SESSION_STORAGE_KEY];

  if (typeof existing === "string" && existing.trim()) {
    return existing;
  }

  if (typeof legacy === "string" && legacy.trim()) {
    await chrome.storage.local.set({
      [BROWSER_SESSION_STORAGE_KEY]: legacy
    });
    await chrome.storage.local.remove(LEGACY_BROWSER_SESSION_STORAGE_KEY);
    return legacy;
  }

  const browserSessionId = crypto.randomUUID();
  await chrome.storage.local.set({
    [BROWSER_SESSION_STORAGE_KEY]: browserSessionId
  });

  return browserSessionId;
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("StructuredQueries extension installed.");
  void configureSidePanel();
  void ensureBrowserSessionId();
});

void configureSidePanel();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_BACKGROUND") {
    sendResponse({
      ok: true,
      extensionId: chrome.runtime.id,
      tabId: sender.tab?.id ?? null
    });

    return false;
  }

  if (message?.type !== "GET_EXTENSION_SESSION") {
    return false;
  }

  void ensureBrowserSessionId().then((browserSessionId) => {
    sendResponse({
      ok: true,
      browserSessionId,
      extensionId: chrome.runtime.id,
      tabId: sender.tab?.id ?? null
    });
  });

  return true;
});
