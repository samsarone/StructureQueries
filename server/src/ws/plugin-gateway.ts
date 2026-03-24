import { File } from "node:buffer";
import type { Server as HttpServer, IncomingMessage } from "node:http";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

import { elevenLabsAdapter } from "../adapters/elevenlabs.js";
import { env } from "../config/env.js";
import { ensureSessionPronunciationDictionary } from "../lib/elevenlabs-pronunciation.js";
import { generateGroundedAssistantReply } from "../lib/chat-agent.js";
import {
  chargeExternalElevenLabsSynthesisUsage,
  chargeExternalElevenLabsTranscriptionUsage
} from "../lib/external-usage-billing.js";
import { prepareAssistantTextForSpeech } from "../lib/speech-prep.js";
import {
  getSamsarErrorMessage,
  isSamsarCreditsIssue
} from "../lib/samsar-errors.js";

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

interface SetLanguageMessage {
  type: "set_language";
  language?: string | null;
}

interface PingMessage {
  type: "ping";
}

type ClientMessage =
  | SessionInitMessage
  | SubmitAudioMessage
  | SetVoiceMessage
  | SetLanguageMessage
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

const MIN_ACCEPTED_TRANSCRIPT_DURATION_MS = 140;
const MIN_ACCEPTED_TRANSCRIPT_LOGPROB = -1.5;
const MIN_ACCEPTED_TRANSCRIPT_CHARS = 2;
const MIN_ACCEPTED_LANGUAGE_PROBABILITY = 0.35;
const ISO_639_3_TO_1_LANGUAGE_CODE: Record<string, string> = {
  ara: "ar",
  ben: "bn",
  chi: "zh",
  deu: "de",
  dut: "nl",
  eng: "en",
  fra: "fr",
  fre: "fr",
  ger: "de",
  hin: "hi",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  mar: "mr",
  nld: "nl",
  pol: "pl",
  por: "pt",
  rus: "ru",
  spa: "es",
  tam: "ta",
  tel: "te",
  tur: "tr",
  ukr: "uk",
  urd: "ur",
  vie: "vi",
  zho: "zh"
};

type TranscriptChunk = {
  languageCode?: unknown;
  languageProbability?: unknown;
  words?: unknown;
};

type TranscriptWord = {
  text?: unknown;
  type?: unknown;
  logprob?: unknown;
  start?: unknown;
  end?: unknown;
};

type AcceptedTranscriptWord = {
  text: string;
  start: number | null;
  end: number | null;
};

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

function sendSocketError(
  socket: WebSocket,
  error: unknown,
  input: {
    fallbackMessage: string;
    statusDetail: string;
  }
) {
  const insufficientCredits = isSamsarCreditsIssue(error);
  const message = getSamsarErrorMessage(error, input.fallbackMessage);

  sendStatus(
    socket,
    "error",
    insufficientCredits ? "Not enough credits are available." : input.statusDetail
  );
  sendMessage(socket, {
    type: "error",
    code: insufficientCredits ? "insufficient_credits" : "request_failed",
    message
  });
}

function logGatewayEvent(event: string, context: Record<string, unknown> = {}) {
  console.log("[plugin-gateway]", {
    ...context,
    event
  });
}

function logTtsFailure(
  stage: string,
  error: unknown,
  context: Record<string, unknown> = {}
) {
  console.error("[plugin-gateway] ElevenLabs TTS failed", {
    ...context,
    error:
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack
          }
        : error,
    stage
  });
}

