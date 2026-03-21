import "dotenv/config";

const DEFAULT_PORT = 3000;
const DEFAULT_SERVICE_NAME = "structuredqueries-server";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SAMSAR_ASSISTANT_MAX_OUTPUT_TOKENS = 500;
const DEFAULT_SAMSAR_ASSISTANT_IMAGE_SIZE = "1024x1024";
const DEFAULT_SAMSAR_RETRIEVAL_LIMIT = 6;
const DEFAULT_SAMSAR_SIMILARITY_LIMIT = 8;
const DEFAULT_SAMSAR_EXTERNAL_USER_PROVIDER = "structuredqueries";
const DEFAULT_SAMSAR_EXTERNAL_ASSISTANT_PROMPT_VERSION =
  "structuredqueries-rag-voice-v1";

function parsePort(value: string | undefined) {
  const parsed = Number(value ?? DEFAULT_PORT);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  serviceName: DEFAULT_SERVICE_NAME,
  port: parsePort(process.env.PORT),
  clientOrigin: "*",
  integrations: {
    elevenLabs: {
      apiKey: readOptional(process.env.ELEVENLABS_API_KEY),
      defaultVoiceId: readOptional(process.env.ELEVENLABS_DEFAULT_VOICE_ID),
      defaultModelId: DEFAULT_ELEVENLABS_MODEL_ID,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS
    },
    samsar: {
      apiKey: readOptional(process.env.SAMSAR_API_KEY),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      assistantModel: undefined,
      assistantReasoningEffort: "medium",
      assistantMaxOutputTokens: DEFAULT_SAMSAR_ASSISTANT_MAX_OUTPUT_TOKENS,
      assistantImageSize: DEFAULT_SAMSAR_ASSISTANT_IMAGE_SIZE,
      imageToolEnabled: true,
      rerankResults: true,
      retrievalLimit: DEFAULT_SAMSAR_RETRIEVAL_LIMIT,
      similarityLimit: DEFAULT_SAMSAR_SIMILARITY_LIMIT,
      externalUserProvider: DEFAULT_SAMSAR_EXTERNAL_USER_PROVIDER,
      externalAppId: DEFAULT_SERVICE_NAME,
      externalCompanyId: undefined,
      externalAssistantPromptVersion:
        DEFAULT_SAMSAR_EXTERNAL_ASSISTANT_PROMPT_VERSION
    }
  }
};
