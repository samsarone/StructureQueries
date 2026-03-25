import { env } from "../config/env.js";

export interface SamsarUserCredentials {
  authToken?: string | null;
  externalUserApiKey?: string | null;
  externalUser?: Record<string, unknown> | null;
}

export class SamsarUserRouteError extends Error {
  status: number;
  code?: string;
  creditsRemaining?: number | null;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      creditsRemaining?: number | null;
    }
  ) {
    super(message);
    this.name = "SamsarUserRouteError";
    this.status = options?.status ?? 502;
    this.code = options?.code;
    this.creditsRemaining = options?.creditsRemaining ?? null;
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function createUpstreamUrl(pathname: string) {
  return new URL(pathname, `${env.integrations.samsar.publicApiBaseUrl.replace(/\/$/, "")}/`);
}

function buildCredentialHeaders(credentials: SamsarUserCredentials) {
  const authToken = readOptionalString(credentials.authToken);
  const externalUserApiKey = readOptionalString(credentials.externalUserApiKey);

  if (!authToken && !externalUserApiKey) {
    throw new SamsarUserRouteError(
      "A Samsar auth token or external-user API key is required.",
      {
        status: 401
      }
    );
  }

  return {
    ...(authToken
      ? {
          Authorization: `Bearer ${authToken}`
        }
      : {}),
    ...(externalUserApiKey
      ? {
          "x-external-user-api-key": externalUserApiKey
        }
      : {})
  };
}

function hasExplicitExternalUserIdentity(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const externalUser =
    record.externalUser && typeof record.externalUser === "object"
      ? (record.externalUser as Record<string, unknown>)
      : record.external_user && typeof record.external_user === "object"
        ? (record.external_user as Record<string, unknown>)
        : undefined;

  return Boolean(
    readOptionalString(record.provider) ||
      readOptionalString(record.externalProvider) ||
      readOptionalString(record.external_provider) ||
      readOptionalString(record.externalUserId) ||
      readOptionalString(record.external_user_id) ||
      readOptionalString(externalUser?.provider) ||
      readOptionalString(externalUser?.externalUserId) ||
      readOptionalString(externalUser?.external_user_id)
  );
}

function injectScopedExternalUser(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  const authToken = readOptionalString(credentials.authToken);
  const externalUserApiKey = readOptionalString(credentials.externalUserApiKey);
  const externalUser =
    credentials.externalUser &&
    typeof credentials.externalUser === "object" &&
    !Array.isArray(credentials.externalUser)
      ? credentials.externalUser
      : undefined;

  if (!authToken || externalUserApiKey || !externalUser) {
    return body;
  }

  if (hasExplicitExternalUserIdentity(body)) {
    return body;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  return {
    ...(body as Record<string, unknown>),
    externalUser
  };
}

async function requestSamsarUserJson<T>(
  pathname: string,
  body: unknown,
  credentials: SamsarUserCredentials,
  init?: {
    method?: "GET" | "POST";
  }
) {
  const scopedBody = injectScopedExternalUser(body, credentials);
  const response = await fetch(createUpstreamUrl(pathname), {
    method: init?.method ?? "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildCredentialHeaders(credentials)
    },
    body:
      init?.method === "GET"
        ? undefined
        : JSON.stringify(scopedBody ?? {})
  });

  const contentType = response.headers.get("content-type") ?? "";
  const parsedBody = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  const creditsRemainingHeader = readOptionalNumber(
    response.headers.get("x-credits-remaining")
  );
  const creditsChargedHeader = readOptionalNumber(
    response.headers.get("x-credits-charged")
  );

  if (!response.ok) {
    const message =
      parsedBody && typeof parsedBody === "object" && "message" in parsedBody
        ? readOptionalString((parsedBody as Record<string, unknown>).message) ??
          `Samsar user route failed with ${response.status}`
        : typeof parsedBody === "string" && parsedBody.trim()
          ? parsedBody.trim()
          : `Samsar user route failed with ${response.status}`;
    const code =
      parsedBody && typeof parsedBody === "object" && "code" in parsedBody
        ? readOptionalString((parsedBody as Record<string, unknown>).code)
        : undefined;
    const creditsRemaining =
      parsedBody && typeof parsedBody === "object" && "creditsRemaining" in parsedBody
        ? readOptionalNumber(
            (parsedBody as Record<string, unknown>).creditsRemaining
          ) ?? creditsRemainingHeader
        : creditsRemainingHeader;

    throw new SamsarUserRouteError(message, {
      status: response.status,
      code,
      creditsRemaining
    });
  }

  return {
    creditsCharged: creditsChargedHeader ?? null,
    creditsRemaining:
      (parsedBody &&
      typeof parsedBody === "object" &&
      "remainingCredits" in parsedBody
        ? readOptionalNumber(
            (parsedBody as Record<string, unknown>).remainingCredits
          )
        : undefined) ??
      creditsRemainingHeader ??
      null,
    data: parsedBody as T
  };
}

export async function fetchSamsarUserSession(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<{
    external_api_key?: string | null;
    externalUser?: Record<string, unknown> | null;
    external_user?: Record<string, unknown> | null;
    remainingCredits?: number | null;
  }>("/v1/external_users/session", body, credentials);
}

export async function createSamsarUserAssistantSession(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    "/v1/external_users/utils/assistant_session",
    body,
    credentials
  );
}

export async function setSamsarUserAssistantSystemPrompt(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    "/v1/external_users/assistant/set_system_prompt",
    body,
    credentials
  );
}

export async function createSamsarUserLoginToken(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    readOptionalString(credentials.authToken)
      ? "/v1/create_login_token"
      : "/v1/external_users/create_login_token",
    body,
    credentials
  );
}

export async function generateSamsarUserEmbeddingsFromPlainText(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    "/v1/external_users/generate_embeddings_from_plain_text",
    body,
    credentials
  );
}

export async function chargeSamsarUserUtilityUsage(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    "/v1/external_users/utils/usage_charge",
    body,
    credentials
  );
}

export async function createSamsarUserAssistantCompletion(
  body: unknown,
  credentials: SamsarUserCredentials
) {
  return requestSamsarUserJson<Record<string, unknown>>(
    "/v1/external_users/assistant/completion",
    body,
    credentials
  );
}
