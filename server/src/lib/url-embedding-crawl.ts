import { Firecrawl } from "@mendable/firecrawl-js";

import { env } from "../config/env.js";
import {
  cleanEmbeddingSourceText,
  stripHtmlToText
} from "./embedding-text-cleanup.js";

const MAX_EMBEDDING_INPUT_CHARS = 6_000;
const MAX_URL_LINKS_PER_REQUEST = 50;

type FirecrawlDocument = {
  markdown?: unknown;
  summary?: unknown;
  html?: unknown;
  rawHtml?: unknown;
  metadata?: Record<string, unknown>;
};

type FirecrawlCrawlError = {
  url?: string;
  code?: string;
  error?: string;
};

type UrlEmbeddingError = Error & {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
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

let firecrawlClient: Firecrawl | undefined;

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
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
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

function getDocumentSourceUrl(
  document: FirecrawlDocument,
  fallbackUrl: string | null = null
) {
  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? document.metadata
      : {};

  return (
    normalizeUrlValue(metadata.sourceURL) ??
    normalizeUrlValue(metadata.url) ??
    normalizeUrlValue(fallbackUrl) ??
    null
  );
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

function buildUrlPlainTextRecord(
  document: FirecrawlDocument,
  fallbackUrl: string | null = null
) {
  const sourceUrl = getDocumentSourceUrl(document, fallbackUrl);

  if (!sourceUrl) {
    return null;
  }

  const content = truncateText(
    cleanEmbeddingSourceText(extractDocumentText(document))
  );

  if (!content) {
    return null;
  }

  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? document.metadata
      : {};
  const parsedUrl = new URL(sourceUrl);
  const publishedTime =
    typeof metadata.publishedTime === "string"
      ? metadata.publishedTime.trim()
      : "";
  const modifiedTime =
    typeof metadata.modifiedTime === "string"
      ? metadata.modifiedTime.trim()
      : "";
  const statusCode = Number(metadata.statusCode);

  return {
    id: sourceUrl,
    source_type: "url",
    crawl_provider: "firecrawl",
    url: sourceUrl,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname || "/",
    ...(typeof metadata.title === "string" && metadata.title.trim()
      ? { title: metadata.title.trim() }
      : {}),
    ...(typeof metadata.description === "string" && metadata.description.trim()
      ? { description: metadata.description.trim() }
      : {}),
    ...(typeof metadata.language === "string" && metadata.language.trim()
      ? { language: metadata.language.trim() }
      : {}),
    status_code: Number.isFinite(statusCode) ? statusCode : null,
    content_length: content.length,
    published_time: publishedTime || null,
    modified_time: modifiedTime || null,
    content
  };
}

function normalizeCrawlError(
  entry: FirecrawlCrawlError | string,
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

  const resolvedUrl = normalizeUrlValue(entry?.url);

  if (!resolvedUrl) {
    return null;
  }

  return {
    url: resolvedUrl,
    message: entry?.error || fallbackMessage,
    code: entry?.code || null
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
    throw createStatusError(
      "FIRECRAWL_API_KEY is not configured.",
      503
    );
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

export async function crawlUrlsForPlainTextEmbeddings(
  urls: string | string[]
): Promise<UrlPlainTextCrawlResult> {
  const client = getFirecrawlClient();
  const normalizedUrls = normalizeUrlList(urls);
  const crawlLevels = env.integrations.firecrawl.crawlLevels;
  const maxLinks = Math.min(
    MAX_URL_LINKS_PER_REQUEST,
    env.integrations.firecrawl.maxLinks
  );

  if (normalizedUrls.length > MAX_URL_LINKS_PER_REQUEST) {
    throw createStatusError(
      `urls may contain at most ${MAX_URL_LINKS_PER_REQUEST} seed URLs per request.`,
      400
    );
  }

  const crawlErrors: UrlEmbeddingIssue[] = [];
  const skippedUrlMap = new Map<string, string>();
  const records: Array<Record<string, unknown>> = [];
  const firecrawlJobIds: string[] = [];
  let firecrawlCreditsUsed = 0;
  let remainingLinks = maxLinks;

  for (
    let index = 0;
    index < normalizedUrls.length && remainingLinks > 0;
    index += 1
  ) {
    const url = normalizedUrls[index]!;
    const remainingSeedUrls = normalizedUrls.length - index;
    const crawlLimit =
      crawlLevels === 1
        ? 1
        : Math.max(1, Math.ceil(remainingLinks / remainingSeedUrls));

    let job;

    try {
      job = await client.crawl(url, {
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
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Firecrawl failed to crawl URL.";

      const issue = {
        url,
        message,
        code:
          typeof (error as { code?: unknown })?.code === "string"
            ? (error as { code: string }).code
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

    if (job.id) {
      try {
        const jobErrors = await client.getCrawlErrors(job.id);

        jobErrors.errors
          .map((entry) =>
            normalizeCrawlError(
              entry,
              "Firecrawl failed to crawl URL."
            )
          )
          .filter((entry): entry is UrlEmbeddingIssue => Boolean(entry))
          .forEach((entry) => {
            crawlErrors.push(entry);
            skippedUrlMap.set(entry.url, entry.message);
          });

        jobErrors.robotsBlocked
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
      } catch {
        // Ignore crawl-error lookups when Firecrawl does not provide them.
      }
    }

    if (job.status === "failed" || job.status === "cancelled") {
      const issue = {
        url,
        message: `Firecrawl crawl ${job.status} for seed URL.`,
        code: `FIRECRAWL_${job.status.toUpperCase()}`
      };
      crawlErrors.push(issue);
      skippedUrlMap.set(issue.url, issue.message);
    }

    const crawledDocuments = Array.isArray(job.data) ? job.data : [];

    crawledDocuments.forEach((document, documentIndex) => {
      const fallbackUrl =
        crawlLevels === 1 ? normalizedUrls[documentIndex] ?? null : null;
      const record = buildUrlPlainTextRecord(
        document as FirecrawlDocument,
        fallbackUrl
      );

      if (!record) {
        const skippedUrl =
          getDocumentSourceUrl(
            document as FirecrawlDocument,
            fallbackUrl
          ) ?? fallbackUrl;
        const metadata =
          document &&
          typeof document === "object" &&
          (document as FirecrawlDocument).metadata &&
          typeof (document as FirecrawlDocument).metadata === "object"
            ? ((document as FirecrawlDocument).metadata as Record<string, unknown>)
            : {};
        const skippedReason =
          normalizeOptionalString(metadata.error) ??
          "Firecrawl returned no extractable text for the URL.";

        if (skippedUrl) {
          skippedUrlMap.set(skippedUrl, skippedReason);
        }

        return;
      }

      skippedUrlMap.delete(record.url as string);
      records.push(record);
    });
  }

  const firecrawlJobId =
    firecrawlJobIds.length === 1 ? firecrawlJobIds[0] ?? null : null;
  const skippedUrls = Array.from(skippedUrlMap.entries()).map(
    ([url, message]) => ({
      url,
      message
    })
  );

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
    processedUrlCount: records.length,
    crawlLevels,
    maxLinks,
    firecrawlCreditsUsed,
    firecrawlJobId,
    firecrawlJobIds,
    skippedUrls,
    crawlErrors
  };
}
