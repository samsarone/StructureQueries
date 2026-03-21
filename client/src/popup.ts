export {};

declare const __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__: string;
declare const __STRUCTUREDQUERIES_SERVER_WS_URL__: string;

const SERVER_HTTP_ORIGIN = __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__;
const SERVER_WS_URL = __STRUCTUREDQUERIES_SERVER_WS_URL__;
const ANALYZED_PAGES_STORAGE_KEY = "structuredqueries.analyzedPages";
const REGISTRATION_STORAGE_KEY = "structuredqueries.registration";
const LEGACY_ANALYZED_PAGES_STORAGE_KEY = "telepathy.analyzedPages";
const LEGACY_REGISTRATION_STORAGE_KEY = "telepathy.registration";

interface ExtensionSessionPayload {
  ok: boolean;
  browserSessionId: string;
  extensionId: string;
}

interface ServerHealthPayload {
  status?: string;
}

interface StructuredQueriesExternalUserPayload {
  provider?: string | null;
  externalUserId?: string | null;
  externalAppId?: string | null;
  externalCompanyId?: string | null;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  userType?: string | null;
  browserInstallation?: Record<string, unknown> | null;
  generationCredits?: number | null;
}

interface RegistrationStatePayload {
  browserSessionId: string;
  assistantSessionId?: string;
  externalUser?: StructuredQueriesExternalUserPayload | null;
  externalUserApiKey?: string;
}

interface BrowserSessionPayload {
  ok: boolean;
  assistantSessionId?: string | null;
  externalUser?: StructuredQueriesExternalUserPayload | null;
  externalUserApiKey?: string | null;
  registrationRequired?: boolean;
  warnings?: string[];
}

interface PageContext {
  title?: string;
  url?: string;
  documentLanguage?: string;
}

interface PageStatusPayload {
  ok: boolean;
  indexed: boolean;
  analysisAvailable?: boolean;
  templateId?: string;
}

interface AnalyzePayload {
  ok: boolean;
  analysis?: {
    templateId?: string;
    source?: string;
  };
}

interface AnalyzedPageCacheEntry {
  analyzed: boolean;
  templateId?: string;
}

interface VoicesPayload {
  ok: boolean;
  provider: "elevenlabs" | "placeholder";
  warnings?: string[];
  voices: Array<{
    voiceId: string;
    name: string;
    description?: string;
  }>;
}

interface RuntimeMessage {
  type: string;
  [key: string]: unknown;
}

type LogRole = "system" | "user" | "assistant";

interface AppState {
  assistantSessionId?: string;
  browserSessionId?: string;
  extensionId?: string;
  currentUser?: StructuredQueriesExternalUserPayload | null;
  currentPage?: PageContext;
  currentTemplateId?: string;
  externalUserApiKey?: string;
  registrationRequired: boolean;
  registrationSubmitting: boolean;
  accountEditorOpen: boolean;
  serverOnline: boolean;
  indexChecked: boolean;
  analysisReady: boolean;
  isAnalyzing: boolean;
  websocketState: "disconnected" | "connecting" | "ready";
  websocketDetail: string;
  voices: VoicesPayload["voices"];
  pendingAssistantText?: string;
  conversationActive: boolean;
  assistantSpeaking: boolean;
  recording: boolean;
}

const accountButton = document.querySelector<HTMLButtonElement>("#account-button");
const accountNameNode = document.querySelector<HTMLElement>("#account-name");
const accountHintNode = document.querySelector<HTMLElement>("#account-hint");
const accountEmailNode = document.querySelector<HTMLElement>("#account-email");
const accountUsernameNode =
  document.querySelector<HTMLElement>("#account-username");
const accountUserIdNode =
  document.querySelector<HTMLElement>("#account-user-id");
const analysisPillNode = document.querySelector<HTMLElement>("#analysis-pill");
const pageTitleNode = document.querySelector<HTMLElement>("#page-title");
const pageUrlNode = document.querySelector<HTMLElement>("#page-url");
const pageLanguageNode =
  document.querySelector<HTMLElement>("#page-language");
const registrationOverlayNode =
  document.querySelector<HTMLElement>("#registration-overlay");
const registrationFormNode =
  document.querySelector<HTMLFormElement>("#registration-form");
const registrationEyebrowNode =
  document.querySelector<HTMLElement>("#registration-eyebrow");
const registrationTitleNode =
  document.querySelector<HTMLElement>("#registration-title");
const registrationSubtitleNode =
  document.querySelector<HTMLElement>("#registration-subtitle");
const registrationStatusNode =
  document.querySelector<HTMLElement>("#registration-status");
const registrationCloseButton =
  document.querySelector<HTMLButtonElement>("#registration-close-button");
const registrationSubmitButton =
  document.querySelector<HTMLButtonElement>("#registration-submit-button");
const registrationDisplayNameNode =
  document.querySelector<HTMLInputElement>("#registration-display-name");
const registrationEmailNode =
  document.querySelector<HTMLInputElement>("#registration-email");
const registrationUsernameNode =
  document.querySelector<HTMLInputElement>("#registration-username");
const analysisStatusNode =
  document.querySelector<HTMLElement>("#analysis-status");
const conversationLogNode =
  document.querySelector<HTMLElement>("#conversation-log");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");
const analyzeButton = document.querySelector<HTMLButtonElement>("#analyze-button");
const startChatButton =
  document.querySelector<HTMLButtonElement>("#start-chat-button");
const stopChatButton =
  document.querySelector<HTMLButtonElement>("#stop-chat-button");
const closeOverlayButton =
  document.querySelector<HTMLButtonElement>("#close-overlay-button");
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice-select");
const languageSelect =
  document.querySelector<HTMLSelectElement>("#language-select");

