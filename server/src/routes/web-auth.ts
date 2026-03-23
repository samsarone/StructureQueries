import { Router } from "express";

import { env } from "../config/env.js";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getUpstreamBaseUrl() {
  return env.integrations.samsar.publicApiBaseUrl.replace(/\/$/, "");
}

function createUpstreamUrl(pathname: string) {
  return new URL(pathname, `${getUpstreamBaseUrl()}/`);
}

async function relayUpstreamResponse(
  upstreamResponse: Response,
  response: Parameters<Router["get"]>[1] extends (
    request: infer _Request,
    response: infer ResponseType
  ) => infer _Return
    ? ResponseType
    : never
) {
  const responseBody = await upstreamResponse.text();
  const contentType =
    upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8";

  response.status(upstreamResponse.status);
  response.type(contentType);

  if (!responseBody) {
    response.send();
    return;
  }

  if (contentType.includes("application/json")) {
    try {
      response.send(JSON.parse(responseBody));
      return;
    } catch {
      // Fall through and send the original body if the upstream content-type
      // was JSON-like but the body was not valid JSON.
    }
  }

  response.send(responseBody);
}

async function proxyJsonPost(
  pathname: string,
  body: unknown,
  response: Parameters<Router["post"]>[1] extends (
    request: infer _Request,
    response: infer ResponseType
  ) => infer _Return
    ? ResponseType
    : never
) {
  try {
    const upstreamResponse = await fetch(createUpstreamUrl(pathname), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });

    await relayUpstreamResponse(upstreamResponse, response);
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to reach Samsar auth service."
    });
  }
}

export const webAuthRouter = Router();

webAuthRouter.get("/session", async (request, response) => {
  const authToken =
    readOptionalString(
      typeof request.query.authToken === "string"
        ? request.query.authToken
        : undefined
    ) ??
    readOptionalString(request.get("authorization")?.replace(/^Bearer\s+/i, ""));
  const loginToken =
    readOptionalString(
      typeof request.query.loginToken === "string"
        ? request.query.loginToken
        : undefined
    ) ??
    readOptionalString(request.get("x-login-token")) ??
    readOptionalString(request.get("login_token"));

  if (!authToken && !loginToken) {
    response.status(400).json({
      ok: false,
      error: "authToken or loginToken is required."
    });
    return;
  }

  try {
    const url = createUpstreamUrl("/users/verify_token");

    if (authToken) {
      url.searchParams.set("authToken", authToken);
    }

    if (loginToken) {
      url.searchParams.set("loginToken", loginToken);
    }

    const upstreamResponse = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    await relayUpstreamResponse(upstreamResponse, response);
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to verify the Samsar session."
    });
  }
});

webAuthRouter.post("/login", async (request, response) => {
  await proxyJsonPost("/users/login", request.body, response);
});

webAuthRouter.post("/register", async (request, response) => {
  await proxyJsonPost("/users/register", request.body, response);
});
