export {};

declare const __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__: string;
declare const __STRUCTUREDQUERIES_SERVER_WS_URL__: string;

const SERVER_HTTP_ORIGIN = __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__;
const SERVER_WS_URL = __STRUCTUREDQUERIES_SERVER_WS_URL__;
const ANALYZED_PAGES_STORAGE_KEY = "structuredqueries.analyzedPages";
const REGISTRATION_STORAGE_KEY = "structuredqueries.registration";
const PREPARE_PAGE_SETTINGS_STORAGE_KEY = "structuredqueries.preparePageSettings";
const PREPARE_PAGE_REQUESTS_STORAGE_KEY = "structuredqueries.preparePageRequests";
const LEGACY_ANALYZED_PAGES_STORAGE_KEY = "telepathy.analyzedPages";
const LEGACY_REGISTRATION_STORAGE_KEY = "telepathy.registration";
const STARTER_CREDITS = 50;
const LOW_CREDIT_WARNING_THRESHOLD = 100;
const CONVERSATION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const NOTIFICATION_DURATION_MS = 6_000;
const DEFAULT_PREPARE_PAGE_MAX_CREDITS = 20;
const MIN_PREPARE_PAGE_MAX_CREDITS = 1;
const MAX_PREPARE_PAGE_MAX_CREDITS = 100;
const creditCountFormatter = new Intl.NumberFormat();

interface ExtensionSessionPayload {
  ok: boolean;
  browserSessionId: string;
  extensionId: string;
  tabId?: number | null;
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
  preferredLanguage?: string;
  preferredVoiceId?: string;
  preferredVoiceName?: string;
}

interface PreparePageSettingsPayload {
  maxPrepareCredits?: number;
}

interface PreparePageRequestCacheEntry {
  requestId: string;
  browserSessionId?: string;
  url: string;
  title?: string;
  templateId?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
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
  status?: string;
  reason?: string;
  analysisAvailable?: boolean;
  templateId?: string;
  requestId?: string;
  error?: string | null;
  code?: string | null;
  creditsRemaining?: number | null;
  recordCount?: number | null;
  lastAnalyzedAt?: string | null;
}

interface AnalyzePayload {
  ok: boolean;
  prepareRequestId?: string;
  prepareStatus?: string;
  analysisAvailable?: boolean;
  analysis?: {
    templateId?: string;
    status?: string;
    source?: string;
    raw?: {
      creditsRemaining?: number | null;
    };
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
type NotificationAction = "recharge";
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
  hostTabId?: number;
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
  creditBannerDismissed: boolean;
  preferredVoiceId?: string;
  preferredVoiceName?: string;
  voicePreviewState: "idle" | "loading" | "playing";
  voicePreviewVoiceId?: string;
  notificationMessage?: string;
  notificationAction?: NotificationAction;
  pendingAssistantText?: string;
  pendingAssistantLanguage?: string;
  currentPrepareRequestId?: string;
  currentPrepareStatus?: string;
  conversationActive: boolean;
  assistantSpeaking: boolean;
  recording: boolean;
  maxPrepareCredits: number;
}

const accountButton = document.querySelector<HTMLButtonElement>("#account-button");
const accountNameNode = document.querySelector<HTMLElement>("#account-name");
const accountHintNode = document.querySelector<HTMLElement>("#account-hint");
const accountEmailNode = document.querySelector<HTMLElement>("#account-email");
const accountUsernameNode =
  document.querySelector<HTMLElement>("#account-username");
const accountUserIdNode =
  document.querySelector<HTMLElement>("#account-user-id");
const overlayCloseButtons =
  document.querySelectorAll<HTMLButtonElement>("[data-overlay-close-button]");
const headerCreditsNode = document.querySelector<HTMLElement>("#header-credits");
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
const prepareMaxCreditsInput =
  document.querySelector<HTMLInputElement>("#prepare-max-credits-input");
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
const surfaceStatusNode =
  document.querySelector<HTMLElement>("#surface-status");
const creditWarningNode =
  document.querySelector<HTMLElement>("#credit-warning");
const creditWarningMessageNode =
  document.querySelector<HTMLElement>("#credit-warning-message");
const creditWarningButton =
  document.querySelector<HTMLButtonElement>("#credit-warning-button");
const creditWarningDismissButton =
  document.querySelector<HTMLButtonElement>("#credit-warning-dismiss-button");
const notificationNode =
  document.querySelector<HTMLElement>("#notification-banner");
const notificationMessageNode =
  document.querySelector<HTMLElement>("#notification-message");
const notificationActionButton =
  document.querySelector<HTMLButtonElement>("#notification-action");
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
  creditBannerDismissed: false,
  preferredVoiceId: undefined,
  preferredVoiceName: undefined,
  voicePreviewState: "idle",
  voicePreviewVoiceId: undefined,
  notificationMessage: undefined,
  notificationAction: undefined,
  conversationActive: false,
  pendingAssistantLanguage: undefined,
  assistantSpeaking: false,
  recording: false,
  maxPrepareCredits: DEFAULT_PREPARE_PAGE_MAX_CREDITS
};

