import { Router } from "express";

import { samsarAdapter } from "../adapters/samsar.js";
import {
  buildStructuredQueriesAssistantSystemPrompt,
  buildStructuredQueriesExternalUser,
  summarizeStructuredQueriesExternalUser
} from "../lib/external-user.js";

export const browserSessionsRouter = Router();

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createSessionPayload(body: Record<string, unknown>) {
  return {
    browserSessionId: readOptionalString(body.browserSessionId) ?? "",
    extensionId: readOptionalString(body.extensionId) ?? null,
    preferredLanguage: readOptionalString(body.preferredLanguage) ?? null,
    preferredVoiceId: readOptionalString(body.preferredVoiceId) ?? null,
    userAgent: readOptionalString(body.userAgent) ?? null
  };
}

browserSessionsRouter.post("/", async (request, response) => {
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const session = createSessionPayload(body);

  if (!session.browserSessionId) {
    response.status(400).json({
      ok: false,
      error: "browserSessionId is required"
    });
    return;
  }

  const externalUserApiKey = readOptionalString(body.externalUserApiKey);
  const assistantSessionId = readOptionalString(body.assistantSessionId);
  const externalUser =
    body.externalUser && typeof body.externalUser === "object"
      ? summarizeStructuredQueriesExternalUser(
          body.externalUser as Record<string, unknown>
        )
      : null;

  response.json({
    ok: true,
    session,
    externalUserApiKey: externalUserApiKey ?? null,
    assistantSessionId: assistantSessionId ?? null,
    externalUser,
    registrationRequired: !(externalUserApiKey && assistantSessionId),
    warnings: []
  });
});

browserSessionsRouter.post("/register", async (request, response) => {
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const session = createSessionPayload({
    ...body,
    userAgent: readOptionalString(body.userAgent) ?? request.get("user-agent")
  });

  if (!session.browserSessionId) {
    response.status(400).json({
      ok: false,
      error: "browserSessionId is required"
    });
    return;
  }

  if (!samsarAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "SAMSAR_API_KEY is not configured."
    });
    return;
  }

  try {
    const externalUserIdentity = buildStructuredQueriesExternalUser({
      browserSessionId: session.browserSessionId,
      extensionId: session.extensionId ?? undefined,
      email: readOptionalString(body.email),
      username: readOptionalString(body.username),
      displayName: readOptionalString(body.displayName),
      preferredLanguage: session.preferredLanguage,
      preferredVoiceId: session.preferredVoiceId ?? undefined,
      userAgent: session.userAgent ?? undefined
    });
    const externalSession = await samsarAdapter.createExternalUserSession(
      externalUserIdentity
    );
    const externalUserApiKey =
      readOptionalString(externalSession.data.external_api_key) ?? null;

    await samsarAdapter.setExternalAssistantSystemPrompt(
      {
        system_prompt: buildStructuredQueriesAssistantSystemPrompt()
      },
      externalUserIdentity,
      externalUserApiKey ? { externalUserApiKey } : undefined
    );

    const assistantSession = await samsarAdapter.createExternalAssistantSession(
      externalUserIdentity,
      {
        session_name: `StructuredQueries voice assistant ${session.browserSessionId.slice(-8)}`,
        metadata: {
          browser_session_id: session.browserSessionId,
          extension_id: session.extensionId,
          preferred_language: session.preferredLanguage,
          preferred_voice_id: session.preferredVoiceId,
          user_type: "chrome_extension"
        }
      },
      externalUserApiKey ? { externalUserApiKey } : undefined
    );

    response.json({
      ok: true,
      session,
      externalUserApiKey,
      assistantSessionId:
        readOptionalString(assistantSession.data.session_id) ??
        readOptionalString(assistantSession.data.request_id) ??
        null,
      externalUser: summarizeStructuredQueriesExternalUser(
        (externalSession.data.external_user ??
          externalSession.data.externalUser ??
          externalUserIdentity) as Record<string, unknown>
      ),
      registrationRequired: !(
        externalUserApiKey &&
        (assistantSession.data.session_id || assistantSession.data.request_id)
      ),
      warnings: []
    });
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to register the external user with Samsar."
    });
  }
});
