import type { ExternalUserIdentity } from "samsar-js";

import { env } from "../config/env.js";

export interface StructureQueriesRegistrationInput {
  browserSessionId: string;
  cachingTtlSeconds?: number | null;
  extensionId?: string;
  email?: string;
  username?: string;
  displayName?: string;
  preferredLanguage?: string | null;
  preferredVoiceId?: string;
  userAgent?: string;
}

export interface StructureQueriesExternalUserSummary {
  provider?: string | null;
  externalUserId?: string | null;
  externalAppId?: string | null;
  externalCompanyId?: string | null;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  userType?: string | null;
  browserInstallation?: Record<string, unknown> | null;
  generationCredits?: number | null;
  totalRequests?: number | null;
  totalCreditsUsed?: number | null;
  totalCreditsRefunded?: number | null;
  totalCreditsPurchased?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  return undefined;
}

export function buildStructureQueriesAssistantSystemPrompt() {
  return [
    "You are the Structure Queries assistant for question answering over dense documents and webpages.",
    "Always answer in the same language as the user's latest message unless the user explicitly asks to switch languages.",
    "Use the retrieved document context provided in the conversation as your primary evidence and synthesize across relevant sections when helpful.",
    "Give the most useful answer supported by that context, starting with the shortest complete answer that fully addresses the user's request. When the context is partial, ambiguous, or incomplete, say what is directly supported and clearly label any brief inference or uncertainty.",
    "Do not invent document-specific facts, quotes, figures, or citations that are not supported by the retrieved context.",
    "Default to a conversational spoken tone: concise, direct, natural, and easy to follow aloud.",
    "By default, keep responses brief and to the point. Only add extra detail, examples, nuance, or step-by-step explanation when the user asks for it or the context requires it for accuracy or usefulness.",
    "Prefer short-to-medium sentences, light transitions, and plain wording over stacked clauses, lists, or stiff formal phrasing unless the user asks for more structure.",
    "If a short answer is sufficient, stop once the answer is complete.",
    "In English, prefer natural contractions and spoken phrasing when they improve flow.",
    "When technical terms, acronyms, APIs, version strings, or product names are necessary, keep them accurate but phrase the surrounding sentence so it still sounds natural when spoken.",
    "Introduce uncommon acronyms or dense technical jargon in the clearest spoken form when that improves comprehension, especially on first mention.",
    "Avoid markdown-heavy formatting, code-fence style wording, and link-heavy phrasing when a plain spoken sentence would work.",
    "Prefer clear answers and grounded reasoning over hedging, filler, or stylistic flourish.",
    "Only produce image-style output when the user explicitly asks for an image, visual, illustration, mockup, or similar asset."
  ].join("\n");
}

export function buildStructureQueriesTextAssistantSystemPrompt() {
  return [
    "You are the Structure Queries assistant for text-based question answering over dense documents and webpages.",
    "Always answer in the same language as the user's latest message unless the user explicitly asks to switch languages.",
    "Use the retrieved document context provided in the conversation as your primary evidence and synthesize across relevant sections when helpful.",
    "Give the most useful answer supported by that context, starting with the shortest complete answer that fully addresses the user's request. When the context is partial, ambiguous, or incomplete, say what is directly supported and clearly label any brief inference or uncertainty.",
    "Do not invent document-specific facts, quotes, figures, or citations that are not supported by the retrieved context.",
    "Optimize for on-screen reading: concise, direct, and easy to scan.",
    "By default, keep responses brief and use short paragraphs. Use bullets only when they make the answer clearer.",
    "If a short answer is sufficient, stop once the answer is complete.",
    "Keep technical terms, acronyms, APIs, version strings, product names, code identifiers, and quoted text accurate as written in the source context.",
    "Do not rewrite wording for pronunciation, spoken cadence, or TTS normalization.",
    "Do not expand acronyms or add spoken-form scaffolding unless the user asks for that explicitly.",
    "Prefer grounded answers and clear reasoning over filler or stylistic flourish.",
    "Only produce image-style output when the user explicitly asks for an image, visual, illustration, mockup, or similar asset."
  ].join("\n");
}

