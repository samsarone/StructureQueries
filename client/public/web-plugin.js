(function () {
  const SERVER_HTTP_ORIGIN = window.location.origin;
  const SERVER_WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/plugin`;
  const AUTH_TOKEN_KEY = "authToken";
  const BROWSER_SESSION_STORAGE_KEY = "structuredqueries.web.browserSessionId";
  const REGISTRATION_STORAGE_KEY = "structuredqueries.web.registration";
  const PAGE_STATE_STORAGE_KEY = "structuredqueries.web.pageState";
  const PREPARE_PAGE_SETTINGS_STORAGE_KEY = "structuredqueries.web.preparePageSettings";
  const LOW_CREDIT_WARNING_THRESHOLD = 100;
  const CONVERSATION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  const NOTIFICATION_DURATION_MS = 6_000;
  const DEFAULT_PREPARE_PAGE_MAX_CREDITS = 20;
  const MIN_PREPARE_PAGE_MAX_CREDITS = 1;
  const MAX_PREPARE_PAGE_MAX_CREDITS = 100;
  const DEFAULT_CACHING_TTL_SECONDS = 60 * 60;
  const ONE_DAY_CACHING_TTL_SECONDS = 24 * 60 * 60;
  const EMBEDDING_TEMPLATE_EXPIRED_CODE = "EMBEDDING_TEMPLATE_EXPIRED";
  const EXPIRED_PAGE_CACHE_MESSAGE =
    "This page cache expired. Prepare the page again.";
  const MIN_SPEECH_DURATION_MS = 360;
  const SILENCE_STOP_DURATION_MS = 520;
  const MIN_SIGNAL_RMS = 0.02;
  const MIN_SUSTAINED_VOICE_FRAMES = 6;
  const MIN_RECORDED_AUDIO_BYTES = 2_500;
  const VOICE_BAND_MIN_HZ = 140;
  const VOICE_BAND_MAX_HZ = 3600;
  const LOW_RUMBLE_MAX_HZ = 120;
  const HIGH_CLICK_MIN_HZ = 4200;
  const ANALYSIS_BAND_MAX_HZ = 6000;
  const MIN_VOICE_BAND_SHARE = 0.6;
  const MAX_LOW_BAND_SHARE = 0.25;
  const MAX_HIGH_BAND_SHARE = 0.18;
  const EMBED_HEIGHT_MESSAGE_TYPE = "structuredqueries:web-client-height";
  const creditCountFormatter = new Intl.NumberFormat();

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
  };

  const refs = {
    authOverlay: document.querySelector("#auth-overlay"),
    authCloseButton: document.querySelector("#auth-close-button"),
    authTitle: document.querySelector("#auth-title"),
    authSubtitle: document.querySelector("#auth-subtitle"),
    authStatus: document.querySelector("#auth-status"),
    authModeLoginButton: document.querySelector("#auth-mode-login"),
    authModeRegisterButton: document.querySelector("#auth-mode-register"),
    loginForm: document.querySelector("#login-form"),
    loginEmail: document.querySelector("#login-email"),
    loginPassword: document.querySelector("#login-password"),
    loginSubmitButton: document.querySelector("#login-submit-button"),
    registerForm: document.querySelector("#register-form"),
    registerDisplayName: document.querySelector("#register-display-name"),
    registerEmail: document.querySelector("#register-email"),
    registerUsername: document.querySelector("#register-username"),
    registerPassword: document.querySelector("#register-password"),
    registerConfirmPassword: document.querySelector("#register-confirm-password"),
    registerSubmitButton: document.querySelector("#register-submit-button"),
    advancedButton: document.querySelector("#advanced-button"),
    advancedDrawer: document.querySelector("#advanced-drawer"),
    sessionDrawer: document.querySelector("#session-drawer"),
    headerCredits: document.querySelector("#header-credits"),
    analysisPill: document.querySelector("#analysis-pill"),
    creditWarning: document.querySelector("#credit-warning"),
    creditWarningMessage: document.querySelector("#credit-warning-message"),
    creditWarningButton: document.querySelector("#credit-warning-button"),
    creditWarningDismissButton: document.querySelector("#credit-warning-dismiss-button"),
    noticeBanner: document.querySelector("#notice-banner"),
    mainScreen: document.querySelector("#main-screen"),
    urlForm: document.querySelector("#url-form"),
    pageUrlInput: document.querySelector("#page-url-input"),
    pageTitle: document.querySelector("#page-title"),
    surfaceStatus: document.querySelector("#surface-status"),
    analyzeButton: document.querySelector("#analyze-button"),
    analyzeButtonLabel: document.querySelector("#analyze-button-label"),
    analyzeButtonIcon: document.querySelector("#analyze-button-icon"),
    voiceToggleButton: document.querySelector("#voice-toggle-button"),
    voiceToggleButtonLabel: document.querySelector("#voice-toggle-button-label"),
    voiceToggleButtonIcon: document.querySelector("#voice-toggle-button-icon"),
    languageSelect: document.querySelector("#language-select"),
    advancedDisplayName: document.querySelector("#advanced-display-name"),
    advancedEmail: document.querySelector("#advanced-email"),
    advancedUsername: document.querySelector("#advanced-username"),
    cachingTtlSelect: document.querySelector("#caching-ttl-select"),
    prepareMaxCreditsInput: document.querySelector("#prepare-max-credits-input"),
    settingsCreditsRemaining: document.querySelector("#settings-credits-remaining"),
    settingsCreditsCaption: document.querySelector("#settings-credits-caption"),
    voiceSelect: document.querySelector("#voice-select"),
    voicePreviewButton: document.querySelector("#voice-preview-button"),
    voiceWarning: document.querySelector("#voice-warning"),
    saveSettingsButton: document.querySelector("#save-settings-button"),
    rechargeButton: document.querySelector("#recharge-button"),
    authOpenButton: document.querySelector("#auth-open-button"),
    logoutButton: document.querySelector("#logout-button"),
    advancedStatus: document.querySelector("#advanced-status"),
    accountName: document.querySelector("#account-name"),
    accountHint: document.querySelector("#account-hint"),
    accountEmail: document.querySelector("#account-email"),
    accountUsername: document.querySelector("#account-username"),
    accountUserId: document.querySelector("#account-user-id"),
    analysisStatus: document.querySelector("#analysis-status"),
    pageUrl: document.querySelector("#page-url"),
    pageLanguage: document.querySelector("#page-language"),
    conversationLog: document.querySelector("#conversation-log")
  };

  const state = {
    authMode: "login",
    authOverlayOpen: false,
    authSubmitting: false,
    authToken: null,
    authUser: null,
    browserSessionId: null,
    currentPage: null,
    currentTemplateId: null,
    currentUser: null,
    externalUserApiKey: null,
    assistantSessionId: null,
    registrationRequired: true,
    serverOnline: false,
    analysisReady: false,
    isAnalyzing: false,
    websocketState: "disconnected",
    websocketPhase: "idle",
    websocketDetail: "Idle",
    voices: [],
    voiceWarning: null,
    preferredVoiceId: null,
    preferredVoiceName: null,
    voicePreviewState: "idle",
    voicePreviewVoiceId: null,
    conversationActive: false,
    recording: false,
    assistantSpeaking: false,
    pendingAssistantText: null,
    pendingAssistantLanguage: null,
    creditIssueMessage: null,
    creditBannerDismissed: false,
    noticeMessage: null,
    settingsSaving: false,
    pendingAction: null,
    pageCacheExpired: false,
    cachingTtlSeconds: DEFAULT_CACHING_TTL_SECONDS,
    maxPrepareCredits: DEFAULT_PREPARE_PAGE_MAX_CREDITS
  };

  let activeSocket;
  let activeSocketPromise;
  let activeAssistantAudio;
  let activeAssistantAudioObjectUrl;
  let activeVoicePreviewAudio;
  let activeNoticeTimer;
  let resumeConversationTimer;
  let conversationIdleTimer;
  let activeMediaRecorder;
  let activeMicrophoneStream;
  let recordedChunks = [];
  let recordingStartedAt = 0;
  let discardCurrentRecording = false;
  let audioContext;
  let mediaSourceNode;
  let analyserNode;
  let analyserTimeData;
  let analyserFrequencyData;
  let monitorFrameId;
  let speechDetectedAt;
  let lastVoiceDetectedAt;
  let sustainedVoiceFrames = 0;
  let stopRequested = false;
  let assistantAudioReceivedForTurn = false;
  let embedHeightFrameId = 0;
  let embedHeightObserver;
  let voicesLoaded = false;
  let voicesLoadPromise;

  function readOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function buildSessionCredentialPayload() {
    return {
      authToken: getActiveAuthToken(),
      browserSessionId: state.browserSessionId,
      externalUserApiKey: state.externalUserApiKey
    };
  }

  function normalizePreparePageCreditCap(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_PREPARE_PAGE_MAX_CREDITS;
    }

    return Math.max(
      MIN_PREPARE_PAGE_MAX_CREDITS,
      Math.min(MAX_PREPARE_PAGE_MAX_CREDITS, Math.floor(parsed))
    );
  }

  function normalizeCachingTtlSeconds(value) {
    return Number(value) === ONE_DAY_CACHING_TTL_SECONDS
      ? ONE_DAY_CACHING_TTL_SECONDS
      : DEFAULT_CACHING_TTL_SECONDS;
  }

  function isExpiredTemplateCode(code) {
    return code === EMBEDDING_TEMPLATE_EXPIRED_CODE;
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage write failures so the client still works in private mode.
    }
  }

  function safeStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage removal failures.
    }
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    const prefix = `${name}=`;

    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(prefix)) {
        const value = trimmed.slice(prefix.length);
        return value ? decodeURIComponent(value) : null;
      }
    }

    return null;
  }

  function postEmbeddedHeight() {
    if (window.parent === window) {
      return;
    }

    const nextHeight = Math.ceil(
      Math.max(
        document.documentElement?.scrollHeight ?? 0,
        document.documentElement?.offsetHeight ?? 0,
        document.body?.scrollHeight ?? 0,
        document.body?.offsetHeight ?? 0
      )
    );

    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    window.parent.postMessage(
      {
        type: EMBED_HEIGHT_MESSAGE_TYPE,
        height: nextHeight
      },
      window.location.origin
    );
  }

  function scheduleEmbeddedHeightSync() {
    if (window.parent === window || embedHeightFrameId) {
      return;
    }

    embedHeightFrameId = window.requestAnimationFrame(() => {
      embedHeightFrameId = 0;
      postEmbeddedHeight();
    });
  }

  function bindEmbeddedHeightSync() {
    if (window.parent === window) {
      return;
    }

    const observedElements = [
      document.documentElement,
      document.body,
      document.querySelector(".web-overlay-shell"),
      refs.authOverlay,
      refs.mainScreen
    ].filter(Boolean);

    if (typeof ResizeObserver === "function") {
      embedHeightObserver = new ResizeObserver(() => {
        scheduleEmbeddedHeightSync();
      });

      for (const element of observedElements) {
        embedHeightObserver.observe(element);
      }
    }

    document.addEventListener(
      "toggle",
      () => {
        scheduleEmbeddedHeightSync();
      },
      true
    );

    window.addEventListener("resize", scheduleEmbeddedHeightSync);

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        scheduleEmbeddedHeightSync();
      });
    }

    scheduleEmbeddedHeightSync();
  }

  function setAuthCookie(token) {
    if (!token) {
      return;
    }

    const hostname = window.location.hostname;
    const domainAttr = hostname.endsWith("samsar.one") ? "; domain=.samsar.one" : "";
    const secureAttr = window.location.protocol === "https:" ? "; Secure" : "";

    document.cookie = `authToken=${encodeURIComponent(token)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax${secureAttr}${domainAttr}`;
  }

  function clearAuthCookies() {
    const hostname = window.location.hostname;
    const domains = new Set(["", hostname]);

    if (hostname.endsWith("samsar.one")) {
      domains.add(".samsar.one");
    }

    const parts = hostname.split(".").filter(Boolean);
    for (let index = 0; index < parts.length - 1; index += 1) {
      const domain = parts.slice(index).join(".");
      domains.add(domain);
      domains.add(`.${domain}`);
    }

    for (const domain of domains) {
      const domainAttr = domain ? ` domain=${domain};` : "";
      document.cookie = `authToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;${domainAttr}`;
    }
  }

  function getStoredAuthToken() {
    const localToken = safeStorageGet(AUTH_TOKEN_KEY);
    if (localToken) {
      return localToken;
    }

    try {
      const sessionToken = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (sessionToken) {
        safeStorageSet(AUTH_TOKEN_KEY, sessionToken);
        return sessionToken;
      }
    } catch {
      // Ignore sessionStorage read failures.
    }

    const cookieToken = getCookie(AUTH_TOKEN_KEY);
    if (cookieToken) {
      safeStorageSet(AUTH_TOKEN_KEY, cookieToken);
      return cookieToken;
    }

    return null;
  }

  function persistAuthToken(token) {
    if (!token) {
      return;
    }

    safeStorageSet(AUTH_TOKEN_KEY, token);

    try {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // Ignore sessionStorage write failures.
    }

    setAuthCookie(token);
    state.authToken = token;
  }

  function clearAuthData() {
    state.authToken = null;
    state.authUser = null;
    safeStorageRemove(AUTH_TOKEN_KEY);

    try {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // Ignore sessionStorage removal failures.
    }

    clearAuthCookies();
  }

  function getAuthParamsFromWindow(targetWindow) {
    try {
      const url = new URL(targetWindow.location.href);
      const authToken =
        readOptionalString(url.searchParams.get("authToken")) ??
        readOptionalString(url.searchParams.get("externalUserToken"));
      const loginToken = readOptionalString(url.searchParams.get("loginToken"));

      if (!authToken && !loginToken) {
        return null;
      }

      return {
        authToken: authToken ?? null,
        loginToken: loginToken ?? null,
        targetWindow,
        url
      };
    } catch {
      return null;
    }
  }

  function readAuthParamsFromLocation() {
    const ownParams = getAuthParamsFromWindow(window);
    if (ownParams) {
      return ownParams;
    }

    if (!window.parent || window.parent === window) {
      return null;
    }

    return getAuthParamsFromWindow(window.parent);
  }

  function clearAuthParamsFromLocation(payload) {
    if (!payload) {
      return;
    }

    try {
      payload.url.searchParams.delete("authToken");
      payload.url.searchParams.delete("externalUserToken");
      payload.url.searchParams.delete("loginToken");
      payload.targetWindow.history.replaceState(
        payload.targetWindow.history.state,
        "",
        `${payload.url.pathname}${payload.url.search}${payload.url.hash}`
      );
    } catch {
      // Ignore history update failures when stripping transient auth params.
    }
  }

  async function restoreAuthSessionFromLocation() {
    const payload = readAuthParamsFromLocation();
    if (!payload) {
      return false;
    }

    clearAuthParamsFromLocation(payload);

    try {
      let sessionPayload;

      if (payload.loginToken) {
        sessionPayload = await fetchJson(
          `/api/web-auth/session?loginToken=${encodeURIComponent(payload.loginToken)}`
        );
      } else if (payload.authToken) {
        persistAuthToken(payload.authToken);
        sessionPayload = await fetchJson("/api/web-auth/session", {
          headers: {
            Authorization: `Bearer ${payload.authToken}`
          }
        });
      } else {
        return false;
      }

      const resolvedAuthToken = readOptionalString(sessionPayload.authToken);
      if (resolvedAuthToken) {
        persistAuthToken(resolvedAuthToken);
      }

      state.authUser = sessionPayload;
      populateProfileInputs(true);
      showNotice("Signed in on this Samsar subdomain.");
      return true;
    } catch (error) {
      console.error("Failed to restore auth session from location", error);
      appendLog(
        "system",
        error instanceof Error
          ? error.message
          : "The shared Samsar login could not be restored here."
      );
      return false;
    }
  }

  function getOrCreateBrowserSessionId() {
    const stored = safeStorageGet(BROWSER_SESSION_STORAGE_KEY);
    if (stored) {
      return stored;
    }

    const created =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `sqweb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    safeStorageSet(BROWSER_SESSION_STORAGE_KEY, created);
    return created;
  }

  function resetConversationLog() {
    if (!refs.conversationLog) {
      return;
    }

    refs.conversationLog.innerHTML = `
      <article class="log-item log-item-system">
        <p class="log-role">System</p>
        <p class="log-text">Sign in, paste a public URL, analyze it, then ask by voice.</p>
      </article>
    `;
  }

  function appendLog(role, message) {
    if (!refs.conversationLog || !message) {
      return;
    }

    const article = document.createElement("article");
    article.className = `log-item log-item-${role}`;

    const roleNode = document.createElement("p");
    roleNode.className = "log-role";
    roleNode.textContent =
      role === "assistant" ? "Assistant" : role === "user" ? "User" : "System";

    const textNode = document.createElement("p");
    textNode.className = "log-text";
    textNode.textContent = message;

    article.append(roleNode, textNode);
    refs.conversationLog.append(article);
    refs.conversationLog.scrollTop = refs.conversationLog.scrollHeight;
  }

  function appendImageLog(role, imageUrl, label) {
    if (!refs.conversationLog || !imageUrl) {
      return;
    }

    const article = document.createElement("article");
    article.className = `log-item log-item-${role}`;

    const roleNode = document.createElement("p");
    roleNode.className = "log-role";
    roleNode.textContent =
      role === "assistant" ? "Assistant" : role === "user" ? "User" : "System";

    const textNode = document.createElement("p");
    textNode.className = "log-text";
    textNode.textContent = label || "Image response";

    const imageNode = document.createElement("img");
    imageNode.className = "log-image";
    imageNode.alt = label || "Generated image";
    imageNode.src = imageUrl;

    article.append(roleNode, textNode, imageNode);
    refs.conversationLog.append(article);
    refs.conversationLog.scrollTop = refs.conversationLog.scrollHeight;
  }

  async function fetchJson(pathname, options) {
    const response = await fetch(pathname, options);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const errorMessage =
        typeof body === "object" && body && "error" in body && typeof body.error === "string" && body.error.trim()
          ? body.error.trim()
          : typeof body === "object" && body && "message" in body && typeof body.message === "string" && body.message.trim()
            ? body.message.trim()
            : typeof body === "string" && body.trim()
              ? body
              : `Request failed with ${response.status}`;
      const error = new Error(errorMessage);
      if (typeof body === "object" && body && "code" in body && typeof body.code === "string") {
        error.code = body.code;
      }
      error.status = response.status;
      throw error;
    }

    return body;
  }

  function normalizeUrl(rawUrl) {
    try {
      const parsedUrl = new URL(rawUrl);
      parsedUrl.hash = "";
      return parsedUrl.toString();
    } catch {
      return rawUrl.trim();
    }
  }

  function isPrivateHostname(hostname) {
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

  function getAnalyzeUrlError(rawUrl) {
    if (!rawUrl) {
      return "Enter a public URL before starting analysis.";
    }

    try {
      const parsedUrl = new URL(rawUrl);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return "Only http and https pages can be analyzed.";
      }

      if (isPrivateHostname(parsedUrl.hostname)) {
        return "Only public URLs can be analyzed. Local and private network pages are not supported.";
      }

      return undefined;
    } catch {
      return "Enter a valid public URL for document analysis.";
    }
  }

  function deriveTitleFromUrl(rawUrl) {
    try {
      const parsedUrl = new URL(rawUrl);
      const hostname = parsedUrl.hostname.replace(/^www\./, "");
      const pathname = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
      return `${hostname}${pathname}`.slice(0, 96);
    } catch {
      return "Selected page";
    }
  }

  function getCreditsRemaining() {
    const externalCredits = Number(state.currentUser?.generationCredits);
    if (Number.isFinite(externalCredits)) {
      return Math.max(0, Math.floor(externalCredits));
    }

    const authCredits = Number(state.authUser?.generationCredits);
    if (Number.isFinite(authCredits)) {
      return Math.max(0, Math.floor(authCredits));
    }

    return null;
  }

  function formatCreditsLabel(value) {
    const amount = creditCountFormatter.format(value);
    return `${amount} ${value === 1 ? "credit" : "credits"}`;
  }

  function getActiveAuthToken() {
    return state.externalUserApiKey ? null : state.authToken;
  }

  function hasActiveSamsarCredentials() {
    return Boolean(state.externalUserApiKey || getActiveAuthToken());
  }

  function isInsufficientCreditsMessage(message) {
    const normalized = readOptionalString(message);
    return Boolean(
      normalized &&
        /not enough .*credits?|insufficient .*credits?|credits? are available|credits? remaining: 0|recharge credits?/i.test(
          normalized
        )
    );
  }

  function formatInsufficientCreditsMessage(message) {
    const normalized = readOptionalString(message);

    if (!normalized) {
      return "Not enough credits are available for this request. Recharge credits in Samsar and then try again.";
    }

    return /recharge/i.test(normalized)
      ? normalized
      : `${normalized} Recharge credits in Samsar and then try again.`;
  }

  function syncCreditIssueStateWithBalance() {
    const creditsRemaining = getCreditsRemaining();

    if (creditsRemaining !== null && creditsRemaining > 0) {
      state.creditIssueMessage = null;
    }
  }

  function clearNoticeTimer() {
    if (typeof activeNoticeTimer === "number") {
      window.clearTimeout(activeNoticeTimer);
      activeNoticeTimer = undefined;
    }
  }

  function showNotice(message, durationMs = NOTIFICATION_DURATION_MS) {
    clearNoticeTimer();
    state.noticeMessage = message;
    render();

    if (durationMs <= 0) {
      return;
    }

    activeNoticeTimer = window.setTimeout(() => {
      state.noticeMessage = null;
      activeNoticeTimer = undefined;
      render();
    }, durationMs);
  }

  function populateProfileInputs(force) {
    const nextDisplayName =
      readOptionalString(state.currentUser?.displayName) ??
      readOptionalString(state.authUser?.displayName) ??
      "";
    const nextEmail =
      readOptionalString(state.currentUser?.email) ??
      readOptionalString(state.authUser?.email) ??
      "";
    const nextUsername =
      readOptionalString(state.currentUser?.username) ??
      readOptionalString(state.authUser?.username) ??
      "";

    if (refs.advancedDisplayName && (force || !refs.advancedDisplayName.value.trim())) {
      refs.advancedDisplayName.value = nextDisplayName;
    }

    if (refs.advancedEmail && (force || !refs.advancedEmail.value.trim())) {
      refs.advancedEmail.value = nextEmail;
    }

    if (refs.advancedUsername && (force || !refs.advancedUsername.value.trim())) {
      refs.advancedUsername.value = nextUsername;
    }
  }

  function syncPreparePageCreditCapInput() {
    if (!refs.prepareMaxCreditsInput) {
      return;
    }

    refs.prepareMaxCreditsInput.value = String(state.maxPrepareCredits);
  }

  function syncCachingTtlInput() {
    if (!refs.cachingTtlSelect) {
      return;
    }

    refs.cachingTtlSelect.value = String(state.cachingTtlSeconds);
  }

  function savePreparePageSettings() {
    safeStorageSet(
      PREPARE_PAGE_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        cachingTtlSeconds: state.cachingTtlSeconds,
        maxPrepareCredits: state.maxPrepareCredits
      })
    );
  }

  function loadPreparePageSettings() {
    const stored = safeStorageGet(PREPARE_PAGE_SETTINGS_STORAGE_KEY);

    if (!stored) {
      state.cachingTtlSeconds = DEFAULT_CACHING_TTL_SECONDS;
      state.maxPrepareCredits = DEFAULT_PREPARE_PAGE_MAX_CREDITS;
      syncCachingTtlInput();
      syncPreparePageCreditCapInput();
      return;
    }

    try {
      const payload = JSON.parse(stored);
      state.cachingTtlSeconds = normalizeCachingTtlSeconds(
        payload?.cachingTtlSeconds
      );
      state.maxPrepareCredits = normalizePreparePageCreditCap(
        payload?.maxPrepareCredits
      );
    } catch {
      state.cachingTtlSeconds = DEFAULT_CACHING_TTL_SECONDS;
      state.maxPrepareCredits = DEFAULT_PREPARE_PAGE_MAX_CREDITS;
      safeStorageRemove(PREPARE_PAGE_SETTINGS_STORAGE_KEY);
    }

    syncCachingTtlInput();
    syncPreparePageCreditCapInput();
  }

  function updatePreparePageCreditCapFromInput() {
    state.maxPrepareCredits = normalizePreparePageCreditCap(
      refs.prepareMaxCreditsInput?.value ?? state.maxPrepareCredits
    );
    syncPreparePageCreditCapInput();
    savePreparePageSettings();
    render();
  }

  function updateCachingTtlFromInput() {
    state.cachingTtlSeconds = normalizeCachingTtlSeconds(
      refs.cachingTtlSelect?.value ?? state.cachingTtlSeconds
    );
    syncCachingTtlInput();
    savePreparePageSettings();
    render();
  }

  function saveRegistrationState() {
    safeStorageSet(
      REGISTRATION_STORAGE_KEY,
      JSON.stringify({
        browserSessionId: state.browserSessionId,
        assistantSessionId: state.assistantSessionId,
        authToken: state.authToken,
        externalUser: state.currentUser,
        externalUserApiKey: state.externalUserApiKey,
        preferredLanguage: getSelectedLanguage(),
        preferredVoiceId: state.preferredVoiceId,
        preferredVoiceName: state.preferredVoiceName
      })
    );
  }

  function loadRegistrationState() {
    const stored = safeStorageGet(REGISTRATION_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const payload = JSON.parse(stored);
      if (payload?.browserSessionId !== state.browserSessionId) {
        return;
      }

      state.assistantSessionId = readOptionalString(payload.assistantSessionId) ?? null;
      state.authToken = readOptionalString(payload.authToken) ?? state.authToken;
      state.currentUser =
        payload.externalUser && typeof payload.externalUser === "object"
          ? payload.externalUser
          : null;
      state.externalUserApiKey = readOptionalString(payload.externalUserApiKey) ?? null;
      setSelectedLanguage(
        readOptionalString(payload.preferredLanguage) ??
          getPreferredLanguageFromUser(payload.externalUser)
      );
      state.cachingTtlSeconds =
        getCachingTtlSecondsFromUser(payload.externalUser) ??
        state.cachingTtlSeconds;
      syncCachingTtlInput();
      state.preferredVoiceId = readOptionalString(payload.preferredVoiceId) ?? null;
      state.preferredVoiceName = readOptionalString(payload.preferredVoiceName) ?? null;
      state.pageCacheExpired = false;
      state.registrationRequired = !(
        (state.externalUserApiKey || state.authToken) &&
        state.assistantSessionId
      );
      syncCreditIssueStateWithBalance();
    } catch {
      safeStorageRemove(REGISTRATION_STORAGE_KEY);
    }
  }

  function clearRegistrationState() {
    state.currentUser = null;
    state.externalUserApiKey = null;
    state.assistantSessionId = null;
    state.registrationRequired = true;
    state.creditIssueMessage = null;
    state.pageCacheExpired = false;
    safeStorageRemove(REGISTRATION_STORAGE_KEY);
  }

  function savePageState() {
    safeStorageSet(
      PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        url: state.currentPage?.url ?? "",
        templateId: state.currentTemplateId ?? "",
        preferredLanguage: getSelectedLanguage()
      })
    );
  }

  function loadPageState() {
    const stored = safeStorageGet(PAGE_STATE_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const payload = JSON.parse(stored);
      setSelectedLanguage(readOptionalString(payload?.preferredLanguage));
      const url = readOptionalString(payload?.url);
      if (!url || !refs.pageUrlInput) {
        return;
      }

      refs.pageUrlInput.value = url;
      state.currentPage = {
        url,
        title: deriveTitleFromUrl(url)
      };
      state.currentTemplateId = readOptionalString(payload?.templateId) ?? null;
      state.analysisReady = Boolean(state.currentTemplateId);
      state.pageCacheExpired = false;
    } catch {
      safeStorageRemove(PAGE_STATE_STORAGE_KEY);
    }
  }

  function applyCurrentPage(rawUrl) {
    const previousUrl = state.currentPage?.url ?? null;
    const normalized = readOptionalString(rawUrl) ? normalizeUrl(rawUrl) : null;

    if (!normalized) {
      state.currentPage = null;
      state.currentTemplateId = null;
      state.analysisReady = false;
      state.pageCacheExpired = false;
      savePageState();
      return;
    }

    state.currentPage = {
      url: normalized,
      title: deriveTitleFromUrl(normalized)
    };

    if (previousUrl && previousUrl !== normalized) {
      state.currentTemplateId = null;
      state.analysisReady = false;
      state.pageCacheExpired = false;
      resetConversationLog();
      if (state.conversationActive || state.recording || state.assistantSpeaking) {
        void stopConversationMode({
          detail: "Stopped",
          logMessage: "Voice stopped after switching pages."
        });
      } else {
        closeWebSocketSession();
      }
    }

    savePageState();
  }

  function buildIdentityPayload() {
    const fallbackEmail = readOptionalString(state.authUser?.email) ?? "";
    const fallbackUsername =
      readOptionalString(state.authUser?.username) ??
      (fallbackEmail.includes("@") ? fallbackEmail.split("@")[0] : state.browserSessionId.slice(-8));
    const fallbackDisplayName =
      readOptionalString(state.authUser?.displayName) ??
      readOptionalString(state.authUser?.username) ??
      "Samsar user";

    return {
      displayName: readOptionalString(refs.advancedDisplayName?.value) ?? fallbackDisplayName,
      email: readOptionalString(refs.advancedEmail?.value) ?? fallbackEmail,
      username: readOptionalString(refs.advancedUsername?.value) ?? fallbackUsername
    };
  }

  function applyBrowserSessionPayload(payload) {
    state.assistantSessionId =
      readOptionalString(payload.assistantSessionId) ?? state.assistantSessionId;
    state.authToken =
      readOptionalString(payload.authToken) ??
      (payload.authToken === null ? null : state.authToken);
    state.currentUser =
      payload.externalUser && typeof payload.externalUser === "object"
        ? payload.externalUser
        : payload.externalUser === null
          ? null
          : state.currentUser;
    state.externalUserApiKey =
      readOptionalString(payload.externalUserApiKey) ??
      (payload.externalUserApiKey === null ? null : state.externalUserApiKey);
    const payloadCreditsRemaining = Number(payload.creditsRemaining);
    if (state.currentUser && Number.isFinite(payloadCreditsRemaining)) {
      state.currentUser = {
        ...state.currentUser,
        generationCredits: Math.max(0, Math.floor(payloadCreditsRemaining))
      };
    }
    state.registrationRequired = Boolean(payload.registrationRequired);
    const preferredLanguage = getPreferredLanguageFromUser(state.currentUser);
    if (preferredLanguage) {
      setSelectedLanguage(preferredLanguage);
    }
    state.cachingTtlSeconds =
      getCachingTtlSecondsFromUser(state.currentUser) ??
      state.cachingTtlSeconds;
    syncCachingTtlInput();
    syncCreditIssueStateWithBalance();
    populateProfileInputs(true);
    saveRegistrationState();
  }

  async function refreshServerStatus() {
    try {
      const payload = await fetchJson("/api/health");
      state.serverOnline = payload.status === "ok";
    } catch {
      state.serverOnline = false;
    }
  }

  function getSelectedVoiceId() {
    const value = readOptionalString(refs.voiceSelect?.value);
    return value ?? state.preferredVoiceId ?? null;
  }

  function getSelectedLanguage() {
    return readOptionalString(refs.languageSelect?.value) ?? "auto";
  }

  function setSelectedLanguage(language) {
    if (!refs.languageSelect) {
      return;
    }

    const nextLanguage = readOptionalString(language) ?? "auto";

    if (
      Array.from(refs.languageSelect.options).some(
        (option) => option.value === nextLanguage
      )
    ) {
      refs.languageSelect.value = nextLanguage;
    }
  }

  function getPreferredLanguageFromUser(user) {
    const browserInstallation =
      user?.browserInstallation && typeof user.browserInstallation === "object"
        ? user.browserInstallation
        : user?.browser_installation && typeof user.browser_installation === "object"
          ? user.browser_installation
          : null;

    if (!browserInstallation) {
      return null;
    }

    return (
      readOptionalString(browserInstallation.preferred_language) ??
      readOptionalString(browserInstallation.preferredLanguage) ??
      null
    );
  }

  function getCachingTtlSecondsFromUser(user) {
    const browserInstallation =
      user?.browserInstallation && typeof user.browserInstallation === "object"
        ? user.browserInstallation
        : user?.browser_installation && typeof user.browser_installation === "object"
          ? user.browser_installation
          : null;

    if (!browserInstallation) {
      return null;
    }

    return normalizeCachingTtlSeconds(
      browserInstallation.caching_ttl ?? browserInstallation.cachingTtl
    );
  }

  function getSelectedVoiceName() {
    return readOptionalString(refs.voiceSelect?.selectedOptions?.[0]?.textContent) ?? "Browser voice fallback";
  }

  function getSelectedVoicePreviewSource() {
    const selectedVoiceId = getSelectedVoiceId();
    const selectedVoice = state.voices.find((voice) => voice.voiceId === selectedVoiceId);

    if (!selectedVoiceId || !selectedVoice?.previewUrl) {
      return null;
    }

    return `${SERVER_HTTP_ORIGIN}/api/voices/preview?voiceId=${encodeURIComponent(selectedVoice.voiceId)}`;
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

  function renderVoiceOptions() {
    if (!refs.voiceSelect) {
      return;
    }

    refs.voiceSelect.innerHTML = "";

    for (const voice of state.voices) {
      const option = document.createElement("option");
      option.value = voice.voiceId;
      option.textContent = voice.name;
      option.title = voice.description || voice.name;
      refs.voiceSelect.append(option);
    }

    if (refs.voiceSelect.options.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Browser voice fallback";
      refs.voiceSelect.append(option);
    }

    const preferredVoiceId = state.preferredVoiceId;
    const matchingValue =
      preferredVoiceId &&
      Array.from(refs.voiceSelect.options).some((option) => option.value === preferredVoiceId)
        ? preferredVoiceId
        : state.voices[0]?.voiceId ?? "";
    refs.voiceSelect.value = matchingValue;
    state.preferredVoiceId = matchingValue || null;
    state.preferredVoiceName = getSelectedVoiceName();
  }

  async function refreshVoices() {
    if (!state.serverOnline) {
      state.voices = [];
      state.voiceWarning = null;
      renderVoiceOptions();
      return;
    }

    try {
      const payload = await fetchJson("/api/voices");
      state.voices = Array.isArray(payload.voices) ? payload.voices : [];
      state.voiceWarning = readOptionalString(payload.warnings?.[0]) ?? null;
    } catch (error) {
      state.voices = [];
      state.voiceWarning = error instanceof Error ? error.message : "Failed to fetch voices.";
    }

    renderVoiceOptions();
  }

  async function ensureVoicesLoaded(input) {
    if (!state.serverOnline) {
      voicesLoaded = false;
      state.voices = [];
      state.voiceWarning = null;
      renderVoiceOptions();
      return;
    }

    if (!input?.force && voicesLoaded) {
      return;
    }

    if (!input?.force && voicesLoadPromise) {
      return voicesLoadPromise;
    }

    voicesLoadPromise = refreshVoices()
      .then(() => {
        voicesLoaded = true;
      })
      .finally(() => {
        voicesLoadPromise = null;
      });

    return voicesLoadPromise;
  }

  function openAuthOverlay(mode, action) {
    state.authMode = mode || "login";
    state.authOverlayOpen = true;
    state.pendingAction = action || null;
    render();
  }

  function closeAuthOverlay() {
    if (state.authSubmitting) {
      return;
    }

    state.authOverlayOpen = false;
    state.pendingAction = null;
    render();
  }

  async function refreshAuthSession() {
    const authToken = getStoredAuthToken();
    state.authToken = authToken;

    if (!authToken) {
      state.authUser = null;
      clearRegistrationState();
      populateProfileInputs(true);
      render();
      return;
    }

    try {
      const payload = await fetchJson("/api/web-auth/session", {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      state.authUser = payload;
      const resolvedAuthToken = readOptionalString(payload.authToken);
      if (resolvedAuthToken && resolvedAuthToken !== authToken) {
        persistAuthToken(resolvedAuthToken);
      }

      populateProfileInputs(true);
    } catch (error) {
      console.error("Failed to refresh auth session", error);
      clearAuthData();
      clearRegistrationState();
      appendLog(
        "system",
        "Your Samsar session could not be restored here. Sign in again to continue."
      );
    }

    render();
  }

  async function ensureProvisionedSession(force) {
    if (!state.authUser) {
      throw new Error("Login is required before page analysis can start.");
    }

    if (!force && hasActiveSamsarCredentials() && state.assistantSessionId && state.currentUser) {
      return;
    }

    const identity = buildIdentityPayload();
    const payload = await fetchJson("/api/browser-sessions/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        authToken: getActiveAuthToken(),
        browserSessionId: state.browserSessionId,
        cachingTtlSeconds: state.cachingTtlSeconds,
        displayName: identity.displayName,
        email: identity.email,
        username: identity.username,
        preferredLanguage: getSelectedLanguage(),
        preferredVoiceId: getSelectedVoiceId(),
        grantStarterCredits: false
      })
    });

    applyBrowserSessionPayload(payload);
  }

  async function syncBrowserSession() {
    if (!state.browserSessionId || !hasActiveSamsarCredentials() || !state.assistantSessionId) {
      return;
    }

    const payload = await fetchJson("/api/browser-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assistantSessionId: state.assistantSessionId,
        ...buildSessionCredentialPayload(),
        cachingTtlSeconds: state.cachingTtlSeconds,
        preferredLanguage: getSelectedLanguage(),
        preferredVoiceId: getSelectedVoiceId()
      })
    });

    applyBrowserSessionPayload(payload);
  }

  async function persistAdvancedSettings() {
    if (!state.authUser) {
      openAuthOverlay("login", "save_settings");
      return;
    }

    state.settingsSaving = true;
    render();

    try {
      await ensureProvisionedSession();
      const identity = buildIdentityPayload();
      const payload = await fetchJson("/api/browser-sessions/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assistantSessionId: state.assistantSessionId,
          ...buildSessionCredentialPayload(),
          cachingTtlSeconds: state.cachingTtlSeconds,
          displayName: identity.displayName,
          email: identity.email,
          username: identity.username,
          preferredLanguage: getSelectedLanguage(),
          preferredVoiceId: getSelectedVoiceId()
        })
      });

      applyBrowserSessionPayload(payload);
      state.preferredVoiceId = getSelectedVoiceId();
      state.preferredVoiceName = getSelectedVoiceName();
      showNotice("Advanced settings saved.");
      appendLog("system", "Advanced settings updated for this web session.");
    } catch (error) {
      appendLog(
        "system",
        error instanceof Error ? error.message : "Failed to save advanced settings."
      );
    } finally {
      state.settingsSaving = false;
      render();
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    state.authSubmitting = true;
    render();

    try {
      const payload = await fetchJson("/api/web-auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: refs.loginEmail?.value ?? "",
          password: refs.loginPassword?.value ?? ""
        })
      });

      const authToken = readOptionalString(payload.authToken);
      if (!authToken) {
        throw new Error("Samsar login did not return an auth token.");
      }

      persistAuthToken(authToken);
      state.authUser = payload;
      populateProfileInputs(true);
      state.authOverlayOpen = false;
      state.authMode = "login";
      render();
      showNotice("Signed in on this Samsar subdomain.");
      await continuePendingAction();
    } catch (error) {
      refs.authStatus.textContent =
        error instanceof Error
          ? error.message
          : "Invalid email or password. Please try again.";
    } finally {
      state.authSubmitting = false;
      render();
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    const password = refs.registerPassword?.value ?? "";
    const confirmPassword = refs.registerConfirmPassword?.value ?? "";

    if (password !== confirmPassword) {
      refs.authStatus.textContent = "Passwords do not match.";
      return;
    }

    state.authSubmitting = true;
    render();

    try {
      const payload = await fetchJson("/api/web-auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: refs.registerDisplayName?.value ?? "",
          email: refs.registerEmail?.value ?? "",
          username: refs.registerUsername?.value ?? "",
          password,
          preferredLanguage: getSelectedLanguage()
        })
      });

      const authToken = readOptionalString(payload.authToken);
      if (!authToken) {
        throw new Error("Samsar registration did not return an auth token.");
      }

      persistAuthToken(authToken);
      state.authUser = payload;
      populateProfileInputs(true);
      state.authOverlayOpen = false;
      state.authMode = "login";
      render();
      showNotice("Account created and shared across Samsar subdomains.");
      await continuePendingAction();
    } catch (error) {
      refs.authStatus.textContent =
        error instanceof Error
          ? error.message
          : "Unable to create your account right now.";
    } finally {
      state.authSubmitting = false;
      render();
    }
  }

  async function continuePendingAction() {
    const action = state.pendingAction;
    state.pendingAction = null;

    if (action === "analyze") {
      await analyzeCurrentPage();
      return;
    }

    if (action === "voice") {
      await startRecording();
      return;
    }

    if (action === "save_settings") {
      await persistAdvancedSettings();
    }
  }

  async function openRechargeFlow() {
    try {
      await ensureProvisionedSession();
      const payload = await fetchJson("/api/browser-sessions/login-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...buildSessionCredentialPayload()
        })
      });

      const loginUrl = readOptionalString(payload.loginUrl) ?? "https://app.samsar.one";
      window.open(loginUrl, "_blank", "noopener,noreferrer");
      appendLog("system", "Opened Samsar in a new tab so you can recharge credits.");
    } catch (error) {
      appendLog(
        "system",
        error instanceof Error ? error.message : "Failed to create the recharge link."
      );
    }
  }

  function dismissCreditBanner() {
    state.creditBannerDismissed = true;
    render();
  }

  function setIcon(node, iconName) {
    if (!node) {
      return;
    }

    node.innerHTML = BUTTON_ICONS[iconName] || "";
  }

  function setCurrentPageFromInput() {
    const rawUrl = refs.pageUrlInput?.value ?? "";
    applyCurrentPage(rawUrl);
    render();
  }

  function expireCurrentPageCache(input) {
    const message =
      readOptionalString(input?.message) ?? EXPIRED_PAGE_CACHE_MESSAGE;

    state.analysisReady = false;
    state.currentTemplateId = null;
    state.pageCacheExpired = true;
    state.isAnalyzing = false;

    if (state.conversationActive || state.recording || state.assistantSpeaking) {
      void stopConversationMode({
        detail: "Prepare page"
      });
    } else {
      closeWebSocketSession({
        phase: "idle",
        detail: "Prepare page"
      });
    }

    savePageState();
    render();

    if (input?.appendLog) {
      appendLog("system", message);
    }

    if (input?.notify) {
      showNotice(message);
    }
  }

  async function refreshIndexStatus() {
    if (!state.currentPage?.url || !state.currentTemplateId) {
      return;
    }

    try {
      const payload = await fetchJson(
        `/api/webpages/status?url=${encodeURIComponent(state.currentPage.url)}&templateId=${encodeURIComponent(state.currentTemplateId)}`
      );

      if (
        isExpiredTemplateCode(payload.code) ||
        readOptionalString(payload.status) === "expired"
      ) {
        expireCurrentPageCache();
        return;
      }

      state.analysisReady = Boolean(payload.analysisAvailable);
      state.currentTemplateId = readOptionalString(payload.templateId) ?? state.currentTemplateId;
      state.pageCacheExpired = false;
      savePageState();
    } catch (error) {
      if (isExpiredTemplateCode(error?.code) || error?.status === 410) {
        expireCurrentPageCache();
        return;
      }

      state.analysisReady = Boolean(state.currentTemplateId);
    }
  }

  async function analyzeCurrentPage() {
    setCurrentPageFromInput();
    state.pageCacheExpired = false;
    updatePreparePageCreditCapFromInput();
    updateCachingTtlFromInput();

    const analyzeUrlError = getAnalyzeUrlError(state.currentPage?.url);
    if (analyzeUrlError) {
      appendLog("system", analyzeUrlError);
      return;
    }

    if (!state.authUser) {
      openAuthOverlay("login", "analyze");
      appendLog("system", "Login is required before page analysis can start.");
      return;
    }

    state.isAnalyzing = true;
    render();

    try {
      await ensureProvisionedSession();
      const payload = await fetchJson("/api/webpages/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...buildSessionCredentialPayload(),
          cachingTtlSeconds: state.cachingTtlSeconds,
          url: state.currentPage.url,
          maxPrepareCredits: state.maxPrepareCredits
        })
      });

      state.analysisReady = Boolean(payload.ok);
      state.pageCacheExpired = false;
      state.currentTemplateId = readOptionalString(payload.analysis?.templateId) ?? null;
      if (
        state.currentUser &&
        Number.isFinite(Number(payload.analysis?.raw?.creditsRemaining))
      ) {
        state.currentUser = {
          ...state.currentUser,
          generationCredits: Math.max(
            0,
            Math.floor(Number(payload.analysis.raw.creditsRemaining))
          )
        };
        syncCreditIssueStateWithBalance();
      }
      savePageState();
      appendLog("system", "Page ready for QA.");
      await ensureWebSocketSession();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to analyze the page.";
      const code =
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : null;

      if (code === "insufficient_credits" || isInsufficientCreditsMessage(message)) {
        showInsufficientCreditsState(message);
      } else if (isExpiredTemplateCode(code) || error?.status === 410) {
        expireCurrentPageCache({
          appendLog: true,
          message,
          notify: true
        });
      } else {
        appendLog("system", message);
      }
    } finally {
      state.isAnalyzing = false;
      render();
    }
  }

  function showInsufficientCreditsState(message) {
    const issueMessage = formatInsufficientCreditsMessage(message);
    state.creditIssueMessage = issueMessage;
    state.creditBannerDismissed = false;
    refs.advancedDrawer.open = true;
    appendLog("system", issueMessage);
    void stopConversationMode({
      detail: "Recharge required"
    });
    render();
  }

  function sendSocketMessage(message) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    activeSocket.send(JSON.stringify(message));
  }

  function base64FromBytes(bytes) {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return window.btoa(binary);
  }

  function bytesFromBase64(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function chooseLocalSpeechVoice(language) {
    if (!("speechSynthesis" in window)) {
      return undefined;
    }

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

    if (state.voicePreviewState !== "idle" || state.voicePreviewVoiceId) {
      state.voicePreviewState = "idle";
      state.voicePreviewVoiceId = null;
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

    if (
      state.voicePreviewVoiceId === selectedVoiceId &&
      state.voicePreviewState !== "idle"
    ) {
      stopVoicePreviewPlayback();
      render();
      return;
    }

    stopVoicePreviewPlayback();
    stopAssistantPlayback();

    const audio = new Audio(previewSource);
    activeVoicePreviewAudio = audio;
    state.voicePreviewVoiceId = selectedVoiceId;
    state.voicePreviewState = "loading";
    render();

    const cleanup = () => {
      if (activeVoicePreviewAudio === audio) {
        activeVoicePreviewAudio = undefined;
      }

      if (state.voicePreviewVoiceId === selectedVoiceId) {
        state.voicePreviewVoiceId = null;
        state.voicePreviewState = "idle";
      }

      resumeConversationAfterVoicePreview();
      render();
    };

    audio.addEventListener("play", () => {
      state.voicePreviewState = "playing";
      render();
    });

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    try {
      await audio.play();
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  async function playAssistantAudio(audioBase64, mimeType) {
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

    return new Promise((resolve, reject) => {
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

      audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  function speakLocally(text, language) {
    if (!("speechSynthesis" in window) || !text.trim()) {
      return Promise.resolve();
    }

    stopAssistantPlayback();
    stopVoicePreviewPlayback();
    state.assistantSpeaking = true;
    state.websocketDetail = "Assistant speaking...";
    render();

    return new Promise((resolve, reject) => {
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

  function normalizeWebSocketPhase(phase) {
    switch (phase) {
      case "connected":
      case "ready":
      case "transcribing":
      case "thinking":
      case "synthesizing":
      case "error":
      case "idle":
        return phase;
      default:
        return "idle";
    }
  }

  function handleSocketMessage(event) {
    const payload = JSON.parse(event.data);

    if (payload.type === "status") {
      const phase = typeof payload.phase === "string" ? payload.phase : "idle";
      const detail = typeof payload.detail === "string" ? payload.detail : "";
      state.websocketPhase = normalizeWebSocketPhase(phase);

      if (!state.assistantSpeaking) {
        state.websocketDetail = detail || phase;
      }

      if (phase === "idle") {
        if (state.pendingAssistantText) {
          const fallbackText = state.pendingAssistantText;
          const fallbackLanguage = state.pendingAssistantLanguage;
          state.pendingAssistantText = null;
          state.pendingAssistantLanguage = null;

          if (state.conversationActive && !assistantAudioReceivedForTurn) {
            void speakLocally(fallbackText, fallbackLanguage)
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
      state.currentTemplateId = readOptionalString(payload.templateId) ?? state.currentTemplateId;
      savePageState();
      render();
      return;
    }

    if (payload.type === "transcript_ready") {
      appendLog("user", typeof payload.transcript === "string" ? payload.transcript : "Transcript unavailable.");
      return;
    }

    if (payload.type === "assistant_message") {
      const text =
        typeof payload.text === "string" ? payload.text : "Assistant reply unavailable.";
      appendLog("assistant", text);
      state.pendingAssistantText = text;
      state.pendingAssistantLanguage = readOptionalString(payload.language) ?? null;
      return;
    }

    if (payload.type === "voice_updated") {
      const nextVoiceId = readOptionalString(payload.voiceId) ?? null;
      const matchingVoice = nextVoiceId
        ? state.voices.find((voice) => voice.voiceId === nextVoiceId)
        : null;

      state.preferredVoiceId = nextVoiceId;
      if (matchingVoice) {
        state.preferredVoiceName = matchingVoice.name;
      }

      if (
        refs.voiceSelect &&
        Array.from(refs.voiceSelect.options).some(
          (option) => option.value === (nextVoiceId ?? "")
        )
      ) {
        refs.voiceSelect.value = nextVoiceId ?? "";
      }

      saveRegistrationState();
      render();
      return;
    }

    if (payload.type === "assistant_audio") {
      const audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
      const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "audio/mpeg";

      if (!audioBase64) {
        console.warn("Assistant audio event did not include audio data.");
        return;
      }

      const fallbackText = readOptionalString(state.pendingAssistantText);
      const fallbackLanguage =
        readOptionalString(payload.language) ?? state.pendingAssistantLanguage;
      state.pendingAssistantText = null;
      state.pendingAssistantLanguage = null;
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
            if (hasActiveSamsarCredentials() && state.assistantSessionId) {
              void syncBrowserSession().catch((error) => {
                console.error("Failed to refresh credits after assistant turn", error);
              });
            }
            scheduleConversationResume();
          });
      }

      return;
    }

    if (payload.type === "assistant_image") {
      const imageBase64 = typeof payload.imageBase64 === "string" ? payload.imageBase64 : "";
      const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl : "";
      const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "image/png";

      if (imageBase64) {
        appendImageLog("assistant", `data:${mimeType};base64,${imageBase64}`, "Image response");
        return;
      }

      if (imageUrl) {
        appendImageLog("assistant", imageUrl, "Image response");
      }

      return;
    }

    if (payload.type === "error") {
      const message =
        typeof payload.message === "string" ? payload.message : "Unexpected websocket error.";
      const code = typeof payload.code === "string" ? payload.code : undefined;

      if (code === "insufficient_credits" || isInsufficientCreditsMessage(message)) {
        showInsufficientCreditsState(message);
        return;
      }

      if (isExpiredTemplateCode(code)) {
        expireCurrentPageCache({
          appendLog: true,
          message,
          notify: true
        });
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

    if (!state.currentPage?.url) {
      throw new Error("A page URL is required before voice can start.");
    }

    if (state.registrationRequired || !hasActiveSamsarCredentials() || !state.assistantSessionId) {
      throw new Error("Login and account setup are required before starting voice chat.");
    }

    state.websocketState = "connecting";
    state.websocketPhase = "connected";
    state.websocketDetail = "Connecting...";
    render();

    activeSocketPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(SERVER_WS_URL);

      socket.addEventListener("message", handleSocketMessage);
      socket.addEventListener("close", () => {
        if (activeSocket === socket) {
          activeSocket = undefined;
          state.conversationActive = false;
          state.websocketState = "disconnected";
          state.websocketPhase = "idle";
          state.websocketDetail = "Disconnected";
          state.recording = false;
          state.assistantSpeaking = false;
          state.pendingAssistantText = null;
          state.pendingAssistantLanguage = null;
          render();
        }
      });

      socket.addEventListener("error", () => {
        reject(new Error("Failed to connect to the websocket gateway."));
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
          ...buildSessionCredentialPayload(),
          pageUrl: state.currentPage?.url,
          templateId: state.currentTemplateId,
          voiceId: getSelectedVoiceId(),
          language: getSelectedLanguage()
        });
        resolve(socket);
      });
    }).finally(() => {
      activeSocketPromise = undefined;
    });

    return activeSocketPromise;
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

  function resetConversationIdleTimer() {
    clearConversationIdleTimer();

    if (!state.conversationActive && !state.recording && !state.assistantSpeaking) {
      return;
    }

    conversationIdleTimer = window.setTimeout(() => {
      void stopConversationMode({
        detail: "Idle timeout",
        logMessage: "Voice turned off after 10 minutes idle. Start voice when you're ready."
      });
    }, CONVERSATION_IDLE_TIMEOUT_MS);
  }

  function scheduleConversationResume(delayMs) {
    clearResumeConversationTimer();

    if (!state.conversationActive) {
      return;
    }

    resumeConversationTimer = window.setTimeout(() => {
      void startConversationTurn().catch((error) => {
        handleConversationLoopError(error);
      });
    }, delayMs || 250);
  }

  function cleanupAudioMonitor() {
    if (typeof monitorFrameId === "number") {
      window.cancelAnimationFrame(monitorFrameId);
    }

    monitorFrameId = undefined;
    analyserTimeData = undefined;
    analyserFrequencyData = undefined;

    try {
      mediaSourceNode?.disconnect();
    } catch {
      // Ignore disconnect failures during teardown.
    }

    try {
      analyserNode?.disconnect();
    } catch {
      // Ignore disconnect failures during teardown.
    }

    mediaSourceNode = undefined;
    analyserNode = undefined;

    if (audioContext) {
      void audioContext.close().catch(() => {
        // Ignore close failures during teardown.
      });
    }

    audioContext = undefined;
  }

  function cleanupRecording() {
    cleanupAudioMonitor();
    activeMediaRecorder = undefined;

    if (activeMicrophoneStream) {
      for (const track of activeMicrophoneStream.getTracks()) {
        track.stop();
      }
    }

    activeMicrophoneStream = undefined;
    recordedChunks = [];
    recordingStartedAt = 0;
    discardCurrentRecording = false;
    stopRequested = false;
    speechDetectedAt = undefined;
    lastVoiceDetectedAt = undefined;
    sustainedVoiceFrames = 0;
  }

  function getPreferredRecordingMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  }

  function normalizeRecordingError(error) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        return "Microphone access was blocked or dismissed. Allow microphone access for this site, then try Start voice again.";
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

  function getBandEnergy(frequencyData, sampleRate, minHz, maxHz) {
    const nyquist = sampleRate / 2;
    const clampedMinHz = Math.max(0, minHz);
    const clampedMaxHz = Math.min(maxHz, nyquist);

    if (clampedMaxHz <= clampedMinHz) {
      return 0;
    }

    const startIndex = Math.max(0, Math.floor((clampedMinHz / nyquist) * frequencyData.length));
    const endIndex = Math.min(
      frequencyData.length - 1,
      Math.ceil((clampedMaxHz / nyquist) * frequencyData.length)
    );

    if (endIndex < startIndex) {
      return 0;
    }

    let energy = 0;
    for (let index = startIndex; index <= endIndex; index += 1) {
      energy += frequencyData[index];
    }

    return energy;
  }

  function isVoiceLikeSignal() {
    if (!analyserNode || !analyserTimeData || !analyserFrequencyData || !audioContext) {
      return false;
    }

    analyserNode.getByteTimeDomainData(analyserTimeData);
    analyserNode.getByteFrequencyData(analyserFrequencyData);

    let sum = 0;
    for (const sample of analyserTimeData) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / analyserTimeData.length);
    if (rms < MIN_SIGNAL_RMS) {
      return false;
    }

    const sampleRate = audioContext.sampleRate;
    const analysisMaxHz = Math.min(ANALYSIS_BAND_MAX_HZ, sampleRate / 2);
    const totalEnergy = getBandEnergy(analyserFrequencyData, sampleRate, 80, analysisMaxHz);
    if (totalEnergy <= 0) {
      return false;
    }

    const voiceEnergy = getBandEnergy(
      analyserFrequencyData,
      sampleRate,
      VOICE_BAND_MIN_HZ,
      Math.min(VOICE_BAND_MAX_HZ, analysisMaxHz)
    );
    const lowEnergy = getBandEnergy(analyserFrequencyData, sampleRate, 0, Math.min(LOW_RUMBLE_MAX_HZ, analysisMaxHz));
    const highEnergy = getBandEnergy(
      analyserFrequencyData,
      sampleRate,
      Math.min(HIGH_CLICK_MIN_HZ, analysisMaxHz),
      analysisMaxHz
    );

    const voiceShare = voiceEnergy / totalEnergy;
    const lowShare = lowEnergy / totalEnergy;
    const highShare = highEnergy / totalEnergy;

    return (
      voiceShare >= MIN_VOICE_BAND_SHARE &&
      lowShare <= MAX_LOW_BAND_SHARE &&
      highShare <= MAX_HIGH_BAND_SHARE
    );
  }

  function monitorSpeechActivity() {
    if (!activeMediaRecorder || activeMediaRecorder.state === "inactive" || stopRequested) {
      monitorFrameId = undefined;
      return;
    }

    const now = performance.now();
    const voiceLikeSignal = isVoiceLikeSignal();

    if (voiceLikeSignal) {
      sustainedVoiceFrames = Math.min(sustainedVoiceFrames + 1, MIN_SUSTAINED_VOICE_FRAMES + 4);

      if (sustainedVoiceFrames >= MIN_SUSTAINED_VOICE_FRAMES) {
        speechDetectedAt = speechDetectedAt || now;
        lastVoiceDetectedAt = now;
      }
    } else if (
      speechDetectedAt &&
      lastVoiceDetectedAt &&
      now - speechDetectedAt >= MIN_SPEECH_DURATION_MS &&
      now - lastVoiceDetectedAt >= SILENCE_STOP_DURATION_MS
    ) {
      void stopMicrophoneTurn({
        discard: false,
        processingLabel: "Processing audio..."
      });
      monitorFrameId = undefined;
      return;
    } else {
      sustainedVoiceFrames = Math.max(sustainedVoiceFrames - 1, 0);
    }

    monitorFrameId = window.requestAnimationFrame(monitorSpeechActivity);
  }

  async function startMicrophoneTurn() {
    if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
      return;
    }

    if (!window.isSecureContext) {
      throw new Error(
        "Microphone recording requires an HTTPS page. Open the client on a secure page and try again."
      );
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This page cannot request microphone access in the current browser context."
      );
    }

    activeMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    recordedChunks = [];
    const mimeType = getPreferredRecordingMimeType();
    activeMediaRecorder = mimeType
      ? new MediaRecorder(activeMicrophoneStream, { mimeType })
      : new MediaRecorder(activeMicrophoneStream);
    recordingStartedAt = Date.now();
    discardCurrentRecording = false;
    stopRequested = false;
    speechDetectedAt = undefined;
    lastVoiceDetectedAt = undefined;
    sustainedVoiceFrames = 0;

    activeMediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    activeMediaRecorder.addEventListener(
      "stop",
      async () => {
        const recorderMimeType = activeMediaRecorder?.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordedChunks, { type: recorderMimeType });
        const durationMs =
          recordingStartedAt > 0 ? Math.max(0, Date.now() - recordingStartedAt) : undefined;
        const shouldDiscard = discardCurrentRecording;
        cleanupRecording();

        if (shouldDiscard) {
          render();
          return;
        }

        if (blob.size < MIN_RECORDED_AUDIO_BYTES) {
          appendLog("system", "No clear speech was detected. Try again when you're ready.");
          state.websocketPhase = state.conversationActive ? "ready" : "idle";
          state.websocketDetail = state.conversationActive ? "Listening..." : "Idle";
          render();

          if (state.conversationActive) {
            scheduleConversationResume(200);
          }

          return;
        }

        await submitRecordedAudio(blob, durationMs);
      },
      { once: true }
    );

    if (window.AudioContext || window.webkitAudioContext) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextConstructor();
      mediaSourceNode = audioContext.createMediaStreamSource(activeMicrophoneStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.68;
      analyserTimeData = new Uint8Array(analyserNode.fftSize);
      analyserFrequencyData = new Uint8Array(analyserNode.frequencyBinCount);
      mediaSourceNode.connect(analyserNode);
    }

    activeMediaRecorder.start();
    state.recording = true;
    state.websocketPhase = "ready";
    state.websocketDetail = "Listening...";
    render();
    resetConversationIdleTimer();
    monitorSpeechActivity();
  }

  async function stopMicrophoneTurn(options) {
    if (!activeMediaRecorder || activeMediaRecorder.state === "inactive") {
      return;
    }

    discardCurrentRecording = Boolean(options?.discard);
    stopRequested = true;
    state.recording = false;
    state.websocketPhase = options?.discard ? "idle" : "transcribing";
    state.websocketDetail = options?.discard ? "Stopped" : options?.processingLabel || "Processing audio...";
    render();
    activeMediaRecorder.stop();
  }

  async function submitRecordedAudio(blob, durationMs) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await submitRecordedAudioBase64(
      base64FromBytes(bytes),
      blob.type || "audio/webm",
      durationMs
    );
  }

  async function submitRecordedAudioBase64(audioBase64, mimeType, durationMs) {
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
      language: getSelectedLanguage(),
      templateId: state.currentTemplateId
    });
  }

  async function startConversationTurn() {
    if (!state.conversationActive || state.recording || state.assistantSpeaking) {
      return;
    }

    state.websocketPhase = "ready";
    state.websocketDetail = "Listening...";
    render();
    await ensureWebSocketSession();
    await startMicrophoneTurn();
  }

  function handleConversationLoopError(error) {
    const message = normalizeRecordingError(error);
    if (isInsufficientCreditsMessage(message)) {
      showInsufficientCreditsState(message);
      return;
    }

    closeWebSocketSession({
      phase: "error",
      detail: "Voice chat stopped"
    });
    appendLog("system", message);
    render();
  }

  async function startRecording() {
    setCurrentPageFromInput();

    const analyzeUrlError = getAnalyzeUrlError(state.currentPage?.url);
    if (analyzeUrlError) {
      appendLog("system", analyzeUrlError);
      return;
    }

    if (!state.authUser) {
      openAuthOverlay("login", "voice");
      appendLog("system", "Login is required before voice chat can start.");
      return;
    }

    if (!state.analysisReady) {
      appendLog("system", "Analyze the page before starting voice.");
      return;
    }

    try {
      await ensureProvisionedSession();
      stopVoicePreviewPlayback();
      state.conversationActive = true;
      state.websocketPhase = "connected";
      state.websocketDetail = "Starting...";
      render();
      await startConversationTurn();
    } catch (error) {
      state.conversationActive = false;
      handleConversationLoopError(error);
    }
  }

  async function stopConversationMode(input) {
    clearResumeConversationTimer();
    clearConversationIdleTimer();
    state.conversationActive = false;
    state.recording = false;
    state.websocketPhase = "idle";
    state.websocketDetail = input?.detail || "Stopped";
    stopAssistantPlayback();

    if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
      await stopMicrophoneTurn({
        discard: true
      });
    } else {
      cleanupRecording();
    }

    closeWebSocketSession({
      phase: "idle",
      detail: input?.detail || "Stopped"
    });

    if (input?.logMessage) {
      appendLog("system", input.logMessage);
    }

    render();
  }

  function closeWebSocketSession(input) {
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
    state.conversationActive = false;
    state.recording = false;
    state.assistantSpeaking = false;
    state.pendingAssistantText = null;
    state.pendingAssistantLanguage = null;
    state.websocketState = "disconnected";
    state.websocketPhase = input?.phase || "idle";
    state.websocketDetail = input?.detail || "Idle";
    cleanupRecording();
  }

  function getStatusPillText() {
    if (!state.serverOnline) {
      return "Offline";
    }

    if (state.isAnalyzing) {
      return "Analyzing";
    }

    if (state.recording) {
      return "Listening";
    }

    if (state.assistantSpeaking) {
      return "Speaking";
    }

    if (state.conversationActive) {
      return "Voice live";
    }

    if (state.analysisReady) {
      return "Ready";
    }

    if (state.authUser) {
      return "Signed in";
    }

    return "Guest";
  }

  function getSurfaceStatusText() {
    if (!state.serverOnline) {
      return "The server is currently unavailable.";
    }

    if (state.isAnalyzing) {
      return "Preparing the page structure for follow-up Q&A.";
    }

    if (state.recording) {
      return "Listening for your question.";
    }

    if (state.assistantSpeaking) {
      return "Replying in the selected voice.";
    }

    if (state.conversationActive) {
      return state.websocketDetail || "Voice is live.";
    }

    if (state.analysisReady) {
      return "The page is ready. Start voice when you're ready to ask.";
    }

    if (state.pageCacheExpired) {
      return EXPIRED_PAGE_CACHE_MESSAGE;
    }

    if (state.currentPage?.url) {
      return "Analyze this page to prepare the conversation.";
    }

    return "Paste a public URL, then analyze it.";
  }

  function getAnalyzeButtonLabel() {
    if (state.isAnalyzing) {
      return "Analyzing...";
    }

    return state.analysisReady ? "Re-analyze" : "Prepare page";
  }

  function getVoiceButtonLabel() {
    if (state.websocketState === "connecting") {
      return "Connecting...";
    }

    if (state.conversationActive || state.recording || state.assistantSpeaking) {
      return "Stop";
    }

    return "Speak";
  }

  function getUserDisplayName() {
    return (
      readOptionalString(state.currentUser?.displayName) ??
      readOptionalString(state.authUser?.displayName) ??
      readOptionalString(state.currentUser?.username) ??
      readOptionalString(state.authUser?.username) ??
      "Guest"
    );
  }

  function getAccountHintText() {
    if (!state.authUser) {
      return "Sign in to analyze pages and start voice Q&A.";
    }

    if (state.registrationRequired) {
      return "Session will be provisioned automatically when you start.";
    }

    return state.websocketDetail || "Ready to analyze and ask follow-up questions.";
  }

  function getCreditBannerMessage() {
    if (state.creditIssueMessage) {
      return state.creditIssueMessage;
    }

    const creditsRemaining = getCreditsRemaining();
    if (
      creditsRemaining !== null &&
      creditsRemaining <= LOW_CREDIT_WARNING_THRESHOLD &&
      state.authUser
    ) {
      return `Low balance: ${formatCreditsLabel(creditsRemaining)} remaining.`;
    }

    return null;
  }

  function render() {
    const creditsRemaining = getCreditsRemaining();
    const creditBannerMessage = getCreditBannerMessage();
    const voicePreviewSource = getSelectedVoicePreviewSource();
    const previewActive =
      state.voicePreviewVoiceId === getSelectedVoiceId() &&
      state.voicePreviewState !== "idle";

    if (refs.headerCredits) {
      refs.headerCredits.textContent =
        creditsRemaining === null
          ? state.authUser
            ? "-- cr"
            : "Guest"
          : `${creditCountFormatter.format(creditsRemaining)} cr`;
    }

    if (refs.analysisPill) {
      refs.analysisPill.textContent = getStatusPillText();
    }

    if (refs.noticeBanner) {
      refs.noticeBanner.hidden = !state.noticeMessage;
      refs.noticeBanner.textContent = state.noticeMessage || "";
    }

    if (refs.creditWarning) {
      refs.creditWarning.hidden = !creditBannerMessage || state.creditBannerDismissed;
    }

    if (refs.creditWarningMessage) {
      refs.creditWarningMessage.textContent = creditBannerMessage || "";
    }

    if (refs.pageTitle) {
      refs.pageTitle.textContent = state.currentPage?.title || "Paste a public URL to begin";
    }

    if (refs.surfaceStatus) {
      refs.surfaceStatus.textContent = getSurfaceStatusText();
    }

    if (refs.analyzeButton) {
      refs.analyzeButton.disabled =
        !state.serverOnline ||
        state.isAnalyzing ||
        state.authSubmitting ||
        state.settingsSaving ||
        (state.conversationActive && !state.recording);
    }

    if (refs.analyzeButtonLabel) {
      refs.analyzeButtonLabel.textContent = getAnalyzeButtonLabel();
    }

    setIcon(
      refs.analyzeButtonIcon,
      state.isAnalyzing ? "loader" : state.analysisReady ? "redo" : "scan"
    );

    if (refs.voiceToggleButton) {
      refs.voiceToggleButton.disabled =
        !state.serverOnline ||
        !state.currentPage?.url ||
        !state.analysisReady ||
        state.isAnalyzing ||
        state.authSubmitting ||
        state.settingsSaving;
      refs.voiceToggleButton.classList.toggle(
        "button-live",
        state.conversationActive || state.recording || state.assistantSpeaking
      );
    }

    if (refs.voiceToggleButtonLabel) {
      refs.voiceToggleButtonLabel.textContent = getVoiceButtonLabel();
    }

    setIcon(
      refs.voiceToggleButtonIcon,
      state.conversationActive || state.recording || state.assistantSpeaking ? "stop" : "mic"
    );

    if (refs.settingsCreditsRemaining) {
      refs.settingsCreditsRemaining.textContent =
        creditsRemaining === null ? "Checking..." : formatCreditsLabel(creditsRemaining);
    }

    if (refs.settingsCreditsCaption) {
      refs.settingsCreditsCaption.textContent = state.authUser
        ? "Use recharge if you need more credits for analysis or voice."
        : "Sign in to sync your Samsar credits here.";
    }

    if (refs.cachingTtlSelect) {
      if (refs.cachingTtlSelect.value !== String(state.cachingTtlSeconds)) {
        refs.cachingTtlSelect.value = String(state.cachingTtlSeconds);
      }

      refs.cachingTtlSelect.disabled =
        state.authSubmitting || state.settingsSaving || state.isAnalyzing;
    }

    if (refs.voicePreviewButton) {
      const previewBusy = state.recording || state.assistantSpeaking;
      refs.voicePreviewButton.disabled =
        !voicePreviewSource ||
        state.isAnalyzing ||
        state.authSubmitting ||
        state.settingsSaving ||
        (previewBusy && !previewActive);
      refs.voicePreviewButton.textContent = !voicePreviewSource
        ? "Preview unavailable"
        : previewActive && state.voicePreviewState === "playing"
          ? "Stop preview"
          : previewActive && state.voicePreviewState === "loading"
            ? "Loading..."
            : "Play preview";
    }

    if (refs.voiceWarning) {
      refs.voiceWarning.hidden = !state.voiceWarning;
      refs.voiceWarning.textContent = state.voiceWarning || "";
    }

    if (refs.saveSettingsButton) {
      refs.saveSettingsButton.disabled =
        state.authSubmitting || state.settingsSaving || state.isAnalyzing;
      refs.saveSettingsButton.textContent = state.settingsSaving ? "Saving..." : "Save advanced";
    }

    if (refs.rechargeButton) {
      refs.rechargeButton.disabled =
        state.authSubmitting ||
        state.settingsSaving ||
        !state.authUser ||
        state.registrationRequired;
    }

    if (refs.authOpenButton) {
      refs.authOpenButton.hidden = Boolean(state.authUser);
    }

    if (refs.logoutButton) {
      refs.logoutButton.hidden = !state.authUser;
    }

    if (refs.advancedStatus) {
      refs.advancedStatus.textContent = state.authUser
        ? state.registrationRequired
          ? "Your Samsar account is signed in. The live session will be provisioned when you start."
          : "Signed in and ready. Save advanced settings here whenever you change them."
        : "Sign in to analyze pages, start voice Q&A, and use your Samsar credits.";
    }

    if (refs.accountName) {
      refs.accountName.textContent = getUserDisplayName();
    }

    if (refs.accountHint) {
      refs.accountHint.textContent = getAccountHintText();
    }

    if (refs.accountEmail) {
      refs.accountEmail.textContent =
        readOptionalString(state.currentUser?.email) ??
        readOptionalString(state.authUser?.email) ??
        "Not provided";
    }

    if (refs.accountUsername) {
      refs.accountUsername.textContent =
        readOptionalString(state.currentUser?.username) ??
        readOptionalString(state.authUser?.username) ??
        "Not provided";
    }

    if (refs.accountUserId) {
      refs.accountUserId.textContent =
        readOptionalString(state.currentUser?.externalUserId) ??
        readOptionalString(state.authUser?._id) ??
        state.browserSessionId ??
        "Session pending";
    }

    if (refs.analysisStatus) {
      refs.analysisStatus.textContent = state.analysisReady
        ? `Ready${state.currentTemplateId ? ` • Template ${state.currentTemplateId}` : ""}`
        : state.pageCacheExpired
          ? EXPIRED_PAGE_CACHE_MESSAGE
          : getSurfaceStatusText();
    }

    if (refs.pageUrl) {
      refs.pageUrl.textContent = state.currentPage?.url || "No URL selected yet.";
    }

    if (refs.pageLanguage) {
      const selectedLanguage = getSelectedLanguage();
      refs.pageLanguage.textContent = `Language: ${selectedLanguage === "auto" ? "automatic" : selectedLanguage}`;
    }

    if (refs.authOverlay) {
      refs.authOverlay.hidden = !state.authOverlayOpen;
    }

    if (refs.mainScreen) {
      refs.mainScreen.hidden = state.authOverlayOpen;
    }

    if (refs.authTitle) {
      refs.authTitle.textContent =
        state.authMode === "login" ? "Login to continue" : "Create an account";
    }

    if (refs.authSubtitle) {
      refs.authSubtitle.textContent =
        state.authMode === "login"
          ? "Sign in to analyze pages, start voice Q&A, and use your Samsar credits."
          : "Create a Samsar account here and it will carry across samsar.one subdomains.";
    }

    if (refs.authStatus && !state.authSubmitting) {
      refs.authStatus.textContent =
        state.authMode === "login"
          ? "Use your existing Samsar account or create one here."
          : "Create your account and continue with the same web workflow.";
    }

    if (refs.loginForm) {
      refs.loginForm.hidden = state.authMode !== "login";
    }

    if (refs.registerForm) {
      refs.registerForm.hidden = state.authMode !== "register";
    }

    if (refs.authModeLoginButton) {
      refs.authModeLoginButton.classList.toggle("is-active", state.authMode === "login");
      refs.authModeLoginButton.setAttribute(
        "aria-selected",
        state.authMode === "login" ? "true" : "false"
      );
    }

    if (refs.authModeRegisterButton) {
      refs.authModeRegisterButton.classList.toggle("is-active", state.authMode === "register");
      refs.authModeRegisterButton.setAttribute(
        "aria-selected",
        state.authMode === "register" ? "true" : "false"
      );
    }

    if (refs.authCloseButton) {
      refs.authCloseButton.disabled = state.authSubmitting;
    }

    if (refs.advancedButton) {
      refs.advancedButton.disabled = state.authOverlayOpen;
    }

    if (refs.loginSubmitButton) {
      refs.loginSubmitButton.disabled = state.authSubmitting;
      refs.loginSubmitButton.textContent = state.authSubmitting ? "Logging in..." : "Login";
    }

    if (refs.registerSubmitButton) {
      refs.registerSubmitButton.disabled = state.authSubmitting;
      refs.registerSubmitButton.textContent = state.authSubmitting
        ? "Creating account..."
        : "Create account";
    }

    scheduleEmbeddedHeightSync();
  }

  refs.authModeLoginButton?.addEventListener("click", () => {
    state.authMode = "login";
    render();
  });

  refs.authModeRegisterButton?.addEventListener("click", () => {
    state.authMode = "register";
    render();
  });

  refs.authCloseButton?.addEventListener("click", () => {
    closeAuthOverlay();
  });

  refs.loginForm?.addEventListener("submit", (event) => {
    void handleLoginSubmit(event);
  });

  refs.registerForm?.addEventListener("submit", (event) => {
    void handleRegisterSubmit(event);
  });

  refs.advancedButton?.addEventListener("click", () => {
    if (!refs.advancedDrawer) {
      return;
    }

    const nextOpen = !refs.advancedDrawer.open;
    refs.advancedDrawer.open = nextOpen;

    if (nextOpen) {
      void ensureVoicesLoaded().catch((error) => {
        console.error("Failed to load speakers", error);
      });
    }

    scheduleEmbeddedHeightSync();
  });

  refs.advancedDrawer?.addEventListener("toggle", () => {
    scheduleEmbeddedHeightSync();
  });

  refs.sessionDrawer?.addEventListener("toggle", () => {
    scheduleEmbeddedHeightSync();
  });

  refs.urlForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void analyzeCurrentPage();
  });

  refs.pageUrlInput?.addEventListener("change", () => {
    setCurrentPageFromInput();
  });

  refs.analyzeButton?.addEventListener("click", () => {
    void analyzeCurrentPage();
  });

  refs.voiceToggleButton?.addEventListener("click", () => {
    if (state.conversationActive || state.recording || state.assistantSpeaking) {
      void stopConversationMode({
        detail: "Stopped"
      });
      return;
    }

    void startRecording();
  });

  refs.voicePreviewButton?.addEventListener("click", () => {
    void ensureVoicesLoaded()
      .then(() => toggleVoicePreviewPlayback())
      .catch((error) => {
        appendLog(
          "system",
          error instanceof Error ? error.message : "Failed to play speaker preview."
        );
      });
  });

  refs.saveSettingsButton?.addEventListener("click", () => {
    void persistAdvancedSettings();
  });

  refs.rechargeButton?.addEventListener("click", () => {
    void openRechargeFlow();
  });

  refs.creditWarningButton?.addEventListener("click", () => {
    void openRechargeFlow();
  });

  refs.creditWarningDismissButton?.addEventListener("click", dismissCreditBanner);

  refs.authOpenButton?.addEventListener("click", () => {
    openAuthOverlay("login", null);
  });

  refs.logoutButton?.addEventListener("click", () => {
    clearAuthData();
    clearRegistrationState();
    closeWebSocketSession();
    populateProfileInputs(true);
    render();
    showNotice("Signed out from this web client.");
  });

  refs.voiceSelect?.addEventListener("change", () => {
    state.preferredVoiceId = getSelectedVoiceId();
    state.preferredVoiceName = getSelectedVoiceName();
    stopVoicePreviewPlayback();

    if (activeSocket?.readyState === WebSocket.OPEN) {
      sendSocketMessage({
        type: "set_voice",
        voiceId: getSelectedVoiceId()
      });
    }

    saveRegistrationState();
    render();
  });

  refs.languageSelect?.addEventListener("change", () => {
    savePageState();
    saveRegistrationState();
    syncLanguagePreferenceToSocket();
    render();
  });

  refs.prepareMaxCreditsInput?.addEventListener("change", () => {
    updatePreparePageCreditCapFromInput();
  });

  refs.prepareMaxCreditsInput?.addEventListener("blur", () => {
    updatePreparePageCreditCapFromInput();
  });

  refs.cachingTtlSelect?.addEventListener("change", () => {
    updateCachingTtlFromInput();
  });

  window.addEventListener("focus", () => {
    if (
      state.creditIssueMessage &&
      hasActiveSamsarCredentials() &&
      state.assistantSessionId
    ) {
      void syncBrowserSession().catch((error) => {
        console.error("Failed to refresh browser session", error);
      });
    }
  });

  window.addEventListener("pagehide", () => {
    void stopConversationMode({
      detail: "Stopped"
    });
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

  async function boot() {
    state.browserSessionId = getOrCreateBrowserSessionId();
    loadPreparePageSettings();
    loadRegistrationState();
    loadPageState();
    populateProfileInputs(true);
    resetConversationLog();
    render();
    await refreshServerStatus();
    await restoreAuthSessionFromLocation();
    await refreshAuthSession();
    await refreshIndexStatus();
    render();
  }

  bindEmbeddedHeightSync();
  void boot();
})();
