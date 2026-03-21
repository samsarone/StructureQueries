export {};

const SERVER_HTTP_ORIGIN = "https://structuredqueries.samsar.one";
const SERVER_WS_URL = "wss://structuredqueries.samsar.one/ws/plugin";
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
  serverOnline: boolean;
  indexChecked: boolean;
  analysisReady: boolean;
  isAnalyzing: boolean;
  websocketState: "disconnected" | "connecting" | "ready";
  websocketDetail: string;
  voices: VoicesPayload["voices"];
  pendingAssistantText?: string;
  recording: boolean;
}

const serverStatusNode = document.querySelector<HTMLElement>("#server-status");
const browserSessionNode =
  document.querySelector<HTMLElement>("#browser-session");
const pageTitleNode = document.querySelector<HTMLElement>("#page-title");
const pageUrlNode = document.querySelector<HTMLElement>("#page-url");
const pageLanguageNode =
  document.querySelector<HTMLElement>("#page-language");
const indexStatusNode = document.querySelector<HTMLElement>("#index-status");
const voiceSessionStatusNode = document.querySelector<HTMLElement>(
  "#voice-session-status"
);
const registrationOverlayNode =
  document.querySelector<HTMLElement>("#registration-overlay");
const registrationFormNode =
  document.querySelector<HTMLFormElement>("#registration-form");
const registrationStatusNode =
  document.querySelector<HTMLElement>("#registration-status");
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
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice-select");
const languageSelect =
  document.querySelector<HTMLSelectElement>("#language-select");

const state: AppState = {
  currentUser: null,
  registrationRequired: true,
  registrationSubmitting: false,
  serverOnline: false,
  indexChecked: false,
  analysisReady: false,
  isAnalyzing: false,
  websocketState: "disconnected",
  websocketDetail: "Idle",
  voices: [],
  recording: false
};

let activeSocket: WebSocket | undefined;
let activeSocketPromise: Promise<WebSocket> | undefined;
let mediaRecorder: MediaRecorder | undefined;
let mediaStream: MediaStream | undefined;
let recordedChunks: Blob[] = [];

function normalizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function truncateMiddle(value: string, size = 14) {
  if (value.length <= size * 2) {
    return value;
  }

  return `${value.slice(0, size)}...${value.slice(-size)}`;
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
    "Analyze the webpage first. After that, start a voice chat and speak into your microphone."
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
    option.textContent = "No voices available";
    voiceSelect.append(option);
  }

  const matchingValue = state.voices.some((voice) => voice.voiceId === previousValue)
    ? previousValue
    : state.voices[0]?.voiceId ?? "";
  voiceSelect.value = matchingValue;
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

