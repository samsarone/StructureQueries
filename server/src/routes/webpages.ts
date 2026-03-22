import { Router } from "express";

import { samsarAdapter } from "../adapters/samsar.js";
import {
  crawlUrlsForPlainTextEmbeddings,
  getUrlEmbeddingFieldOptions,
  isFirecrawlConfigured
} from "../lib/url-embedding-crawl.js";
import {
  chargeExternalFirecrawlUsage,
  isExternalUtilityBillingEnabled
} from "../lib/external-usage-billing.js";
import {
  getSamsarErrorContext,
  getSamsarErrorMessage,
  getSamsarErrorStatus
} from "../lib/samsar-errors.js";

const EXTENSION_STARTER_SCAN_MAX_LINKS = 2;

function createEmbeddingName(title: string | undefined, url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const pathname = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
    const pageLabel = title?.trim() || `${hostname}${pathname}`;

    return pageLabel.slice(0, 120);
  } catch {
    return (title?.trim() || url).slice(0, 120);
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^172\.(\d{1,3})\./);

  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function getAnalyzeUrlError(rawUrl: string) {
  try {
    const parsedUrl = new URL(rawUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return "Only http and https URLs can be analyzed.";
    }

    if (isPrivateHostname(parsedUrl.hostname)) {
      return "Only public URLs can be analyzed. Localhost and private network pages are not supported.";
    }

    return undefined;
  } catch {
    return "url must be a valid URL";
  }
}

export const webpagesRouter = Router();

webpagesRouter.get("/status", async (request, response) => {
  const rawUrl =
    typeof request.query.url === "string" ? request.query.url.trim() : "";
  const templateId =
    typeof request.query.templateId === "string"
      ? request.query.templateId.trim()
      : "";

  if (!rawUrl && !templateId) {
    response.status(400).json({
      ok: false,
      error: "url or templateId is required"
    });
    return;
  }

  if (!templateId) {
    response.json({
      ok: true,
      url: rawUrl || null,
      indexed: false,
      status: "not_indexed",
      checkedAt: new Date().toISOString(),
      reason: "stateless_proxy_requires_template_id",
      analysisAvailable: false,
      lastAnalyzedAt: null,
      templateId: null
    });
    return;
  }

  if (!samsarAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "SAMSAR_API_KEY is not configured."
    });
    return;
  }

  try {
    const embeddingStatus = await samsarAdapter.getEmbeddingStatus(templateId);

    response.json({
      ok: true,
      url: rawUrl || null,
      indexed: Boolean(embeddingStatus.data.has_embeddings),
      status:
        readOptionalString(embeddingStatus.data.status) ??
        (embeddingStatus.data.has_embeddings ? "completed" : "not_indexed"),
      checkedAt: new Date().toISOString(),
      reason: "embedding_status_from_samsar",
      analysisAvailable: Boolean(embeddingStatus.data.has_embeddings),
      lastAnalyzedAt: null,
      templateId: embeddingStatus.data.template_id ?? templateId,
      recordCount:
        typeof embeddingStatus.data.record_count === "number"
          ? embeddingStatus.data.record_count
          : null
    });
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch embedding status from Samsar."
    });
  }
});

