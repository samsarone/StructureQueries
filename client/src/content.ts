function getSelectedText() {
  return window.getSelection()?.toString().trim() ?? "";
}

const MIN_SPEECH_DURATION_MS = 250;
const SILENCE_STOP_DURATION_MS = 550;
const VOICE_ACTIVITY_THRESHOLD = 0.02;
const OVERLAY_HOST_ID = "structuredqueries-overlay-host";
const OVERLAY_FRAME_URL = chrome.runtime.getURL("popup.html");

let mediaRecorder: MediaRecorder | undefined;
let mediaStream: MediaStream | undefined;
let recordedChunks: Blob[] = [];
let analyserNode: AnalyserNode | undefined;
let analyserData: Uint8Array<ArrayBuffer> | undefined;
let audioContext: AudioContext | undefined;
let mediaSourceNode: MediaStreamAudioSourceNode | undefined;
let monitorFrameId: number | undefined;
let speechDetectedAt: number | undefined;
let lastVoiceDetectedAt: number | undefined;
let stopRequested = false;
let overlayHost: HTMLDivElement | undefined;
let overlayFrame: HTMLIFrameElement | undefined;

function resetSpeechActivity() {
  speechDetectedAt = undefined;
  lastVoiceDetectedAt = undefined;
  stopRequested = false;
}

function cleanupAudioMonitor() {
  if (typeof monitorFrameId === "number") {
    cancelAnimationFrame(monitorFrameId);
  }

  monitorFrameId = undefined;
  analyserData = undefined;

  try {
    mediaSourceNode?.disconnect();
  } catch {
    // Ignore disconnect errors during teardown.
  }

  try {
    analyserNode?.disconnect();
  } catch {
    // Ignore disconnect errors during teardown.
  }

  mediaSourceNode = undefined;
  analyserNode = undefined;

  if (audioContext) {
    void audioContext.close().catch(() => {
      // Ignore close errors during teardown.
    });
  }

  audioContext = undefined;
}

function cleanupRecording() {
  cleanupAudioMonitor();
  mediaRecorder = undefined;

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }

  mediaStream = undefined;
  recordedChunks = [];
  resetSpeechActivity();
}

function getPreferredRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function normalizeRecordingError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone access was blocked or dismissed for this site. Allow microphone access in Chrome, then click Talk again.";
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

function getCurrentVolumeLevel() {
  if (!analyserNode || !analyserData) {
    return 0;
  }

  analyserNode.getByteTimeDomainData(analyserData);

  let sum = 0;

  for (const sample of analyserData) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / analyserData.length);
}

function monitorSpeechActivity() {
  if (!mediaRecorder || mediaRecorder.state === "inactive" || stopRequested) {
    monitorFrameId = undefined;
    return;
  }

  const now = performance.now();
  const currentLevel = getCurrentVolumeLevel();

  if (currentLevel >= VOICE_ACTIVITY_THRESHOLD) {
    speechDetectedAt ??= now;
    lastVoiceDetectedAt = now;
  } else if (
    speechDetectedAt &&
    lastVoiceDetectedAt &&
    now - speechDetectedAt >= MIN_SPEECH_DURATION_MS &&
    now - lastVoiceDetectedAt >= SILENCE_STOP_DURATION_MS
  ) {
    void stopPageRecording("silence");
    monitorFrameId = undefined;
    return;
  }

  monitorFrameId = requestAnimationFrame(monitorSpeechActivity);
}