const state: AppState = {
  currentUser: null,
  registrationRequired: true,
  registrationSubmitting: false,
  accountEditorOpen: false,
  serverOnline: false,
  indexChecked: false,
  analysisReady: false,
  isAnalyzing: false,
  websocketState: "disconnected",
  websocketDetail: "Idle",
  voices: [],
  conversationActive: false,
  assistantSpeaking: false,
  recording: false
};

let activeSocket: WebSocket | undefined;
let activeSocketPromise: Promise<WebSocket> | undefined;
let activeAssistantAudio: HTMLAudioElement | undefined;
let activeAssistantAudioObjectUrl: string | undefined;
let resumeConversationTimer: number | undefined;
let assistantAudioReceivedForTurn = false;

function normalizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function readOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^172\.(\d{1,3})\./);

  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function getAnalyzeUrlError(rawUrl?: string) {
  if (!rawUrl) {
    return "Open a page before starting document analysis.";
  }

  try {
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "Only http and https pages can be analyzed.";
    }

    if (isPrivateHostname(url.hostname)) {
      return "Only public URLs can be analyzed. Local and private network pages are not supported.";
    }

    return undefined;
  } catch {
    return "This page URL is not valid for document analysis.";
  }
}

function getCurrentUserId() {
  return (
    state.currentUser?.externalUserId ??
    state.browserSessionId ??
    "Unavailable"
  );
}

function clearResumeConversationTimer() {
  if (typeof resumeConversationTimer === "number") {
    window.clearTimeout(resumeConversationTimer);
  }

  resumeConversationTimer = undefined;
}

function stopAssistantPlayback() {
  clearResumeConversationTimer();
  state.assistantSpeaking = false;

  if (activeAssistantAudio) {
    activeAssistantAudio.pause();
    activeAssistantAudio.src = "";
    activeAssistantAudio = undefined;
  }

  if (activeAssistantAudioObjectUrl) {
    URL.revokeObjectURL(activeAssistantAudioObjectUrl);
    activeAssistantAudioObjectUrl = undefined;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function requestOverlayClose() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: "STRUCTUREDQUERIES_CLOSE_OVERLAY"
    }, "*");
    return;
  }

  window.close();
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

function setText(node: HTMLElement | null, value: string) {
  if (node) {
    node.textContent = value;
  }
}

function appendLog(role: LogRole, text: string) {
  if (!conversationLogNode) {
    return;
  }

  const article = document.createElement("article");
  const roleNode = document.createElement("p");
  const textNode = document.createElement("p");

  article.className = `log-item log-item-${role}`;
  roleNode.className = "log-role";
  roleNode.textContent = role;
  textNode.className = "log-text";
  textNode.textContent = text;

  article.append(roleNode, textNode);
  conversationLogNode.append(article);
  conversationLogNode.scrollTop = conversationLogNode.scrollHeight;
}

function appendImageLog(
  role: LogRole,
  imageSource: {
    imageBase64?: string;
    imageUrl?: string;
    mimeType: string;
  },
  caption?: string
) {
  if (!conversationLogNode) {
    return;
  }

  const article = document.createElement("article");
  const roleNode = document.createElement("p");
  const imageNode = document.createElement("img");

  article.className = `log-item log-item-${role}`;
  roleNode.className = "log-role";
  roleNode.textContent = role;
  imageNode.className = "log-image";
  imageNode.src = imageSource.imageUrl
    ? imageSource.imageUrl
    : `data:${imageSource.mimeType};base64,${imageSource.imageBase64 ?? ""}`;
  imageNode.alt = caption || `${role} image response`;

  article.append(roleNode);

  if (caption) {
    const captionNode = document.createElement("p");
    captionNode.className = "log-text";
    captionNode.textContent = caption;
    article.append(captionNode);
  }

  article.append(imageNode);
  conversationLogNode.append(article);
  conversationLogNode.scrollTop = conversationLogNode.scrollHeight;
}

function resetConversationLog() {
  if (!conversationLogNode) {
    return;
  }

  conversationLogNode.innerHTML = "";
  appendLog(
    "system",
    "Analyze, then tap Talk."
  );
}

function renderVoiceOptions() {
  if (!voiceSelect) {
    return;
  }

  const previousValue = voiceSelect.value;
  voiceSelect.innerHTML = "";

  for (const voice of state.voices) {
    const option = document.createElement("option");
    option.value = voice.voiceId;
    option.textContent = voice.name;
    option.title = voice.description ?? voice.name;
    voiceSelect.append(option);
  }

  if (state.voices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Browser voice fallback";
    voiceSelect.append(option);
  }

  const matchingValue = state.voices.some((voice) => voice.voiceId === previousValue)
    ? previousValue
    : state.voices[0]?.voiceId ?? "";
  voiceSelect.value = matchingValue;
}

function getSelectedVoiceId() {
  const value = voiceSelect?.value?.trim();

  return value ? value : undefined;
}

function syncRegistrationForm() {
  if (registrationDisplayNameNode) {
    registrationDisplayNameNode.value = state.currentUser?.displayName ?? "";
  }

  if (registrationEmailNode) {
    registrationEmailNode.value = state.currentUser?.email ?? "";
  }

  if (registrationUsernameNode) {
    registrationUsernameNode.value = state.currentUser?.username ?? "";
  }
}

function openAccountEditor() {
  state.accountEditorOpen = true;
  syncRegistrationForm();
  render();
}

function closeAccountEditor() {
  if (state.registrationRequired || state.registrationSubmitting) {
    return;
  }

  state.accountEditorOpen = false;
  render();
}

