import { env } from "../config/env.js";
import { readableStreamToBuffer } from "../lib/streams.js";
import {
  getElevenLabsClient,
  isElevenLabsConfigured
} from "../connectors/elevenlabs.js";

type ElevenLabsVoiceSearchRequest = Parameters<
  ReturnType<typeof getElevenLabsClient>["voices"]["search"]
>[0];
type ElevenLabsTextToSpeechRequest = Parameters<
  ReturnType<typeof getElevenLabsClient>["textToSpeech"]["convert"]
>[1];
type ElevenLabsSpeechToTextRequest = Parameters<
  ReturnType<typeof getElevenLabsClient>["speechToText"]["convert"]
>[0];
type ElevenLabsSpeechToTextResponse = Awaited<
  ReturnType<ReturnType<typeof getElevenLabsClient>["speechToText"]["convert"]>
>;
type ElevenLabsConversationSignedUrlRequest = Parameters<
  ReturnType<
    typeof getElevenLabsClient
  >["conversationalAi"]["conversations"]["getSignedUrl"]
>[0];

export interface ElevenLabsSynthesisInput extends ElevenLabsTextToSpeechRequest {
  voiceId: string;
}

export interface ElevenLabsSynthesisResult {
  audioBuffer: Buffer;
  characterCount: number | null;
  requestId: string | null;
}

export interface ElevenLabsTranscriptionResult {
  transcription: ElevenLabsSpeechToTextResponse;
  durationMs: number | null;
  requestId: string | null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRawResponseHeader(
  rawResponse: { headers?: unknown } | null | undefined,
  headerName: string
) {
  const headers = rawResponse?.headers;

  if (headers && typeof headers === "object" && "get" in headers) {
    const getter = headers.get;

    if (typeof getter === "function") {
      return normalizeOptionalString(
        getter.call(headers, headerName) ??
          getter.call(headers, headerName.toLowerCase())
      );
    }
  }

  if (!headers || typeof headers !== "object") {
    return null;
  }

  const record = headers as Record<string, unknown>;
  return normalizeOptionalString(
    record[headerName] ?? record[headerName.toLowerCase()]
  );
}

function readRawResponseHeaderNumber(
  rawResponse: { headers?: unknown } | null | undefined,
  headerName: string
) {
  const value = readRawResponseHeader(rawResponse, headerName);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inferTranscriptionDurationMs(
  transcription: ElevenLabsSpeechToTextResponse
) {
  const transcripts = Array.isArray(
    (transcription as { transcripts?: unknown }).transcripts
  )
    ? ((transcription as unknown as { transcripts: Array<{ words?: unknown }> })
        .transcripts)
    : [transcription as { words?: unknown }];

  let maxEndSeconds = 0;

  for (const transcript of transcripts) {
    const words = Array.isArray(transcript?.words) ? transcript.words : [];

    for (const word of words) {
      const end =
        typeof (word as { end?: unknown }).end === "number"
          ? (word as { end: number }).end
          : Number((word as { end?: unknown }).end);

      if (Number.isFinite(end) && end > maxEndSeconds) {
        maxEndSeconds = end;
      }
    }
  }

  return maxEndSeconds > 0 ? Math.ceil(maxEndSeconds * 1000) : null;
}

export async function listElevenLabsVoices(
  request?: ElevenLabsVoiceSearchRequest
) {
  const client = getElevenLabsClient();
  return client.voices.search({
    pageSize: request?.pageSize ?? 100,
    ...request
  });
}

export async function synthesizeWithElevenLabs({
  voiceId,
  ...request
}: ElevenLabsSynthesisInput) {
  const client = getElevenLabsClient();
  const response = await client.textToSpeech
    .convert(voiceId, {
      ...request,
      modelId: request.modelId ?? env.integrations.elevenLabs.defaultModelId
    })
    .withRawResponse();

  return {
    audioBuffer: await readableStreamToBuffer(response.data),
    characterCount: readRawResponseHeaderNumber(
      response.rawResponse,
      "x-character-count"
    ),
    requestId: readRawResponseHeader(response.rawResponse, "request-id")
  };
}

export async function getElevenLabsVoice(voiceId: string) {
  return getElevenLabsClient().voices.get(voiceId, {
    withSettings: true
  });
}

export async function transcribeWithElevenLabs(
  request: ElevenLabsSpeechToTextRequest
) {
  const response = await getElevenLabsClient().speechToText
    .convert(request)
    .withRawResponse();

  return {
    transcription: response.data,
    durationMs: inferTranscriptionDurationMs(response.data),
    requestId: readRawResponseHeader(response.rawResponse, "request-id")
  };
}

export async function getElevenLabsConversationSignedUrl(
  request: ElevenLabsConversationSignedUrlRequest
) {
  return getElevenLabsClient().conversationalAi.conversations.getSignedUrl(
    request
  );
}

export const elevenLabsAdapter = {
  id: "elevenlabs",
  isConfigured: isElevenLabsConfigured,
  getClient: getElevenLabsClient,
  getVoice: getElevenLabsVoice,
  getConversationSignedUrl: getElevenLabsConversationSignedUrl,
  listVoices: listElevenLabsVoices,
  synthesize: synthesizeWithElevenLabs,
  transcribe: transcribeWithElevenLabs
} as const;
