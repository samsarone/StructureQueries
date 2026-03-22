export {};

declare const __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__: string;
declare const __STRUCTUREDQUERIES_SERVER_WS_URL__: string;

const SERVER_HTTP_ORIGIN = __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__;
const SERVER_WS_URL = __STRUCTUREDQUERIES_SERVER_WS_URL__;
const ANALYZED_PAGES_STORAGE_KEY = "structuredqueries.analyzedPages";
const REGISTRATION_STORAGE_KEY = "structuredqueries.registration";
const LEGACY_ANALYZED_PAGES_STORAGE_KEY = "telepathy.analyzedPages";
const LEGACY_REGISTRATION_STORAGE_KEY = "telepathy.registration";
const STARTER_CREDITS = 50;
const creditCountFormatter = new Intl.NumberFormat();

interface ExtensionSessionPayload {
  ok: boolean;
  browserSessionId: string;
  extensionId: string;
}

interface ServerHealthPayload {
  status?: string;
}

interface StructureQueriesExternalUserPayload {
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
  totalRequests?: number | null;
  totalCreditsUsed?: number | null;
  totalCreditsRefunded?: number | null;
  totalCreditsPurchased?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RegistrationStatePayload {
  browserSessionId: string;
  assistantSessionId?: string;
  externalUser?: StructureQueriesExternalUserPayload | null;
  externalUserApiKey?: string;
  preferredVoiceId?: string;
  preferredVoiceName?: string;
}

interface BrowserSessionPayload {
  ok: boolean;
  assistantSessionId?: string | null;
  externalUser?: StructureQueriesExternalUserPayload | null;
  externalUserApiKey?: string | null;
  registrationRequired?: boolean;
  starterCreditsGranted?: number | null;
  warnings?: string[];
}

interface BrowserSessionLoginLinkPayload {
  ok: boolean;
  loginUrl?: string | null;
  externalUser?: StructureQueriesExternalUserPayload | null;
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
    previewUrl?: string;
  }>;
}

interface RuntimeMessage {
  type: string;
  [key: string]: unknown;
}

type LogRole = "system" | "user" | "assistant";
type WebSocketPhase =
  | "idle"
  | "connected"
  | "ready"
  | "transcribing"
  | "thinking"
  | "synthesizing"
  | "error";

