import { samsarAdapter } from "../adapters/samsar.js";
import { env } from "../config/env.js";
import { buildStructureQueriesExternalUser } from "./external-user.js";
import { chargeSamsarUserUtilityUsage } from "./samsar-user-auth.js";

const AUXILIARY_UTILITY_PRICING_MULTIPLIER = 1.25;

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasUserCredential(input?: {
  authToken?: string;
  externalUserApiKey?: string;
}) {
  return Boolean(
    readOptionalString(input?.authToken) ??
      readOptionalString(input?.externalUserApiKey)
  );
}

function buildSamsarUserCredentials(input?: {
  authToken?: string;
  browserSessionId?: string;
  externalUserApiKey?: string;
}) {
  const authToken = readOptionalString(input?.authToken);
  const externalUserApiKey = readOptionalString(input?.externalUserApiKey);
  const browserSessionId = readOptionalString(input?.browserSessionId);

  if (!authToken && !externalUserApiKey) {
    throw new Error(
      "No Samsar auth token or external-user API key was provided for external utility billing."
    );
  }

  return {
    authToken: authToken ?? null,
    externalUserApiKey: externalUserApiKey ?? null,
    externalUser:
      authToken && browserSessionId
        ? buildStructureQueriesExternalUser({
            browserSessionId
          })
        : null
  };
}

async function chargeExternalUtilityUsage(
  payload: Record<string, unknown>,
  credentials?: {
    authToken?: string;
    browserSessionId?: string;
    externalUserApiKey?: string;
  }
) {
  if (!isExternalUtilityBillingEnabled()) {
    return null;
  }

  const userCredentials = buildSamsarUserCredentials(credentials);
  if (userCredentials.authToken) {
    return chargeSamsarUserUtilityUsage(payload, userCredentials);
  }

  return samsarAdapter.chargeExternalUserUtilityUsage(payload, null, {
    externalUserApiKey: userCredentials.externalUserApiKey ?? undefined
  });
}

export function isExternalUtilityBillingEnabled() {
  return (
    env.currentEnv === "production" &&
    env.appName === "structure_queries"
  );
}

export async function chargeExternalFirecrawlUsage(input: {
  authToken?: string;
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

  if (!hasUserCredential(input)) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "firecrawl",
      firecrawl_credits_used: firecrawlCreditsUsed,
      pricing_multiplier: AUXILIARY_UTILITY_PRICING_MULTIPLIER,
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
    {
      authToken: input.authToken,
      browserSessionId: input.browserSessionId,
      externalUserApiKey: input.externalUserApiKey
    }
  );
}

export async function chargeExternalElevenLabsTranscriptionUsage(input: {
  assistantSessionId?: string;
  authToken?: string;
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

  if (!hasUserCredential(input)) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "elevenlabs_stt",
      model: "scribe_v2",
      duration_ms: durationMs,
      pricing_multiplier: AUXILIARY_UTILITY_PRICING_MULTIPLIER,
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
    {
      authToken: input.authToken,
      browserSessionId: input.browserSessionId,
      externalUserApiKey: input.externalUserApiKey
    }
  );
}

export async function chargeExternalElevenLabsSynthesisUsage(input: {
  assistantSessionId?: string;
  authToken?: string;
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

  if (!hasUserCredential(input)) {
    return null;
  }

  return chargeExternalUtilityUsage(
    {
      utility_type: "elevenlabs_tts",
      model: env.integrations.elevenLabs.defaultModelId,
      pricing_multiplier: AUXILIARY_UTILITY_PRICING_MULTIPLIER,
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
    {
      authToken: input.authToken,
      browserSessionId: input.browserSessionId,
      externalUserApiKey: input.externalUserApiKey
    }
  );
}
