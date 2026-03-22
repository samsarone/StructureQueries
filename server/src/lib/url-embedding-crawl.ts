import { Firecrawl } from "@mendable/firecrawl-js";

import { env } from "../config/env.js";
import {
  cleanEmbeddingSourceText,
  stripHtmlToText
} from "./embedding-text-cleanup.js";

const MAX_EMBEDDING_INPUT_CHARS = 6_000;
const MAX_URL_SEEDS_PER_REQUEST = 50;
const MAX_URL_CRAWL_LINKS_PER_REQUEST = 5;
const FIRECRAWL_MIN_REQUEST_INTERVAL_MS = 500;
const FIRECRAWL_MIN_JOB_START_INTERVAL_MS = 8_000;
const FIRECRAWL_MAX_RATE_LIMIT_RETRIES = 8;
const FIRECRAWL_RETRY_DELAY_BUFFER_MS = 1_000;
const FIRECRAWL_MAX_RETRY_DELAY_MS = 60_000;
const RELATED_SECTION_PATTERN =
  /\b(related|related links|see also|further reading|additional resources|learn more|next steps)\b/i;
const EXCLUDED_SECTION_PATTERN =
  /\b(nav|navigation|menu|footer|header|breadcrumb|legal|privacy|terms|cookie|social|share)\b/i;
const IMPORTANT_LINK_PATTERN =
  /\b(overview|introduction|quickstart|getting started|guide|tutorial|reference|api|configuration|setup|install|example|examples|concept|concepts|architecture|details|faq|troubleshooting)\b/i;
const DEPRIORITIZED_LINK_PATTERN =
  /\b(sign in|signin|log in|login|register|sign up|signup|pricing|billing|blog|news|press|careers|contact|support|privacy|terms|cookie|cookies|legal|facebook|twitter|linkedin|youtube|github)\b/i;
const NON_HTML_PATH_PATTERN =
  /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tgz|mp4|mp3|mov|avi|pptx?|docx?|xlsx?)$/i;

type FirecrawlDocument = {
  markdown?: unknown;
  summary?: unknown;
  html?: unknown;
  rawHtml?: unknown;
  links?: unknown;
  url?: unknown;
  sourceURL?: unknown;
  sourceUrl?: unknown;
  metadata?: Record<string, unknown>;
};

type FirecrawlCrawlJob = {
  id?: string;
  status?: string;
  creditsUsed?: number;
  completed?: number;
  data?: FirecrawlDocument[];
};

type FirecrawlCrawlErrors = {
  errors?: Array<Record<string, unknown> | string>;
  robotsBlocked?: Array<Record<string, unknown> | string>;
};

type UrlEmbeddingError = Error & {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
};

type FirecrawlDocumentSection = {
  sourceUrl: string;
  title: string | null;
  description: string | null;
  language: string | null;
  statusCode: number | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  sectionText: string;
};

type PrioritizedLinkSource = "related" | "main" | "generic";

type PrioritizedLinkCandidate = {
  url: string;
  source: PrioritizedLinkSource;
  score: number;
};

type UrlPlainTextRecordBuildResult = {
  record: Record<string, unknown> | null;
  processedPageCount: number;
  hasPrimarySection: boolean;
  skippedUrlMap: Map<string, string>;
};

export interface UrlEmbeddingIssue {
  url: string;
  message: string;
  code?: string | null;
}

export interface UrlPlainTextCrawlResult {
  records: Array<Record<string, unknown>>;
  inputUrlCount: number;
  processedUrlCount: number;
  crawlLevels: number;
  maxLinks: number;
  firecrawlCreditsUsed: number;
  firecrawlJobId: string | null;
  firecrawlJobIds: string[];
  skippedUrls: UrlEmbeddingIssue[];
  crawlErrors: UrlEmbeddingIssue[];
}

export interface UrlPlainTextCrawlOptions {
  crawlLevels?: number;
  maxLinks?: number;
}