function summarizeTtsRequest(input: {
  languageCode?: string;
  locators?: Array<{
    pronunciationDictionaryId: string;
    versionId?: string;
  }> | undefined;
  text: string;
  voiceId: string;
}) {
  return {
    hasPronunciationDictionaryLocators: Boolean(input.locators?.length),
    languageCode: input.languageCode ?? null,
    pronunciationDictionaryLocators: input.locators ?? [],
    textPreview: input.text.slice(0, 240),
    textLength: input.text.length,
    voiceId: input.voiceId
  };
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
  if (!language) {
    return undefined;
  }

  const trimmed = language.trim().toLowerCase();

  if (!trimmed || trimmed === "auto") {
    return undefined;
  }

  const [baseLanguage] = trimmed.split(/[-_]/);

  if (!baseLanguage) {
    return undefined;
  }

  if (baseLanguage.length === 2) {
    return baseLanguage;
  }

  return ISO_639_3_TO_1_LANGUAGE_CODE[baseLanguage];
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceLanguageHint(language?: string | null) {
  const normalizedLanguage = normalizeLanguage(language);

  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  if (!language) {
    return undefined;
  }

  const trimmed = language.trim().toLowerCase();
  return trimmed && trimmed !== "auto" ? trimmed : undefined;
}

function resolveRequestedLanguageKey(language?: string | null) {
  return coerceLanguageHint(language) ?? null;
}

function resolveResponseLanguage(input: {
  requestedLanguage?: string | null;
  detectedLanguage?: string | null;
}) {
  return (
    coerceLanguageHint(input.detectedLanguage) ??
    resolveRequestedLanguageKey(input.requestedLanguage) ??
    null
  );
}

function createNoSpeechDetectedError(message = "No clear speech was detected.") {
  const error = new Error(message) as Error & {
    code: string;
  };
  error.code = "no_speech_detected";
  return error;
}

function isNoSpeechDetectedError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "no_speech_detected"
  );
}

function extractTranscriptChunks(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { transcripts?: unknown }).transcripts)
  ) {
    return (payload as { transcripts: TranscriptChunk[] }).transcripts;
  }

  return [payload as TranscriptChunk];
}

function extractTranscriptWords(payload: unknown) {
  return extractTranscriptChunks(payload).flatMap((chunk) =>
    Array.isArray(chunk?.words) ? (chunk.words as TranscriptWord[]) : []
  );
}

function normalizeTranscriptText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isWordLikeTranscriptText(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function readFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTranscript(words: AcceptedTranscriptWord[]) {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .trim();
}

function calculateAcceptedSpeechDurationMs(words: AcceptedTranscriptWord[]) {
  const starts = words
    .map((word) => word.start)
    .filter((value): value is number => typeof value === "number");
  const ends = words
    .map((word) => word.end)
    .filter((value): value is number => typeof value === "number");

  if (starts.length === 0 || ends.length === 0) {
    return null;
  }

  const start = Math.min(...starts);
  const end = Math.max(...ends);
  return end > start ? Math.ceil((end - start) * 1000) : null;
}

function normalizeTranscriptionResult(
  payload: unknown,
  requestId: string | null,
  fallbackDurationMs: number | null,
  language?: string | null
) {
  const transcriptChunks = extractTranscriptChunks(payload);
  const transcriptWords = extractTranscriptWords(payload);
  const expectedLanguage = normalizeLanguage(language);
  const audioEventCount = transcriptWords.filter(
    (word) => word?.type === "audio_event"
  ).length;
  const acceptedWords = transcriptWords.reduce<AcceptedTranscriptWord[]>(
    (result, word) => {
      if (word?.type !== "word") {
        return result;
      }

      const text = normalizeTranscriptText(word.text);

      if (!text || !isWordLikeTranscriptText(text)) {
        return result;
      }

      const logprob = readFiniteNumber(word.logprob);
      if (
        logprob !== null &&
        logprob < MIN_ACCEPTED_TRANSCRIPT_LOGPROB
      ) {
        return result;
      }

      result.push({
        text,
        start: readFiniteNumber(word.start),
        end: readFiniteNumber(word.end)
      });
      return result;
    },
    []
  );
  const transcript = formatTranscript(acceptedWords);
  const languageProbability = transcriptChunks.reduce((maxProbability, chunk) => {
    const nextProbability = readFiniteNumber(chunk?.languageProbability);
    return nextProbability !== null && nextProbability > maxProbability
      ? nextProbability
      : maxProbability;
  }, 0);
  const rawDetectedLanguage = transcriptChunks.reduce<string | undefined>(
    (resolvedLanguage, chunk) => {
      if (resolvedLanguage) {
        return resolvedLanguage;
      }

      return typeof chunk?.languageCode === "string" && chunk.languageCode.trim()
        ? chunk.languageCode
        : undefined;
    },
    undefined
  );
  const detectedLanguage = coerceLanguageHint(rawDetectedLanguage);
  const durationMs =
    calculateAcceptedSpeechDurationMs(acceptedWords) ?? fallbackDurationMs;

  if (!transcript || transcript.length < MIN_ACCEPTED_TRANSCRIPT_CHARS) {
    throw createNoSpeechDetectedError();
  }

  if (
    audioEventCount > acceptedWords.length * 2 &&
    acceptedWords.length < 2
  ) {
    throw createNoSpeechDetectedError(
      "Only background noise was detected in the recording."
    );
  }

  if (
    durationMs !== null &&
    durationMs < MIN_ACCEPTED_TRANSCRIPT_DURATION_MS &&
    acceptedWords.length < 2
  ) {
    throw createNoSpeechDetectedError();
  }

  if (
    !expectedLanguage &&
    languageProbability > 0 &&
    languageProbability < MIN_ACCEPTED_LANGUAGE_PROBABILITY &&
    acceptedWords.length < 2
  ) {
    throw createNoSpeechDetectedError(
      "The recording was too noisy to confidently detect speech."
    );
  }

  return {
    transcript,
    detectedLanguage,
    durationMs,
    requestId,
    source: "elevenlabs" as const
  };
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
      noVerbatim: true,
      tagAudioEvents: true,
      diarize: false,
      temperature: 0,
      timestampsGranularity: "word"
    });

    return normalizeTranscriptionResult(
      result.transcription,
      result.requestId,
      result.durationMs,
      language
    );
  } catch (error) {
    if (isNoSpeechDetectedError(error)) {
      throw error;
    }

    throw new Error(
      error instanceof Error
        ? `Transcription failed. ${error.message}`
        : "Transcription failed."
    );
  }
}

