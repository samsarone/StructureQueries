export {};

let mediaRecorder: MediaRecorder | undefined;
let mediaStream: MediaStream | undefined;
let recordedChunks: Blob[] = [];

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

function getPreferredRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
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

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    return;
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
    async () => {
      const blob = new Blob(recordedChunks, {
        type: mediaRecorder?.mimeType || mimeType || "audio/webm"
      });
      cleanupRecording();

      if (blob.size === 0) {
        await chrome.runtime.sendMessage({
          type: "OFFSCREEN_RECORDING_ERROR",
          message: "No audio was captured for this turn."
        });
        return;
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      await chrome.runtime.sendMessage({
        type: "OFFSCREEN_AUDIO_READY",
        audioBase64: base64FromBytes(bytes),
        mimeType: blob.type || "audio/webm"
      });
    },
    { once: true }
  );

  mediaRecorder.start();

  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_RECORDING_STARTED"
  });
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    throw new Error("No active recording is in progress.");
  }

  mediaRecorder.stop();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OFFSCREEN_START_RECORDING") {
    void startRecording()
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

  if (message?.type === "OFFSCREEN_STOP_RECORDING") {
    void stopRecording()
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
