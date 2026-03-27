import { Router, type Request, type Response } from "express";

import { env } from "../config/env.js";
import { createSamsarUserLoginToken } from "../lib/samsar-user-auth.js";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveRequestProtocol(request: Request) {
  return (
    readOptionalString(request.get("x-forwarded-proto")?.split(",")[0]) ??
    request.protocol ??
    "http"
  );
}

function getRequestOrigin(request: Request) {
  const host =
    readOptionalString(request.get("x-forwarded-host")?.split(",")[0]) ??
    readOptionalString(request.get("host"));

  if (!host) {
    return null;
  }

  return `${resolveRequestProtocol(request)}://${host}`;
}

function getSharedCookieDomain(request: Request) {
  const host =
    readOptionalString(request.get("x-forwarded-host")?.split(",")[0]) ??
    readOptionalString(request.get("host"));

  if (!host) {
    return undefined;
  }

  const hostname = host.split(":")[0].trim().toLowerCase();

  return hostname === "samsar.one" || hostname.endsWith(".samsar.one")
    ? ".samsar.one"
    : undefined;
}

function setSharedAuthCookie(
  request: Request,
  response: Response,
  authToken: string
) {
  const secureAttr =
    resolveRequestProtocol(request) === "https" ? "; Secure" : "";
  const domain = getSharedCookieDomain(request);
  const domainAttr = domain ? `; Domain=${domain}` : "";

  response.append(
    "Set-Cookie",
    `authToken=${encodeURIComponent(authToken)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax${secureAttr}${domainAttr}`
  );
}

function resolveSafeRedirectPath(
  rawValue: unknown,
  fallback = "/web-client"
) {
  const redirectPath = readOptionalString(rawValue);

  if (
    !redirectPath ||
    !redirectPath.startsWith("/") ||
    redirectPath.startsWith("//")
  ) {
    return fallback;
  }

  return redirectPath;
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
  response: Response,
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
  upstreamResponse: globalThis.Response,
  request: Request,
  response: Response
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
      const parsedBody = JSON.parse(responseBody);

      if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
        const authToken = readOptionalString(
          (parsedBody as Record<string, unknown>).authToken
        );

        if (authToken) {
          setSharedAuthCookie(request, response, authToken);
        }
      }

      response.send(parsedBody);
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
  request: Request,
  response: Response
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

    await relayUpstreamResponse(upstreamResponse, request, response);
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
    readOptionalString(request.get("authorization")?.replace(/^Bearer\s+/i, "")) ??
    readCookieValue(request.headers.cookie, "authToken");
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

    await relayUpstreamResponse(upstreamResponse, request, response);
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

webAuthRouter.get("/google-login", async (request, response) => {
  const origin = getRequestOrigin(request);

  if (!origin) {
    sendExtensionBridgeError(
      response,
      400,
      "The public origin for this Samsar subdomain could not be determined."
    );
    return;
  }

  try {
    const upstreamUrl = createUpstreamUrl("/users/google_login");
    upstreamUrl.searchParams.set("origin", origin);
    upstreamUrl.searchParams.set("cookieConsent", "accepted");
    upstreamUrl.searchParams.set(
      "redirect",
      resolveSafeRedirectPath(request.query.redirect, "/web-client")
    );

    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json"
      }
    });
    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await upstreamResponse.json()
      : await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      throw new Error(
        responseBody &&
          typeof responseBody === "object" &&
          "error" in responseBody &&
          typeof responseBody.error === "string" &&
          responseBody.error.trim()
          ? responseBody.error.trim()
          : `Google login failed with ${upstreamResponse.status}.`
      );
    }

    const loginUrl =
      responseBody && typeof responseBody === "object"
        ? readOptionalString((responseBody as Record<string, unknown>).loginUrl)
        : undefined;

    if (!loginUrl) {
      throw new Error("Samsar did not return a Google login URL.");
    }

    response.redirect(302, loginUrl);
  } catch (error) {
    sendExtensionBridgeError(
      response,
      502,
      error instanceof Error
        ? error.message
        : "Unable to start Google login for this Samsar subdomain."
    );
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
  await proxyJsonPost("/users/login", request.body, request, response);
});

webAuthRouter.post("/register", async (request, response) => {
  await proxyJsonPost("/users/register", request.body, request, response);
});