interface AppState {
  assistantSessionId?: string;
  browserSessionId?: string;
  extensionId?: string;
  currentUser?: StructureQueriesExternalUserPayload | null;
  currentPage?: PageContext;
  currentTemplateId?: string;
  externalUserApiKey?: string;
  registrationRequired: boolean;
  registrationSubmitting: boolean;
  loginLinkSubmitting: boolean;
  accountEditorOpen: boolean;
  serverOnline: boolean;
  indexChecked: boolean;
  analysisReady: boolean;
  isAnalyzing: boolean;
  isInitializing: boolean;
  websocketState: "disconnected" | "connecting" | "ready";
  websocketPhase: WebSocketPhase;
  websocketDetail: string;
  voices: VoicesPayload["voices"];
  voiceWarning?: string;
  creditIssueMessage?: string;
  preferredVoiceId?: string;
  preferredVoiceName?: string;
  voicePreviewState: "idle" | "loading" | "playing";
  voicePreviewVoiceId?: string;
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
const settingsCreditsRemainingNode =
  document.querySelector<HTMLElement>("#settings-credits-remaining");
const settingsCreditsCaptionNode =
  document.querySelector<HTMLElement>("#settings-credits-caption");
const samsarLoginButton =
  document.querySelector<HTMLButtonElement>("#samsar-login-button");
const analysisStatusNode =
  document.querySelector<HTMLElement>("#analysis-status");
const conversationLogNode =
  document.querySelector<HTMLElement>("#conversation-log");
const overlayShellNode =
  document.querySelector<HTMLElement>(".overlay-shell");
const analyzeButton = document.querySelector<HTMLButtonElement>("#analyze-button");
const analyzeButtonLabel =
  document.querySelector<HTMLElement>("#analyze-button-label");
const analyzeButtonIcon =
  document.querySelector<HTMLElement>("#analyze-button-icon");
const buttonRowNode =
  document.querySelector<HTMLElement>("#button-row");
const closeOverlayButton =
  document.querySelector<HTMLButtonElement>("#close-overlay-button");
const surfaceStatusNode =
  document.querySelector<HTMLElement>("#surface-status");
const creditWarningNode =
  document.querySelector<HTMLElement>("#credit-warning");
const creditWarningMessageNode =
  document.querySelector<HTMLElement>("#credit-warning-message");
const creditWarningButton =
  document.querySelector<HTMLButtonElement>("#credit-warning-button");
const voiceToggleButton =
  document.querySelector<HTMLButtonElement>("#voice-toggle-button");
const voiceToggleButtonLabel =
  document.querySelector<HTMLElement>("#voice-toggle-button-label");
const voiceToggleButtonIcon =
  document.querySelector<HTMLElement>("#voice-toggle-button-icon");
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice-select");
const voicePreviewButton =
  document.querySelector<HTMLButtonElement>("#voice-preview-button");
const voiceWarningNode = document.querySelector<HTMLElement>("#voice-warning");
const languageSelect =
  document.querySelector<HTMLSelectElement>("#language-select");

const state: AppState = {
  currentUser: null,
  registrationRequired: true,
  registrationSubmitting: false,
  loginLinkSubmitting: false,
  accountEditorOpen: false,
  serverOnline: false,
  indexChecked: false,
  analysisReady: false,
  isAnalyzing: false,
  isInitializing: true,
  websocketState: "disconnected",
  websocketPhase: "idle",
  websocketDetail: "Idle",
  voices: [],
  voiceWarning: undefined,
  creditIssueMessage: undefined,
  preferredVoiceId: undefined,
  preferredVoiceName: undefined,
  voicePreviewState: "idle",
  voicePreviewVoiceId: undefined,
  conversationActive: false,
  assistantSpeaking: false,
  recording: false
};

let activeSocket: WebSocket | undefined;
let activeSocketPromise: Promise<WebSocket> | undefined;
let activeAssistantAudio: HTMLAudioElement | undefined;
let activeAssistantAudioObjectUrl: string | undefined;
let activeVoicePreviewAudio: HTMLAudioElement | undefined;
let resumeConversationTimer: number | undefined;
let assistantAudioReceivedForTurn = false;

const BUTTON_ICONS = {
  mic: `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.2a2.7 2.7 0 0 1 2.7 2.7v3.8a2.7 2.7 0 1 1-5.4 0V5.9A2.7 2.7 0 0 1 10 3.2Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.7 8.8v.7A4.3 4.3 0 0 0 10 13.8a4.3 4.3 0 0 0 4.3-4.3v-.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M10 13.8v2.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M7.6 16.7h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `,
  stop: `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="5.2" y="5.2" width="9.6" height="9.6" rx="2.1" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  `,
  scan: `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.4 3.8H5.6A1.8 1.8 0 0 0 3.8 5.6v1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M12.6 3.8h1.8a1.8 1.8 0 0 1 1.8 1.8v1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M16.2 12.6v1.8a1.8 1.8 0 0 1-1.8 1.8h-1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M3.8 12.6v1.8a1.8 1.8 0 0 0 1.8 1.8h1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M7.6 10h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M10 7.6v4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `,
  redo: `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M15.1 7.2A5.6 5.6 0 0 0 6 5.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M15 3.9v3.8h-3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.9 12.8A5.6 5.6 0 0 0 14 14.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M5 16.1v-3.8h3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  loader: `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.2a6.8 6.8 0 1 1-4.81 1.99" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `
} as const;

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

function getCreditsRemaining() {
  return typeof state.currentUser?.generationCredits === "number"
    ? Math.max(0, Math.floor(state.currentUser.generationCredits))
    : null;
}

function formatCreditsLabel(value: number) {
  const amount = creditCountFormatter.format(value);
  return `${amount} ${value === 1 ? "credit" : "credits"}`;
}

function syncCreditIssueStateWithBalance() {
  const creditsRemaining = getCreditsRemaining();

  if (creditsRemaining !== null && creditsRemaining > 0) {
    state.creditIssueMessage = undefined;
  }
}

function isInsufficientCreditsMessage(
  message: string | null | undefined
) {
  const normalized = readOptionalString(message);

  return Boolean(
    normalized &&
      /not enough .*credits?|insufficient .*credits?|credits? are available|credits? remaining: 0|recharge credits?/i.test(
        normalized
      )
  );
}

function formatInsufficientCreditsMessage(
  message: string | null | undefined
) {
  const normalized = readOptionalString(message);

  if (!normalized) {
    return "Not enough credits are available for this request. Recharge credits in Samsar and then try again.";
  }

  return /recharge/i.test(normalized)
    ? normalized
    : `${normalized} Recharge credits in Samsar and then try again.`;
}

function getPreferredVoiceIdFromUser(
  user?: StructureQueriesExternalUserPayload | null
) {
  const browserInstallation = user?.browserInstallation;

  if (!browserInstallation || typeof browserInstallation !== "object") {
    return undefined;
  }

  const installation = browserInstallation as Record<string, unknown>;

  return (
    readOptionalString(
      typeof installation.preferred_voice_id === "string"
        ? installation.preferred_voice_id
        : undefined
    ) ??
    readOptionalString(
      typeof installation.preferredVoiceId === "string"
        ? installation.preferredVoiceId
        : undefined
    )
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

function stopVoicePreviewPlayback() {
  if (activeVoicePreviewAudio) {
    activeVoicePreviewAudio.pause();
    activeVoicePreviewAudio.src = "";
    activeVoicePreviewAudio = undefined;
  }

  if (
    state.voicePreviewState !== "idle" ||
    readOptionalString(state.voicePreviewVoiceId)
  ) {
    state.voicePreviewState = "idle";
    state.voicePreviewVoiceId = undefined;
    renderVoicePreviewButton();
  }
}

async function toggleVoicePreviewPlayback() {
  const selectedVoiceId = getSelectedVoiceId();
  const previewSource = getSelectedVoicePreviewSource();

  if (!selectedVoiceId || !previewSource) {
    return;
  }

  const previewActive =
    state.voicePreviewVoiceId === selectedVoiceId &&
    state.voicePreviewState !== "idle";

  if (previewActive) {
    stopVoicePreviewPlayback();
    return;
  }

  stopAssistantPlayback();
  stopVoicePreviewPlayback();

  const audio = new Audio(previewSource);
  activeVoicePreviewAudio = audio;
  state.voicePreviewVoiceId = selectedVoiceId;
  state.voicePreviewState = "loading";
  renderVoicePreviewButton();

  const cleanup = () => {
    if (activeVoicePreviewAudio === audio) {
      activeVoicePreviewAudio = undefined;
    }

    if (state.voicePreviewVoiceId === selectedVoiceId) {
      state.voicePreviewState = "idle";
      state.voicePreviewVoiceId = undefined;
      renderVoicePreviewButton();
    }
  };

  audio.addEventListener("play", () => {
    if (activeVoicePreviewAudio !== audio) {
      return;
    }

    state.voicePreviewState = "playing";
    renderVoicePreviewButton();
  });

  audio.addEventListener(
    "ended",
    () => {
      cleanup();
    },
    { once: true }
  );

  audio.addEventListener(
    "pause",
    () => {
      if (!audio.ended) {
        cleanup();
      }
    },
    { once: true }
  );

  audio.addEventListener(
    "error",
    () => {
      cleanup();
      appendLog("system", "Failed to play speaker preview.");
    },
    { once: true }
  );

  try {
    await audio.play();
  } catch (error) {
    const previewWasInterrupted =
      activeVoicePreviewAudio !== audio ||
      state.voicePreviewVoiceId !== selectedVoiceId ||
      (error instanceof DOMException && error.name === "AbortError");
    cleanup();

    if (!previewWasInterrupted) {
      throw error;
    }
  }
}

function requestOverlayClose() {
  stopVoicePreviewPlayback();

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

function setIcon(
  node: HTMLElement | null,
  icon: keyof typeof BUTTON_ICONS
) {
  if (node) {
    node.innerHTML = BUTTON_ICONS[icon];
  }
}

function setButtonVariant(
  button: HTMLElement | null,
  variant: "primary" | "secondary" | "danger"
) {
  if (!button) {
    return;
  }

  button.classList.toggle("primary-button", variant === "primary");
  button.classList.toggle("secondary-button", variant === "secondary");
  button.classList.toggle("danger-button", variant === "danger");
}

function normalizeWebSocketPhase(phase: string): WebSocketPhase {
  switch (phase) {
    case "connected":
    case "ready":
    case "transcribing":
    case "thinking":
    case "synthesizing":
    case "idle":
    case "error":
      return phase;
    default:
      return "idle";
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
  roleNode.textContent =
    role === "user"
      ? "You"
      : role === "assistant"
        ? "Structured Queries"
        : "System";
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
  appendLog("system", "Prepare the page, then ask by voice.");
}

function renderVoiceOptions() {
  if (!voiceSelect) {
    renderVoicePreviewButton();
    return;
  }

  const preferredVoiceId = readOptionalString(state.preferredVoiceId);
  const preferredVoiceName = readOptionalString(state.preferredVoiceName);
  voiceSelect.innerHTML = "";

  for (const voice of state.voices) {
    const option = document.createElement("option");
    option.value = voice.voiceId;
    option.textContent = voice.name;
    option.title = voice.description ?? voice.name;
    voiceSelect.append(option);
  }

  if (
    preferredVoiceId &&
    !state.voices.some((voice) => voice.voiceId === preferredVoiceId)
  ) {
    const option = document.createElement("option");
    option.value = preferredVoiceId;
    option.textContent = preferredVoiceName ?? "Saved speaker";
    option.title = preferredVoiceName ?? "Saved speaker";
    voiceSelect.append(option);
  }

  if (voiceSelect.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Browser voice fallback";
    voiceSelect.append(option);
  }

  const matchingValue =
    preferredVoiceId &&
    Array.from(voiceSelect.options).some((option) => option.value === preferredVoiceId)
      ? preferredVoiceId
    : state.voices[0]?.voiceId ?? "";
  voiceSelect.value = matchingValue;

  if (preferredVoiceId && matchingValue === preferredVoiceId) {
    state.preferredVoiceName =
      readOptionalString(voiceSelect.selectedOptions[0]?.textContent) ??
      preferredVoiceName;
  }

  if (
    state.voicePreviewState !== "idle" &&
    (state.voicePreviewVoiceId !== getSelectedVoiceId() ||
      !getSelectedVoicePreviewSource())
  ) {
    stopVoicePreviewPlayback();
    return;
  }

  renderVoicePreviewButton();
}

function getSelectedVoiceId() {
  const value = readOptionalString(voiceSelect?.value);

  return value ?? readOptionalString(state.preferredVoiceId);
}

function getSelectedVoiceOption() {
  const selectedVoiceId = getSelectedVoiceId();

  if (!selectedVoiceId) {
    return undefined;
  }

  return state.voices.find((voice) => voice.voiceId === selectedVoiceId);
}

function getSelectedVoiceName() {
  return (
    readOptionalString(getSelectedVoiceOption()?.name) ??
    readOptionalString(voiceSelect?.selectedOptions[0]?.textContent) ??
    readOptionalString(state.preferredVoiceName)
  );
}

function getSelectedVoicePreviewSource() {
  const selectedVoice = getSelectedVoiceOption();

  if (!selectedVoice?.previewUrl) {
    return undefined;
  }

  return `${SERVER_HTTP_ORIGIN}/api/voices/preview?voiceId=${encodeURIComponent(
    selectedVoice.voiceId
  )}`;
}

function renderVoicePreviewButton() {
  if (!voicePreviewButton) {
    return;
  }

  const selectedVoiceId = getSelectedVoiceId();
  const previewSource = getSelectedVoicePreviewSource();
  const previewActive = Boolean(
    selectedVoiceId &&
      state.voicePreviewVoiceId === selectedVoiceId &&
      state.voicePreviewState !== "idle"
  );
  const voiceBusy =
    state.conversationActive || state.recording || state.assistantSpeaking;

  voicePreviewButton.disabled =
    !previewSource ||
    state.registrationSubmitting ||
    state.isInitializing ||
    (voiceBusy && !previewActive);
  voicePreviewButton.textContent = !previewSource
    ? "Preview unavailable"
    : previewActive && state.voicePreviewState === "playing"
      ? "Pause preview"
      : previewActive && state.voicePreviewState === "loading"
        ? "Loading preview..."
        : "Play preview";
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

  if (!state.registrationRequired && state.serverOnline) {
    void syncBrowserSession().catch((error) => {
      console.error("Failed to refresh account settings", error);
    });
  }
}

function closeAccountEditor() {
  if (state.registrationRequired || state.registrationSubmitting) {
    return;
  }

  state.accountEditorOpen = false;
  render();
}

function render() {
  const creditIssueActive = Boolean(state.creditIssueMessage);
  const analyzeUrlError = getAnalyzeUrlError(state.currentPage?.url);
  const waitingForAssistant =
    state.conversationActive &&
    !state.recording &&
    !state.assistantSpeaking &&
    ["transcribing", "thinking", "synthesizing"].includes(state.websocketPhase);
  const voiceBusy =
    state.conversationActive ||
    state.recording ||
    state.assistantSpeaking ||
    waitingForAssistant;
  const creditsRemaining = getCreditsRemaining();
  const accountName =
    readOptionalString(state.currentUser?.displayName) ??
    readOptionalString(state.currentUser?.username) ??
    readOptionalString(state.currentUser?.email) ??
    (state.registrationRequired ? "Setup required" : "Structured Queries");
  const settingsCreditsValue = state.registrationRequired
    ? `${STARTER_CREDITS} starter credits`
    : creditsRemaining === null
      ? "Unavailable"
      : formatCreditsLabel(creditsRemaining);
  const settingsCreditsCaption = state.registrationRequired
    ? "Granted once when this Chrome client finishes registration."
    : creditIssueActive
      ? "Recharge in Samsar, then return here and refresh the session."
    : creditsRemaining === null
      ? "Refresh the session to load your latest balance."
      : "Open the Samsar app to recharge when you need more.";
  const analysisPill = state.isInitializing
    ? "Loading"
    : state.isAnalyzing
      ? "Scanning"
      : !state.serverOnline
        ? "Offline"
        : state.registrationRequired
          ? "Register"
          : creditIssueActive
            ? "Recharge"
          : analyzeUrlError
            ? "Blocked"
            : state.recording
              ? "Listening"
              : state.assistantSpeaking
                ? "Speaking"
                : waitingForAssistant
                  ? "Thinking"
                  : state.conversationActive
                    ? "Live"
                    : state.analysisReady
                      ? "Ready"
                      : "Prepare";
  const surfaceStatus = state.isInitializing
    ? "Syncing session..."
    : !state.serverOnline
      ? "Server offline."
      : state.registrationRequired
        ? "Finish setup to unlock page QA."
        : creditIssueActive
          ? "Recharge required."
        : analyzeUrlError
          ? analyzeUrlError
          : state.isAnalyzing
            ? "Building page context..."
            : state.recording
              ? "Listening for your question..."
              : state.assistantSpeaking
                ? "Speaking the answer..."
                : waitingForAssistant
                  ? state.websocketPhase === "transcribing"
                    ? "Transcribing your question..."
                    : state.websocketPhase === "synthesizing"
                      ? "Preparing voice reply..."
                      : "Thinking..."
                  : state.conversationActive
                    ? "Voice chat is live."
                    : state.analysisReady
                      ? "Ready for voice questions."
                      : "Prepare this page once to start QA.";
  const analysisDetail = state.isInitializing
    ? "Loading client state."
    : !state.serverOnline
      ? "Server unavailable."
      : state.registrationRequired
        ? "Finish setup to continue."
        : creditIssueActive
          ? "This client is blocked until credits are recharged in Samsar."
        : analyzeUrlError
          ? analyzeUrlError
          : state.isAnalyzing
            ? "Reading and indexing this page."
            : state.recording
              ? "Listening."
              : state.assistantSpeaking
                ? "Speaking."
                : waitingForAssistant
                  ? state.websocketDetail || "Generating assistant reply."
                  : state.conversationActive
                    ? "Voice chat live."
                    : state.analysisReady
                      ? "Ready when you are."
                      : "Create page context first.";
  const registrationDialogOpen =
    !state.isInitializing && (state.registrationRequired || state.accountEditorOpen);
  const registrationMode = state.registrationRequired ? "register" : "edit";
  const voiceMode = state.isInitializing
    ? "loading"
    : !state.serverOnline
      ? "offline"
      : state.isAnalyzing
        ? "analyzing"
        : state.recording
          ? "listening"
          : state.assistantSpeaking
            ? "speaking"
            : waitingForAssistant
              ? "thinking"
              : state.websocketState === "connecting"
                ? "connecting"
                : state.conversationActive
                  ? "armed"
                  : state.analysisReady
                    ? "ready"
                    : analyzeUrlError
                      ? "error"
                      : "idle";
  const voiceButtonDisabled =
    state.isInitializing ||
    state.registrationRequired ||
    state.registrationSubmitting ||
    !state.serverOnline ||
    creditIssueActive ||
    !state.analysisReady ||
    !state.currentPage?.url ||
    state.isAnalyzing ||
    state.websocketState === "connecting";
  const voiceButtonLabel = state.websocketState === "connecting"
    ? "Connecting..."
    : voiceBusy
      ? "Stop voice"
      : state.analysisReady
        ? "Start voice"
        : "Voice after scan";
  const analyzeButtonLabelText = state.isAnalyzing
    ? "Preparing..."
    : state.analysisReady
      ? "Redo scan"
      : "Prepare page";

  setText(surfaceStatusNode, surfaceStatus);
  setText(accountNameNode, accountName);
  setText(
    accountHintNode,
    state.registrationRequired
      ? "Setup is required."
      : creditIssueActive
        ? "Recharge required."
      : creditsRemaining !== null
        ? `${formatCreditsLabel(creditsRemaining)} remaining.`
      : state.currentUser?.email
        ? "Ready."
        : "Connected."
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
    state.currentPage?.title ?? "Current page"
  );
  setText(
    pageUrlNode,
    state.currentPage?.url ?? "No page selected"
  );
  setText(
    pageLanguageNode,
    `Language: ${state.currentPage?.documentLanguage || "unknown"}`
  );
  setText(analysisStatusNode, analysisDetail);
  setText(
    registrationEyebrowNode,
    registrationMode === "register" ? "Register" : "Account"
  );
  setText(
    registrationTitleNode,
    registrationMode === "register"
      ? "Register Structured Queries"
      : "Update Account"
  );
  setText(
    registrationSubtitleNode,
    registrationMode === "register"
      ? "Set up this browser to continue."
      : "Update your session profile."
  );
  setText(
    registrationStatusNode,
    !state.serverOnline
      ? "Server must be online."
      : state.registrationSubmitting
        ? registrationMode === "register"
          ? "Setting up..."
          : "Saving..."
      : state.loginLinkSubmitting
          ? "Opening Samsar..."
      : registrationMode === "register"
          ? `All fields are optional. You will receive ${STARTER_CREDITS} starter credits.`
          : creditIssueActive
            ? state.creditIssueMessage ?? "Recharge credits to continue."
          : "Save changes."
  );
  setText(settingsCreditsRemainingNode, settingsCreditsValue);
  setText(settingsCreditsCaptionNode, settingsCreditsCaption);
  setText(voiceWarningNode, state.voiceWarning ?? "");
  setText(creditWarningMessageNode, state.creditIssueMessage ?? "");

  if (voiceWarningNode) {
    voiceWarningNode.hidden = !state.voiceWarning;
  }

  if (creditWarningNode) {
    creditWarningNode.hidden = !creditIssueActive;
  }

  document.body.dataset.loading = state.isInitializing ? "true" : "false";
  document.body.dataset.voiceMode = voiceMode;

  if (overlayShellNode) {
    overlayShellNode.setAttribute("aria-busy", state.isInitializing ? "true" : "false");
  }

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
      state.registrationSubmitting ||
      state.loginLinkSubmitting ||
      !state.serverOnline;
    registrationSubmitButton.textContent = state.registrationSubmitting
      ? registrationMode === "register"
        ? "Registering..."
        : "Saving..."
      : registrationMode === "register"
        ? "Register"
        : "Save Changes";
  }

  if (samsarLoginButton) {
    samsarLoginButton.hidden = registrationMode === "register";
    samsarLoginButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      state.loginLinkSubmitting ||
      !state.serverOnline;
    samsarLoginButton.textContent = state.loginLinkSubmitting
      ? "Opening Samsar..."
      : "Recharge Credits";
  }

  if (creditWarningButton) {
    creditWarningButton.disabled =
      state.registrationRequired ||
      state.registrationSubmitting ||
      state.loginLinkSubmitting ||
      !state.serverOnline;
    creditWarningButton.textContent = state.loginLinkSubmitting
      ? "Opening Samsar..."
      : "Recharge Credits";
  }

  if (analyzeButton) {
    analyzeButton.disabled =
      state.isInitializing ||
      state.registrationRequired ||
      state.registrationSubmitting ||
      !state.serverOnline ||
      creditIssueActive ||
      Boolean(analyzeUrlError) ||
      state.isAnalyzing ||
      voiceBusy;
    analyzeButton.classList.toggle("button-chip", state.analysisReady);
    setButtonVariant(analyzeButton, state.analysisReady ? "secondary" : "primary");
  }

  setText(analyzeButtonLabel, analyzeButtonLabelText);
  setIcon(
    analyzeButtonIcon,
    state.isAnalyzing ? "loader" : state.analysisReady ? "redo" : "scan"
  );

  if (voiceToggleButton) {
    voiceToggleButton.disabled = voiceButtonDisabled;
    voiceToggleButton.classList.toggle("button-live", voiceBusy);
    setButtonVariant(
      voiceToggleButton,
      voiceBusy ? "danger" : state.analysisReady ? "primary" : "secondary"
    );
  }

  setText(voiceToggleButtonLabel, voiceButtonLabel);
  setIcon(voiceToggleButtonIcon, voiceBusy ? "stop" : "mic");

  if (buttonRowNode) {
    buttonRowNode.classList.toggle("button-row-ready", state.analysisReady);
  }

  if (voiceSelect) {
    voiceSelect.disabled =
      state.registrationSubmitting ||
      state.isInitializing;
  }

  renderVoicePreviewButton();

  if (languageSelect) {
    languageSelect.disabled =
      state.registrationSubmitting ||
      state.registrationRequired ||
      state.isInitializing;
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
    accountButton.disabled = state.registrationSubmitting || state.isInitializing;
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

async function stopPageRecordingCapture() {
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
  }
}

function showInsufficientCreditsState(message?: string | null) {
  const issueMessage = formatInsufficientCreditsMessage(message);
  const shouldAppendLog = state.creditIssueMessage !== issueMessage;

  state.creditIssueMessage = issueMessage;
  void stopPageRecordingCapture();
  closeWebSocketSession({
    phase: "error",
    detail: "Recharge required"
  });
  state.accountEditorOpen = true;
  syncRegistrationForm();
  render();

  if (shouldAppendLog) {
    appendLog("system", issueMessage);
  }

  openAccountEditor();
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

async function savePreferredVoicePreference() {
  if (!state.browserSessionId) {
    return;
  }

  await saveRegistrationState(state.browserSessionId, {
    assistantSessionId: state.assistantSessionId,
    externalUser: state.currentUser,
    externalUserApiKey: state.externalUserApiKey,
    preferredVoiceId: state.preferredVoiceId,
    preferredVoiceName: state.preferredVoiceName
  });
}

async function loadRegistrationState() {
  if (!state.browserSessionId) {
    state.assistantSessionId = undefined;
    state.currentUser = null;
    state.externalUserApiKey = undefined;
    state.preferredVoiceId = undefined;
    state.preferredVoiceName = undefined;
    state.registrationRequired = true;
    syncRegistrationForm();
    return;
  }

  const registration = await getRegistrationState(state.browserSessionId);

  state.assistantSessionId = registration?.assistantSessionId;
  state.currentUser = registration?.externalUser ?? null;
  state.externalUserApiKey = registration?.externalUserApiKey;
  state.preferredVoiceId =
    registration?.preferredVoiceId ??
    getPreferredVoiceIdFromUser(registration?.externalUser);
  state.preferredVoiceName = registration?.preferredVoiceName;
  state.registrationRequired = !(
    state.externalUserApiKey && state.assistantSessionId
  );
  syncCreditIssueStateWithBalance();
  syncRegistrationForm();
}

function applyBrowserSessionPayload(payload: BrowserSessionPayload) {
  state.assistantSessionId =
    typeof payload.assistantSessionId === "string"
      ? payload.assistantSessionId
      : payload.assistantSessionId === null
        ? undefined
        : state.assistantSessionId;
  state.currentUser =
    payload.externalUser === undefined
      ? state.currentUser
      : payload.externalUser ?? null;
  state.externalUserApiKey =
    typeof payload.externalUserApiKey === "string"
      ? payload.externalUserApiKey
      : payload.externalUserApiKey === null
        ? undefined
        : state.externalUserApiKey;
  state.registrationRequired = Boolean(payload.registrationRequired);
  syncCreditIssueStateWithBalance();
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
      preferredVoiceId: getSelectedVoiceId(),
      userAgent: navigator.userAgent
    })
  });

  applyBrowserSessionPayload(payload);

  await saveRegistrationState(state.browserSessionId, {
    assistantSessionId: state.assistantSessionId,
    externalUser: state.currentUser,
    externalUserApiKey: state.externalUserApiKey,
    preferredVoiceId: state.preferredVoiceId,
    preferredVoiceName: state.preferredVoiceName
  });
  render();
}

async function persistBrowserProfilePreferences() {
  if (!state.browserSessionId) {
    return;
  }

  if (
    state.registrationRequired ||
    !state.serverOnline ||
    !state.externalUserApiKey ||
    !state.assistantSessionId
  ) {
    await syncBrowserSession();
    return;
  }

  const payload = await fetchJson<BrowserSessionPayload>(
    "/api/browser-sessions/profile",
    {
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
        displayName: state.currentUser?.displayName ?? "",
        email: state.currentUser?.email ?? "",
        username: state.currentUser?.username ?? "",
        preferredLanguage: languageSelect?.value ?? "auto",
        preferredVoiceId: getSelectedVoiceId()
      })
    }
  );

