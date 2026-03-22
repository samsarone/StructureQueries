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

function isInjectableTabUrl(rawUrl?: string) {
  if (!rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isMissingReceiverError(error: unknown) {
  return (
    error instanceof Error &&
    /Receiving end does not exist|Could not establish connection/i.test(
      error.message
    )
  );
}

async function sendToggleOverlayMessage(tabId: number) {
  return chrome.tabs.sendMessage(tabId, {
    type: "TOGGLE_PAGE_OVERLAY"
  });
}

async function toggleOverlayForTab(tab: chrome.tabs.Tab) {
  if (typeof tab.id !== "number" || !isInjectableTabUrl(tab.url)) {
    return;
  }

  try {
    await sendToggleOverlayMessage(tab.id);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ["content.js"]
    });

    await sendToggleOverlayMessage(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Structure Queries extension installed.");
  void ensureBrowserSessionId();
});

chrome.action.onClicked.addListener((tab) => {
  void toggleOverlayForTab(tab).catch((error) => {
    console.error("Failed to toggle Structure Queries overlay", error);
  });
});

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
