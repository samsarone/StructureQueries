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
type ElevenLabsConversationSignedUrlRequest = Parameters<
  ReturnType<
    typeof getElevenLabsClient
  >["conversationalAi"]["conversations"]["getSignedUrl"]
>[0];

export interface ElevenLabsSynthesisInput extends ElevenLabsTextToSpeechRequest {
  voiceId: string;
}

export async function listElevenLabsVoices(
  request?: ElevenLabsVoiceSearchRequest
) {
  const client = getElevenLabsClient();

  if (request?.search || request?.pageSize || request?.nextPageToken) {
    return client.voices.search(request);
  }

  return client.voices.getAll();
}

export async function synthesizeWithElevenLabs({
  voiceId,
  ...request
}: ElevenLabsSynthesisInput) {
  const client = getElevenLabsClient();
  const response = await client.textToSpeech.convert(voiceId, {
    ...request,
    modelId: request.modelId ?? env.integrations.elevenLabs.defaultModelId
  });

  return readableStreamToBuffer(response);
}

export async function getElevenLabsVoice(voiceId: string) {
  return getElevenLabsClient().voices.get(voiceId, {
    withSettings: true
  });
}

export async function transcribeWithElevenLabs(
  request: ElevenLabsSpeechToTextRequest
) {
  return getElevenLabsClient().speechToText.convert(request);
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
