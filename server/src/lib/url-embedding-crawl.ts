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
    const document = (await client.scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true
    })) as FirecrawlDocument;

    return document;
  } catch {
    return null;
  }
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

    try {
      job = (await client.crawl(seedUrl, {
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
      })) as FirecrawlCrawlJob;
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

    if (job.id) {
      try {
        const jobErrors = (await client.getCrawlErrors(job.id)) as FirecrawlCrawlErrors;

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
      } catch {
        // Ignore crawl-error lookups when Firecrawl does not provide them.
      }
    }

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