  applyBrowserSessionPayload(payload);

  await saveRegistrationState(state.browserSessionId, {
    assistantSessionId: state.assistantSessionId,
    externalUser: state.currentUser,
    externalUserApiKey: state.externalUserApiKey,
    preferredVoiceId: state.preferredVoiceId,
    preferredVoiceName: state.preferredVoiceName
  });
  render();
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

    applyBrowserSessionPayload(payload);
    state.preferredVoiceId = getSelectedVoiceId();
    state.preferredVoiceName = getSelectedVoiceName();
    state.accountEditorOpen = false;
    await saveRegistrationState(state.browserSessionId, {
      assistantSessionId: state.assistantSessionId,
      externalUser: state.currentUser,
      externalUserApiKey: state.externalUserApiKey,
      preferredVoiceId: state.preferredVoiceId,
      preferredVoiceName: state.preferredVoiceName
    });
    appendLog(
      "system",
      isRegistrationFlow
        ? payload.starterCreditsGranted && payload.starterCreditsGranted > 0
          ? `Registration completed. ${formatCreditsLabel(payload.starterCreditsGranted)} are ready to use.`
          : "Registration completed. You can now analyze documents and start voice chat."
        : "Account details updated for this client session."
    );
    await refreshAll();
  } catch (error) {
    console.error("Failed to save Structure Queries account profile", error);
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

async function openSamsarClientLogin() {
  if (!state.browserSessionId || state.registrationRequired) {
    return;
  }

  state.loginLinkSubmitting = true;
  render();

  try {
    const payload = await fetchJson<BrowserSessionLoginLinkPayload>(
      "/api/browser-sessions/login-link",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          browserSessionId: state.browserSessionId,
          externalUser: state.currentUser,
          externalUserApiKey: state.externalUserApiKey,
          extensionId: state.extensionId,
          preferredLanguage: languageSelect?.value ?? "auto",
          preferredVoiceId: getSelectedVoiceId(),
          userAgent: navigator.userAgent
        })
      }
    );

    if (payload.externalUser !== undefined) {
      state.currentUser = payload.externalUser ?? null;
    }

    await saveRegistrationState(state.browserSessionId, {
      assistantSessionId: state.assistantSessionId,
      externalUser: state.currentUser,
      externalUserApiKey: state.externalUserApiKey,
      preferredVoiceId: state.preferredVoiceId,
      preferredVoiceName: state.preferredVoiceName
    });

    const loginUrl = readOptionalString(payload.loginUrl);

    if (!loginUrl) {
      throw new Error("Samsar login link was not returned.");
    }

    await chrome.tabs.create({
      url: loginUrl
    });
    appendLog(
      "system",
      "Opened Samsar in a new tab so you can recharge credits."
    );
  } catch (error) {
    console.error("Failed to open Samsar client login", error);
    appendLog(
      "system",
      error instanceof Error
        ? error.message
        : "Failed to create the Samsar login link."
    );
  } finally {
    state.loginLinkSubmitting = false;
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
    state.voiceWarning = undefined;
    renderVoiceOptions();
    return;
  }

  try {
    const payload = await fetchJson<VoicesPayload>("/api/voices");
    state.voices = payload.voices;
    state.voiceWarning = readOptionalString(payload.warnings?.[0]);

    for (const warning of payload.warnings ?? []) {
      console.warn("Structure Queries voices warning:", warning);
    }
  } catch (error) {
    console.error("Failed to fetch voices", error);
    state.voices = [];
    state.voiceWarning =
      error instanceof Error ? error.message : "Failed to fetch voices.";
  }

  renderVoiceOptions();
}

