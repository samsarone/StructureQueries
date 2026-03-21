import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";

import { env } from "./config/env.js";
import { browserSessionsRouter } from "./routes/browser-sessions.js";
import {
  chatCompletionsRouter,
  proxyChatCompletionRouter
} from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { messagesRouter } from "./routes/messages.js";
import { stackRouter } from "./routes/stack.js";
import { voicesRouter } from "./routes/voices.js";
import { webpagesRouter } from "./routes/webpages.js";
import { backendStack } from "./stack.js";

export function createApp() {
  const app = express();
  const endpointItems = [
    ["/api/health", "Health and dependency status"],
    ["/api/browser-sessions", "Browser session management"],
    ["/api/messages", "Structured message operations"],
    ["/api/stack", "Runtime backend stack summary"],
    ["/api/voices", "Voice provider endpoints"],
    ["/api/webpages", "Webpage ingestion endpoints"],
    ["/v1/chat/completions", "OpenAI-compatible chat completions"]
  ]
    .map(
      ([path, description]) =>
        `<li><a href="${path}">${path}</a><span>${description}</span></li>`
    )
    .join("");

  app.locals.stack = backendStack;

  app.use(
    cors({
      origin: env.clientOrigin === "*" ? true : env.clientOrigin
    })
  );
  app.use(express.json());

  app.get("/", (_request, response) => {
    response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${env.serviceName}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(68, 94, 145, 0.18), transparent 38%),
          linear-gradient(180deg, #f5f2eb 0%, #efe7d9 100%);
        color: #162133;
      }

      main {
        max-width: 880px;
        margin: 0 auto;
        padding: 48px 24px 64px;
      }

      .panel {
        padding: 32px;
        border: 1px solid rgba(22, 33, 51, 0.12);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 45px rgba(22, 33, 51, 0.08);
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2.5rem, 5vw, 4.5rem);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      p {
        margin: 0;
        max-width: 46rem;
        font-size: 1.05rem;
        line-height: 1.7;
      }

      ul {
        list-style: none;
        margin: 32px 0 0;
        padding: 0;
        display: grid;
        gap: 12px;
      }

      li {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-radius: 16px;
        background: rgba(245, 242, 235, 0.9);
      }

      a {
        color: #0f5dd7;
        font-weight: 700;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      span {
        color: #51607a;
      }

      .meta {
        margin-top: 28px;
        color: #51607a;
        font-size: 0.95rem;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Structured Queries</h1>
        <p>
          ${env.serviceName} is running and ready to serve the API, browser
          session gateway, and provider-backed chat workflows behind this host.
        </p>
        <ul>${endpointItems}</ul>
        <p class="meta">Production target port: ${env.port}</p>
      </section>
    </main>
  </body>
</html>`);
  });

  app.use("/api/browser-sessions", browserSessionsRouter);
  app.use("/api/chat-completion", proxyChatCompletionRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/stack", stackRouter);
  app.use("/api/voices", voicesRouter);
  app.use("/api/webpages", webpagesRouter);
  app.use("/v1/chat", chatCompletionsRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: "Not found"
    });
  });

  app.use(
    (
      error: Error,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      console.error(error);
      response.status(500).json({
        error: "Internal server error"
      });
    }
  );

  return app;
}