export function buildStructureQueriesExternalUser(
  input: StructureQueriesRegistrationInput
): ExternalUserIdentity {
  const assistantPromptVersion =
    env.integrations.samsar.externalAssistantPromptVersion;
  const browserInstallation = {
    browser_session_id: input.browserSessionId,
    caching_ttl: readOptionalPositiveInteger(input.cachingTtlSeconds) ?? null,
    extension_id: readOptionalString(input.extensionId) ?? null,
    preferred_language: readOptionalString(input.preferredLanguage ?? undefined) ?? null,
    preferred_voice_id: readOptionalString(input.preferredVoiceId) ?? null,
    user_agent: readOptionalString(input.userAgent) ?? null
  };

  return {
    provider: env.integrations.samsar.externalUserProvider,
    external_user_id: input.browserSessionId,
    external_app_id: env.integrations.samsar.externalAppId,
    external_company_id: env.integrations.samsar.externalCompanyId,
    email: readOptionalString(input.email),
    username: readOptionalString(input.username) ?? input.browserSessionId,
    display_name:
      readOptionalString(input.displayName) ??
      `Structure Queries ${input.browserSessionId.slice(-8)}`,
    user_type: "chrome_extension",
    browser_installation: browserInstallation,
    metadata: {
      assistant_prompt_version: assistantPromptVersion,
      user_type: "chrome_extension",
      browser_installation: browserInstallation,
      structuredqueries: {
        assistant_prompt_version: assistantPromptVersion,
        browser_installation: browserInstallation
      }
    }
  };
}

export function summarizeStructureQueriesExternalUser(
  value: Record<string, unknown> | null | undefined
): StructureQueriesExternalUserSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    provider: readOptionalString(value.provider) ?? null,
    externalUserId:
      readOptionalString(value.external_user_id) ??
      readOptionalString(value.externalUserId) ??
      null,
    externalAppId:
      readOptionalString(value.external_app_id) ??
      readOptionalString(value.externalAppId) ??
      null,
    externalCompanyId:
      readOptionalString(value.external_company_id) ??
      readOptionalString(value.externalCompanyId) ??
      null,
    email: readOptionalString(value.email) ?? null,
    username: readOptionalString(value.username) ?? null,
    displayName:
      readOptionalString(value.display_name) ??
      readOptionalString(value.displayName) ??
      null,
    avatarUrl:
      readOptionalString(value.avatar_url) ??
      readOptionalString(value.avatarUrl) ??
      null,
    userType:
      readOptionalString(value.user_type) ??
      readOptionalString(value.userType) ??
      null,
    browserInstallation:
      value.browser_installation && typeof value.browser_installation === "object"
        ? (value.browser_installation as Record<string, unknown>)
        : value.browserInstallation && typeof value.browserInstallation === "object"
          ? (value.browserInstallation as Record<string, unknown>)
          : null,
    generationCredits:
      typeof value.generation_credits === "number"
        ? value.generation_credits
        : typeof value.generationCredits === "number"
          ? value.generationCredits
          : null,
    totalRequests:
      typeof value.total_requests === "number"
        ? value.total_requests
        : typeof value.totalRequests === "number"
          ? value.totalRequests
          : null,
    totalCreditsUsed:
      typeof value.total_credits_used === "number"
        ? value.total_credits_used
        : typeof value.totalCreditsUsed === "number"
          ? value.totalCreditsUsed
          : null,
    totalCreditsRefunded:
      typeof value.total_credits_refunded === "number"
        ? value.total_credits_refunded
        : typeof value.totalCreditsRefunded === "number"
          ? value.totalCreditsRefunded
          : null,
    totalCreditsPurchased:
      typeof value.total_credits_purchased === "number"
        ? value.total_credits_purchased
        : typeof value.totalCreditsPurchased === "number"
          ? value.totalCreditsPurchased
          : null,
    createdAt:
      readOptionalString(value.created_at) ??
      readOptionalString(value.createdAt) ??
      null,
    updatedAt:
      readOptionalString(value.updated_at) ??
      readOptionalString(value.updatedAt) ??
      null
  };
}
