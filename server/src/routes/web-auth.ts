import { Router } from "express";

import { env } from "../config/env.js";
import { createSamsarUserLoginToken } from "../lib/samsar-user-auth.js";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getUpstreamBaseUrl() {
  return env.integrations.samsar.publicApiBaseUrl.replace(/\/$/, "");
}

function createUpstreamUrl(pathname: string) {
  return new URL(pathname, `${getUpstreamBaseUrl()}/`);
}

function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookiePart of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookiePart.trim().split("=");
    if (cookieName !== name) {
      continue;
    }

    const rawValue = valueParts.join("=");
    return readOptionalString(rawValue ? decodeURIComponent(rawValue) : undefined);
  }

  return undefined;
}

function resolveExtensionRedirectUri(rawValue: unknown) {
  const redirectUri = readOptionalString(rawValue);

  if (!redirectUri) {
    return null;
  }

  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".chromiumapp.org")) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function sendExtensionBridgeError(
  response: Parameters<Router["get"]>[1] extends (
    request: infer _Request,
    response: infer ResponseType
  ) => infer _Return
    ? ResponseType
    : never,
  status: number,
  message: string
) {
  response.status(status).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue with Samsar One</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f6f8fb; color: #142033; }
      main { max-width: 32rem; margin: 10vh auto 0; padding: 1.5rem; }
      .card { background: #fff; border: 1px solid #d9e2ef; border-radius: 1rem; box-shadow: 0 12px 32px rgba(20, 32, 51, 0.08); padding: 1.5rem; }
      h1 { margin: 0 0 0.75rem; font-size: 1.1rem; }
      p { margin: 0; line-height: 1.5; color: #41536c; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>Continue with Samsar One</h1>
        <p>${message}</p>
      </div>
    </main>
  </body>
</html>`);
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

webAuthRouter.get("/extension", async (request, response) => {
  const redirectUri = resolveExtensionRedirectUri(request.query.redirect_uri);

  if (!redirectUri) {
    sendExtensionBridgeError(
      response,
      400,
      "The extension redirect URL is missing or invalid."
    );
    return;
  }

  const authToken =
    readCookieValue(request.headers.cookie, "authToken") ??
    readOptionalString(request.get("authorization")?.replace(/^Bearer\s+/i, ""));

  if (!authToken) {
    sendExtensionBridgeError(
      response,
      401,
      "No shared Samsar session was found in this browser. Sign in to Samsar One in this browser window, then try again from the extension."
    );
    return;
  }

  try {
    const loginToken = await createSamsarUserLoginToken(
      {},
      {
        authToken
      }
    );
    const resolvedLoginToken =
      readOptionalString(loginToken.data.loginToken) ??
      (() => {
        const loginUrl = readOptionalString(loginToken.data.loginUrl);

        if (!loginUrl) {
          return undefined;
        }

        try {
          return readOptionalString(new URL(loginUrl).searchParams.get("loginToken"));
        } catch {
          return undefined;
        }
      })();

    if (!resolvedLoginToken) {
      throw new Error("A login token was not returned.");
    }

    redirectUri.searchParams.set("loginToken", resolvedLoginToken);
    response.redirect(302, redirectUri.toString());
  } catch (error) {
    sendExtensionBridgeError(
      response,
      502,
      error instanceof Error
        ? error.message
        : "Unable to create the extension sign-in token."
    );
  }
});

webAuthRouter.post("/login", async (request, response) => {
  await proxyJsonPost("/users/login", request.body, response);
});

webAuthRouter.post("/register", async (request, response) => {
  await proxyJsonPost("/users/register", request.body, response);
});
