import { File } from "node:buffer";
import type { Server as HttpServer, IncomingMessage } from "node:http";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

import { elevenLabsAdapter } from "../adapters/elevenlabs.js";
import { env } from "../config/env.js";
import { generateGroundedAssistantReply } from "../lib/chat-agent.js";
import {
  chargeExternalElevenLabsSynthesisUsage,
  chargeExternalElevenLabsTranscriptionUsage
} from "../lib/external-usage-billing.js";

interface SessionInitMessage {
  type: "session_init";
  assistantSessionId?: string;
  browserSessionId: string;
  extensionId?: string;
  externalUserApiKey?: string;
  pageUrl: string;
  pageTitle?: string;
  templateId?: string;
  voiceId?: string;
  language?: string | null;
  userAgent?: string;
}

interface SubmitAudioMessage {
  type: "submit_audio";
  audioBase64: string;
  durationMs?: number;
  mimeType?: string;
  language?: string | null;
  templateId?: string;
  voiceId?: string;
}

interface SetVoiceMessage {
  type: "set_voice";
  voiceId?: string;
}

interface PingMessage {
  type: "ping";
}

type ClientMessage =
  | SessionInitMessage
  | SubmitAudioMessage
  | SetVoiceMessage
  | PingMessage;

interface SocketState {
  assistantSessionId?: string;
  browserSessionId?: string;
  conversationId?: string;
  extensionId?: string;
  externalUserApiKey?: string;
  pageUrl?: string;
  pageTitle?: string;
  templateId?: string;
  voiceId?: string;
  language?: string | null;
}

function sendMessage(socket: WebSocket, payload: Record<string, unknown>) {
  socket.send(JSON.stringify(payload));
}

function sendStatus(
  socket: WebSocket,
  phase:
    | "connected"
    | "ready"
    | "transcribing"
    | "thinking"
    | "synthesizing"
    | "idle"
    | "error",
  detail?: string
) {
  sendMessage(socket, {
    type: "status",
    phase,
    detail,
    at: new Date().toISOString()
  });
}

function rawDataToString(rawData: RawData) {
  if (typeof rawData === "string") {
    return rawData;
  }

  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString("utf8");
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString("utf8");
  }

  return rawData.toString("utf8");
}

