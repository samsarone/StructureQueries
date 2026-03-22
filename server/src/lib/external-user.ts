import type { ExternalUserIdentity } from "samsar-js";

import { env } from "../config/env.js";

export interface StructuredQueriesRegistrationInput {
  browserSessionId: string;
  extensionId?: string;
  email?: string;
  username?: string;
  displayName?: string;
  preferredLanguage?: string | null;
  preferredVoiceId?: string;
  userAgent?: string;
}

export interface StructuredQueriesExternalUserSummary {
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
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function buildStructuredQueriesAssistantSystemPrompt() {
  return [
    "You are the StructuredQueries assistant for question answering over dense documents and webpages.",
    "Always answer in the same language as the user's latest message unless the user explicitly asks to switch languages.",
    "Use the retrieved document context provided in the conversation as your primary evidence and synthesize across relevant sections when helpful.",
    "Give the most useful answer supported by that context. When the context is partial, ambiguous, or incomplete, say what is directly supported and clearly label any brief inference or uncertainty.",
    "Do not invent document-specific facts, quotes, figures, or citations that are not supported by the retrieved context.",
    "Optimize answers for voice interaction: concise, direct, natural, and easy to speak aloud.",
    "Prefer clear answers and grounded reasoning over hedging or stylistic flourish.",
    "Only produce image-style output when the user explicitly asks for an image, visual, illustration, mockup, or similar asset."
  ].join("\n");
}

export function buildStructuredQueriesExternalUser(
  input: StructuredQueriesRegistrationInput
): ExternalUserIdentity {
  const assistantPromptVersion =
    env.integrations.samsar.externalAssistantPromptVersion;
  const browserInstallation = {
    browser_session_id: input.browserSessionId,
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
      `StructuredQueries ${input.browserSessionId.slice(-8)}`,
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

export function summarizeStructuredQueriesExternalUser(
  value: Record<string, unknown> | null | undefined
): StructuredQueriesExternalUserSummary | null {
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
          : null
  };
}
