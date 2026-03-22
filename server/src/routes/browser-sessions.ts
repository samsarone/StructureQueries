import { Router } from "express";

import { samsarAdapter } from "../adapters/samsar.js";
import {
  buildStructureQueriesAssistantSystemPrompt,
  buildStructureQueriesExternalUser,
  summarizeStructureQueriesExternalUser
} from "../lib/external-user.js";
import {
  getSamsarErrorContext,
  getSamsarErrorMessage,
  getSamsarErrorStatus
} from "../lib/samsar-errors.js";

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

async function upsertExternalUserProfile(
  body: Record<string, unknown>,
  options?: {
    createAssistantSession?: boolean;
  }
) {
  const session = createSessionPayload(body);

  if (!session.browserSessionId) {
    throw new Error("browserSessionId is required");
  }

  const externalUserIdentity = buildStructureQueriesExternalUser({
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
    readOptionalString(externalSession.data.external_api_key) ??
    readOptionalString(body.externalUserApiKey) ??
    null;

  await samsarAdapter.setExternalAssistantSystemPrompt(
    {
      system_prompt: buildStructureQueriesAssistantSystemPrompt()
    },
    externalUserIdentity,
    externalUserApiKey ? { externalUserApiKey } : undefined
  );

  let assistantSessionId =
    readOptionalString(body.assistantSessionId) ?? null;

  if (!assistantSessionId && options?.createAssistantSession !== false) {
    const assistantSession = await samsarAdapter.createExternalAssistantSession(
      externalUserIdentity,
      {
        session_name: `Structure Queries voice assistant ${session.browserSessionId.slice(-8)}`,
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

    assistantSessionId =
      readOptionalString(assistantSession.data.session_id) ??
      readOptionalString(assistantSession.data.request_id) ??
      null;
  }

  return {
    ok: true,
    session,
    externalUserApiKey,
    assistantSessionId,
    externalUser: summarizeStructureQueriesExternalUser(
      (externalSession.data.external_user ??
        externalSession.data.externalUser ??
        externalUserIdentity) as Record<string, unknown>
    ),
    registrationRequired: !(externalUserApiKey && assistantSessionId),
    warnings: []
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
      ? summarizeStructureQueriesExternalUser(
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
    const payload = await upsertExternalUserProfile({
      ...body,
      browserSessionId: session.browserSessionId,
      extensionId: session.extensionId,
      preferredLanguage: session.preferredLanguage,
      preferredVoiceId: session.preferredVoiceId,
      userAgent: session.userAgent
    });
    response.json(payload);
  } catch (error) {
    console.error("Failed to register browser session with Samsar", {
      browserSessionId: session.browserSessionId,
      samsar: getSamsarErrorContext(error)
    });

    response.status(getSamsarErrorStatus(error)).json({
      ok: false,
      error: getSamsarErrorMessage(
        error,
        "Failed to register the external user with Samsar."
      )
    });
  }
});

browserSessionsRouter.post("/profile", async (request, response) => {
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
    const payload = await upsertExternalUserProfile(
      {
        ...body,
        browserSessionId: session.browserSessionId,
        extensionId: session.extensionId,
        preferredLanguage: session.preferredLanguage,
        preferredVoiceId: session.preferredVoiceId,
        userAgent: session.userAgent
      },
      {
        createAssistantSession: false
      }
    );
    response.json(payload);
  } catch (error) {
    console.error("Failed to update browser session profile with Samsar", {
      browserSessionId: session.browserSessionId,
      samsar: getSamsarErrorContext(error)
    });

    response.status(getSamsarErrorStatus(error)).json({
      ok: false,
      error: getSamsarErrorMessage(
        error,
        "Failed to update the external user profile with Samsar."
      )
    });
  }
});
