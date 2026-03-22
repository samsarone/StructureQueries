function getSelectedText() {
  return window.getSelection()?.toString().trim() ?? "";
}

const MIN_SPEECH_DURATION_MS = 320;
const SILENCE_STOP_DURATION_MS = 450;
const MIN_SIGNAL_RMS = 0.018;
const MIN_SUSTAINED_VOICE_FRAMES = 5;
const VOICE_BAND_MIN_HZ = 140;
const VOICE_BAND_MAX_HZ = 3600;
const LOW_RUMBLE_MAX_HZ = 120;
const HIGH_CLICK_MIN_HZ = 4200;
const ANALYSIS_BAND_MAX_HZ = 6000;
const MIN_VOICE_BAND_SHARE = 0.58;
const MAX_LOW_BAND_SHARE = 0.28;
const MAX_HIGH_BAND_SHARE = 0.22;
const OVERLAY_HOST_ID = "structuredqueries-overlay-host";
const OVERLAY_FRAME_URL = chrome.runtime.getURL("popup.html");

let mediaRecorder: MediaRecorder | undefined;
let mediaStream: MediaStream | undefined;
let recordedChunks: Blob[] = [];
let analyserNode: AnalyserNode | undefined;
let analyserTimeData: Uint8Array<ArrayBuffer> | undefined;
let analyserFrequencyData: Uint8Array<ArrayBuffer> | undefined;
let audioContext: AudioContext | undefined;
let mediaSourceNode: MediaStreamAudioSourceNode | undefined;
let monitorFrameId: number | undefined;
let speechDetectedAt: number | undefined;
let lastVoiceDetectedAt: number | undefined;
let stopRequested = false;
let sustainedVoiceFrames = 0;
let overlayHost: HTMLDivElement | undefined;
let overlayFrame: HTMLIFrameElement | undefined;

function resetSpeechActivity() {
  speechDetectedAt = undefined;
  lastVoiceDetectedAt = undefined;
  stopRequested = false;
  sustainedVoiceFrames = 0;
}

function cleanupAudioMonitor() {
  if (typeof monitorFrameId === "number") {
    cancelAnimationFrame(monitorFrameId);
  }

  monitorFrameId = undefined;
  analyserTimeData = undefined;
  analyserFrequencyData = undefined;

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
      return "Microphone access was blocked or dismissed for this site. Allow microphone access in Chrome, then click Start voice again.";
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

function getBandEnergy(
  frequencyData: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
) {
  const nyquist = sampleRate / 2;
  const clampedMinHz = Math.max(0, minHz);
  const clampedMaxHz = Math.min(maxHz, nyquist);

  if (clampedMaxHz <= clampedMinHz) {
    return 0;
  }

  const startIndex = Math.max(
    0,
    Math.floor((clampedMinHz / nyquist) * frequencyData.length)
  );
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
  const lowEnergy = getBandEnergy(
    analyserFrequencyData,
    sampleRate,
    0,
    Math.min(LOW_RUMBLE_MAX_HZ, analysisMaxHz)
  );
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
  if (!mediaRecorder || mediaRecorder.state === "inactive" || stopRequested) {
    monitorFrameId = undefined;
    return;
  }

  const now = performance.now();
  const voiceLikeSignal = isVoiceLikeSignal();

  if (voiceLikeSignal) {
    sustainedVoiceFrames = Math.min(
      sustainedVoiceFrames + 1,
      MIN_SUSTAINED_VOICE_FRAMES + 4
    );

    if (sustainedVoiceFrames >= MIN_SUSTAINED_VOICE_FRAMES) {
      speechDetectedAt ??= now;
      lastVoiceDetectedAt = now;
    }
  } else if (
    speechDetectedAt &&
    lastVoiceDetectedAt &&
    now - speechDetectedAt >= MIN_SPEECH_DURATION_MS &&
    now - lastVoiceDetectedAt >= SILENCE_STOP_DURATION_MS
  ) {
    void stopPageRecording("silence");
    monitorFrameId = undefined;
    return;
  } else {
    sustainedVoiceFrames = Math.max(sustainedVoiceFrames - 1, 0);
  }

  monitorFrameId = requestAnimationFrame(monitorSpeechActivity);
}

function startSpeechMonitor(stream: MediaStream) {
  cleanupAudioMonitor();

  audioContext = new AudioContext({
    latencyHint: "interactive"
  });
  mediaSourceNode = audioContext.createMediaStreamSource(stream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;
  analyserNode.smoothingTimeConstant = 0.5;
  analyserTimeData = new Uint8Array(analyserNode.fftSize);
  analyserFrequencyData = new Uint8Array(analyserNode.frequencyBinCount);
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
    audio: {
      autoGainControl: {
        ideal: true
      },
      channelCount: {
        ideal: 1
      },
      echoCancellation: {
        ideal: true
      },
      noiseSuppression: {
        ideal: true
      },
      sampleRate: {
        ideal: 24000
      }
    }
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
        top: 16px;
        right: 16px;
        width: min(356px, calc(100vw - 24px));
        height: min(624px, calc(100vh - 24px));
        z-index: 2147483647;
        pointer-events: none;
      }

      .sq-frame {
        width: 100%;
        height: 100%;
        border: 0;
        border-radius: 26px;
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
          transform: translateY(-8px) scale(0.985);
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
          height: min(72vh, calc(100vh - 24px));
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