let firecrawlClient: Firecrawl | undefined;
let firecrawlThrottleQueue = Promise.resolve();
let firecrawlNextRequestAt = 0;
let firecrawlNextJobStartAt = 0;

function createStatusError(
  message: string,
  statusCode: number,
  code?: string,
  details?: Record<string, unknown>
) {
  const error = new Error(message) as UrlEmbeddingError;
  error.statusCode = statusCode;
  error.code = code;

  if (details) {
    error.details = details;
  }

  return error;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseRetryAfterMessageMs(message: unknown) {
  if (typeof message !== "string" || !message.trim()) {
    return null;
  }

  const retryAfterMatch = message.match(/retry after\s+(\d+)\s*s/i);

  if (retryAfterMatch) {
    const seconds = Number.parseInt(retryAfterMatch[1] ?? "", 10);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }
  }

  const resetAtMatch = message.match(/resets at\s+(.+)$/i);

  if (resetAtMatch) {
    const resetAt = Date.parse((resetAtMatch[1] ?? "").trim());

    if (Number.isFinite(resetAt)) {
      return Math.max(0, resetAt - Date.now());
    }
  }

  return null;
}

function isFirecrawlRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { code?: unknown }).code;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

  return (
    statusCode === 429 ||
    code === "FIRECRAWL_RATE_LIMIT" ||
    /rate limit/i.test(message) ||
    /retry after/i.test(message)
  );
}

function getFirecrawlRetryDelayMs(error: unknown, attempt = 0) {
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? (error as { message: string }).message
        : "";
  const hintedDelayMs = parseRetryAfterMessageMs(message) ?? 0;
  const exponentialDelayMs = Math.min(
    FIRECRAWL_MAX_RETRY_DELAY_MS,
    1_000 * (2 ** attempt)
  );

  return Math.max(hintedDelayMs, exponentialDelayMs) + FIRECRAWL_RETRY_DELAY_BUFFER_MS;
}

async function waitForFirecrawlRequestSlot(isJobStart: boolean) {
  const run = firecrawlThrottleQueue.then(async () => {
    const now = Date.now();
    const waitUntil = Math.max(
      firecrawlNextRequestAt,
      isJobStart ? firecrawlNextJobStartAt : 0
    );
    const delayMs = Math.max(0, waitUntil - now);

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const scheduledAt = Date.now();
    firecrawlNextRequestAt =
      scheduledAt + Math.max(0, FIRECRAWL_MIN_REQUEST_INTERVAL_MS);

    if (isJobStart) {
      firecrawlNextJobStartAt =
        scheduledAt +
        Math.max(
          FIRECRAWL_MIN_REQUEST_INTERVAL_MS,
          FIRECRAWL_MIN_JOB_START_INTERVAL_MS
        );
    }
  });

  firecrawlThrottleQueue = run.catch(() => {});
  await run;
}

function registerFirecrawlRateLimitBackoff(
  isJobStart: boolean,
  retryAfterMs: number
) {
  const normalizedRetryAfterMs = Math.max(
    0,
    Number.parseInt(String(retryAfterMs || 0), 10) || 0
  );

  if (normalizedRetryAfterMs <= 0) {
    return;
  }

  const backoffUntil = Date.now() + normalizedRetryAfterMs;
  firecrawlNextRequestAt = Math.max(firecrawlNextRequestAt, backoffUntil);

  if (isJobStart) {
    firecrawlNextJobStartAt = Math.max(firecrawlNextJobStartAt, backoffUntil);
  }
}