function closeWebSocketSession(input?: {
  phase?: WebSocketPhase;
  detail?: string;
}) {
  clearResumeConversationTimer();
  stopAssistantPlayback();
  stopVoicePreviewPlayback();

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
  state.websocketPhase = input?.phase ?? "idle";
  state.websocketDetail = input?.detail ?? "Idle";
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
  const message = normalizeRecordingError(error);

  if (isInsufficientCreditsMessage(message)) {
    showInsufficientCreditsState(message);
    return;
  }

  closeWebSocketSession({
    phase: "error",
    detail: "Voice chat stopped"
  });
  render();
  appendLog("system", message);
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

  state.websocketPhase = "ready";
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
  stopVoicePreviewPlayback();

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
  stopVoicePreviewPlayback();
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
    state.websocketPhase = normalizeWebSocketPhase(phase);
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
    state.websocketPhase = "ready";
    state.websocketDetail = "Connected";
    state.currentTemplateId =
      typeof payload.templateId === "string"
        ? payload.templateId
        : state.currentTemplateId;
    render();
    return;
  }

  if (payload.type === "voice_updated") {
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
        "Image response"
      );
    }

    return;
  }

  if (payload.type === "error") {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Unexpected websocket error.";
    const code =
      typeof payload.code === "string" ? payload.code : undefined;

    if (
      code === "insufficient_credits" ||
      isInsufficientCreditsMessage(message)
    ) {
      showInsufficientCreditsState(message);
      return;
    }

    state.websocketPhase = "error";
    state.websocketDetail = message;
    appendLog("system", message);

    if (state.conversationActive) {
      scheduleConversationResume(600);
    }

    render();
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
  state.websocketPhase = "connected";
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
        state.websocketPhase = "idle";
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
      state.websocketPhase = "connected";
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
  await submitRecordedAudioBase64(
    base64FromBytes(bytes),
    blob.type || "audio/webm"
  );
}