function render() {
  const analyzeUrlError = getAnalyzeUrlError(state.currentPage?.url);
  const accountName =
    readOptionalString(state.currentUser?.displayName) ??
    readOptionalString(state.currentUser?.username) ??
    readOptionalString(state.currentUser?.email) ??
    (state.registrationRequired ? "Registration required" : "StructuredQueries user");
  const analysisPill = state.isAnalyzing
    ? "Scanning"
    : !state.serverOnline
      ? "Offline"
      : state.registrationRequired
        ? "Register"
        : analyzeUrlError
          ? "Blocked"
          : state.recording
            ? "Listening"
            : state.assistantSpeaking
              ? "Speaking"
              : state.conversationActive
                ? "Live"
                : state.analysisReady
                  ? "Ready"
                  : "Scan";
  const analysisDetail = !state.serverOnline
    ? "Server offline."
    : state.registrationRequired
      ? "Register to continue."
      : analyzeUrlError
        ? analyzeUrlError
        : state.isAnalyzing
          ? "Scanning page context."
          : state.recording
            ? "Listening for your turn."
            : state.assistantSpeaking
              ? "Responding."
              : state.conversationActive
                ? "Voice chat live."
                : state.analysisReady
                  ? "Ready on this page."
                  : "Analyze this page first.";
  const registrationDialogOpen =
    state.registrationRequired || state.accountEditorOpen;
  const registrationMode = state.registrationRequired ? "register" : "edit";
  const voiceMode = !state.serverOnline
    ? "offline"
    : state.isAnalyzing
      ? "analyzing"
      : state.recording
        ? "listening"
        : state.assistantSpeaking
          ? "speaking"
          : state.websocketState === "connecting"
            ? "connecting"
            : state.conversationActive
              ? "armed"
              : state.analysisReady
                ? "ready"
                : analyzeUrlError
                  ? "error"
                  : "idle";

  setText(accountNameNode, accountName);
  setText(
    accountHintNode,
    state.registrationRequired
      ? "Register to unlock voice chat."
      : state.currentUser?.email
        ? "Active session ready."
        : "Session registered."
  );
  setText(
    accountEmailNode,
    readOptionalString(state.currentUser?.email) ?? "Not provided"
  );
  setText(
    accountUsernameNode,
    readOptionalString(state.currentUser?.username) ?? "Not provided"
  );
  setText(accountUserIdNode, getCurrentUserId());
  setText(analysisPillNode, analysisPill);
  setText(
    pageTitleNode,
    state.currentPage?.title ?? "No active tab"
  );
  setText(
    pageUrlNode,
    state.currentPage?.url ?? "Unavailable"
  );
  setText(
    pageLanguageNode,
    `Document language: ${state.currentPage?.documentLanguage || "unknown"}`
  );
  setText(analysisStatusNode, analysisDetail);
  setText(
    registrationEyebrowNode,
    registrationMode === "register" ? "Register" : "Account"
  );
  setText(
    registrationTitleNode,
    registrationMode === "register"
      ? "Register StructuredQueries"
      : "Update Account"
  );
  setText(
    registrationSubtitleNode,
    registrationMode === "register"
      ? "Register this browser installation to continue."
      : "Update the session profile."
  );
  setText(
    registrationStatusNode,
    !state.serverOnline
      ? "Server must be online."
      : state.registrationSubmitting
        ? registrationMode === "register"
          ? "Creating your account..."
          : "Saving account changes..."
        : registrationMode === "register"
          ? "Profile fields are optional."
          : "Save profile changes."
  );

  document.body.dataset.voiceMode = voiceMode;

  if (registrationOverlayNode) {
    registrationOverlayNode.classList.toggle("is-hidden", !registrationDialogOpen);
  }

  if (registrationCloseButton) {
    registrationCloseButton.disabled =
      state.registrationRequired || state.registrationSubmitting;
    registrationCloseButton.hidden = state.registrationRequired;
  }

  if (registrationSubmitButton) {
    registrationSubmitButton.disabled =
      state.registrationSubmitting || !state.serverOnline;
    registrationSubmitButton.textContent = state.registrationSubmitting
      ? registrationMode === "register"
        ? "Registering..."
        : "Saving..."
      : registrationMode === "register"
        ? "Register"
        : "Save Changes";
  }

  if (analyzeButton) {
    analyzeButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.serverOnline ||
      Boolean(analyzeUrlError) ||
      state.isAnalyzing;
    analyzeButton.textContent = state.isAnalyzing
      ? "Scanning..."
      : state.analysisReady
        ? "Reanalyze"
        : "Analyze";
  }

  if (startChatButton) {
    startChatButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.serverOnline ||
      !state.analysisReady ||
      !state.currentPage?.url ||
      state.conversationActive ||
      state.websocketState === "connecting";
    startChatButton.textContent =
      state.websocketState === "connecting"
        ? "Syncing"
        : state.conversationActive
          ? "Live"
          : "Talk";
  }

  if (stopChatButton) {
    stopChatButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.conversationActive;
    stopChatButton.textContent = "Stop";
  }

  if (voiceSelect) {
    voiceSelect.disabled =
      state.registrationSubmitting ||
      state.registrationRequired;
  }

  if (languageSelect) {
    languageSelect.disabled =
      state.registrationSubmitting || state.registrationRequired;
  }

  if (registrationDisplayNameNode) {
    registrationDisplayNameNode.disabled = state.registrationSubmitting;
  }

  if (registrationEmailNode) {
    registrationEmailNode.disabled = state.registrationSubmitting;
  }

  if (registrationUsernameNode) {
    registrationUsernameNode.disabled = state.registrationSubmitting;
  }

  if (accountButton) {
    accountButton.disabled = state.registrationSubmitting;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${SERVER_HTTP_ORIGIN}${path}`, init);

  if (!response.ok) {
    let errorMessage = `Request failed with ${response.status}`;

    try {
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (typeof payload.error === "string" && payload.error.trim()) {
        errorMessage = payload.error.trim();
      } else if (
        typeof payload.message === "string" &&
        payload.message.trim()
      ) {
        errorMessage = payload.message.trim();
      }
    } catch {
      // Keep the default HTTP status message when the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

async function getExtensionSession() {
  return chrome.runtime.sendMessage({
    type: "GET_EXTENSION_SESSION"
  }) as Promise<ExtensionSessionPayload>;
}

async function requestPageContextFromTab(tabId: number) {
  return (await chrome.tabs.sendMessage(tabId, {
    type: "GET_PAGE_CONTEXT"
  })) as PageContext;
}

async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return activeTab;
}

async function sendMessageToActiveTab<T>(message: RuntimeMessage) {
  const activeTab = await getActiveTab();

  if (!activeTab || typeof activeTab.id !== "number") {
    throw new Error("No active browser tab is available.");
  }

  try {
    return (await chrome.tabs.sendMessage(activeTab.id, message)) as T;
  } catch (error) {
    if (isMissingReceiverError(error) && isInjectableTabUrl(activeTab.url)) {
      await chrome.scripting.executeScript({
        target: {
          tabId: activeTab.id
        },
        files: ["content.js"]
      });

      return (await chrome.tabs.sendMessage(activeTab.id, message)) as T;
    }

    throw error;
  }
}

async function fetchPageContext() {
  const activeTab = await getActiveTab();

  if (!activeTab) {
    return undefined;
  }

  let pageContext: PageContext | undefined;

  if (typeof activeTab.id === "number") {
    try {
      pageContext = await requestPageContextFromTab(activeTab.id);
    } catch (error) {
      if (isMissingReceiverError(error) && isInjectableTabUrl(activeTab.url)) {
        try {
          await chrome.scripting.executeScript({
            target: {
              tabId: activeTab.id
            },
            files: ["content.js"]
          });
          pageContext = await requestPageContextFromTab(activeTab.id);
        } catch (retryError) {
          console.warn(
            "Failed to inject content script into active tab",
            retryError
          );
        }
      } else if (!isMissingReceiverError(error)) {
        console.warn("Failed to fetch page context from active tab", error);
      }
    }
  }

  return {
    title: pageContext?.title ?? activeTab.title ?? "Untitled page",
    url: pageContext?.url ?? activeTab.url,
    documentLanguage: pageContext?.documentLanguage
  };
}

async function getAnalyzedPagesCache() {
  const stored = await chrome.storage.local.get([
    ANALYZED_PAGES_STORAGE_KEY,
    LEGACY_ANALYZED_PAGES_STORAGE_KEY
  ]);
  const cache =
    stored[ANALYZED_PAGES_STORAGE_KEY] ??
    stored[LEGACY_ANALYZED_PAGES_STORAGE_KEY];

  if (!cache || typeof cache !== "object") {
    return {} as Record<string, AnalyzedPageCacheEntry>;
  }

  if (
    stored[ANALYZED_PAGES_STORAGE_KEY] === undefined &&
    stored[LEGACY_ANALYZED_PAGES_STORAGE_KEY] !== undefined
  ) {
    await chrome.storage.local.set({
      [ANALYZED_PAGES_STORAGE_KEY]: cache
    });
    await chrome.storage.local.remove(LEGACY_ANALYZED_PAGES_STORAGE_KEY);
  }

  return cache as Record<string, AnalyzedPageCacheEntry>;
}

async function markPageAnalyzed(
  url: string,
  entry: AnalyzedPageCacheEntry
) {
  const cache = await getAnalyzedPagesCache();
  cache[normalizeUrl(url)] = entry;
  await chrome.storage.local.set({
    [ANALYZED_PAGES_STORAGE_KEY]: cache
  });
}

async function getAnalyzedPageState(url: string) {
  const cache = await getAnalyzedPagesCache();
  return cache[normalizeUrl(url)];
}

async function getRegistrationState(browserSessionId: string) {
  const stored = await chrome.storage.local.get([
    REGISTRATION_STORAGE_KEY,
    LEGACY_REGISTRATION_STORAGE_KEY
  ]);
  const registration =
    stored[REGISTRATION_STORAGE_KEY] ?? stored[LEGACY_REGISTRATION_STORAGE_KEY];

  if (!registration || typeof registration !== "object") {
    return null;
  }

  const payload = registration as RegistrationStatePayload;

  if (payload.browserSessionId !== browserSessionId) {
    return null;
  }

  if (
    stored[REGISTRATION_STORAGE_KEY] === undefined &&
    stored[LEGACY_REGISTRATION_STORAGE_KEY] !== undefined
  ) {
    await chrome.storage.local.set({
      [REGISTRATION_STORAGE_KEY]: registration
    });
    await chrome.storage.local.remove(LEGACY_REGISTRATION_STORAGE_KEY);
  }

  return payload;
}

async function saveRegistrationState(
  browserSessionId: string,
  registration: Omit<RegistrationStatePayload, "browserSessionId">
) {
  await chrome.storage.local.set({
    [REGISTRATION_STORAGE_KEY]: {
      browserSessionId,
      ...registration
    }
  });
}

async function loadRegistrationState() {
  if (!state.browserSessionId) {
    state.assistantSessionId = undefined;
    state.currentUser = null;
    state.externalUserApiKey = undefined;
    state.registrationRequired = true;
    syncRegistrationForm();
    return;
  }

  const registration = await getRegistrationState(state.browserSessionId);

  state.assistantSessionId = registration?.assistantSessionId;
  state.currentUser = registration?.externalUser ?? null;
  state.externalUserApiKey = registration?.externalUserApiKey;
  state.registrationRequired = !(
    state.externalUserApiKey && state.assistantSessionId
  );
  syncRegistrationForm();
}

async function syncBrowserSession() {
  if (!state.browserSessionId) {
    return;
  }

  const payload = await fetchJson<BrowserSessionPayload>("/api/browser-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      externalUser: state.currentUser,
      externalUserApiKey: state.externalUserApiKey,
      extensionId: state.extensionId,
      preferredLanguage: languageSelect?.value ?? "auto",
      preferredVoiceId: getSelectedVoiceId()
    })
  });

  state.registrationRequired = Boolean(payload.registrationRequired);
}

async function submitAccountProfile() {
  if (!state.browserSessionId) {
    return;
  }

  const isRegistrationFlow = state.registrationRequired;
  const endpoint = isRegistrationFlow
    ? "/api/browser-sessions/register"
    : "/api/browser-sessions/profile";

  state.registrationSubmitting = true;
  render();

  try {
    const payload = await fetchJson<BrowserSessionPayload>(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assistantSessionId: state.assistantSessionId,
        browserSessionId: state.browserSessionId,
        externalUserApiKey: state.externalUserApiKey,
        extensionId: state.extensionId,
        userAgent: navigator.userAgent,
        displayName: registrationDisplayNameNode?.value ?? "",
        email: registrationEmailNode?.value ?? "",
        username: registrationUsernameNode?.value ?? "",
        preferredLanguage: languageSelect?.value ?? "auto",
        preferredVoiceId: getSelectedVoiceId()
      })
    });

    state.assistantSessionId =
      typeof payload.assistantSessionId === "string"
        ? payload.assistantSessionId
        : undefined;
    state.currentUser = payload.externalUser ?? null;
    state.externalUserApiKey =
      typeof payload.externalUserApiKey === "string"
        ? payload.externalUserApiKey
        : undefined;
    state.registrationRequired = Boolean(payload.registrationRequired);
    state.accountEditorOpen = false;
    await saveRegistrationState(state.browserSessionId, {
      assistantSessionId: state.assistantSessionId,
      externalUser: state.currentUser,
      externalUserApiKey: state.externalUserApiKey
    });
    appendLog(
      "system",
      isRegistrationFlow
        ? "Registration completed. You can now analyze documents and start voice chat."
        : "Account details updated for this client session."
    );
    await refreshAll();
  } catch (error) {
    console.error("Failed to save StructuredQueries account profile", error);
    appendLog(
      "system",
      error instanceof Error
        ? error.message
        : isRegistrationFlow
          ? "Registration failed."
          : "Failed to update account details."
    );
  } finally {
    state.registrationSubmitting = false;
    render();
  }
}

async function refreshServerStatus() {
  try {
    const payload = await fetchJson<ServerHealthPayload>("/api/health");
    state.serverOnline = payload.status === "ok";
  } catch (error) {
    console.error("Failed to reach server", error);
    state.serverOnline = false;
  }
}

async function refreshVoices() {
  if (!state.serverOnline) {
    state.voices = [];
    renderVoiceOptions();
    return;
  }

  try {
    const payload = await fetchJson<VoicesPayload>("/api/voices");
    state.voices = payload.voices;

    for (const warning of payload.warnings ?? []) {
      console.warn("StructuredQueries voices warning:", warning);
    }
  } catch (error) {
    console.error("Failed to fetch voices", error);
    state.voices = [];
  }

  renderVoiceOptions();
}

function closeWebSocketSession() {
  clearResumeConversationTimer();
  stopAssistantPlayback();

  if (activeSocket) {
    activeSocket.close();
  }

  activeSocket = undefined;
  activeSocketPromise = undefined;
  assistantAudioReceivedForTurn = false;
  state.conversationActive = false;
  state.recording = false;
  state.assistantSpeaking = false;
  state.websocketState = "disconnected";
  state.websocketDetail = "Idle";
  state.pendingAssistantText = undefined;
}

async function refreshIndexStatus() {
  if (!state.currentPage?.url) {
    state.indexChecked = false;
    state.analysisReady = false;
    state.currentTemplateId = undefined;
    return;
  }

  const localAnalysis = await getAnalyzedPageState(state.currentPage.url);
  state.indexChecked = true;
  state.analysisReady = Boolean(localAnalysis?.analyzed);
  state.currentTemplateId = localAnalysis?.templateId ?? undefined;

  if (
    !state.serverOnline ||
    state.registrationRequired ||
    !state.currentTemplateId
  ) {
    return;
  }

  try {
    const payload = await fetchJson<PageStatusPayload>(
      `/api/webpages/status?url=${encodeURIComponent(
        state.currentPage.url
      )}&templateId=${encodeURIComponent(state.currentTemplateId)}`
    );
    state.analysisReady =
      Boolean(localAnalysis?.analyzed) && Boolean(payload.analysisAvailable);
    state.currentTemplateId = payload.templateId ?? state.currentTemplateId;
  } catch (error) {
    console.error("Failed to check webpage status", error);
    state.analysisReady = Boolean(localAnalysis?.analyzed);
  }
}

function sendSocketMessage(message: RuntimeMessage) {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  activeSocket.send(JSON.stringify(message));
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function bytesFromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function handleConversationLoopError(error: unknown) {
  console.error("Voice chat loop error", error);
  state.conversationActive = false;
  state.recording = false;
  state.assistantSpeaking = false;
  state.websocketDetail = "Voice chat stopped";
  closeWebSocketSession();
  render();
  appendLog("system", normalizeRecordingError(error));
}

async function startConversationTurn() {
  if (
    !state.conversationActive ||
    state.recording ||
    state.assistantSpeaking
  ) {
    return;
  }

  if (state.registrationRequired) {
    throw new Error("Register this browser installation before starting voice chat.");
  }

  state.websocketDetail = "Listening...";
  render();
  await ensureWebSocketSession();
  const response = await sendMessageToActiveTab<{
    ok?: boolean;
    error?: string;
  }>({
    type: "START_PAGE_RECORDING"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to start microphone recording.");
  }
}

function scheduleConversationResume(delayMs = 250) {
  clearResumeConversationTimer();

  if (!state.conversationActive) {
    return;
  }

  resumeConversationTimer = window.setTimeout(() => {
    void startConversationTurn().catch((error) => {
      handleConversationLoopError(error);
    });
  }, delayMs);
}

async function playAssistantAudio(audioBase64: string, mimeType: string) {
  stopAssistantPlayback();

  const bytes = bytesFromBase64(audioBase64);
  const blob = new Blob([bytes], {
    type: mimeType
  });
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  activeAssistantAudio = audio;
  activeAssistantAudioObjectUrl = objectUrl;
  state.assistantSpeaking = true;
  state.websocketDetail = "Assistant speaking...";
  render();

  return new Promise<void>(async (resolve, reject) => {
    const cleanup = () => {
      if (activeAssistantAudio === audio) {
        activeAssistantAudio = undefined;
      }

      if (activeAssistantAudioObjectUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        activeAssistantAudioObjectUrl = undefined;
      }

      state.assistantSpeaking = false;
      render();
    };

    audio.addEventListener(
      "ended",
      () => {
        cleanup();
        resolve();
      },
      { once: true }
    );

    audio.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("Failed to play assistant audio."));
      },
      { once: true }
    );

    try {
      await audio.play();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function chooseLocalSpeechVoice() {
  const availableVoices = window.speechSynthesis.getVoices();
  const preferredLanguage = languageSelect?.value;

  if (preferredLanguage && preferredLanguage !== "auto") {
    const byLanguage = availableVoices.find((voice) =>
      voice.lang.toLowerCase().startsWith(preferredLanguage.toLowerCase())
    );

    if (byLanguage) {
      return byLanguage;
    }
  }

  return availableVoices[0];
}

function speakLocally(text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) {
    return Promise.resolve();
  }

  stopAssistantPlayback();
  state.assistantSpeaking = true;
  state.websocketDetail = "Assistant speaking...";
  render();

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chooseLocalSpeechVoice();

    if (voice) {
      utterance.voice = voice;
    }

    utterance.addEventListener(
      "end",
      () => {
        state.assistantSpeaking = false;
        render();
        resolve();
      },
      { once: true }
    );

    utterance.addEventListener(
      "error",
      () => {
        state.assistantSpeaking = false;
        render();
        reject(new Error("Failed to play local speech."));
      },
      { once: true }
    );

    window.speechSynthesis.speak(utterance);
  });
}

function handleSocketMessage(event: MessageEvent<string>) {
  const payload = JSON.parse(event.data) as RuntimeMessage;

  if (payload.type === "status") {
    const phase = typeof payload.phase === "string" ? payload.phase : "idle";
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    if (!state.assistantSpeaking) {
      state.websocketDetail = detail || phase;
    }

    if (phase === "idle") {
      if (state.pendingAssistantText) {
        const localSpeechText = state.pendingAssistantText;
        state.pendingAssistantText = undefined;

        if (state.conversationActive && !assistantAudioReceivedForTurn) {
          void speakLocally(localSpeechText)
            .catch((error) => {
              console.error("Failed to play local speech", error);
            })
            .finally(() => {
              scheduleConversationResume();
            });
        }
      } else if (state.conversationActive && !assistantAudioReceivedForTurn) {
        scheduleConversationResume();
      }
    }

    render();
    return;
  }

  if (payload.type === "session_ready") {
    state.websocketState = "ready";
    state.websocketDetail = "Connected";
    state.currentTemplateId =
      typeof payload.templateId === "string"
        ? payload.templateId
        : state.currentTemplateId;
    render();
    appendLog("system", "Voice session is ready.");
    return;
  }

  if (payload.type === "voice_updated") {
    appendLog("system", "Speaker preference updated for the active session.");
    return;
  }

  if (payload.type === "transcript_ready") {
    const transcript =
      typeof payload.transcript === "string"
        ? payload.transcript
        : "Transcript unavailable.";
    appendLog("user", transcript);
    return;
  }

  if (payload.type === "assistant_message") {
    const text =
      typeof payload.text === "string"
        ? payload.text
        : "Assistant reply unavailable.";
    state.pendingAssistantText = text;
    appendLog("assistant", text);
    return;
  }

  if (payload.type === "assistant_audio") {
    const fallbackText = state.pendingAssistantText;
    state.pendingAssistantText = undefined;
    assistantAudioReceivedForTurn = true;
    const audioBase64 =
      typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
    const mimeType =
      typeof payload.mimeType === "string" ? payload.mimeType : "audio/mpeg";

    if (audioBase64 && state.conversationActive) {
      void playAssistantAudio(audioBase64, mimeType)
        .catch((error) => {
          console.error("Failed to play assistant audio", error);

          if (fallbackText && state.conversationActive) {
            return speakLocally(fallbackText);
          }

          return Promise.resolve();
        })
        .finally(() => {
          scheduleConversationResume();
        });
    }

    return;
  }

  if (payload.type === "assistant_image") {
    const imageBase64 =
      typeof payload.imageBase64 === "string" ? payload.imageBase64 : "";
    const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl : "";
    const mimeType =
      typeof payload.mimeType === "string" ? payload.mimeType : "image/png";

    if (imageBase64 || imageUrl) {
      appendImageLog(
        "assistant",
        {
          imageBase64: imageBase64 || undefined,
          imageUrl: imageUrl || undefined,
          mimeType
        },
        "Assistant generated an image response."
      );
    }

    return;
  }

  if (payload.type === "error") {
    appendLog(
      "system",
      typeof payload.message === "string"
        ? payload.message
        : "Unexpected websocket error."
    );

    if (state.conversationActive) {
      scheduleConversationResume(600);
    }
  }
}

async function ensureWebSocketSession() {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    return activeSocket;
  }

  if (activeSocketPromise) {
    return activeSocketPromise;
  }

  if (!state.browserSessionId || !state.currentPage?.url) {
    throw new Error("Browser session and active page are required.");
  }

  if (state.registrationRequired) {
    throw new Error("Register this browser installation before starting voice chat.");
  }

  if (!state.externalUserApiKey || !state.assistantSessionId) {
    throw new Error("Registration is incomplete. Register this browser installation again.");
  }

  state.websocketState = "connecting";
  state.websocketDetail = "Connecting...";
  render();

  activeSocketPromise = new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(SERVER_WS_URL);

    socket.addEventListener("message", handleSocketMessage);
    socket.addEventListener("close", () => {
      if (activeSocket === socket) {
        activeSocket = undefined;
        state.conversationActive = false;
        state.recording = false;
        state.assistantSpeaking = false;
        state.websocketState = "disconnected";
        state.websocketDetail = "Disconnected";
        render();
      }
    });
    socket.addEventListener("error", () => {
      reject(new Error("Failed to connect to websocket gateway."));
    });
    socket.addEventListener("open", () => {
      activeSocket = socket;
      state.websocketState = "ready";
      state.websocketDetail = "Connected";
      render();
      sendSocketMessage({
        type: "session_init",
        assistantSessionId: state.assistantSessionId,
        browserSessionId: state.browserSessionId,
        extensionId: state.extensionId,
        externalUserApiKey: state.externalUserApiKey,
        pageUrl: state.currentPage?.url,
        pageTitle: state.currentPage?.title,
        templateId: state.currentTemplateId,
        voiceId: getSelectedVoiceId(),
        language: languageSelect?.value ?? "auto",
        userAgent: navigator.userAgent
      });
      resolve(socket);
    });
  })
    .finally(() => {
      activeSocketPromise = undefined;
    });

  return activeSocketPromise;
}

function getPreferredRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

async function submitRecordedAudio(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await submitRecordedAudioBase64(base64FromBytes(bytes), blob.type || "audio/webm");
}

async function submitRecordedAudioBase64(audioBase64: string, mimeType: string) {
  const socket = await ensureWebSocketSession();

  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("Voice session is not connected.");
  }

  assistantAudioReceivedForTurn = false;
  state.recording = false;
  state.websocketDetail = "Processing audio...";
  render();

  sendSocketMessage({
    type: "submit_audio",
    audioBase64,
    mimeType,
    language: languageSelect?.value ?? "auto",
    templateId: state.currentTemplateId,
    voiceId: getSelectedVoiceId()
  });
}

function normalizeRecordingError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone access was blocked or dismissed. Click Start Voice Chat again and allow microphone access in Chrome.";
    }

    if (error.name === "NotFoundError") {
      return "No microphone was found on this device.";
    }

    if (error.name === "NotReadableError") {
      return "The microphone is already in use by another app or could not be opened.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Failed to start recording.";
}

async function getMicrophonePermissionState() {
  if (!navigator.permissions?.query) {
    return undefined;
  }

  try {
    const permissionStatus = await navigator.permissions.query({
      name: "microphone" as PermissionName
    });
    return permissionStatus.state;
  } catch {
    return undefined;
  }
}

async function requestMicrophonePermissionFromPanel() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      const permissionState = await getMicrophonePermissionState();

      if (permissionState === "denied") {
        throw new Error(
          "Chrome is currently blocking microphone access for this extension. Open the extension site settings, allow Microphone, then click Start Voice Chat again."
        );
      }
    }

    throw error;
  }
}

async function startRecording() {
  if (state.conversationActive) {
    return;
  }

  if (state.registrationRequired) {
    throw new Error("Register this browser installation before starting voice chat.");
  }

  state.conversationActive = true;
  state.websocketDetail = "Starting voice chat...";
  render();
  appendLog(
    "system",
    "Voice chat live."
  );

  try {
    await startConversationTurn();
  } catch (error) {
    state.conversationActive = false;

    try {
      await requestMicrophonePermissionFromPanel();
    } catch {
      // Prefer the page-context error below because it better reflects
      // the origin Chrome evaluated for microphone access.
    }

    throw error;
  }
}

async function stopRecording() {
  if (!state.conversationActive && !state.recording && !state.assistantSpeaking) {
    return;
  }

  clearResumeConversationTimer();
  state.conversationActive = false;
  state.recording = false;
  state.websocketDetail = "Voice chat stopped";
  stopAssistantPlayback();
  render();
  appendLog("system", "Voice chat stopped.");

  try {
    const response = await sendMessageToActiveTab<{
      ok?: boolean;
      error?: string;
    }>({
      type: "STOP_PAGE_RECORDING"
    });

    if (!response?.ok && response?.error) {
      console.warn("Failed to stop page recording", response.error);
    }
  } catch (error) {
    console.warn("Failed to stop page recording", error);
  } finally {
    closeWebSocketSession();
  }
}

async function analyzeCurrentPage() {
  if (!state.browserSessionId || !state.currentPage?.url) {
    return;
  }

  const analyzeUrlError = getAnalyzeUrlError(state.currentPage.url);

  if (state.registrationRequired) {
    appendLog(
      "system",
      "Registration is required before document analysis can start."
    );
    return;
  }

  if (analyzeUrlError) {
    appendLog(
      "system",
      analyzeUrlError
    );
    return;
  }

  state.isAnalyzing = true;
  render();

  try {
    const payload = await fetchJson<AnalyzePayload>("/api/webpages/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browserSessionId: state.browserSessionId,
        url: state.currentPage.url,
        title: state.currentPage.title,
        preferredLanguage: languageSelect?.value ?? "auto",
        preferredVoiceId: getSelectedVoiceId()
      })
    });

    if (payload.ok) {
      state.analysisReady = true;
      state.currentTemplateId =
        typeof payload.analysis?.templateId === "string"
          ? payload.analysis.templateId
          : undefined;
      await markPageAnalyzed(state.currentPage.url, {
        analyzed: true,
        templateId: state.currentTemplateId
      });
      appendLog(
        "system",
        "Document analysis completed. Voice chat is now available for this client session."
      );
      await ensureWebSocketSession();
    }
  } catch (error) {
    console.error("Failed to analyze document", error);
    appendLog(
      "system",
      error instanceof Error ? error.message : "Failed to analyze document."
    );
  } finally {
    state.isAnalyzing = false;
    render();
  }
}

async function refreshAll() {
  const previousPageUrl = state.currentPage?.url;
  const extensionSession = await getExtensionSession();

  state.browserSessionId = extensionSession.browserSessionId;
  state.extensionId = extensionSession.extensionId;

  await refreshServerStatus();
  await refreshVoices();
  state.currentPage = await fetchPageContext();

  if (previousPageUrl && previousPageUrl !== state.currentPage?.url) {
    if (state.conversationActive || state.recording || state.assistantSpeaking) {
      await stopRecording();
    } else {
      closeWebSocketSession();
    }
    resetConversationLog();
    state.currentTemplateId = undefined;
  }

  await loadRegistrationState();

  if (state.serverOnline) {
    await syncBrowserSession();
  }

  await refreshIndexStatus();
  render();
}

chrome.runtime.onMessage.addListener((message) => {
  if (
    message?.type === "OFFSCREEN_RECORDING_STARTED" ||
    message?.type === "PAGE_RECORDING_STARTED"
  ) {
    state.recording = true;
    state.websocketDetail = "Listening...";
    render();
    return false;
  }

  if (message?.type === "PAGE_RECORDING_STOPPED") {
    state.recording = false;
    state.websocketDetail = "Processing audio...";
    render();
    return false;
  }

  if (
    message?.type === "OFFSCREEN_AUDIO_READY" ||
    message?.type === "PAGE_AUDIO_READY"
  ) {
    appendLog("system", "Audio captured. Uploading turn to the proxy...");
    void submitRecordedAudioBase64(
      typeof message.audioBase64 === "string" ? message.audioBase64 : "",
      typeof message.mimeType === "string" ? message.mimeType : "audio/webm"
    ).catch((error) => {
      console.error("Failed to submit recorded audio", error);
      appendLog(
        "system",
        error instanceof Error
          ? error.message
          : "Failed to submit recorded audio."
      );
    });
    return false;
  }

  if (message?.type === "PAGE_RECORDING_CANCELLED") {
    state.recording = false;
    state.websocketDetail = state.conversationActive
      ? "Listening..."
      : "Idle";
    render();

    if (state.conversationActive) {
      scheduleConversationResume(100);
    }

    return false;
  }

  if (
    message?.type === "OFFSCREEN_RECORDING_ERROR" ||
    message?.type === "PAGE_RECORDING_ERROR"
  ) {
    state.recording = false;
    state.conversationActive = false;
    state.websocketDetail = "Microphone unavailable";
    render();
    appendLog(
      "system",
      typeof message.message === "string"
        ? message.message
        : "Failed to start recording."
    );
    return false;
  }

  return false;
});

refreshButton?.addEventListener("click", () => {
  void refreshAll();
});

accountButton?.addEventListener("click", () => {
  openAccountEditor();
});

analyzeButton?.addEventListener("click", () => {
  void analyzeCurrentPage();
});

registrationFormNode?.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitAccountProfile();
});

registrationCloseButton?.addEventListener("click", () => {
  closeAccountEditor();
});

registrationOverlayNode?.addEventListener("click", (event) => {
  if (event.target === registrationOverlayNode) {
    closeAccountEditor();
  }
});

startChatButton?.addEventListener("click", () => {
  void startRecording().catch((error) => {
    console.error("Failed to start recording", error);
    appendLog(
      "system",
      normalizeRecordingError(error)
    );
  });
});

stopChatButton?.addEventListener("click", () => {
  void stopRecording();
});

closeOverlayButton?.addEventListener("click", () => {
  requestOverlayClose();
});

voiceSelect?.addEventListener("change", () => {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    sendSocketMessage({
      type: "set_voice",
      voiceId: getSelectedVoiceId()
    });
  }
});

languageSelect?.addEventListener("change", () => {
  void syncBrowserSession().catch((error) => {
    console.error("Failed to update browser session", error);
  });
});

window.addEventListener("pagehide", () => {
  void stopRecording();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    requestOverlayClose();
  }
});

resetConversationLog();
void refreshAll();