async function firecrawlWithRetry<T>(
  run: () => Promise<T>,
  options?: {
    isJobStart?: boolean;
  }
) {
  const isJobStart = options?.isJobStart === true;
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= FIRECRAWL_MAX_RATE_LIMIT_RETRIES;
    attempt += 1
  ) {
    await waitForFirecrawlRequestSlot(isJobStart);

    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (
        !isFirecrawlRateLimitError(error) ||
        attempt >= FIRECRAWL_MAX_RATE_LIMIT_RETRIES
      ) {
        throw error;
      }

      const retryDelayMs = getFirecrawlRetryDelayMs(error, attempt);
      registerFirecrawlRateLimitBackoff(isJobStart, retryDelayMs);
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

function truncateText(text: string, maxChars = MAX_EMBEDDING_INPUT_CHARS) {
  if (!text) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUrlValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeUrlList(urls: string | string[]) {
  const values = Array.isArray(urls) ? urls : [urls];
  const normalized: string[] = [];
  const invalid: unknown[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const normalizedUrl = normalizeUrlValue(value);

    if (!normalizedUrl) {
      invalid.push(value);
      return;
    }

    if (seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    normalized.push(normalizedUrl);
  });

  if (normalized.length === 0) {
    throw createStatusError(
      "urls must contain at least one valid URL.",
      400
    );
  }

  if (invalid.length > 0) {
    const invalidList = invalid
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
      .slice(0, 5)
      .join(", ");

    throw createStatusError(
      invalidList
        ? `Invalid URL values: ${invalidList}`
        : "urls contains invalid URL values.",
      400
    );
  }

  return normalized;
}

function resolveUrlValue(
  value: unknown,
  baseUrl: string | null = null
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function upsertPrioritizedLinkCandidate(
  candidates: Map<string, PrioritizedLinkCandidate>,
  candidate: PrioritizedLinkCandidate | null
) {
  if (!candidate) {
    return;
  }

  const existing = candidates.get(candidate.url);

  if (!existing || candidate.score > existing.score) {
    candidates.set(candidate.url, candidate);
  }
}

function isAllowedCrawlCandidateUrl(seedUrl: string, candidateUrl: string) {
  try {
    const seed = new URL(seedUrl);
    const candidate = new URL(candidateUrl);

    if (seed.toString() === candidate.toString()) {
      return false;
    }

    if (seed.hostname !== candidate.hostname) {
      return false;
    }

    if (NON_HTML_PATH_PATTERN.test(candidate.pathname)) {
      return false;
    }

    if (
      DEPRIORITIZED_LINK_PATTERN.test(candidate.pathname) ||
      DEPRIORITIZED_LINK_PATTERN.test(candidate.search)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function scorePrioritizedLinkCandidate(input: {
  seedUrl: string;
  candidateUrl: string;
  source: PrioritizedLinkSource;
  anchorText?: string | null;
  sectionHeading?: string | null;
}) {
  if (!isAllowedCrawlCandidateUrl(input.seedUrl, input.candidateUrl)) {
    return null;
  }

  const seed = new URL(input.seedUrl);
  const candidate = new URL(input.candidateUrl);
  const anchorText = normalizeOptionalString(input.anchorText)?.toLowerCase() ?? "";
  const sectionHeading =
    normalizeOptionalString(input.sectionHeading)?.toLowerCase() ?? "";
  const comparableText = `${anchorText} ${sectionHeading} ${candidate.pathname}`.trim();
  let score =
    input.source === "related"
      ? 300
      : input.source === "main"
        ? 200
        : 100;

  if (candidate.pathname.startsWith(seed.pathname.replace(/[^/]+$/, ""))) {
    score += 30;
  }

  if (IMPORTANT_LINK_PATTERN.test(comparableText)) {
    score += 25;
  }

  if (RELATED_SECTION_PATTERN.test(sectionHeading)) {
    score += 40;
  }

  if (DEPRIORITIZED_LINK_PATTERN.test(comparableText)) {
    score -= 120;
  }

  if (candidate.search) {
    score -= 5;
  }

  return {
    url: candidate.toString(),
    source: input.source,
    score
  };
}

function extractMarkdownLinkCandidates(
  seedUrl: string,
  markdown: string
) {
  const candidates = new Map<string, PrioritizedLinkCandidate>();
  const lines = markdown.split(/\r?\n/);
  let currentHeading: string | null = null;

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmedLine);

    if (headingMatch) {
      currentHeading = headingMatch[2]?.trim() ?? null;
      return;
    }

    const matches = trimmedLine.matchAll(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    );

    for (const match of matches) {
      const resolvedUrl = resolveUrlValue(match[2], seedUrl);

      if (!resolvedUrl) {
        continue;
      }

      const source: PrioritizedLinkSource =
        currentHeading && RELATED_SECTION_PATTERN.test(currentHeading)
          ? "related"
          : currentHeading && !EXCLUDED_SECTION_PATTERN.test(currentHeading)
            ? "main"
            : "generic";

      upsertPrioritizedLinkCandidate(
        candidates,
        scorePrioritizedLinkCandidate({
          seedUrl,
          candidateUrl: resolvedUrl,
          source,
          anchorText: match[1],
          sectionHeading: currentHeading
        })
      );
    }
  });

  return candidates;
}

function selectPrioritizedChildLinks(
  seedUrl: string,
  document: FirecrawlDocument,
  maxLinks: number
) {
  if (maxLinks <= 0) {
    return [];
  }

  const candidates = new Map<string, PrioritizedLinkCandidate>();
  const markdown =
    typeof document.markdown === "string" ? document.markdown : "";

  if (markdown.trim()) {
    extractMarkdownLinkCandidates(seedUrl, markdown).forEach((candidate, url) => {
      candidates.set(url, candidate);
    });
  }

  const discoveredLinks = Array.isArray(document.links) ? document.links : [];

  discoveredLinks.forEach((link) => {
    const resolvedUrl = resolveUrlValue(link, seedUrl);

    if (!resolvedUrl) {
      return;
    }

    upsertPrioritizedLinkCandidate(
      candidates,
      scorePrioritizedLinkCandidate({
        seedUrl,
        candidateUrl: resolvedUrl,
        source: "generic"
      })
    );
  });

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, maxLinks)
    .map((candidate) => candidate.url);
}

function getFirecrawlMetadata(document: FirecrawlDocument) {
  return document.metadata && typeof document.metadata === "object"
    ? document.metadata
    : {};
}

function getDocumentUrlCandidates(
  document: FirecrawlDocument,
  fallbackUrl: string | null = null
) {
  const metadata = getFirecrawlMetadata(document);
  const candidates = [
    metadata.sourceURL,
    metadata.sourceUrl,
    metadata.url,
    document.sourceURL,
    document.sourceUrl,
    document.url,
    fallbackUrl
  ];
  const normalized: string[] = [];
  const seen = new Set<string>();

  candidates.forEach((candidate) => {
    const normalizedUrl = normalizeUrlValue(candidate);

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    normalized.push(normalizedUrl);
  });

  return normalized;
}

function getDocumentSourceUrl(
  document: FirecrawlDocument,
  fallbackUrl: string | null = null
) {
  return getDocumentUrlCandidates(document, fallbackUrl)[0] ?? null;
}

function extractDocumentText(document: FirecrawlDocument) {
  const markdown = typeof document.markdown === "string" ? document.markdown : "";

  if (markdown.trim()) {
    return markdown;
  }

  const summary = typeof document.summary === "string" ? document.summary : "";

  if (summary.trim()) {
    return summary;
  }

  const html =
    typeof document.html === "string"
      ? document.html
      : typeof document.rawHtml === "string"
        ? document.rawHtml
        : "";

  return stripHtmlToText(html);
}

function buildDocumentSection(
  document: FirecrawlDocument,
  fallbackUrl: string | null = null
): FirecrawlDocumentSection | null {
  const sourceUrl = getDocumentSourceUrl(document, fallbackUrl);

  if (!sourceUrl) {
    return null;
  }

  const metadata = getFirecrawlMetadata(document);
  const title = normalizeOptionalString(metadata.title);
  const description = normalizeOptionalString(metadata.description);
  const language = normalizeOptionalString(metadata.language);
  const publishedTime = normalizeOptionalString(metadata.publishedTime);
  const modifiedTime = normalizeOptionalString(metadata.modifiedTime);
  const statusCode = Number(metadata.statusCode);
  const rawText = extractDocumentText(document).trim();
  const parts: string[] = [];

  if (title) {
    parts.push(title);
  }

  if (description && description.toLowerCase() !== title?.toLowerCase()) {
    parts.push(description);
  }

  if (rawText) {
    parts.push(rawText);
  }

  const sectionText = parts.join("\n\n").trim();

  if (!sectionText) {
    return null;
  }

  return {
    sourceUrl,
    title,
    description,
    language,
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
    publishedTime,
    modifiedTime,
    sectionText
  };
}

function buildUrlPlainTextRecord(
  seedUrl: string,
  documents: FirecrawlDocument[],
  primaryDocument: FirecrawlDocument | null = null
): UrlPlainTextRecordBuildResult {
  const skippedUrlMap = new Map<string, string>();
  const sections: FirecrawlDocumentSection[] = [];
  const seenUrls = new Set<string>();
  const candidateDocuments = primaryDocument
    ? [primaryDocument, ...documents]
    : [...documents];
  let hasPrimarySection = false;

  candidateDocuments.forEach((document, index) => {
    const fallbackUrl = index === 0 && primaryDocument ? seedUrl : null;
    const section = buildDocumentSection(document, fallbackUrl);
    const resolvedUrl = getDocumentSourceUrl(document, fallbackUrl) ?? fallbackUrl;
    const matchesSeedUrl = getDocumentUrlCandidates(document, fallbackUrl).includes(seedUrl);

    if (!section) {
      if (resolvedUrl) {
        skippedUrlMap.set(
          resolvedUrl,
          normalizeOptionalString(getFirecrawlMetadata(document).error) ??
            "Firecrawl returned no extractable text for the URL."
        );
      }
      return;
    }

    if (seenUrls.has(section.sourceUrl)) {
      if (matchesSeedUrl) {
        hasPrimarySection = true;
      }
      return;
    }

    seenUrls.add(section.sourceUrl);
    skippedUrlMap.delete(section.sourceUrl);

    if (matchesSeedUrl) {
      hasPrimarySection = true;
      sections.unshift(section);
      return;
    }

    sections.push(section);
  });

  const combinedSectionText = sections.map((section) => section.sectionText).join("\n\n");
  const content = truncateText(cleanEmbeddingSourceText(combinedSectionText));

  if (!content) {
    return {
      record: null,
      processedPageCount: sections.length,
      hasPrimarySection,
      skippedUrlMap
    };
  }

  const primarySection =
    sections.find((section) => section.sourceUrl === seedUrl) ?? sections[0] ?? null;
  const parsedUrl = new URL(seedUrl);

  return {
    record: {
      id: seedUrl,
      source_type: "url",
      crawl_provider: "firecrawl",
      url: seedUrl,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname || "/",
      ...(primarySection?.title ? { title: primarySection.title } : {}),
      ...(primarySection?.description
        ? { description: primarySection.description }
        : {}),
      ...(primarySection?.language ? { language: primarySection.language } : {}),
      status_code: primarySection?.statusCode ?? null,
      content_length: content.length,
      published_time: primarySection?.publishedTime ?? null,
      modified_time: primarySection?.modifiedTime ?? null,
      content
    },
    processedPageCount: sections.length,
    hasPrimarySection,
    skippedUrlMap
  };
}

function normalizeCrawlError(
  entry: Record<string, unknown> | string,
  fallbackMessage: string
): UrlEmbeddingIssue | null {
  if (typeof entry === "string") {
    const url = normalizeUrlValue(entry);

    if (!url) {
      return null;
    }

    return {
      url,
      message: fallbackMessage,
      code: "FIRECRAWL_ROBOTS_BLOCKED"
    };
  }

  const resolvedUrl = normalizeUrlValue(entry.url);

  if (!resolvedUrl) {
    return null;
  }

  return {
    url: resolvedUrl,
    message:
      (typeof entry.error === "string" && entry.error.trim()) ||
      (typeof entry.message === "string" && entry.message.trim()) ||
      fallbackMessage,
    code: typeof entry.code === "string" ? entry.code : null
  };
}

function getDefaultUrlEmbeddingFieldOptions() {
  return {
    source_type: { filterable: true, searchable: false },
    crawl_provider: { filterable: true, searchable: false },
    url: { searchable: true, retrievable: true },
    hostname: { filterable: true, searchable: true },
    pathname: { filterable: true, searchable: true },
    title: { searchable: true },
    description: { searchable: true },
    language: { filterable: true, searchable: true },
    status_code: { filterable: true, searchable: false },
    content_length: { filterable: true, searchable: false },
    published_time: { filterable: true, searchable: true },
    modified_time: { filterable: true, searchable: true },
    content: { searchable: true, retrievable: true }
  };
}

export function getUrlEmbeddingFieldOptions() {
  return getDefaultUrlEmbeddingFieldOptions();
}

export function isFirecrawlConfigured() {
  return Boolean(env.integrations.firecrawl.apiKey);
}

function getFirecrawlClient() {
  if (!env.integrations.firecrawl.apiKey) {
    throw createStatusError("FIRECRAWL_API_KEY is not configured.", 503);
  }

  if (!firecrawlClient) {
    firecrawlClient = new Firecrawl({
      apiKey: env.integrations.firecrawl.apiKey,
      apiUrl: env.integrations.firecrawl.apiUrl,
      timeoutMs: env.integrations.firecrawl.timeoutSeconds * 1_000
    });
  }

  return firecrawlClient;
}

async function scrapePrimaryDocument(client: Firecrawl, url: string) {
  try {
    const document = (await firecrawlWithRetry(
      () =>
        client.scrape(url, {
          formats: ["markdown", "links"],
          onlyMainContent: true
        }) as Promise<FirecrawlDocument>,
      {
        isJobStart: false
      }
    )) as FirecrawlDocument;

    return document;
  } catch {
    return null;
  }
}

async function batchScrapeDocuments(client: Firecrawl, urls: string[]) {
  const job = (await firecrawlWithRetry(
    () =>
      client.batchScrape(urls, {
        options: {
          formats: ["markdown"],
          onlyMainContent: true
        },
        pollInterval: env.integrations.firecrawl.pollIntervalSeconds,
        timeout: env.integrations.firecrawl.timeoutSeconds
      }) as Promise<FirecrawlCrawlJob>,
    {
      isJobStart: true
    }
  )) as FirecrawlCrawlJob;

  let crawlErrors: FirecrawlCrawlErrors = {
    errors: [],
    robotsBlocked: []
  };

  if (job.id) {
    try {
      crawlErrors = (await firecrawlWithRetry(
        () => client.getBatchScrapeErrors(job.id!) as Promise<FirecrawlCrawlErrors>,
        {
          isJobStart: false
        }
      )) as FirecrawlCrawlErrors;
    } catch {
      crawlErrors = {
        errors: [],
        robotsBlocked: []
      };
    }
  }

  return {
    job,
    crawlErrors
  };
}

async function crawlSeedUrlWithFallback(
  client: Firecrawl,
  seedUrl: string,
  crawlLevels: number,
  crawlLimit: number
) {
  const genericCrawl = async () => {
    const job = (await firecrawlWithRetry(
      () =>
        client.crawl(seedUrl, {
          limit: crawlLimit,
          maxDiscoveryDepth: Math.max(0, crawlLevels - 1),
          sitemap: "skip",
          crawlEntireDomain: true,
          allowExternalLinks: false,
          allowSubdomains: false,
          ignoreQueryParameters: true,
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: true
          },
          pollInterval: env.integrations.firecrawl.pollIntervalSeconds,
          timeout: env.integrations.firecrawl.timeoutSeconds
        }) as Promise<FirecrawlCrawlJob>,
      {
        isJobStart: true
      }
    )) as FirecrawlCrawlJob;

    let crawlErrors: FirecrawlCrawlErrors = {
      errors: [],
      robotsBlocked: []
    };

    if (job.id) {
      try {
        crawlErrors = (await firecrawlWithRetry(
          () => client.getCrawlErrors(job.id!) as Promise<FirecrawlCrawlErrors>,
          {
            isJobStart: false
          }
        )) as FirecrawlCrawlErrors;
      } catch {
        crawlErrors = {
          errors: [],
          robotsBlocked: []
        };
      }
    }

    return {
      job,
      crawlErrors
    };
  };

  if (crawlLevels !== 2 || crawlLimit <= 1) {
    return genericCrawl();
  }

  const primaryDocument = await scrapePrimaryDocument(client, seedUrl);

  if (!primaryDocument) {
    return genericCrawl();
  }

  const childUrls = selectPrioritizedChildLinks(
    seedUrl,
    primaryDocument,
    Math.max(0, crawlLimit - 1)
  );

  if (childUrls.length === 0) {
    return genericCrawl();
  }

  try {
    const batchResult = await batchScrapeDocuments(client, childUrls);
    const childDocuments = Array.isArray(batchResult.job.data)
      ? batchResult.job.data
      : [];

    return {
      job: {
        id: batchResult.job.id,
        status:
          batchResult.job.status ??
          (childDocuments.length > 0 ? "completed" : "failed"),
        creditsUsed:
          1 +
          (typeof batchResult.job.creditsUsed === "number"
            ? batchResult.job.creditsUsed
            : childDocuments.length),
        completed: childDocuments.length + 1,
        data: [primaryDocument, ...childDocuments]
      } satisfies FirecrawlCrawlJob,
      crawlErrors: batchResult.crawlErrors
    };
  } catch {
    return genericCrawl();
  }
}

export async function crawlUrlsForPlainTextEmbeddings(
  urls: string | string[],
  options?: UrlPlainTextCrawlOptions
): Promise<UrlPlainTextCrawlResult> {
  const client = getFirecrawlClient();
  const normalizedUrls = normalizeUrlList(urls);
  const crawlLevels = Math.max(
    1,
    Math.min(
      3,
      Number.isInteger(options?.crawlLevels)
        ? Number(options?.crawlLevels)
        : env.integrations.firecrawl.crawlLevels
    )
  );
  const maxLinks = Math.min(
    MAX_URL_CRAWL_LINKS_PER_REQUEST,
    Number.isInteger(options?.maxLinks)
      ? Math.max(1, Number(options?.maxLinks))
      : env.integrations.firecrawl.maxLinks
  );

  if (normalizedUrls.length > MAX_URL_SEEDS_PER_REQUEST) {
    throw createStatusError(
      `urls may contain at most ${MAX_URL_SEEDS_PER_REQUEST} seed URLs per request.`,
      400
    );
  }

  const crawlErrors: UrlEmbeddingIssue[] = [];
  const skippedUrlMap = new Map<string, string>();
  const records: Array<Record<string, unknown>> = [];
  const firecrawlJobIds: string[] = [];
  let firecrawlCreditsUsed = 0;
  let processedUrlCount = 0;
  let remainingLinks = maxLinks;

  for (
    let index = 0;
    index < normalizedUrls.length && remainingLinks > 0;
    index += 1
  ) {
    const seedUrl = normalizedUrls[index]!;
    const remainingSeedUrls = normalizedUrls.length - index;
    const crawlLimit =
      crawlLevels === 1
        ? 1
        : Math.max(1, Math.ceil(remainingLinks / remainingSeedUrls));

    let job: FirecrawlCrawlJob;
    let jobErrors: FirecrawlCrawlErrors = {
      errors: [],
      robotsBlocked: []
    };

    try {
      const crawlResult = await crawlSeedUrlWithFallback(
        client,
        seedUrl,
        crawlLevels,
        crawlLimit
      );
      job = crawlResult.job;
      jobErrors = crawlResult.crawlErrors;
    } catch (error) {
      const issue = {
        url: seedUrl,
        message:
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Firecrawl failed to crawl URL.",
        code:
          typeof (error as { code?: unknown })?.code === "string"
            ? ((error as { code: string }).code)
            : "FIRECRAWL_ERROR"
      };
      crawlErrors.push(issue);
      skippedUrlMap.set(issue.url, issue.message);
      continue;
    }

    if (job.id) {
      firecrawlJobIds.push(job.id);
    }

    const creditsUsed =
      typeof job.creditsUsed === "number"
        ? job.creditsUsed
        : Array.isArray(job.data)
          ? job.data.length
          : job.completed ?? 0;

    firecrawlCreditsUsed += creditsUsed;
    remainingLinks = Math.max(0, remainingLinks - Math.max(0, creditsUsed));

    (jobErrors.errors ?? [])
      .map((entry) =>
        normalizeCrawlError(entry, "Firecrawl failed to crawl URL.")
      )
      .filter((entry): entry is UrlEmbeddingIssue => Boolean(entry))
      .forEach((entry) => {
        crawlErrors.push(entry);
        skippedUrlMap.set(entry.url, entry.message);
      });

    (jobErrors.robotsBlocked ?? [])
      .map((entry) =>
        normalizeCrawlError(
          entry,
          "Firecrawl blocked the URL via robots.txt."
        )
      )
      .filter((entry): entry is UrlEmbeddingIssue => Boolean(entry))
      .forEach((entry) => {
        crawlErrors.push(entry);
        skippedUrlMap.set(entry.url, entry.message);
      });

    if (job.status === "failed" || job.status === "cancelled") {
      const issue = {
        url: seedUrl,
        message: `Firecrawl crawl ${job.status} for seed URL.`,
        code: `FIRECRAWL_${job.status.toUpperCase()}`
      };
      crawlErrors.push(issue);
      skippedUrlMap.set(issue.url, issue.message);
    }

    const crawledDocuments = Array.isArray(job.data) ? job.data : [];
    let recordBuildResult = buildUrlPlainTextRecord(seedUrl, crawledDocuments);

    if (!recordBuildResult.hasPrimarySection) {
      const primaryDocument = await scrapePrimaryDocument(client, seedUrl);

      if (primaryDocument) {
        firecrawlCreditsUsed += 1;
        recordBuildResult = buildUrlPlainTextRecord(
          seedUrl,
          crawledDocuments,
          primaryDocument
        );
      }
    }

    recordBuildResult.skippedUrlMap.forEach((message, url) => {
      skippedUrlMap.set(url, message);
    });

    if (recordBuildResult.record) {
      records.push(recordBuildResult.record);
      processedUrlCount += recordBuildResult.processedPageCount;
      if (recordBuildResult.hasPrimarySection) {
        skippedUrlMap.delete(seedUrl);
      } else if (!skippedUrlMap.has(seedUrl)) {
        skippedUrlMap.set(
          seedUrl,
          "Firecrawl did not return extractable text for the source URL."
        );
      }
      continue;
    }

    if (!skippedUrlMap.has(seedUrl)) {
      skippedUrlMap.set(
        seedUrl,
        "Firecrawl returned no extractable text for the source URL."
      );
    }
  }

  const firecrawlJobId =
    firecrawlJobIds.length === 1 ? firecrawlJobIds[0] ?? null : null;
  const skippedUrls = Array.from(skippedUrlMap.entries()).map(([url, message]) => ({
    url,
    message
  }));

  if (records.length === 0) {
    throw createStatusError(
      crawlErrors[0]?.message ||
        "Firecrawl returned no extractable text for the provided URLs.",
      422,
      "NO_URL_CONTENT",
      {
        firecrawl_job_id: firecrawlJobId,
        firecrawl_job_ids: firecrawlJobIds,
        crawl_errors: crawlErrors,
        skipped_urls: skippedUrls
      }
    );
  }

  return {
    records,
    inputUrlCount: normalizedUrls.length,
    processedUrlCount,
    crawlLevels,
    maxLinks,
    firecrawlCreditsUsed,
    firecrawlJobId,
    firecrawlJobIds,
    skippedUrls,
    crawlErrors
  };
}