function startSpeechMonitor(stream: MediaStream) {
  cleanupAudioMonitor();

  audioContext = new AudioContext();
  mediaSourceNode = audioContext.createMediaStreamSource(stream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;
  analyserNode.smoothingTimeConstant = 0.7;
  analyserData = new Uint8Array(analyserNode.fftSize);
  mediaSourceNode.connect(analyserNode);
  monitorFrameId = requestAnimationFrame(monitorSpeechActivity);
}

async function startPageRecording() {
  if (!window.isSecureContext) {
    throw new Error(
      "Microphone recording requires an HTTPS page. Open the client on a secure page and try again."
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This page cannot request microphone access in the current browser context.");
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    return;
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true
  });
  recordedChunks = [];
  resetSpeechActivity();
  startSpeechMonitor(mediaStream);

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
    async () => {
      const blob = new Blob(recordedChunks, {
        type: mediaRecorder?.mimeType || mimeType || "audio/webm"
      });
      const hasSpeech = Boolean(speechDetectedAt);
      cleanupRecording();

      if (blob.size === 0 || !hasSpeech) {
        await chrome.runtime.sendMessage({
          type: "PAGE_RECORDING_CANCELLED"
        });
        return;
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      await chrome.runtime.sendMessage({
        type: "PAGE_AUDIO_READY",
        audioBase64: base64FromBytes(bytes),
        mimeType: blob.type || "audio/webm"
      });
    },
    { once: true }
  );

  mediaRecorder.start();

  await chrome.runtime.sendMessage({
    type: "PAGE_RECORDING_STARTED"
  });
}

async function stopPageRecording(reason: "manual" | "silence") {
  if (!mediaRecorder || mediaRecorder.state === "inactive" || stopRequested) {
    throw new Error("No active recording is in progress.");
  }

  stopRequested = true;
  cleanupAudioMonitor();
  mediaRecorder.stop();
  await chrome.runtime.sendMessage({
    type: "PAGE_RECORDING_STOPPED",
    reason
  });
}

function createOverlay() {
  const existingHost = document.getElementById(OVERLAY_HOST_ID);

  if (existingHost instanceof HTMLDivElement) {
    overlayHost = existingHost;
    overlayFrame =
      existingHost.shadowRoot?.querySelector("iframe") ?? undefined;
    return existingHost;
  }

  const host = document.createElement("div");
  host.id = OVERLAY_HOST_ID;
  const shadowRoot = host.attachShadow({
    mode: "open"
  });
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .sq-shell {
        position: fixed;
        top: 18px;
        right: 18px;
        width: min(430px, calc(100vw - 24px));
        height: min(760px, calc(100vh - 24px));
        z-index: 2147483647;
        pointer-events: none;
      }

      .sq-frame {
        width: 100%;
        height: 100%;
        border: 0;
        border-radius: 30px;
        background: transparent;
        overflow: hidden;
        pointer-events: auto;
        box-shadow:
          0 30px 80px rgba(2, 8, 16, 0.45),
          0 0 0 1px rgba(102, 188, 255, 0.14),
          0 0 0 1px rgba(2, 8, 16, 0.6) inset;
        animation: sq-enter 180ms ease-out;
      }

      @keyframes sq-enter {
        from {
          opacity: 0;
          transform: translateY(-10px) scale(0.98);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @media (max-width: 720px) {
        .sq-shell {
          top: 12px;
          right: 12px;
          left: 12px;
          width: auto;
          height: min(82vh, calc(100vh - 24px));
        }
      }
    </style>
    <div class="sq-shell">
      <iframe
        class="sq-frame"
        src="${OVERLAY_FRAME_URL}"
        title="StructuredQueries overlay"
        allow="microphone"
      ></iframe>
    </div>
  `;

  overlayHost = host;
  overlayFrame = shadowRoot.querySelector("iframe") ?? undefined;
  document.documentElement.append(host);
  return host;
}

function openOverlay() {
  createOverlay();
}

function closeOverlay() {
  if (!overlayHost) {
    overlayHost = document.getElementById(OVERLAY_HOST_ID) as HTMLDivElement | null ?? undefined;
  }

  const host = overlayHost;

  if (!host) {
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    void stopPageRecording("manual").catch(() => {
      cleanupRecording();
    });
  }

  host.remove();
  overlayHost = undefined;
  overlayFrame = undefined;
}

function toggleOverlay() {
  const existingHost = document.getElementById(OVERLAY_HOST_ID);

  if (existingHost) {
    closeOverlay();
    return;
  }

  openOverlay();
}

window.addEventListener("message", (event) => {
  if (event.source !== overlayFrame?.contentWindow) {
    return;
  }

  if (event.data?.type === "STRUCTUREDQUERIES_CLOSE_OVERLAY") {
    closeOverlay();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_CONTEXT") {
    sendResponse({
      documentLanguage: document.documentElement.lang || undefined,
      title: document.title || "Untitled page",
      url: window.location.href,
      selectedText: getSelectedText()
    });

    return false;
  }

  if (message?.type === "TOGGLE_PAGE_OVERLAY") {
    toggleOverlay();
    sendResponse({
      ok: true
    });
    return false;
  }

  if (message?.type === "CLOSE_PAGE_OVERLAY") {
    closeOverlay();
    sendResponse({
      ok: true
    });
    return false;
  }

  if (message?.type === "START_PAGE_RECORDING") {
    void startPageRecording()
      .then(() => {
        sendResponse({
          ok: true
        });
      })
      .catch((error) => {
        cleanupRecording();
        sendResponse({
          ok: false,
          error: normalizeRecordingError(error)
        });
      });

    return true;
  }

  if (message?.type === "STOP_PAGE_RECORDING") {
    void Promise.resolve()
      .then(() => {
        return stopPageRecording("manual");
      })
      .then(() => {
        sendResponse({
          ok: true
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to stop recording."
        });
      });

    return true;
  }

  return false;
});