async function submitRecordedAudioBase64(
  audioBase64: string,
  mimeType: string,
  durationMs?: number
) {
  const socket = await ensureWebSocketSession();

  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("Voice session is not connected.");
  }

  assistantAudioReceivedForTurn = false;
  state.recording = false;
  state.websocketPhase = "transcribing";
  state.websocketDetail = "Processing audio...";
  render();

  sendSocketMessage({
    type: "submit_audio",
    audioBase64,
    durationMs,
    mimeType,
    language: languageSelect?.value ?? "auto",
    templateId: state.currentTemplateId,
    voiceId: getSelectedVoiceId()
  });
}

function normalizeRecordingError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone access was blocked or dismissed. Allow it for this page, then try Start voice again.";
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
          "Chrome is currently blocking microphone access for this extension. Open the extension site settings, allow Microphone, then click Start voice again."
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

  stopVoicePreviewPlayback();
  state.conversationActive = true;
  state.websocketPhase = "connected";
  state.websocketDetail = "Starting...";
  render();

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
  state.websocketPhase = "idle";
  state.websocketDetail = "Stopped";
  stopAssistantPlayback();
  render();

  try {
    await stopPageRecordingCapture();
  } finally {
    closeWebSocketSession({
      phase: "idle",
      detail: "Stopped"
    });
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
        externalUserApiKey: state.externalUserApiKey,
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
        "Page ready for QA."
      );
      await ensureWebSocketSession();
    }
  } catch (error) {
    console.error("Failed to analyze document", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze document.";

    if (isInsufficientCreditsMessage(message)) {
      showInsufficientCreditsState(message);
    } else {
      appendLog("system", message);
    }
  } finally {
    state.isAnalyzing = false;
    render();
  }
}

