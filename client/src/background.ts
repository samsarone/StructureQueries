export {};

const BROWSER_SESSION_STORAGE_KEY = "telepathy.browserSessionId";

async function ensureBrowserSessionId() {
  const stored = await chrome.storage.local.get(BROWSER_SESSION_STORAGE_KEY);
  const existing = stored[BROWSER_SESSION_STORAGE_KEY];

  if (typeof existing === "string" && existing.trim()) {
    return existing;
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
  console.log("Telepathy extension installed.");
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
