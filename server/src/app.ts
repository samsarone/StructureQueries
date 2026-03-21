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
        color-scheme: dark;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 18% 18%, rgba(70, 191, 255, 0.22), transparent 24%),
          radial-gradient(circle at 78% 16%, rgba(57, 216, 129, 0.18), transparent 22%),
          radial-gradient(circle at 76% 84%, rgba(251, 113, 133, 0.14), transparent 18%),
          linear-gradient(160deg, #07111d 0%, #0a1627 52%, #060d18 100%);
        color: #eef9ff;
      }

      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 24px;
      }

      .panel {
        width: min(100%, 760px);
        padding: 36px;
        border: 1px solid rgba(122, 177, 211, 0.16);
        border-radius: 32px;
        background:
          radial-gradient(circle at top left, rgba(70, 191, 255, 0.16), transparent 28%),
          linear-gradient(180deg, rgba(8, 18, 31, 0.94), rgba(8, 16, 28, 0.96));
        backdrop-filter: blur(18px);
        box-shadow:
          0 26px 80px rgba(0, 0, 0, 0.38),
          0 0 0 1px rgba(122, 177, 211, 0.08) inset;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: rgba(151, 222, 255, 0.78);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 10ch;
        font-size: clamp(3rem, 7vw, 5.5rem);
        line-height: 0.94;
        letter-spacing: -0.04em;
      }

      p {
        margin: 0;
        max-width: 32rem;
        font-size: 1rem;
        line-height: 1.6;
        color: rgba(164, 203, 223, 0.88);
      }

      .cta-row {
        margin-top: 28px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .install-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 54px;
        padding: 0 22px;
        border-radius: 18px;
        border: 1px solid rgba(57, 216, 129, 0.72);
        background: linear-gradient(135deg, rgba(70, 191, 255, 0.92), rgba(57, 216, 129, 0.98));
        color: #041015;
        font-size: 0.96rem;
        font-weight: 700;
        text-decoration: none;
        pointer-events: none;
        box-shadow: 0 16px 44px rgba(57, 216, 129, 0.16);
      }

      .install-button::after {
        content: "Soon";
        margin-left: 10px;
        padding: 5px 8px;
        border-radius: 999px;
        background: rgba(4, 16, 21, 0.12);
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta {
        margin-top: 12px;
        font-size: 0.92rem;
        color: rgba(191, 231, 245, 0.72);
      }

      @media (max-width: 640px) {
        .panel {
          padding: 28px 22px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="eyebrow">StructuredQueries</p>
        <h1>Structured Queries</h1>
        <div class="cta-row">
          <a class="install-button" href="#" aria-disabled="true">Install Chrome extension</a>
        </div>
        <p class="meta">Voice-first retrieval for live webpages. Chrome install link will be added here next.</p>
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