let activeSocket: WebSocket | undefined;
let activeSocketPromise: Promise<WebSocket> | undefined;
let activeAssistantAudio: HTMLAudioElement | undefined;
let activeAssistantAudioObjectUrl: string | undefined;
let activeVoicePreviewAudio: HTMLAudioElement | undefined;
let activeAnalyzeRequestController: AbortController | undefined;
let resumeConversationTimer: number | undefined;
let conversationIdleTimer: number | undefined;
let notificationTimer: number | undefined;
let prepareStatusPollTimer: number | undefined;
let assistantAudioReceivedForTurn = false;
let creditsRefreshPending = false;

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

function readOptionalString(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : undefined;
  return trimmed ? trimmed : undefined;
}

function normalizePreparePageCreditCap(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PREPARE_PAGE_MAX_CREDITS;
  }

  return Math.max(
    MIN_PREPARE_PAGE_MAX_CREDITS,
    Math.min(MAX_PREPARE_PAGE_MAX_CREDITS, Math.floor(parsed))
  );
}

function getErrorCode(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim()
      ? error.code.trim()
      : undefined
  );
}

function getErrorStatus(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined
  );
}

function isAbortError(error: unknown) {
  return Boolean(
    (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
  );
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

    if (state.notificationAction === "recharge") {
      clearNotificationTimer();
      state.notificationMessage = undefined;
      state.notificationAction = undefined;
    }
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

function getPreferredLanguageFromUser(
  user?: StructureQueriesExternalUserPayload | null
) {
  const browserInstallation = user?.browserInstallation;

  if (!browserInstallation || typeof browserInstallation !== "object") {
    return undefined;
  }

  const installation = browserInstallation as Record<string, unknown>;

  return (
    readOptionalString(
      typeof installation.preferred_language === "string"
        ? installation.preferred_language
        : undefined
    ) ??
    readOptionalString(
      typeof installation.preferredLanguage === "string"
        ? installation.preferredLanguage
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

function clearConversationIdleTimer() {
  if (typeof conversationIdleTimer === "number") {
    window.clearTimeout(conversationIdleTimer);
  }

  conversationIdleTimer = undefined;
}

function clearNotificationTimer() {
  if (typeof notificationTimer === "number") {
    window.clearTimeout(notificationTimer);
  }

  notificationTimer = undefined;
}

function clearPrepareStatusPollTimer() {
  if (typeof prepareStatusPollTimer === "number") {
    window.clearTimeout(prepareStatusPollTimer);
  }

  prepareStatusPollTimer = undefined;
}

function abortActiveAnalyzeRequest() {
  if (activeAnalyzeRequestController) {
    activeAnalyzeRequestController.abort();
    activeAnalyzeRequestController = undefined;
  }
}

function hideNotification() {
  clearNotificationTimer();

  if (!state.notificationMessage && !state.notificationAction) {
    return;
  }

  state.notificationMessage = undefined;
  state.notificationAction = undefined;
  render();
}

function showNotification(
  message: string,
  durationMs = NOTIFICATION_DURATION_MS,
  action?: NotificationAction
) {
  clearNotificationTimer();
  state.notificationMessage = message;
  state.notificationAction = action;
  render();

  if (durationMs <= 0) {
    return;
  }

  notificationTimer = window.setTimeout(() => {
    notificationTimer = undefined;

    if (state.notificationMessage !== message) {
      return;
    }

    state.notificationMessage = undefined;
    state.notificationAction = undefined;
    render();
  }, durationMs);
}

function resetConversationIdleTimer() {
  clearConversationIdleTimer();

  if (!state.conversationActive && !state.recording && !state.assistantSpeaking) {
    return;
  }

  conversationIdleTimer = window.setTimeout(() => {
    void stopConversationMode({
      detail: "Idle timeout",
      logMessage: "Voice turned off after 10 minutes idle. Start voice when you're ready.",
      notificationMessage:
        "You've been idle for 10 minutes. Start voice when you're ready."
    });
  }, CONVERSATION_IDLE_TIMEOUT_MS);
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

function resumeConversationAfterVoicePreview() {
  if (!state.conversationActive || state.recording || state.assistantSpeaking) {
    return;
  }

  scheduleConversationResume(100);
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

    resumeConversationAfterVoicePreview();
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

async function requestOverlayClose() {
  stopVoicePreviewPlayback();
  await stopRecording();

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

function syncPreparePageCreditCapInput() {
  if (!prepareMaxCreditsInput) {
    return;
  }

  prepareMaxCreditsInput.value = String(state.maxPrepareCredits);
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

function dismissCreditBanner(event?: Event) {
  event?.preventDefault();
  event?.stopPropagation();
  state.creditBannerDismissed = true;

  if (creditWarningNode) {
    creditWarningNode.hidden = true;
    creditWarningNode.style.display = "none";
  }

  render();
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
        ? "Structure Queries"
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

function getSelectedLanguage() {
  return readOptionalString(languageSelect?.value) ?? "auto";
}

function setSelectedLanguage(language?: string | null) {
  if (!languageSelect) {
    return;
  }

  const nextLanguage = readOptionalString(language) ?? "auto";

  if (
    Array.from(languageSelect.options).some(
      (option) => option.value === nextLanguage
    )
  ) {
    languageSelect.value = nextLanguage;
  }
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

function syncLanguagePreferenceToSocket() {
  if (activeSocket?.readyState !== WebSocket.OPEN) {
    return;
  }

  sendSocketMessage({
    type: "set_language",
    language: getSelectedLanguage()
  });
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
  const voiceBusy = state.recording || state.assistantSpeaking;

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
  const lowCreditsActive =
    !state.registrationRequired &&
    creditsRemaining !== null &&
    creditsRemaining < LOW_CREDIT_WARNING_THRESHOLD;
  const creditBannerAvailable = creditIssueActive || lowCreditsActive;

  if (!creditBannerAvailable && state.creditBannerDismissed) {
    state.creditBannerDismissed = false;
  }

  const showCreditBanner =
    creditBannerAvailable && !state.creditBannerDismissed;
  const accountName =
    readOptionalString(state.currentUser?.displayName) ??
    readOptionalString(state.currentUser?.username) ??
    readOptionalString(state.currentUser?.email) ??
    (state.registrationRequired ? "Setup required" : "Structure Queries");
  const headerCreditsValue = state.registrationRequired
    ? `${STARTER_CREDITS} starter`
    : creditsRemaining === null
      ? "-- cr"
      : `${creditCountFormatter.format(creditsRemaining)} cr`;
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
  const creditBannerMessage = creditIssueActive
    ? creditsRemaining === null
      ? "Recharge needed."
      : creditsRemaining === 0
        ? "0 credits left."
        : `${creditCountFormatter.format(creditsRemaining)} credits left.`
    : lowCreditsActive && creditsRemaining !== null
      ? creditsRemaining === 0
        ? "0 credits left."
        : `${creditCountFormatter.format(creditsRemaining)} credits left.`
      : "";

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
  setText(headerCreditsNode, headerCreditsValue);
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
      ? "Register Structure Queries"
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
  setText(creditWarningMessageNode, creditBannerMessage);
  setText(notificationMessageNode, state.notificationMessage ?? "");

  if (voiceWarningNode) {
    voiceWarningNode.hidden = !state.voiceWarning;
  }

  if (creditWarningNode) {
    creditWarningNode.hidden = !showCreditBanner;
    creditWarningNode.style.display = showCreditBanner ? "" : "none";
  }

  if (notificationNode) {
    notificationNode.hidden = !state.notificationMessage;
  }

  if (notificationActionButton) {
    notificationActionButton.hidden = !state.notificationAction;
    notificationActionButton.disabled =
      state.notificationAction === "recharge" && state.loginLinkSubmitting;
    notificationActionButton.textContent =
      state.notificationAction === "recharge"
        ? state.loginLinkSubmitting
          ? "Opening..."
          : "Recharge credits"
        : "";
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
    let errorCode: string | undefined;

    try {
      const payload = (await response.json()) as {
        code?: string;
        error?: string;
        message?: string;
      };

      if (typeof payload.code === "string" && payload.code.trim()) {
        errorCode = payload.code.trim();
      }

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

    const error = new Error(errorMessage) as Error & {
      code?: string;
      status?: number;
    };
    error.code = errorCode;
    error.status = response.status;
    throw error;
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

async function sendMessageToClientTab<T>(message: RuntimeMessage) {
  const activeTab = await getActiveTab();
  const tabId =
    typeof state.hostTabId === "number" ? state.hostTabId : activeTab?.id;
  const tabUrl =
    state.currentPage?.url ??
    (typeof state.hostTabId === "number" ? undefined : activeTab?.url);

  if (typeof tabId !== "number") {
    throw new Error("No active browser tab is available.");
  }

  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch (error) {
    if (isMissingReceiverError(error) && isInjectableTabUrl(tabUrl)) {
      await chrome.scripting.executeScript({
        target: {
          tabId
        },
        files: ["content.js"]
      });

      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    }

    throw error;
  }
}

async function stopPageRecordingCapture() {
  try {
    const response = await sendMessageToClientTab<{
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

  creditsRefreshPending = false;
  if (state.currentUser) {
    state.currentUser = {
      ...state.currentUser,
      generationCredits: 0
    };
  }
  state.creditIssueMessage = issueMessage;
  state.creditBannerDismissed = false;
  void stopPageRecordingCapture();
  closeWebSocketSession({
    phase: "error",
    detail: "Recharge required"
  });
  showNotification(issueMessage, 0, "recharge");
  render();

  if (shouldAppendLog) {
    appendLog("system", issueMessage);
  }

  void saveCurrentRegistrationState().catch((error) => {
    console.error("Failed to persist depleted credit balance", error);
  });
}

async function fetchPageContext() {
  const activeTab = await getActiveTab();
  const hostTabId = typeof state.hostTabId === "number" ? state.hostTabId : undefined;

  if (!activeTab && typeof hostTabId !== "number") {
    return undefined;
  }

  let pageContext: PageContext | undefined;

  if (typeof hostTabId === "number") {
    try {
      pageContext = await requestPageContextFromTab(hostTabId);
    } catch (error) {
      if (isMissingReceiverError(error) && isInjectableTabUrl(state.currentPage?.url)) {
        try {
          await chrome.scripting.executeScript({
            target: {
              tabId: hostTabId
            },
            files: ["content.js"]
          });
          pageContext = await requestPageContextFromTab(hostTabId);
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
    title:
      pageContext?.title ??
      activeTab?.title ??
      state.currentPage?.title ??
      "Untitled page",
    url: pageContext?.url ?? state.currentPage?.url ?? activeTab?.url,
    documentLanguage:
      pageContext?.documentLanguage ?? state.currentPage?.documentLanguage
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

async function getPreparePageRequestsCache() {
  const stored = await chrome.storage.local.get(PREPARE_PAGE_REQUESTS_STORAGE_KEY);
  const cache = stored[PREPARE_PAGE_REQUESTS_STORAGE_KEY];

  if (!cache || typeof cache !== "object") {
    return {} as Record<string, PreparePageRequestCacheEntry>;
  }

  return cache as Record<string, PreparePageRequestCacheEntry>;
}

async function savePendingPreparePageRequest(
  url: string,
  entry: PreparePageRequestCacheEntry
) {
  const cache = await getPreparePageRequestsCache();
  cache[normalizeUrl(url)] = entry;
  await chrome.storage.local.set({
    [PREPARE_PAGE_REQUESTS_STORAGE_KEY]: cache
  });
}

async function removePendingPreparePageRequest(
  url: string,
  requestId?: string
) {
  const cache = await getPreparePageRequestsCache();
  const normalizedUrl = normalizeUrl(url);
  const existing = cache[normalizedUrl];

  if (!existing) {
    return;
  }

  if (requestId && existing.requestId !== requestId) {
    return;
  }

  delete cache[normalizedUrl];
  await chrome.storage.local.set({
    [PREPARE_PAGE_REQUESTS_STORAGE_KEY]: cache
  });
}

async function getPendingPreparePageRequest(url: string) {
  const cache = await getPreparePageRequestsCache();
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

async function loadPreparePageSettings() {
  const stored = await chrome.storage.local.get(PREPARE_PAGE_SETTINGS_STORAGE_KEY);
  const payload = stored[PREPARE_PAGE_SETTINGS_STORAGE_KEY];

  if (!payload || typeof payload !== "object") {
    state.maxPrepareCredits = DEFAULT_PREPARE_PAGE_MAX_CREDITS;
    syncPreparePageCreditCapInput();
    return;
  }

  state.maxPrepareCredits = normalizePreparePageCreditCap(
    (payload as PreparePageSettingsPayload).maxPrepareCredits
  );
  syncPreparePageCreditCapInput();
}

async function savePreparePageSettings() {
  await chrome.storage.local.set({
    [PREPARE_PAGE_SETTINGS_STORAGE_KEY]: {
      maxPrepareCredits: state.maxPrepareCredits
    } satisfies PreparePageSettingsPayload
  });
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
    preferredLanguage: getSelectedLanguage(),
    preferredVoiceId: state.preferredVoiceId,
    preferredVoiceName: state.preferredVoiceName
  });
}

async function saveCurrentRegistrationState() {
  if (!state.browserSessionId) {
    return;
  }

  await saveRegistrationState(state.browserSessionId, {
    assistantSessionId: state.assistantSessionId,
    externalUser: state.currentUser,
    externalUserApiKey: state.externalUserApiKey,
    preferredLanguage: getSelectedLanguage(),
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
  setSelectedLanguage(
    registration?.preferredLanguage ??
      getPreferredLanguageFromUser(registration?.externalUser)
  );
  state.registrationRequired = !(
    state.externalUserApiKey && state.assistantSessionId
  );
  syncCreditIssueStateWithBalance();
  syncRegistrationForm();
}

function updatePreparePageCreditCapFromInput() {
  const nextValue = normalizePreparePageCreditCap(
    prepareMaxCreditsInput?.value ?? state.maxPrepareCredits
  );

  state.maxPrepareCredits = nextValue;
  syncPreparePageCreditCapInput();
  render();

  void savePreparePageSettings().catch((error) => {
    console.error("Failed to persist prepare page settings", error);
  });
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
  const preferredLanguage = getPreferredLanguageFromUser(state.currentUser);
  if (preferredLanguage) {
    setSelectedLanguage(preferredLanguage);
  }
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
      preferredLanguage: getSelectedLanguage(),
      preferredVoiceId: getSelectedVoiceId(),
      userAgent: navigator.userAgent
    })
  });

  applyBrowserSessionPayload(payload);

  await saveCurrentRegistrationState();
  render();
}

async function refreshCreditsAfterRequest() {
  if (
    !state.serverOnline ||
    state.registrationRequired ||
    !state.browserSessionId
  ) {
    return;
  }

  await syncBrowserSession();
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
        preferredLanguage: getSelectedLanguage(),
        preferredVoiceId: getSelectedVoiceId()
      })
    }
  );

  applyBrowserSessionPayload(payload);

  await saveRegistrationState(state.browserSessionId, {
    assistantSessionId: state.assistantSessionId,
    externalUser: state.currentUser,
    externalUserApiKey: state.externalUserApiKey,
    preferredLanguage: getSelectedLanguage(),
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
        preferredLanguage: getSelectedLanguage(),
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
      preferredLanguage: getSelectedLanguage(),
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
          preferredLanguage: getSelectedLanguage(),
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
      preferredLanguage: getSelectedLanguage(),
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
  clearConversationIdleTimer();
  stopAssistantPlayback();
  stopVoicePreviewPlayback();

  if (activeSocket) {
    activeSocket.close();
  }

  activeSocket = undefined;
  activeSocketPromise = undefined;
  assistantAudioReceivedForTurn = false;
  creditsRefreshPending = false;
  state.conversationActive = false;
  state.recording = false;
  state.assistantSpeaking = false;
  state.websocketState = "disconnected";
  state.websocketPhase = input?.phase ?? "idle";
  state.websocketDetail = input?.detail ?? "Idle";
  state.pendingAssistantText = undefined;
  state.pendingAssistantLanguage = undefined;
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

async function syncCreditsRemainingFromPrepareRequest(creditsRemaining: unknown) {
  const parsedCredits = Number(creditsRemaining);

  if (!state.currentUser || !Number.isFinite(parsedCredits)) {
    return false;
  }

  state.currentUser = {
    ...state.currentUser,
    generationCredits: Math.max(0, Math.floor(parsedCredits))
  };
  syncCreditIssueStateWithBalance();
  await saveCurrentRegistrationState();
  return true;
}

function setCurrentPrepareRequest(
  request: PreparePageRequestCacheEntry | null | undefined
) {
  state.currentPrepareRequestId = request?.requestId;
  state.currentPrepareStatus = request?.status;
}

async function finalizePreparedPage(input: {
  url: string;
  requestId: string;
  templateId?: string;
  creditsRemaining?: number | null;
  connectSocket?: boolean;
  logMessage?: string;
}) {
  clearPrepareStatusPollTimer();
  setCurrentPrepareRequest(null);
  state.isAnalyzing = false;
  state.analysisReady = true;
  state.currentTemplateId = input.templateId ?? state.currentTemplateId;

  await markPageAnalyzed(input.url, {
    analyzed: true,
    templateId: state.currentTemplateId
  });
  await removePendingPreparePageRequest(input.url, input.requestId);

  const creditsPersisted = await syncCreditsRemainingFromPrepareRequest(
    input.creditsRemaining
  );

  if (!creditsPersisted) {
    await refreshCreditsAfterRequest();
  }

  render();

  if (input.logMessage) {
    appendLog("system", input.logMessage);
  }

  if (input.connectSocket) {
    void ensureWebSocketSession().catch((error) => {
      console.error("Failed to prime websocket session after prepare-page", error);
    });
  }
}

async function failPreparedPage(input: {
  url: string;
  requestId: string;
  message?: string | null;
  code?: string | null;
  creditsRemaining?: number | null;
}) {
  clearPrepareStatusPollTimer();
  setCurrentPrepareRequest(null);
  state.isAnalyzing = false;
  await removePendingPreparePageRequest(input.url, input.requestId);

  const message =
    readOptionalString(input.message) ?? "Failed to prepare this page.";

  if (
    input.code === "insufficient_credits" ||
    isInsufficientCreditsMessage(message)
  ) {
    showInsufficientCreditsState(message);
    return;
  }

  await syncCreditsRemainingFromPrepareRequest(input.creditsRemaining);
  render();
  appendLog("system", message);
}

function schedulePendingPreparePageStatusPoll(delayMs = 2_500) {
  clearPrepareStatusPollTimer();

  if (
    !state.serverOnline ||
    !state.currentPage?.url ||
    !state.currentPrepareRequestId
  ) {
    return;
  }

  prepareStatusPollTimer = window.setTimeout(() => {
    prepareStatusPollTimer = undefined;
    void reconcilePendingPreparePageRequest().catch((error) => {
      console.error("Failed to reconcile pending prepare-page request", error);
    });
  }, delayMs);
}

async function reconcilePendingPreparePageRequest(
  pendingRequest?: PreparePageRequestCacheEntry
) {
  const currentPageUrl = state.currentPage?.url;

  if (!currentPageUrl) {
    clearPrepareStatusPollTimer();
    setCurrentPrepareRequest(null);
    state.isAnalyzing = false;
    return;
  }

  const activeRequest =
    pendingRequest ?? (await getPendingPreparePageRequest(currentPageUrl));

  if (!activeRequest) {
    clearPrepareStatusPollTimer();
    setCurrentPrepareRequest(null);
    state.isAnalyzing = false;
    return;
  }

  if (
    activeRequest.browserSessionId &&
    state.browserSessionId &&
    activeRequest.browserSessionId !== state.browserSessionId
  ) {
    await removePendingPreparePageRequest(currentPageUrl, activeRequest.requestId);
    clearPrepareStatusPollTimer();
    setCurrentPrepareRequest(null);
    state.isAnalyzing = false;
    return;
  }

  state.isAnalyzing = true;
  setCurrentPrepareRequest(activeRequest);
  render();

  if (!state.serverOnline) {
    return;
  }

  try {
    const query = new URLSearchParams({
      requestId: activeRequest.requestId,
      url: currentPageUrl
    });

    if (activeRequest.templateId) {
      query.set("templateId", activeRequest.templateId);
    }

    const payload = await fetchJson<PageStatusPayload>(
      `/api/webpages/status?${query.toString()}`
    );
    const nextTemplateId = payload.templateId ?? activeRequest.templateId;
    const nextStatus =
      readOptionalString(payload.status) ?? activeRequest.status ?? "pending";

    if (payload.analysisAvailable && nextTemplateId) {
      await finalizePreparedPage({
        url: currentPageUrl,
        requestId: payload.requestId ?? activeRequest.requestId,
        templateId: nextTemplateId,
        creditsRemaining: payload.creditsRemaining,
        logMessage: "Page ready for QA."
      });
      return;
    }

    if (
      nextStatus === "failed" ||
      payload.reason === "prepare_request_failed" ||
      payload.code === "insufficient_credits"
    ) {
      await failPreparedPage({
        url: currentPageUrl,
        requestId: activeRequest.requestId,
        message: payload.error,
        code: payload.code,
        creditsRemaining: payload.creditsRemaining
      });
      return;
    }

    const updatedRequest: PreparePageRequestCacheEntry = {
      ...activeRequest,
      requestId: payload.requestId ?? activeRequest.requestId,
      templateId: nextTemplateId,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    await savePendingPreparePageRequest(currentPageUrl, updatedRequest);
    state.isAnalyzing = true;
    setCurrentPrepareRequest(updatedRequest);
    render();
    schedulePendingPreparePageStatusPoll();
  } catch (error) {
    const status = getErrorStatus(error);

    if (status === 404) {
      await failPreparedPage({
        url: currentPageUrl,
        requestId: activeRequest.requestId,
        message:
          "The previous prepare-page request could not be resumed. Start it again."
      });
      return;
    }

    console.error("Failed to refresh pending prepare-page request", error);
    state.isAnalyzing = true;
    setCurrentPrepareRequest(activeRequest);
    render();
    schedulePendingPreparePageStatusPoll(4_000);
  }
}

async function restorePendingPreparePageRequest() {
  clearPrepareStatusPollTimer();
  setCurrentPrepareRequest(null);
  state.isAnalyzing = false;

  if (!state.currentPage?.url) {
    return;
  }

  const pendingRequest = await getPendingPreparePageRequest(state.currentPage.url);

  if (!pendingRequest) {
    return;
  }

  state.isAnalyzing = true;
  setCurrentPrepareRequest(pendingRequest);
  render();
  await reconcilePendingPreparePageRequest(pendingRequest);
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

async function stopConversationMode(input?: {
  detail?: string;
  logMessage?: string;
  notificationMessage?: string;
}) {
  if (!state.conversationActive && !state.recording && !state.assistantSpeaking) {
    return;
  }

  clearResumeConversationTimer();
  clearConversationIdleTimer();
  state.conversationActive = false;
  state.recording = false;
  state.websocketPhase = "idle";
  state.websocketDetail = input?.detail ?? "Stopped";
  stopAssistantPlayback();
  render();

  try {
    await stopPageRecordingCapture();
  } finally {
    closeWebSocketSession({
      phase: "idle",
      detail: input?.detail ?? "Stopped"
    });
    render();
  }

  if (input?.logMessage) {
    appendLog("system", input.logMessage);
  }

  if (input?.notificationMessage) {
    showNotification(input.notificationMessage);
  }
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
  const response = await sendMessageToClientTab<{
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

function chooseLocalSpeechVoice(language?: string | null) {
  const availableVoices = window.speechSynthesis.getVoices();
  const preferredLanguage = readOptionalString(language) ?? getSelectedLanguage();

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

function speakLocally(text: string, language?: string | null) {
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
    const voice = chooseLocalSpeechVoice(language);

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
      if (creditsRefreshPending) {
        creditsRefreshPending = false;
        void refreshCreditsAfterRequest().catch((error) => {
          console.error("Failed to refresh credits after voice turn", error);
        });
      }

      if (state.pendingAssistantText) {
        const localSpeechText = state.pendingAssistantText;
        const localSpeechLanguage = state.pendingAssistantLanguage;
        state.pendingAssistantText = undefined;
        state.pendingAssistantLanguage = undefined;

        if (state.conversationActive && !assistantAudioReceivedForTurn) {
          void speakLocally(localSpeechText, localSpeechLanguage)
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
    const nextVoiceId = readOptionalString(payload.voiceId);
    const matchingVoice = nextVoiceId
      ? state.voices.find((voice) => voice.voiceId === nextVoiceId)
      : undefined;

    state.preferredVoiceId = nextVoiceId;
    if (matchingVoice) {
      state.preferredVoiceName = matchingVoice.name;
    }

    if (
      voiceSelect &&
      Array.from(voiceSelect.options).some(
        (option) => option.value === (nextVoiceId ?? "")
      )
    ) {
      voiceSelect.value = nextVoiceId ?? "";
    }

    renderVoicePreviewButton();
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
    state.pendingAssistantLanguage = readOptionalString(payload.language);
    appendLog("assistant", text);
    return;
  }

  if (payload.type === "assistant_audio") {
    const audioBase64 =
      typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
    const mimeType =
      typeof payload.mimeType === "string" ? payload.mimeType : "audio/mpeg";

    if (!audioBase64) {
      console.warn("Assistant audio event did not include audio data.");
      return;
    }

    const fallbackText = state.pendingAssistantText;
    const fallbackLanguage =
      readOptionalString(payload.language) ?? state.pendingAssistantLanguage;
    state.pendingAssistantText = undefined;
    state.pendingAssistantLanguage = undefined;
    assistantAudioReceivedForTurn = true;

    if (audioBase64 && state.conversationActive) {
      void playAssistantAudio(audioBase64, mimeType)
        .catch((error) => {
          console.error("Failed to play assistant audio", error);

          if (fallbackText && state.conversationActive) {
            return speakLocally(fallbackText, fallbackLanguage);
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
        clearConversationIdleTimer();
        state.conversationActive = false;
        state.recording = false;
        state.assistantSpeaking = false;
        state.pendingAssistantText = undefined;
        state.pendingAssistantLanguage = undefined;
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
        language: getSelectedLanguage(),
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
  creditsRefreshPending = true;
  render();

  sendSocketMessage({
    type: "submit_audio",
    audioBase64,
    durationMs,
    mimeType,
    language: getSelectedLanguage(),
    templateId: state.currentTemplateId
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
  hideNotification();
  state.conversationActive = true;
  state.websocketPhase = "connected";
  state.websocketDetail = "Starting...";
  render();

  try {
    await startConversationTurn();
    resetConversationIdleTimer();
  } catch (error) {
    clearConversationIdleTimer();
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
  await stopConversationMode({
    detail: "Stopped"
  });
}

async function analyzeCurrentPage() {
  if (!state.browserSessionId || !state.currentPage?.url) {
    return;
  }

  updatePreparePageCreditCapFromInput();

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

  const requestId = crypto.randomUUID();
  const pendingRequest: PreparePageRequestCacheEntry = {
    requestId,
    browserSessionId: state.browserSessionId,
    url: state.currentPage.url,
    title: state.currentPage.title,
    status: "crawling",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await savePendingPreparePageRequest(state.currentPage.url, pendingRequest);
  clearPrepareStatusPollTimer();
  setCurrentPrepareRequest(pendingRequest);
  state.isAnalyzing = true;
  render();

  const controller = new AbortController();
  activeAnalyzeRequestController = controller;

  try {
    const payload = await fetchJson<AnalyzePayload>("/api/webpages/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        browserSessionId: state.browserSessionId,
        externalUserApiKey: state.externalUserApiKey,
        prepareRequestId: requestId,
        url: state.currentPage.url,
        title: state.currentPage.title,
        preferredLanguage: getSelectedLanguage(),
        preferredVoiceId: getSelectedVoiceId(),
        maxPrepareCredits: state.maxPrepareCredits
      })
    });

    const persistedRequestId = payload.prepareRequestId ?? requestId;
    const templateId =
      typeof payload.analysis?.templateId === "string"
        ? payload.analysis.templateId
        : pendingRequest.templateId;
    const prepareStatus =
      readOptionalString(payload.prepareStatus) ??
      readOptionalString(payload.analysis?.status) ??
      "pending";
    const nextPendingRequest: PreparePageRequestCacheEntry = {
      ...pendingRequest,
      requestId: persistedRequestId,
      templateId,
      status: prepareStatus,
      updatedAt: new Date().toISOString()
    };
    const creditsRemaining = Number(payload.analysis?.raw?.creditsRemaining);
    const analysisAvailable = payload.analysisAvailable ?? true;

    if (analysisAvailable && templateId) {
      await finalizePreparedPage({
        url: state.currentPage.url,
        requestId: persistedRequestId,
        templateId,
        creditsRemaining: Number.isFinite(creditsRemaining)
          ? creditsRemaining
          : null,
        connectSocket: true,
        logMessage: "Page ready for QA."
      });
      return;
    }

    await savePendingPreparePageRequest(state.currentPage.url, nextPendingRequest);
    state.isAnalyzing = true;
    setCurrentPrepareRequest(nextPendingRequest);
    render();
    schedulePendingPreparePageStatusPoll();
  } catch (error) {
    if (isAbortError(error)) {
      state.isAnalyzing = true;
      setCurrentPrepareRequest(pendingRequest);
      schedulePendingPreparePageStatusPoll();
      return;
    }

    console.error("Failed to analyze document", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze document.";
    const code = getErrorCode(error);

    await failPreparedPage({
      url: state.currentPage.url,
      requestId,
      message,
      code
    });
  } finally {
    if (activeAnalyzeRequestController === controller) {
      activeAnalyzeRequestController = undefined;
    }

    render();
  }
}

async function refreshAll() {
  const previousPageUrl = state.currentPage?.url;

  try {
    const extensionSession = await getExtensionSession();

    state.browserSessionId = extensionSession.browserSessionId;
    state.extensionId = extensionSession.extensionId;
    state.hostTabId =
      typeof extensionSession.tabId === "number"
        ? extensionSession.tabId
        : state.hostTabId;

    await loadPreparePageSettings();
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
    await restorePendingPreparePageRequest();
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
    resetConversationIdleTimer();
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
    resetConversationIdleTimer();
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
    clearConversationIdleTimer();
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

notificationActionButton?.addEventListener("click", () => {
  if (state.notificationAction === "recharge") {
    void openSamsarClientLogin();
  }
});

creditWarningDismissButton?.addEventListener("pointerdown", dismissCreditBanner);
creditWarningDismissButton?.addEventListener("click", dismissCreditBanner);

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

overlayCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    void requestOverlayClose();
  });
});

languageSelect?.addEventListener("change", () => {
  syncLanguagePreferenceToSocket();
  void persistBrowserProfilePreferences().catch((error) => {
    console.error("Failed to update browser session", error);
  });
});

prepareMaxCreditsInput?.addEventListener("change", () => {
  updatePreparePageCreditCapFromInput();
});

prepareMaxCreditsInput?.addEventListener("blur", () => {
  updatePreparePageCreditCapFromInput();
});

window.addEventListener("pagehide", () => {
  clearPrepareStatusPollTimer();
  abortActiveAnalyzeRequest();
  stopVoicePreviewPlayback();
  void stopRecording();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") {
    return;
  }

  void stopConversationMode({
    detail: "Stopped",
    logMessage: "Voice stopped when you left this tab."
  });
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
    if (state.accountEditorOpen && !state.registrationRequired) {
      closeAccountEditor();
      return;
    }

    void requestOverlayClose();
  }
});

resetConversationLog();
void refreshAll();