async function refreshAll() {
  const previousPageUrl = state.currentPage?.url;

  try {
    const extensionSession = await getExtensionSession();

    state.browserSessionId = extensionSession.browserSessionId;
    state.extensionId = extensionSession.extensionId;

    await loadRegistrationState();
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

    if (state.serverOnline) {
      await syncBrowserSession();
    }

    await refreshIndexStatus();
  } catch (error) {
    console.error("Failed to refresh popup state", error);
  } finally {
    state.isInitializing = false;
    render();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (
    message?.type === "OFFSCREEN_RECORDING_STARTED" ||
    message?.type === "PAGE_RECORDING_STARTED"
  ) {
    state.recording = true;
    state.websocketPhase = "ready";
    state.websocketDetail = "Listening...";
    render();
    return false;
  }

  if (message?.type === "PAGE_RECORDING_STOPPED") {
    state.recording = false;
    state.websocketPhase = "transcribing";
    state.websocketDetail = "Processing audio...";
    render();
    return false;
  }

  if (
    message?.type === "OFFSCREEN_AUDIO_READY" ||
    message?.type === "PAGE_AUDIO_READY"
  ) {
    void submitRecordedAudioBase64(
      typeof message.audioBase64 === "string" ? message.audioBase64 : "",
      typeof message.mimeType === "string" ? message.mimeType : "audio/webm",
      typeof message.durationMs === "number" ? message.durationMs : undefined
    ).catch((error) => {
      console.error("Failed to submit recorded audio", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit recorded audio.";

      if (isInsufficientCreditsMessage(message)) {
        showInsufficientCreditsState(message);
        return;
      }

      appendLog("system", message);
    });
    return false;
  }

  if (message?.type === "PAGE_RECORDING_CANCELLED") {
    state.recording = false;
    state.websocketPhase = state.conversationActive ? "ready" : "idle";
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
    state.websocketPhase = "error";
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

samsarLoginButton?.addEventListener("click", () => {
  void openSamsarClientLogin();
});

creditWarningButton?.addEventListener("click", () => {
  void openSamsarClientLogin();
});

voiceToggleButton?.addEventListener("click", () => {
  if (state.conversationActive || state.recording || state.assistantSpeaking) {
    void stopRecording();
    return;
  }

  void startRecording().catch((error) => {
    console.error("Failed to start recording", error);
    appendLog(
      "system",
      normalizeRecordingError(error)
    );
  });
});

closeOverlayButton?.addEventListener("click", () => {
  requestOverlayClose();
});

voicePreviewButton?.addEventListener("click", () => {
  void toggleVoicePreviewPlayback().catch((error) => {
    console.error("Failed to play speaker preview", error);
    appendLog(
      "system",
      error instanceof Error ? error.message : "Failed to play speaker preview."
    );
  });
});

voiceSelect?.addEventListener("change", () => {
  state.preferredVoiceId = getSelectedVoiceId();
  state.preferredVoiceName = getSelectedVoiceName();
  stopVoicePreviewPlayback();
  renderVoicePreviewButton();

  void savePreferredVoicePreference().catch((error) => {
    console.error("Failed to persist preferred speaker", error);
  });

  if (activeSocket?.readyState === WebSocket.OPEN) {
    sendSocketMessage({
      type: "set_voice",
      voiceId: getSelectedVoiceId()
    });
  }

  void persistBrowserProfilePreferences().catch((error) => {
    console.error("Failed to update preferred speaker", error);
  });
});

languageSelect?.addEventListener("change", () => {
  void persistBrowserProfilePreferences().catch((error) => {
    console.error("Failed to update browser session", error);
  });
});

window.addEventListener("pagehide", () => {
  stopVoicePreviewPlayback();
  void stopRecording();
});

window.addEventListener("focus", () => {
  if (
    state.creditIssueMessage &&
    state.serverOnline &&
    !state.registrationRequired
  ) {
    void syncBrowserSession().catch((error) => {
      console.error("Failed to refresh browser session after recharge", error);
    });
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    requestOverlayClose();
  }
});

resetConversationLog();
void refreshAll();