function render() {
  setText(
    serverStatusNode,
    state.serverOnline ? "Online" : "Offline"
  );
  setText(
    browserSessionNode,
    state.browserSessionId ? truncateMiddle(state.browserSessionId, 8) : "Unavailable"
  );
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

  const indexStatus = state.isAnalyzing
    ? "Analyzing..."
    : state.registrationRequired
      ? "Registration Required"
    : state.analysisReady
      ? "Analyzed"
      : state.indexChecked
        ? "Not indexed"
        : "Checking...";
  setText(indexStatusNode, indexStatus);
  setText(voiceSessionStatusNode, state.websocketDetail);

  const analysisDetail = state.registrationRequired
    ? "Register this browser installation before webpage analysis and chat are enabled."
    : state.analysisReady
      ? "The page has a stored template id in this extension, so voice chat can use grounded retrieval now."
      : "Analyze the current page to create a Samsar embedding template for grounded voice chat.";
  setText(analysisStatusNode, analysisDetail);
  setText(
    registrationStatusNode,
    state.serverOnline
      ? state.registrationSubmitting
        ? "Saving registration..."
        : state.registrationRequired
          ? "Register this browser installation. These profile fields are optional."
          : state.currentUser?.displayName
            ? `Registered as ${state.currentUser.displayName}.`
            : "Registration complete."
      : "The proxy server must be online before registration can be completed."
  );

  if (registrationOverlayNode) {
    registrationOverlayNode.classList.toggle(
      "is-hidden",
      !state.serverOnline || !state.registrationRequired
    );
  }

  if (analyzeButton) {
    analyzeButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.serverOnline || !state.currentPage?.url || state.isAnalyzing;
    analyzeButton.textContent = state.isAnalyzing
      ? "Analyzing..."
      : state.analysisReady
        ? "Re-analyze Webpage"
        : "Analyze Webpage";
  }

  if (startChatButton) {
    startChatButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.serverOnline ||
      !state.analysisReady ||
      state.voices.length === 0 ||
      !state.currentPage?.url ||
      state.recording ||
      state.websocketState === "connecting";
    startChatButton.textContent =
      state.websocketState === "connecting"
        ? "Connecting..."
        : "Start Voice Chat";
  }

  if (stopChatButton) {
    stopChatButton.disabled =
      state.registrationRequired || state.registrationSubmitting || !state.recording;
  }

  if (voiceSelect) {
    voiceSelect.disabled =
      state.registrationSubmitting ||
      state.registrationRequired ||
      state.voices.length === 0;
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

async function fetchPageContext() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab) {
    return undefined;
  }

  let pageContext: PageContext | undefined;

  if (typeof activeTab.id === "number") {
    try {
      pageContext = (await chrome.tabs.sendMessage(activeTab.id, {
        type: "GET_PAGE_CONTEXT"
      })) as PageContext;
    } catch (error) {
      console.warn("Content script unavailable for this tab", error);
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
      preferredVoiceId: voiceSelect?.value
    })
  });

  state.registrationRequired = Boolean(payload.registrationRequired);
}

async function submitRegistration() {
  if (!state.browserSessionId) {
    return;
  }

  state.registrationSubmitting = true;
  render();

  try {
    const payload = await fetchJson<BrowserSessionPayload>(
      "/api/browser-sessions/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          browserSessionId: state.browserSessionId,
          extensionId: state.extensionId,
          userAgent: navigator.userAgent,
          displayName: registrationDisplayNameNode?.value ?? "",
          email: registrationEmailNode?.value ?? "",
          username: registrationUsernameNode?.value ?? "",
          preferredLanguage: languageSelect?.value ?? "auto",
          preferredVoiceId: voiceSelect?.value
        })
      }
    );

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
    await saveRegistrationState(state.browserSessionId, {
      assistantSessionId: state.assistantSessionId,
      externalUser: state.currentUser,
      externalUserApiKey: state.externalUserApiKey
    });
    appendLog(
      "system",
      "Registration completed. You can now analyze webpages and start voice chat."
    );
    await refreshAll();
  } catch (error) {
    console.error("Failed to register StructuredQueries user", error);
    appendLog(
      "system",
      error instanceof Error ? error.message : "Registration failed."
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
  } catch (error) {
    console.error("Failed to fetch voices", error);
    state.voices = [];
  }

  renderVoiceOptions();
}

