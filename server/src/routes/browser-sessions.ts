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
const STARTER_CREDITS = 5;
const SAMSAR_CLIENT_REDIRECT_PATH = "/external/studio";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalExternalUser(
  value: unknown
): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function createExternalUserIdentity(
  body: Record<string, unknown>,
  session: ReturnType<typeof createSessionPayload>
) {
  const existingExternalUser = readOptionalExternalUser(body.externalUser);
  const existingBrowserInstallation =
    existingExternalUser?.browserInstallation &&
    typeof existingExternalUser.browserInstallation === "object"
      ? (existingExternalUser.browserInstallation as Record<string, unknown>)
      : existingExternalUser?.browser_installation &&
          typeof existingExternalUser.browser_installation === "object"
        ? (existingExternalUser.browser_installation as Record<string, unknown>)
        : null;
  const preferredVoiceId =
    session.preferredVoiceId ??
    readOptionalString(existingBrowserInstallation?.preferred_voice_id) ??
    readOptionalString(existingBrowserInstallation?.preferredVoiceId);
  const userAgent =
    session.userAgent ??
    readOptionalString(existingBrowserInstallation?.user_agent) ??
    readOptionalString(existingBrowserInstallation?.userAgent);

  return buildStructureQueriesExternalUser({
    browserSessionId: session.browserSessionId,
    extensionId: session.extensionId ?? undefined,
    email:
      readOptionalString(body.email) ??
      readOptionalString(existingExternalUser?.email),
    username:
      readOptionalString(body.username) ??
      readOptionalString(existingExternalUser?.username),
    displayName:
      readOptionalString(body.displayName) ??
      readOptionalString(existingExternalUser?.displayName) ??
      readOptionalString(existingExternalUser?.display_name),
    preferredLanguage: session.preferredLanguage,
    preferredVoiceId,
    userAgent
  });
}

function summarizeExternalUserRecord(
  value: Record<string, unknown> | null | undefined,
  fallback: ReturnType<typeof createExternalUserIdentity>
) {
  return summarizeStructureQueriesExternalUser(
    (value ?? fallback) as Record<string, unknown>
  );
}

function shouldGrantStarterCredits(
  externalUser:
    | ReturnType<typeof summarizeStructureQueriesExternalUser>
    | null
    | undefined
) {
  return Boolean(
    externalUser &&
      (externalUser.generationCredits ?? 0) <= 0 &&
      (externalUser.totalRequests ?? 0) <= 0 &&
      (externalUser.totalCreditsUsed ?? 0) <= 0 &&
      (externalUser.totalCreditsRefunded ?? 0) <= 0 &&
      (externalUser.totalCreditsPurchased ?? 0) <= 0
  );
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
    grantStarterCredits?: boolean;
  }
) {
  const session = createSessionPayload(body);

  if (!session.browserSessionId) {
    throw new Error("browserSessionId is required");
  }

  const externalUserIdentity = createExternalUserIdentity(body, session);
  const externalSession = await samsarAdapter.createExternalUserSession(
    externalUserIdentity
  );
  const externalUserApiKey =
    readOptionalString(externalSession.data.external_api_key) ??
    readOptionalString(body.externalUserApiKey) ??
    null;
  let externalUser = summarizeExternalUserRecord(
    (externalSession.data.external_user ??
      externalSession.data.externalUser) as Record<string, unknown> | null,
    externalUserIdentity
  );
  let starterCreditsGranted: number | null = null;

  if (
    options?.grantStarterCredits &&
    shouldGrantStarterCredits(externalUser)
  ) {
    const grantResult = await samsarAdapter.grantExternalUserCredits(
      externalUserIdentity,
      STARTER_CREDITS
    );
    starterCreditsGranted =
      typeof grantResult.data.creditsGranted === "number"
        ? grantResult.data.creditsGranted
        : STARTER_CREDITS;
    externalUser = summarizeExternalUserRecord(
      (grantResult.data.externalUser ??
        grantResult.data.external_user) as Record<string, unknown> | null,
      externalUserIdentity
    );
  }

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
    externalUser,
    registrationRequired: !(externalUserApiKey && assistantSessionId),
    starterCreditsGranted,
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
  const canRefreshExternalUser =
    samsarAdapter.isConfigured() &&
    Boolean(
      assistantSessionId ||
        externalUserApiKey ||
        readOptionalExternalUser(body.externalUser)
    );
  const externalUser =
    body.externalUser && typeof body.externalUser === "object"
      ? summarizeStructureQueriesExternalUser(
          body.externalUser as Record<string, unknown>
        )
      : null;

  if (canRefreshExternalUser) {
    try {
      const externalUserIdentity = createExternalUserIdentity(body, session);
      const refreshedSession = await samsarAdapter.createExternalUserSession(
        externalUserIdentity
      );
      const refreshedExternalUser = summarizeExternalUserRecord(
        (refreshedSession.data.external_user ??
          refreshedSession.data.externalUser) as Record<string, unknown> | null,
        externalUserIdentity
      );

      response.json({
        ok: true,
        session,
        externalUserApiKey:
          readOptionalString(refreshedSession.data.external_api_key) ??
          externalUserApiKey ??
          null,
        assistantSessionId: assistantSessionId ?? null,
        externalUser: refreshedExternalUser,
        registrationRequired: !(
          (readOptionalString(refreshedSession.data.external_api_key) ??
            externalUserApiKey) &&
          assistantSessionId
        ),
        warnings: []
      });
      return;
    } catch (error) {
      console.error("Failed to refresh browser session with Samsar", {
        browserSessionId: session.browserSessionId,
        samsar: getSamsarErrorContext(error)
      });
    }
  }

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
    }, {
      grantStarterCredits: true
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

browserSessionsRouter.post("/login-link", async (request, response) => {
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
    const externalUserIdentity = createExternalUserIdentity(body, session);
    const loginToken = await samsarAdapter.createExternalUserLoginToken(
      externalUserIdentity,
      {
        redirect: SAMSAR_CLIENT_REDIRECT_PATH,
        externalUserApiKey: readOptionalString(body.externalUserApiKey)
      }
    );

    response.json({
      ok: true,
      loginUrl: readOptionalString(loginToken.data.loginUrl) ?? null,
      externalUser: summarizeExternalUserRecord(
        (loginToken.data.external_user ??
          loginToken.data.externalUser) as Record<string, unknown> | null,
        externalUserIdentity
      )
    });
  } catch (error) {
    console.error("Failed to create Samsar login link for browser session", {
      browserSessionId: session.browserSessionId,
      samsar: getSamsarErrorContext(error)
    });

    response.status(getSamsarErrorStatus(error)).json({
      ok: false,
      error: getSamsarErrorMessage(
        error,
        "Failed to create the external-user login link."
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
