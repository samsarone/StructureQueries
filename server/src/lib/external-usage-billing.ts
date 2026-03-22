import { samsarAdapter } from "../adapters/samsar.js";
import { env } from "../config/env.js";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function requireExternalUserApiKey(externalUserApiKey?: string) {
  const normalized = readOptionalString(externalUserApiKey);

  if (!normalized) {
    throw new Error(
      "No Samsar external-user API key was provided for external utility billing."
    );
  }

  return normalized;
}

async function chargeExternalUtilityUsage(
  payload: Record<string, unknown>,
  externalUserApiKey?: string
) {
  if (!isExternalUtilityBillingEnabled()) {
    return null;
  }

  return samsarAdapter.chargeExternalUserUtilityUsage(
    payload,
    null,
    {
      externalUserApiKey: requireExternalUserApiKey(externalUserApiKey)
    }
  );
}

export function isExternalUtilityBillingEnabled() {
  return (
    env.currentEnv === "production" &&
    env.appName === "structure_queries"
  );
}

export async function chargeExternalFirecrawlUsage(input: {
  browserSessionId?: string;
  externalUserApiKey?: string;
  firecrawlCreditsUsed: number;
  firecrawlJobId?: string | null;
  firecrawlJobIds?: string[];
  pageTitle?: string;
  pageUrl?: string;
  processedUrlCount?: number;
  inputUrlCount?: number;
}) {
  const firecrawlCreditsUsed = normalizePositiveNumber(input.firecrawlCreditsUsed);

  if (firecrawlCreditsUsed <= 0) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "firecrawl",
      firecrawl_credits_used: firecrawlCreditsUsed,
      metadata: {
        source: "structuredqueries_proxy",
        interactionType: "webpage_scan",
        browserSessionId: readOptionalString(input.browserSessionId),
        pageTitle: readOptionalString(input.pageTitle),
        pageUrl: readOptionalString(input.pageUrl),
        firecrawlJobId: readOptionalString(input.firecrawlJobId ?? undefined) ?? null,
        firecrawlJobIds:
          Array.isArray(input.firecrawlJobIds) && input.firecrawlJobIds.length > 0
            ? input.firecrawlJobIds
            : [],
        processedUrlCount: normalizePositiveNumber(input.processedUrlCount),
        inputUrlCount: normalizePositiveNumber(input.inputUrlCount)
      }
    },
    input.externalUserApiKey
  );
}

export async function chargeExternalElevenLabsTranscriptionUsage(input: {
  assistantSessionId?: string;
  browserSessionId?: string;
  durationMs?: number;
  externalUserApiKey?: string;
  language?: string | null;
  mimeType?: string;
  pageTitle?: string;
  pageUrl?: string;
  requestId?: string | null;
}) {
  const durationMs = normalizePositiveNumber(input.durationMs);

  if (durationMs <= 0) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "elevenlabs_stt",
      model: "scribe_v2",
      duration_ms: durationMs,
      metadata: {
        source: "structuredqueries_proxy",
        interactionType: "voicebot_qa_transcription",
        assistantSessionId: readOptionalString(input.assistantSessionId),
        browserSessionId: readOptionalString(input.browserSessionId),
        requestId: readOptionalString(input.requestId ?? undefined),
        language: readOptionalString(input.language ?? undefined) ?? null,
        mimeType: readOptionalString(input.mimeType),
        pageTitle: readOptionalString(input.pageTitle),
        pageUrl: readOptionalString(input.pageUrl)
      }
    },
    input.externalUserApiKey
  );
}

export async function chargeExternalElevenLabsSynthesisUsage(input: {
  assistantSessionId?: string;
  browserSessionId?: string;
  charactersUsed?: number;
  externalUserApiKey?: string;
  pageTitle?: string;
  pageUrl?: string;
  requestId?: string | null;
  text?: string;
  voiceId?: string;
}) {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const charactersUsed = normalizePositiveNumber(input.charactersUsed);

  if (charactersUsed <= 0 && !text) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "elevenlabs_tts",
      model: env.integrations.elevenLabs.defaultModelId,
      ...(charactersUsed > 0
        ? {
            character_count: charactersUsed
          }
        : {
            text
          }),
      metadata: {
        source: "structuredqueries_proxy",
        interactionType: "voicebot_qa_synthesis",
        assistantSessionId: readOptionalString(input.assistantSessionId),
        browserSessionId: readOptionalString(input.browserSessionId),
        pageTitle: readOptionalString(input.pageTitle),
        pageUrl: readOptionalString(input.pageUrl),
        requestId: readOptionalString(input.requestId ?? undefined),
        voiceId: readOptionalString(input.voiceId)
      }
    },
    input.externalUserApiKey
  );
}