function closeWebSocketSession() {
  if (activeSocket) {
    activeSocket.close();
  }

  activeSocket = undefined;
  activeSocketPromise = undefined;
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
    state.analysisReady = false;
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

async function playAssistantAudio(audioBase64: string, mimeType: string) {
  const bytes = bytesFromBase64(audioBase64);
  const blob = new Blob([bytes], {
    type: mimeType
  });
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);

  try {
    await audio.play();
  } catch (error) {
    console.error("Failed to play assistant audio", error);
  }

  audio.addEventListener(
    "ended",
    () => {
      URL.revokeObjectURL(objectUrl);
    },
    { once: true }
  );
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
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseLocalSpeechVoice();

  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

function handleSocketMessage(event: MessageEvent<string>) {
  const payload = JSON.parse(event.data) as RuntimeMessage;

  if (payload.type === "status") {
    const phase = typeof payload.phase === "string" ? payload.phase : "idle";
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    state.websocketDetail = detail || phase;

    if (phase === "idle" && state.pendingAssistantText) {
      speakLocally(state.pendingAssistantText);
      state.pendingAssistantText = undefined;
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
    state.pendingAssistantText = undefined;
    const audioBase64 =
      typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
    const mimeType =
      typeof payload.mimeType === "string" ? payload.mimeType : "audio/mpeg";

    if (audioBase64) {
      void playAssistantAudio(audioBase64, mimeType);
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
        voiceId: voiceSelect?.value,
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
  const socket = await ensureWebSocketSession();

  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("Voice session is not connected.");
  }

  sendSocketMessage({
    type: "submit_audio",
    audioBase64: base64FromBytes(bytes),
    mimeType: blob.type || "audio/webm",
    language: languageSelect?.value ?? "auto",
    templateId: state.currentTemplateId,
    voiceId: voiceSelect?.value
  });
}

function cleanupRecording() {
  mediaRecorder = undefined;

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }

  mediaStream = undefined;
  recordedChunks = [];
}

async function startRecording() {
  if (state.recording) {
    return;
  }

  if (state.registrationRequired) {
    throw new Error("Register this browser installation before starting voice chat.");
  }

  if (state.voices.length === 0) {
    throw new Error("No ElevenLabs voice configuration is available for this server.");
  }

  await ensureWebSocketSession();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia is not available in this Chrome context.");
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true
  });
  recordedChunks = [];

  const mimeType = getPreferredRecordingMimeType();
  mediaRecorder = mimeType
    ? new MediaRecorder(mediaStream, {
        mimeType
      })
    : new MediaRecorder(mediaStream);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener(
    "stop",
    () => {
      const blob = new Blob(recordedChunks, {
        type: mediaRecorder?.mimeType || mimeType || "audio/webm"
      });
      cleanupRecording();
      state.recording = false;
      render();

      if (blob.size === 0) {
        appendLog("system", "No audio was captured for this turn.");
        return;
      }

      appendLog("system", "Audio captured. Uploading turn to the proxy...");
      void submitRecordedAudio(blob).catch((error) => {
        console.error("Failed to submit recorded audio", error);
        appendLog(
          "system",
          error instanceof Error
            ? error.message
            : "Failed to submit recorded audio."
        );
      });
    },
    { once: true }
  );

  mediaRecorder.start();
  state.recording = true;
  state.websocketDetail = "Recording...";
  appendLog("system", "Recording started.");
  render();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    return;
  }

  mediaRecorder.stop();
  state.recording = false;
  state.websocketDetail = "Processing audio...";
  render();
}

async function analyzeCurrentPage() {
  if (!state.browserSessionId || !state.currentPage?.url) {
    return;
  }

  if (state.registrationRequired) {
    appendLog(
      "system",
      "Registration is required before webpage analysis can start."
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
        preferredVoiceId: voiceSelect?.value
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
        "Webpage analysis completed. Voice chat is now available for this browser session."
      );
      await ensureWebSocketSession();
    }
  } catch (error) {
    console.error("Failed to analyze webpage", error);
    appendLog(
      "system",
      error instanceof Error ? error.message : "Failed to analyze webpage."
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
    closeWebSocketSession();
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

refreshButton?.addEventListener("click", () => {
  void refreshAll();
});

analyzeButton?.addEventListener("click", () => {
  void analyzeCurrentPage();
});

registrationFormNode?.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitRegistration();
});

startChatButton?.addEventListener("click", () => {
  void startRecording().catch((error) => {
    console.error("Failed to start recording", error);
    appendLog(
      "system",
      error instanceof Error ? error.message : "Failed to start recording."
    );
  });
});

stopChatButton?.addEventListener("click", () => {
  stopRecording();
});

voiceSelect?.addEventListener("change", () => {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    sendSocketMessage({
      type: "set_voice",
      voiceId: voiceSelect.value
    });
  }
});

languageSelect?.addEventListener("change", () => {
  void syncBrowserSession().catch((error) => {
    console.error("Failed to update browser session", error);
  });
});

resetConversationLog();
void refreshAll();