function parseClientMessage(rawData: RawData): ClientMessage | null {
  try {
    return JSON.parse(rawDataToString(rawData)) as ClientMessage;
  } catch {
    return null;
  }
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

function normalizeLanguage(language?: string | null) {
  if (!language || language === "auto") {
    return undefined;
  }

  return language;
}

async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  language?: string | null
) {
  const buffer = Buffer.from(audioBase64, "base64");

  if (!elevenLabsAdapter.isConfigured()) {
    throw new Error("ELEVENLABS_API_KEY is not configured for transcription.");
  }

  try {
    const file = new File(
      [buffer],
      `turn.${getAudioFileExtension(mimeType)}`,
      { type: mimeType }
    );
    const result = await elevenLabsAdapter.transcribe({
      enableLogging: true,
      modelId: "scribe_v2",
      file,
      languageCode: normalizeLanguage(language),
      diarize: false,
      timestampsGranularity: "word"
    });
    const transcriptPayload = result.transcription;
    const transcriptText =
      "text" in transcriptPayload && typeof transcriptPayload.text === "string"
        ? transcriptPayload.text.trim()
        : "";

    return {
      transcript:
        transcriptText ||
        "Audio was received but the transcript came back empty.",
      detectedLanguage:
        "languageCode" in transcriptPayload
          ? transcriptPayload.languageCode
          : undefined,
      durationMs: result.durationMs,
      requestId: result.requestId,
      source: "elevenlabs" as const
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Transcription failed. ${error.message}`
        : "Transcription failed."
    );
  }
}

async function synthesizeAssistantAudio(text: string, voiceId?: string) {
  const resolvedVoiceId = voiceId ?? env.integrations.elevenLabs.defaultVoiceId;

  if (!resolvedVoiceId || !elevenLabsAdapter.isConfigured()) {
    return null;
  }

  try {
    const result = await elevenLabsAdapter.synthesize({
      voiceId: resolvedVoiceId,
      text
    });

    return {
      audioBase64: result.audioBuffer.toString("base64"),
      characterCount: result.characterCount,
      mimeType: "audio/mpeg",
      requestId: result.requestId,
      source: "elevenlabs" as const,
      voiceId: resolvedVoiceId
    };
  } catch {
    return null;
  }
}

async function initializeConversation(
  socket: WebSocket,
  state: SocketState,
  payload: SessionInitMessage
) {
  if (!payload.externalUserApiKey || !payload.assistantSessionId) {
    sendStatus(
      socket,
      "error",
      "Register this browser installation before starting voice chat."
    );
    sendMessage(socket, {
      type: "error",
      message:
        "Structure Queries registration is incomplete. Missing externalUserApiKey or assistantSessionId."
    });
    return;
  }

  state.assistantSessionId = payload.assistantSessionId;
  state.browserSessionId = payload.browserSessionId;
  state.conversationId = payload.assistantSessionId;
  state.extensionId = payload.extensionId;
  state.externalUserApiKey = payload.externalUserApiKey;
  state.pageUrl = payload.pageUrl;
  state.pageTitle = payload.pageTitle;
  state.templateId = payload.templateId;
  state.voiceId = payload.voiceId;
  state.language = payload.language ?? null;

  sendMessage(socket, {
    type: "session_ready",
    assistantSessionId: payload.assistantSessionId,
    browserSessionId: payload.browserSessionId,
    conversationId: state.conversationId,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    templateId: state.templateId ?? null,
    voiceId: payload.voiceId ?? null,
    language: payload.language ?? null,
    analysisReady: Boolean(payload.templateId),
    analysis: null,
    integrations: {
      elevenlabs: elevenLabsAdapter.isConfigured()
    }
  });
  sendStatus(socket, "ready", "Voice session is ready.");
}

async function handleSubmitAudio(
  socket: WebSocket,
  state: SocketState,
  payload: SubmitAudioMessage
) {
  if (
    !state.browserSessionId ||
    !state.pageUrl ||
    !state.externalUserApiKey ||
    !state.assistantSessionId
  ) {
    sendStatus(socket, "error", "Send session_init before submit_audio.");
    sendMessage(socket, {
      type: "error",
      message: "Voice session is not initialized."
    });
    return;
  }

  const activeVoiceId = payload.voiceId ?? state.voiceId;
  const activeLanguage = payload.language ?? state.language ?? null;
  const activeTemplateId = payload.templateId ?? state.templateId;

  sendStatus(socket, "transcribing", "Processing recorded audio.");
  let transcription;

  try {
    transcription = await transcribeAudio(
      payload.audioBase64,
      payload.mimeType ?? "audio/webm",
      activeLanguage
    );
    await chargeExternalElevenLabsTranscriptionUsage({
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      durationMs: transcription.durationMs ?? payload.durationMs,
      externalUserApiKey: state.externalUserApiKey,
      language: transcription.detectedLanguage ?? activeLanguage,
      mimeType: payload.mimeType ?? "audio/webm",
      pageTitle: state.pageTitle,
      pageUrl: state.pageUrl,
      requestId: transcription.requestId
    });
  } catch (error) {
    sendStatus(socket, "error", "Transcription failed.");
    sendMessage(socket, {
      type: "error",
      message:
        error instanceof Error ? error.message : "Transcription failed."
    });
    return;
  }

  sendMessage(socket, {
    type: "transcript_ready",
    transcript: transcription.transcript,
    language: transcription.detectedLanguage,
    source: transcription.source
  });

  sendStatus(socket, "thinking", "Generating assistant reply.");
  let assistantReply;

  try {
    assistantReply = await generateGroundedAssistantReply({
      externalUserApiKey: state.externalUserApiKey,
      browserSessionId: state.browserSessionId,
      conversationId: state.conversationId,
      language: transcription.detectedLanguage ?? activeLanguage,
      metadata: {
        assistantSessionId: state.assistantSessionId,
        extensionId: state.extensionId,
        source: "plugin_gateway"
      },
      pageTitle: state.pageTitle,
      pageUrl: state.pageUrl,
      samsarSessionId: state.assistantSessionId,
      templateId: activeTemplateId,
      transcript: transcription.transcript,
      user: state.browserSessionId
    });
  } catch (error) {
    sendStatus(socket, "error", "Assistant generation failed.");
    sendMessage(socket, {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Assistant generation failed."
    });
    return;
  }

  const assistantText = assistantReply.text;
  let synthesizedAudio = null;

  if (assistantText.trim()) {
    sendStatus(socket, "synthesizing", "Synthesizing assistant voice.");

    try {
      synthesizedAudio = await synthesizeAssistantAudio(assistantText, activeVoiceId);

      if (synthesizedAudio) {
        await chargeExternalElevenLabsSynthesisUsage({
          assistantSessionId: state.assistantSessionId,
          browserSessionId: state.browserSessionId,
          charactersUsed: synthesizedAudio.characterCount ?? undefined,
          externalUserApiKey: state.externalUserApiKey,
          pageTitle: state.pageTitle,
          pageUrl: state.pageUrl,
          requestId: synthesizedAudio.requestId,
          text: assistantText,
          voiceId: activeVoiceId
        });
      }
    } catch (error) {
      sendStatus(socket, "error", "Assistant voice billing failed.");
      sendMessage(socket, {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Assistant voice billing failed."
      });
      return;
    }
  }

  sendMessage(socket, {
    type: "assistant_message",
    text: assistantText,
    source: assistantReply.provider,
    templateId: assistantReply.templateId ?? activeTemplateId ?? null,
    warnings: assistantReply.warnings ?? []
  });

  for (const [index, image] of assistantReply.images.entries()) {
    sendMessage(socket, {
      type: "assistant_image",
      imageBase64: image.base64 ?? null,
      imageUrl: image.url ?? image.dataUrl ?? null,
      mimeType: image.mimeType,
      index,
      total: assistantReply.images.length,
      source: assistantReply.provider,
      templateId: assistantReply.templateId ?? activeTemplateId ?? null
    });
  }

  if (synthesizedAudio) {
    sendMessage(socket, {
      type: "assistant_audio",
      ...synthesizedAudio
    });
  }

  sendStatus(
    socket,
    "idle",
    synthesizedAudio
      ? "Assistant audio delivered."
      : assistantReply.images.length > 0
        ? "Assistant response delivered with image output."
        : "Assistant text delivered. No remote audio was generated."
  );
}

function handleConnection(socket: WebSocket, request: IncomingMessage) {
  const state: SocketState = {};
  const requestUserAgent = Array.isArray(request.headers["user-agent"])
    ? request.headers["user-agent"][0]
    : request.headers["user-agent"];

  socket.on("error", (error: Error) => {
    console.error("[plugin-gateway] websocket error", error);
  });

  sendStatus(socket, "connected", "WebSocket connection established.");

  socket.on("message", async (rawData: RawData) => {
    const message = parseClientMessage(rawData);

    if (!message) {
      sendMessage(socket, {
        type: "error",
        message: "Invalid JSON payload."
      });
      return;
    }

    if (message.type === "ping") {
      sendMessage(socket, {
        type: "pong",
        at: new Date().toISOString()
      });
      return;
    }

    if (message.type === "session_init") {
      await initializeConversation(socket, state, {
        ...message,
        userAgent: message.userAgent ?? requestUserAgent
      });
      return;
    }

    if (message.type === "set_voice") {
      state.voiceId = message.voiceId;
      sendMessage(socket, {
        type: "voice_updated",
        voiceId: message.voiceId ?? null
      });
      return;
    }

    if (message.type === "submit_audio") {
      await handleSubmitAudio(socket, state, message);
    }
  });
}

export function attachPluginGateway(server: HttpServer) {
  const websocketServer = new WebSocketServer({
    noServer: true
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`
    );

    if (requestUrl.pathname !== "/ws/plugin") {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  websocketServer.on("connection", handleConnection);

  return websocketServer;
}