webpagesRouter.post("/analyze", async (request, response) => {
  const url =
    typeof request.body?.url === "string" ? request.body.url.trim() : "";
  const title =
    typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const browserSessionId =
    typeof request.body?.browserSessionId === "string"
      ? request.body.browserSessionId.trim()
      : "";
  const externalUserApiKey =
    typeof request.body?.externalUserApiKey === "string"
      ? request.body.externalUserApiKey.trim()
      : typeof request.body?.external_user_api_key === "string"
        ? request.body.external_user_api_key.trim()
        : "";

  if (!url) {
    response.status(400).json({
      ok: false,
      error: "url is required"
    });
    return;
  }

  const urlError = getAnalyzeUrlError(url);

  if (urlError) {
    response.status(400).json({
      ok: false,
      error: urlError
    });
    return;
  }

  const analyzedAt = new Date().toISOString();

  if (!isFirecrawlConfigured()) {
    response.status(503).json({
      ok: false,
      error: "FIRECRAWL_API_KEY is not configured."
    });
    return;
  }

  if (!samsarAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "SAMSAR_API_KEY is not configured."
    });
    return;
  }

  if (isExternalUtilityBillingEnabled() && !externalUserApiKey) {
    response.status(401).json({
      ok: false,
      error:
        "No Samsar external-user API key was provided for production utility billing."
    });
    return;
  }

  try {
    const crawlResult = await crawlUrlsForPlainTextEmbeddings([url], {
      maxLinks: EXTENSION_STARTER_SCAN_MAX_LINKS
    });
    const crawlSummary = {
      url,
      inputUrlCount: crawlResult.inputUrlCount,
      processedUrlCount: crawlResult.processedUrlCount,
      crawlLevels: crawlResult.crawlLevels,
      maxLinks: crawlResult.maxLinks,
      firecrawlCreditsUsed: crawlResult.firecrawlCreditsUsed,
      firecrawlJobId: crawlResult.firecrawlJobId,
      firecrawlJobIds: crawlResult.firecrawlJobIds,
      skippedUrls: crawlResult.skippedUrls,
      crawlErrors: crawlResult.crawlErrors
    };

    console.log(
      "[api][webpages][analyze] prepared crawl summary",
      JSON.stringify(crawlSummary)
    );

    await chargeExternalFirecrawlUsage({
      browserSessionId: browserSessionId || undefined,
      externalUserApiKey: externalUserApiKey || undefined,
      firecrawlCreditsUsed: crawlResult.firecrawlCreditsUsed,
      firecrawlJobId: crawlResult.firecrawlJobId,
      firecrawlJobIds: crawlResult.firecrawlJobIds,
      inputUrlCount: crawlResult.inputUrlCount,
      pageTitle: title || undefined,
      pageUrl: url,
      processedUrlCount: crawlResult.processedUrlCount
    });

    console.log(
      "[api][webpages][analyze] prepared plain-text payload",
      JSON.stringify({
        ...crawlSummary,
        records: crawlResult.records
      })
    );

    const result = await samsarAdapter.generateEmbeddingsFromPlainText({
      name: createEmbeddingName(title || undefined, url),
      plain_text: crawlResult.records,
      field_options: getUrlEmbeddingFieldOptions()
    });

    response.json({
      ok: true,
      indexed: true,
      provider: "samsar",
      analysis: {
        url,
        title: title || undefined,
        templateId: result.data.template_id,
        templateHash: result.data.template_hash,
        recordCount: result.data.record_count,
        source: "samsar",
        status: result.data.status ?? "completed",
        analyzedAt,
        raw: {
          ...result.data,
          status: result.data.status ?? "completed",
          input_url_count: crawlResult.inputUrlCount,
          processed_url_count: crawlResult.processedUrlCount,
          firecrawl_credits_used: crawlResult.firecrawlCreditsUsed,
          crawl_levels: crawlResult.crawlLevels,
          max_links: crawlResult.maxLinks,
          firecrawl_job_id: crawlResult.firecrawlJobId,
          ...(crawlResult.firecrawlJobIds.length > 1
            ? {
                firecrawl_job_ids: crawlResult.firecrawlJobIds
              }
            : {}),
          ...(crawlResult.skippedUrls.length > 0
            ? {
                skipped_urls: crawlResult.skippedUrls
              }
            : {}),
          ...(crawlResult.crawlErrors.length > 0
            ? {
                crawl_errors: crawlResult.crawlErrors
              }
            : {}),
          statusCode: result.status,
          creditsCharged: result.creditsCharged,
          creditsRemaining: result.creditsRemaining
        }
      }
    });
  } catch (error) {
    console.error("Failed to analyze webpage with Samsar", {
      url,
      firecrawl:
        error && typeof error === "object"
          ? {
              statusCode:
                typeof (error as { statusCode?: unknown }).statusCode === "number"
                  ? (error as { statusCode: number }).statusCode
                  : undefined,
              code:
                typeof (error as { code?: unknown }).code === "string"
                  ? (error as { code: string }).code
                  : undefined,
              details:
                (error as { details?: unknown }).details ?? undefined
            }
          : undefined,
      samsar: getSamsarErrorContext(error)
    });

    const statusCode =
      error &&
      typeof error === "object" &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : getSamsarErrorStatus(error);

    response.status(statusCode).json({
      ok: false,
      error: getSamsarErrorMessage(
        error,
        "Failed to analyze this document with Samsar."
      )
    });
  }
});
