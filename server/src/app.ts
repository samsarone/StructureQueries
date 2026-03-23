import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { webAuthRouter } from "./routes/web-auth.js";
import { webpagesRouter } from "./routes/webpages.js";
import { backendStack } from "./stack.js";

const CHROME_WEB_STORE_PLACEHOLDER_URL = "https://chromewebstore.google.com/";
const CLIENT_PUBLIC_DIR = fileURLToPath(
  new URL("../../client/public/", import.meta.url)
);
const STRUCTURED_QUERIES_MONOGRAM_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync(
    new URL("../../client/public/structured-queries-monogram.svg", import.meta.url)
  )
).toString("base64")}`;

function renderLandingPage(serviceName: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="Deeply analyze complex web pages and blog posts, then ask grounded follow-up questions with a conversational bot."
    />
    <title>${serviceName}</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

      :root {
        color-scheme: dark;
        --sq-ink: #ecf3fb;
        --sq-muted: #9ba9ba;
        --sq-bg-start: #070b12;
        --sq-bg-mid: #0a121d;
        --sq-bg-end: #050a11;
        --sq-accent: #39d881;
        --sq-accent-cool: #46bfff;
        --sq-card-shadow: 0 24px 90px rgba(70, 191, 255, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--sq-ink);
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 10% 12%, rgba(57, 216, 129, 0.12), transparent 34%),
          radial-gradient(circle at 86% 9%, rgba(70, 191, 255, 0.11), transparent 32%),
          repeating-linear-gradient(90deg, rgba(236, 243, 251, 0.018) 0 1px, transparent 1px 52px),
          linear-gradient(165deg, var(--sq-bg-start) 0%, var(--sq-bg-mid) 45%, var(--sq-bg-end) 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        opacity: 0.22;
        background-image:
          linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
          linear-gradient(124deg, rgba(96, 194, 245, 0.1) 0%, transparent 34%);
        background-size:
          72px 72px,
          72px 72px,
          100% 100%;
        mask-image: radial-gradient(circle at 50% 42%, black 0%, transparent 75%);
      }

      a {
        color: inherit;
      }

      p {
        margin: 0;
      }

      main {
        position: relative;
        z-index: 1;
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        display: grid;
        gap: 14px;
        padding: 10px 0 44px;
      }

      .site-header {
        position: relative;
        z-index: 4;
        width: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(122, 177, 211, 0.08);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(10, 19, 32, 0.22), rgba(7, 13, 24, 0.18)),
          rgba(8, 16, 28, 0.14);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
        backdrop-filter: blur(14px);
        opacity: 0.34;
        pointer-events: none;
        margin-bottom: 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-emblem {
        width: 40px;
        height: 40px;
        padding: 4px;
        flex-shrink: 0;
        border-radius: 16px;
        border: 1px solid rgba(143, 223, 255, 0.1);
        background:
          linear-gradient(180deg, rgba(13, 24, 41, 0.34), rgba(7, 13, 23, 0.3)),
          rgba(7, 13, 23, 0.28);
        box-shadow:
          0 8px 20px rgba(0, 0, 0, 0.12),
          0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      }

      .brand-emblem img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .brand-meta {
        display: grid;
        gap: 2px;
      }

      .brand-overline,
      .eyebrow,
      .label,
      .feature-pill,
      .step-index {
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
      }

      .brand-overline,
      .eyebrow {
        color: rgba(151, 222, 255, 0.68);
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }

      .brand-name {
        max-width: 34ch;
        color: rgba(204, 219, 233, 0.72);
        font-size: 0.8rem;
        line-height: 1.48;
        text-align: left;
      }

      .site-banner-install {
        color: rgba(204, 219, 233, 0.26);
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .section {
        position: relative;
        overflow: hidden;
        padding: clamp(22px, 3vw, 38px);
        border: 1px solid rgba(122, 177, 211, 0.16);
        border-radius: 34px;
        background:
          radial-gradient(circle at top left, rgba(70, 191, 255, 0.16), transparent 28%),
          linear-gradient(180deg, rgba(8, 18, 31, 0.94), rgba(8, 16, 28, 0.96));
        box-shadow:
          0 26px 80px rgba(0, 0, 0, 0.38),
          0 0 0 1px rgba(122, 177, 211, 0.08) inset;
        isolation: isolate;
      }

      .section::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -2;
        background:
          radial-gradient(circle at 10% 14%, rgba(57, 216, 129, 0.12), transparent 36%),
          radial-gradient(circle at 86% 11%, rgba(70, 191, 255, 0.1), transparent 34%),
          linear-gradient(173deg, rgba(7, 11, 18, 0.98) 0%, rgba(8, 12, 20, 0.98) 42%, rgba(6, 10, 17, 0.99) 100%);
      }

      .section::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        opacity: 0.12;
        background-image:
          linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px);
        background-size: 72px 72px;
        mask-image: radial-gradient(circle at 50% 42%, black 0%, transparent 75%);
      }

      #top {
        min-height: calc(100vh - 24px);
        display: flex;
        align-items: center;
        padding-top: clamp(18px, 2vw, 28px);
      }

      .hero-grid {
        display: grid;
        width: 100%;
        grid-template-columns: minmax(0, 1.04fr) minmax(340px, 0.84fr);
        gap: 18px;
        align-items: center;
        justify-items: stretch;
        min-height: 0;
      }

      .hero-copy {
        max-width: 40rem;
        text-align: left;
      }

      .hero-title {
        margin: 0 0 14px;
        max-width: 18.8ch;
        margin-left: 0;
        margin-right: 0;
        display: grid;
        gap: 0.02em;
        justify-items: start;
        font-size: clamp(2.15rem, 4.2vw, 3.7rem);
        line-height: 0.98;
        letter-spacing: -0.06em;
        text-wrap: balance;
      }

      .hero-title-line {
        display: block;
      }

      .hero-title-line-support {
        max-width: 28ch;
        margin-top: -0.14em;
        font-size: 0.28em;
        line-height: 1.2;
        letter-spacing: -0.04em;
        color: rgba(228, 238, 248, 0.9);
        text-wrap: balance;
      }

      .hero-title-rotator {
        position: relative;
        overflow: hidden;
        width: 100%;
        min-height: 0.82em;
        margin-top: -0.02em;
      }

      .hero-title-phrase {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        overflow: hidden;
        white-space: nowrap;
        font-size: 0.74em;
        opacity: 0;
        border-right: 0.05em solid rgba(123, 226, 255, 0.78);
        animation: hero-type-cycle 20s infinite;
        animation-timing-function: steps(24, end);
        animation-fill-mode: both;
        will-change: width, opacity;
      }

      .hero-title-phrase:nth-child(2) {
        animation-delay: 5s;
      }

      .hero-title-phrase:nth-child(3) {
        animation-delay: 10s;
      }

      .hero-title-phrase:nth-child(4) {
        animation-delay: 15s;
      }

      .hero-title .highlight {
        color: var(--sq-accent-cool);
        text-shadow: 0 0 18px rgba(96, 194, 245, 0.14);
      }

      @keyframes hero-type-cycle {
        0%,
        1% {
          opacity: 1;
          width: 0;
        }

        10%,
        18% {
          opacity: 1;
          width: var(--phrase-width);
        }

        22%,
        24% {
          opacity: 1;
          width: 0;
        }

        25%,
        100% {
          opacity: 0;
          width: 0;
        }
      }

      .hero-description,
      .section-copy,
      .card-copy,
      .store-note,
      .asset-copy {
        color: rgba(164, 203, 223, 0.88);
        font-size: 0.98rem;
        line-height: 1.66;
      }

      .hero-description,
      .section-copy {
        text-wrap: pretty;
      }

      .hero-description {
        max-width: 33rem;
        margin: 0;
      }

      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
        justify-content: flex-start;
      }

      .button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 50px;
        padding: 0 22px;
        border-radius: 18px;
        border: 1px solid transparent;
        font-size: 0.92rem;
        font-weight: 700;
        text-decoration: none;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background-color 180ms ease;
      }

      .button:hover {
        transform: translate3d(0, -1px, 0);
      }

      .button-primary {
        border-color: rgba(57, 216, 129, 0.72);
        background: linear-gradient(135deg, rgba(70, 191, 255, 0.92), rgba(57, 216, 129, 0.98));
        color: #041015;
        box-shadow: 0 16px 44px rgba(57, 216, 129, 0.16);
      }

      .button-secondary {
        border-color: rgba(148, 163, 184, 0.24);
        background: rgba(8, 18, 29, 0.62);
        color: rgba(236, 243, 251, 0.96);
      }

      .button-full {
        width: 100%;
      }

      .feature-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
        justify-content: center;
      }

      .feature-pill {
        padding: 11px 15px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        background: rgba(8, 18, 29, 0.62);
        color: rgba(228, 238, 248, 0.88);
        font-size: 0.78rem;
        letter-spacing: 0.04em;
      }

      .preview-card,
      .store-card,
      .step-card,
      .asset-card {
        border: 1px solid rgba(122, 177, 211, 0.16);
        border-radius: 28px;
        background: linear-gradient(180deg, rgba(10, 18, 29, 0.92), rgba(5, 10, 18, 0.94));
        box-shadow: var(--sq-card-shadow);
      }

      .hero-install-overlay {
        position: absolute;
        top: 18px;
        right: 22px;
        padding: 10px 14px;
        border: 1px solid rgba(143, 223, 255, 0.18);
        border-radius: 999px;
        background: rgba(7, 13, 23, 0.08);
        color: rgba(194, 228, 247, 0.2);
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        pointer-events: none;
        user-select: none;
      }

      .preview-card {
        width: min(100%, 400px);
        justify-self: end;
        padding: 15px;
      }

      .preview-top,
      .label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
        font-size: 0.72rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(161, 221, 248, 0.78);
      }

      .preview-top {
        margin-bottom: 12px;
        padding-bottom: 9px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      }

      .message {
        margin-bottom: 9px;
        padding: 12px 13px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(11, 21, 33, 0.92), rgba(8, 16, 27, 0.92));
      }

      .message-label {
        display: block;
        margin-bottom: 8px;
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
        font-size: 0.68rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(151, 222, 255, 0.72);
      }

      .message p {
        font-size: 0.84rem;
        line-height: 1.48;
        color: rgba(236, 243, 251, 0.94);
      }

      .assistant-message {
        border-color: rgba(57, 216, 129, 0.18);
      }

      .preview-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .stat {
        padding: 10px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.03);
      }

      .stat strong {
        display: block;
        font-size: 0.94rem;
        color: rgba(236, 243, 251, 0.96);
      }

      .stat span {
        display: block;
        margin-top: 4px;
        color: rgba(155, 169, 186, 0.88);
        font-size: 0.76rem;
        line-height: 1.44;
      }

      .section-header {
        max-width: 46rem;
        margin: 0 auto 28px;
        text-align: center;
      }

      h2,
      h3 {
        margin: 0;
      }

      .section-title {
        margin: 0 0 14px;
        max-width: 14ch;
        margin-left: auto;
        margin-right: auto;
        font-size: clamp(2.15rem, 5vw, 3.8rem);
        line-height: 0.96;
        letter-spacing: -0.05em;
        text-wrap: balance;
      }

      .install-shell {
        display: grid;
        grid-template-columns: minmax(0, 1.06fr) minmax(280px, 0.94fr);
        gap: 20px;
        align-items: start;
      }

      .interactive-copy {
        display: grid;
        gap: 14px;
      }

      .interactive-point {
        padding: 18px 20px;
        border: 1px solid rgba(122, 177, 211, 0.14);
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(10, 18, 29, 0.88), rgba(5, 10, 18, 0.92));
        box-shadow: var(--sq-card-shadow);
      }

      .interactive-point strong {
        display: block;
        margin-bottom: 8px;
        font-size: 1rem;
        letter-spacing: -0.02em;
      }

      .interactive-point span {
        display: block;
        color: rgba(164, 203, 223, 0.88);
        line-height: 1.6;
      }

      .interactive-shell {
        display: grid;
        gap: 18px;
      }

      .web-client-frame {
        width: 100%;
        min-height: 1180px;
        border: 1px solid rgba(122, 177, 211, 0.16);
        border-radius: 30px;
        background:
          radial-gradient(circle at 12% 16%, rgba(70, 191, 255, 0.12), transparent 26%),
          linear-gradient(180deg, rgba(7, 13, 24, 0.96), rgba(5, 10, 18, 0.98));
        box-shadow:
          0 26px 80px rgba(0, 0, 0, 0.38),
          0 0 0 1px rgba(122, 177, 211, 0.08) inset;
      }

      .step-list {
        display: grid;
        gap: 14px;
      }

      .step-card {
        padding: 22px;
      }

      .step-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 52px;
        min-height: 30px;
        padding: 0 12px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 999px;
        color: rgba(151, 222, 255, 0.82);
        font-size: 0.72rem;
        letter-spacing: 0.16em;
      }

      .step-card h3,
      .store-card h3,
      .asset-card h3 {
        margin-top: 16px;
        font-size: 1.35rem;
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      .card-copy {
        margin-top: 10px;
      }

      .store-card {
        display: grid;
        align-content: start;
        gap: 18px;
        padding: 24px;
      }

      .store-note {
        font-size: 0.92rem;
      }

      .asset-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px;
      }

      .asset-card {
        grid-column: span 3;
        display: grid;
        align-content: start;
        gap: 16px;
        min-height: 280px;
        padding: 22px;
      }

      .asset-card-wide {
        grid-column: span 6;
      }

      .asset-copy {
        font-size: 0.94rem;
      }

      .placeholder-frame,
      .placeholder-chat,
      .placeholder-source {
        position: relative;
        overflow: hidden;
        min-height: 148px;
        border: 1px dashed rgba(148, 163, 184, 0.24);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(14, 22, 34, 0.82), rgba(7, 14, 22, 0.92)),
          linear-gradient(124deg, rgba(96, 194, 245, 0.08) 0%, transparent 50%);
      }

      .placeholder-frame::before,
      .placeholder-chat::before,
      .placeholder-source::before {
        content: "";
        position: absolute;
        inset: 0;
        opacity: 0.14;
        background-image:
          linear-gradient(to right, rgba(148, 163, 184, 0.16) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px);
        background-size: 28px 28px;
      }

      .placeholder-toolbar {
        display: flex;
        gap: 8px;
        padding: 14px 14px 0;
      }

      .placeholder-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(164, 203, 223, 0.45);
      }

      .placeholder-lines {
        display: grid;
        gap: 10px;
        padding: 16px 14px 14px;
      }

      .placeholder-line,
      .placeholder-bubble,
      .placeholder-chip {
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(70, 191, 255, 0.72), rgba(57, 216, 129, 0.54));
      }

      .placeholder-line {
        height: 10px;
      }

      .line-long {
        width: 88%;
      }

      .line-medium {
        width: 72%;
      }

      .line-short {
        width: 58%;
      }

      .placeholder-chat {
        display: grid;
        gap: 12px;
        padding: 16px;
      }

      .placeholder-bubble {
        width: 88%;
        height: 46px;
        opacity: 0.76;
      }

      .placeholder-bubble:nth-child(2) {
        width: 68%;
        justify-self: end;
      }

      .placeholder-source {
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 10px;
        padding: 16px;
      }

      .placeholder-chip {
        width: calc(50% - 5px);
        height: 42px;
        opacity: 0.76;
      }

      @media (max-width: 980px) {
        #top {
          min-height: auto;
          padding-top: 26px;
        }

        .install-shell {
          grid-template-columns: 1fr;
        }

        .hero-grid {
          grid-template-columns: 1fr;
          justify-items: center;
        }

        .hero-copy {
          text-align: center;
        }

        .hero-title {
          margin-left: auto;
          margin-right: auto;
          justify-items: center;
          max-width: 16ch;
        }

        .hero-description {
          margin: 0 auto;
        }

        .cta-row {
          justify-content: center;
        }

        .preview-card {
          width: min(100%, 860px);
          justify-self: stretch;
        }

        .web-client-frame {
          min-height: 1260px;
        }

        .preview-stats {
          grid-template-columns: 1fr;
        }

        .asset-card,
        .asset-card-wide {
          grid-column: span 12;
        }
      }

      @media (max-width: 720px) {
        main {
          width: min(100%, calc(100% - 24px));
          padding-top: 16px;
        }

        #top {
          padding-top: 96px;
        }

        .site-header {
          position: fixed;
          top: 12px;
          left: 12px;
          right: 12px;
          margin-bottom: 0;
          opacity: 0.46;
        }

        .section {
          padding: 24px 20px;
          border-radius: 24px;
        }

        .hero-grid {
          min-height: auto;
        }

        .hero-title {
          font-size: clamp(2.35rem, 12vw, 3.4rem);
        }

        .hero-title-rotator {
          min-height: 1.12em;
        }

        .hero-title-phrase {
          font-size: 0.76em;
        }

        .hero-title-line-support {
          max-width: 22ch;
          margin-top: 0;
          font-size: 0.28em;
        }

        .brand-name {
          max-width: none;
          text-align: center;
        }

        .site-banner-install {
          display: none;
        }

        .hero-description,
        .section-copy,
        .card-copy,
        .store-note,
        .asset-copy {
          font-size: 0.92rem;
          line-height: 1.6;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hero-title-phrase {
          animation: none;
          width: 0;
          opacity: 0;
          border-right: 0;
        }

        .hero-title-phrase:first-child {
          width: var(--phrase-width);
          opacity: 1;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="section" id="top">
        <header class="site-header">
          <div class="brand">
            <div class="brand-emblem">
              <img
                src="${STRUCTURED_QUERIES_MONOGRAM_DATA_URL}"
                alt="Structure Queries monogram"
              />
            </div>
            <div class="brand-meta">
              <p class="brand-overline">Structure Queries</p>
              <p class="brand-name">Deep page analysis with voice-enabled Q&amp;A.</p>
            </div>
          </div>
          <div class="site-banner-install">Install from WebStore</div>
        </header>
        <div class="hero-grid">
          <div class="hero-copy">
            <h1 class="hero-title">
              <span class="hero-title-line">
                <span class="highlight">Interact with</span>
              </span>
              <span
                class="hero-title-rotator"
                aria-label="Articles, research papers, blog posts, technical documentation"
              >
                <span class="hero-title-phrase" style="--phrase-width: 9ch;">Articles</span>
                <span class="hero-title-phrase" style="--phrase-width: 16ch;">Research papers</span>
                <span class="hero-title-phrase" style="--phrase-width: 12ch;">Blog posts</span>
                <span class="hero-title-phrase" style="--phrase-width: 23ch;">Technical documentation</span>
              </span>
              <span class="hero-title-line hero-title-line-support">
                with voice-enabled page analysis and follow-up Q&amp;A.
              </span>
            </h1>
            <p class="hero-description">
              Structure Queries prepares the page, surfaces the key structure, and lets you ask
              follow-up questions by voice without losing the source context.
            </p>

            <div class="cta-row">
              <a
                class="button button-primary"
                href="${CHROME_WEB_STORE_PLACEHOLDER_URL}"
                target="_blank"
                rel="noreferrer"
              >
                Install from WebStore
              </a>
              <a class="button button-secondary" href="#install">Try the web client</a>
            </div>
          </div>

          <div class="preview-card" aria-label="Conversational product preview">
            <div class="preview-top">
              <span>Live Page Context</span>
              <span>Source page</span>
            </div>

            <div class="message">
              <span class="message-label">User</span>
              <p>Summarize the main ideas and show which sections support them.</p>
            </div>

            <div class="message assistant-message">
              <span class="message-label">Bot</span>
              <p>I mapped the page structure, pulled out the key points, and can answer follow-up questions while staying close to the source.</p>
            </div>

            <div class="preview-stats" aria-label="Product highlights">
              <div class="stat">
                <strong>Page-aware</strong>
                <span>Structured context from dense pages before the conversation starts.</span>
              </div>
              <div class="stat">
                <strong>Conversational</strong>
                <span>Ask natural follow-up questions instead of reading line by line.</span>
              </div>
              <div class="stat">
                <strong>Source-backed</strong>
                <span>Answers stay anchored to the source content already on the page.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" id="install">
        <div class="section-header">
          <p class="eyebrow">Web client</p>
          <h2 class="section-title">Try the full Structure Queries workflow on any public URL.</h2>
          <p class="section-copy">
            This section embeds a web version of the plugin UI. Paste in a public URL, analyze the page,
            and use the same voice-enabled Q&amp;A flow directly from the landing page.
          </p>
        </div>

        <div class="install-shell">
          <div class="interactive-copy" aria-label="Web client overview">
            <article class="interactive-point">
              <strong>Enter any public page</strong>
              <span>Use the embedded client for blog posts, docs, and dense webpages without needing the extension popup.</span>
            </article>
            <article class="interactive-point">
              <strong>Sign in across Samsar subdomains</strong>
              <span>If you already have a Samsar session, the web client picks it up here. If not, it opens a login or registration flow before analysis starts.</span>
            </article>
            <article class="interactive-point">
              <strong>Analyze, ask, and recharge in one place</strong>
              <span>The same page analysis, speaker selection, voice interaction, credits, and recharge logic now live inside this landing page section.</span>
            </article>
          </div>

          <div class="interactive-shell">
            <iframe
              class="web-client-frame"
              src="/web-client"
              title="Structured Queries web client"
              loading="lazy"
            ></iframe>
          </div>
        </div>
      </section>

    </main>
  </body>
</html>`;
}

export function createApp() {
  const app = express();

  app.locals.stack = backendStack;

  app.use(
    cors({
      origin: env.clientOrigin === "*" ? true : env.clientOrigin
    })
  );
  app.use(express.json());
  app.use("/landing-assets", express.static(CLIENT_PUBLIC_DIR));

  app.get("/", (_request, response) => {
    response.type("html").send(renderLandingPage(env.serviceName));
  });
  app.get("/web-client", (_request, response) => {
    response.sendFile(join(CLIENT_PUBLIC_DIR, "web-plugin.html"));
  });

  app.use("/api/browser-sessions", browserSessionsRouter);
  app.use("/api/web-auth", webAuthRouter);
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