async function synthesizeAssistantAudio(
  input: {
    browserSessionId?: string;
    language?: string | null;
    retrievalChunks?: Array<{
      id: string;
      score?: number;
      text: string;
    }>;
    text: string;
    voiceId?: string;
  }
) {
  const resolvedVoiceId =
    input.voiceId ?? env.integrations.elevenLabs.defaultVoiceId;
  const resolvedLanguage = normalizeLanguage(input.language);

  if (!elevenLabsAdapter.isConfigured()) {
    logTtsFailure("skipped_unconfigured", new Error("ElevenLabs is not configured."), {
      browserSessionId: input.browserSessionId,
      requestedVoiceId: input.voiceId ?? null
    });
    return null;
  }

  if (!resolvedVoiceId) {
    logTtsFailure("skipped_no_voice", new Error("No ElevenLabs voice ID was available."), {
      browserSessionId: input.browserSessionId,
      requestedVoiceId: input.voiceId ?? null
    });
    return null;
  }

  const preparedSpeech = prepareAssistantTextForSpeech({
    language: input.language,
    retrievalChunks: input.retrievalChunks,
    text: input.text
  });
  logGatewayEvent("tts_requested", {
    browserSessionId: input.browserSessionId,
    language: resolvedLanguage ?? input.language ?? null,
    request: summarizeTtsRequest({
      languageCode: resolvedLanguage,
      locators: undefined,
      text: preparedSpeech.speechText,
      voiceId: resolvedVoiceId
    }),
    technicalTerms: preparedSpeech.technicalTerms,
    voiceId: resolvedVoiceId
  });

  let pronunciationDictionaryLocators:
    | Awaited<ReturnType<typeof ensureSessionPronunciationDictionary>>
    | undefined = undefined;

  try {
    pronunciationDictionaryLocators =
      await ensureSessionPronunciationDictionary({
        rules: preparedSpeech.pronunciationRules,
        sessionKey: input.browserSessionId
      });
  } catch (error) {
    logTtsFailure("dictionary_sync", error, {
      browserSessionId: input.browserSessionId,
      technicalTerms: preparedSpeech.technicalTerms,
      voiceId: resolvedVoiceId
    });
    pronunciationDictionaryLocators = undefined;
  }

  const synthesize = async (locators?: typeof pronunciationDictionaryLocators) => {
    const request = {
      voiceId: resolvedVoiceId,
      text: preparedSpeech.speechText,
      ...(resolvedLanguage ? { languageCode: resolvedLanguage } : {}),
      applyTextNormalization: "auto" as const,
      ...(locators?.length
        ? {
            pronunciationDictionaryLocators: locators
          }
        : {})
    };
    const result = await elevenLabsAdapter.synthesize(request);

    return {
      audioBase64: result.audioBuffer.toString("base64"),
      characterCount: result.characterCount,
      mimeType: "audio/mpeg",
      preparedText: preparedSpeech.speechText,
      pronunciationTerms: preparedSpeech.technicalTerms,
      requestId: result.requestId,
      source: "elevenlabs" as const,
      voiceId: resolvedVoiceId
    };
  };

  try {
    const response = await synthesize(pronunciationDictionaryLocators);

    if (!response.audioBase64) {
      logTtsFailure("empty_audio_primary", new Error("ElevenLabs returned an empty audio payload."), {
        browserSessionId: input.browserSessionId,
        hasDictionary: Boolean(pronunciationDictionaryLocators?.length),
        request: summarizeTtsRequest({
          languageCode: resolvedLanguage,
          locators: pronunciationDictionaryLocators,
          text: preparedSpeech.speechText,
          voiceId: resolvedVoiceId
        }),
        technicalTerms: preparedSpeech.technicalTerms,
        voiceId: resolvedVoiceId
      });
      return null;
    }

    logGatewayEvent("tts_succeeded", {
      browserSessionId: input.browserSessionId,
      characterCount: response.characterCount,
      hasDictionary: Boolean(pronunciationDictionaryLocators?.length),
      requestId: response.requestId,
      voiceId: resolvedVoiceId
    });
    return response;
  } catch (error) {
    logTtsFailure("synthesize_primary", error, {
      browserSessionId: input.browserSessionId,
      hasDictionary: Boolean(pronunciationDictionaryLocators?.length),
      request: summarizeTtsRequest({
        languageCode: resolvedLanguage,
        locators: pronunciationDictionaryLocators,
        text: preparedSpeech.speechText,
        voiceId: resolvedVoiceId
      }),
      technicalTerms: preparedSpeech.technicalTerms,
      voiceId: resolvedVoiceId
    });

    if (pronunciationDictionaryLocators?.length) {
      try {
        const fallbackResponse = await synthesize(undefined);

        if (!fallbackResponse.audioBase64) {
          logTtsFailure("empty_audio_fallback_plain", new Error("ElevenLabs returned an empty audio payload."), {
            browserSessionId: input.browserSessionId,
            request: summarizeTtsRequest({
              languageCode: resolvedLanguage,
              locators: undefined,
              text: preparedSpeech.speechText,
              voiceId: resolvedVoiceId
            }),
            technicalTerms: preparedSpeech.technicalTerms,
            voiceId: resolvedVoiceId
          });
          return null;
        }

        logGatewayEvent("tts_succeeded_fallback_plain", {
          browserSessionId: input.browserSessionId,
          characterCount: fallbackResponse.characterCount,
          requestId: fallbackResponse.requestId,
          voiceId: resolvedVoiceId
        });
        return fallbackResponse;
      } catch (retryError) {
        logTtsFailure("synthesize_fallback_plain", retryError, {
          browserSessionId: input.browserSessionId,
          request: summarizeTtsRequest({
            languageCode: resolvedLanguage,
            locators: undefined,
            text: preparedSpeech.speechText,
            voiceId: resolvedVoiceId
          }),
          technicalTerms: preparedSpeech.technicalTerms,
          voiceId: resolvedVoiceId
        });
      }
    }

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
  state.voiceId = readOptionalString(payload.voiceId);
  state.language = readOptionalString(payload.language) ?? null;

  logGatewayEvent("session_ready", {
    assistantSessionId: payload.assistantSessionId,
    browserSessionId: payload.browserSessionId,
    language: state.language,
    pageUrl: payload.pageUrl,
    templateId: state.templateId ?? null,
    voiceId: state.voiceId ?? null
  });
  sendMessage(socket, {
    type: "session_ready",
    assistantSessionId: payload.assistantSessionId,
    browserSessionId: payload.browserSessionId,
    conversationId: state.conversationId,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    templateId: state.templateId ?? null,
    voiceId: state.voiceId ?? null,
    language: resolveRequestedLanguageKey(state.language),
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

  const requestedVoiceId = readOptionalString(payload.voiceId);
  const activeVoiceId = state.voiceId ?? requestedVoiceId;
  const activeLanguage =
    readOptionalString(payload.language) ?? state.language ?? null;
  const activeTemplateId = payload.templateId ?? state.templateId;
  state.voiceId = activeVoiceId;
  state.language = activeLanguage;
  state.templateId = activeTemplateId;
  logGatewayEvent("submit_audio_received", {
    assistantSessionId: state.assistantSessionId,
    browserSessionId: state.browserSessionId,
    durationMs: payload.durationMs ?? null,
    hasAudioBase64: Boolean(payload.audioBase64),
    language: activeLanguage,
    mimeType: payload.mimeType ?? "audio/webm",
    templateId: activeTemplateId ?? null,
    voiceId: activeVoiceId ?? null
  });

  sendStatus(socket, "transcribing", "Processing recorded audio.");
  let transcription;
  let responseLanguage: string | null = null;

  try {
    transcription = await transcribeAudio(
      payload.audioBase64,
      payload.mimeType ?? "audio/webm",
      activeLanguage
    );
    responseLanguage = resolveResponseLanguage({
      requestedLanguage: activeLanguage,
      detectedLanguage: transcription.detectedLanguage
    });
    await chargeExternalElevenLabsTranscriptionUsage({
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      durationMs: transcription.durationMs ?? payload.durationMs,
      externalUserApiKey: state.externalUserApiKey,
      language: responseLanguage ?? activeLanguage,
      mimeType: payload.mimeType ?? "audio/webm",
      pageTitle: state.pageTitle,
      pageUrl: state.pageUrl,
      requestId: transcription.requestId
    });
  } catch (error) {
    if (isNoSpeechDetectedError(error)) {
      logGatewayEvent("transcription_skipped_no_speech", {
        assistantSessionId: state.assistantSessionId,
        browserSessionId: state.browserSessionId,
        voiceId: activeVoiceId ?? null
      });
      sendStatus(
        socket,
        "idle",
        error instanceof Error ? error.message : "No clear speech was detected."
      );
      return;
    }

    console.error("[plugin-gateway] transcription failed", {
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack
            }
          : error,
      voiceId: activeVoiceId ?? null
    });
    sendSocketError(socket, error, {
      fallbackMessage: "Transcription failed",
      statusDetail: "Transcription failed."
    });
    return;
  }

  sendMessage(socket, {
    type: "transcript_ready",
    transcript: transcription.transcript,
    language: responseLanguage,
    source: transcription.source
  });
  logGatewayEvent("transcription_ready", {
    assistantSessionId: state.assistantSessionId,
    browserSessionId: state.browserSessionId,
    detectedLanguage: transcription.detectedLanguage,
    responseLanguage,
    transcriptLength: transcription.transcript.length,
    voiceId: activeVoiceId ?? null
  });

  sendStatus(socket, "thinking", "Generating assistant reply.");
  let assistantReply;

  try {
    assistantReply = await generateGroundedAssistantReply({
      externalUserApiKey: state.externalUserApiKey,
      browserSessionId: state.browserSessionId,
      conversationId: state.conversationId,
      language: responseLanguage,
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
    console.error("[plugin-gateway] assistant generation failed", {
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack
            }
          : error,
      templateId: activeTemplateId ?? null,
      transcriptLength: transcription.transcript.length,
      voiceId: activeVoiceId ?? null
    });
    sendSocketError(socket, error, {
      fallbackMessage: "Assistant generation failed",
      statusDetail: "Assistant generation failed."
    });
    return;
  }

  const assistantText = assistantReply.text;
  let synthesizedAudio = null;
  logGatewayEvent("assistant_reply_ready", {
    assistantSessionId: state.assistantSessionId,
    browserSessionId: state.browserSessionId,
    hasImages: assistantReply.images.length > 0,
    provider: assistantReply.provider,
    retrievalChunkCount: assistantReply.retrieval?.chunks?.length ?? 0,
    responseLanguage,
    templateId: assistantReply.templateId ?? activeTemplateId ?? null,
    textLength: assistantText.length,
    voiceId: activeVoiceId ?? null
  });

  sendMessage(socket, {
    type: "assistant_message",
    text: assistantText,
    language: responseLanguage,
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

  if (assistantText.trim()) {
    sendStatus(socket, "synthesizing", "Synthesizing assistant voice.");

    try {
      synthesizedAudio = await synthesizeAssistantAudio({
        browserSessionId: state.browserSessionId,
        language: responseLanguage,
        retrievalChunks: assistantReply.retrieval?.chunks,
        text: assistantText,
        voiceId: activeVoiceId
      });

      if (synthesizedAudio) {
        try {
          await chargeExternalElevenLabsSynthesisUsage({
            assistantSessionId: state.assistantSessionId,
            browserSessionId: state.browserSessionId,
            charactersUsed: synthesizedAudio.characterCount ?? undefined,
            externalUserApiKey: state.externalUserApiKey,
            pageTitle: state.pageTitle,
            pageUrl: state.pageUrl,
            requestId: synthesizedAudio.requestId,
            text: synthesizedAudio.preparedText ?? assistantText,
            voiceId: activeVoiceId
          });
        } catch (error) {
          logTtsFailure("billing", error, {
            assistantSessionId: state.assistantSessionId,
            browserSessionId: state.browserSessionId,
            requestId: synthesizedAudio.requestId,
            voiceId: activeVoiceId
          });
        }
      }
    } catch (error) {
      logTtsFailure("unexpected_synthesis", error, {
        assistantSessionId: state.assistantSessionId,
        browserSessionId: state.browserSessionId,
        voiceId: activeVoiceId
      });
      synthesizedAudio = null;
    }
  } else {
    logGatewayEvent("tts_skipped_empty_reply", {
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      provider: assistantReply.provider,
      templateId: assistantReply.templateId ?? activeTemplateId ?? null,
      voiceId: activeVoiceId ?? null
    });
  }

  if (synthesizedAudio) {
    sendMessage(socket, {
      type: "assistant_audio",
      ...synthesizedAudio,
      language: responseLanguage
    });
    logGatewayEvent("assistant_audio_sent", {
      assistantSessionId: state.assistantSessionId,
      audioBase64Length: synthesizedAudio.audioBase64.length,
      browserSessionId: state.browserSessionId,
      characterCount: synthesizedAudio.characterCount,
      requestId: synthesizedAudio.requestId,
      voiceId: activeVoiceId ?? null
    });
  } else {
    logGatewayEvent("assistant_audio_unavailable", {
      assistantSessionId: state.assistantSessionId,
      browserSessionId: state.browserSessionId,
      responseLanguage,
      voiceId: activeVoiceId ?? null
    });
  }

  sendStatus(
    socket,
    "idle",
    synthesizedAudio
      ? "Assistant audio delivered."
      : assistantReply.images.length > 0
        ? "Assistant response delivered with image output."
        : "Assistant text delivered. Remote audio failed or was unavailable."
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
      state.voiceId = readOptionalString(message.voiceId);
      sendMessage(socket, {
        type: "voice_updated",
        voiceId: state.voiceId ?? null
      });
      return;
    }

    if (message.type === "set_language") {
      state.language = readOptionalString(message.language) ?? null;
      sendMessage(socket, {
        type: "language_updated",
        language: resolveRequestedLanguageKey(state.language),
        selectedLanguage: state.language ?? null
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
