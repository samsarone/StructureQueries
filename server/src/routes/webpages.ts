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
import { buildStructureQueriesExternalUser } from "../lib/external-user.js";
import { generateSamsarUserEmbeddingsFromPlainText } from "../lib/samsar-user-auth.js";
import {
  createPreparePageRequestId,
  getPreparePageRequest,
  upsertPreparePageRequest
} from "../lib/prepare-page-requests.js";
import {
  getSamsarErrorContext,
  getSamsarErrorMessage,
  getSamsarErrorStatus,
  isSamsarCreditsIssue
} from "../lib/samsar-errors.js";

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

function normalizePreparePageCreditCap(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function normalizePreparePageStatus(
  value: unknown,
  fallback = "pending"
) {
  const status = readOptionalString(value);
  return status ? status.toLowerCase() : fallback;
}

function summarizeEmbeddingRecords(records: Array<Record<string, unknown>>) {
  return records.map((record) => ({
    id: readOptionalString(record.id) ?? null,
    seedUrl: readOptionalString(record.seed_url) ?? null,
    url: readOptionalString(record.url) ?? null,
    isSeed: record.is_seed === true,
    contentLength:
      typeof record.content_length === "number" ? record.content_length : null,
    title: readOptionalString(record.title) ?? null
  }));
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

async function refreshTrackedPreparePageRequest(requestId: string) {
  const trackedRequest = getPreparePageRequest(requestId);

  if (
    !trackedRequest ||
    trackedRequest.status === "completed" ||
    trackedRequest.status === "failed" ||
    !trackedRequest.templateId ||
    !samsarAdapter.isConfigured()
  ) {
    return trackedRequest;
  }

  try {
    const embeddingStatus = await samsarAdapter.getEmbeddingStatus(
      trackedRequest.templateId
    );
    const analysisAvailable = Boolean(embeddingStatus.data.has_embeddings);

    return upsertPreparePageRequest({
      requestId,
      status: analysisAvailable
        ? "completed"
        : normalizePreparePageStatus(
            embeddingStatus.data.status,
            trackedRequest.status
          ),
      analysisAvailable,
      templateId: embeddingStatus.data.template_id ?? trackedRequest.templateId,
      recordCount:
        typeof embeddingStatus.data.record_count === "number"
          ? embeddingStatus.data.record_count
          : trackedRequest.recordCount,
      completedAt: analysisAvailable
        ? new Date().toISOString()
        : trackedRequest.completedAt ?? null
    });
  } catch (error) {
    console.warn("Failed to refresh tracked prepare-page request status", {
      requestId,
      templateId: trackedRequest.templateId,
      error: error instanceof Error ? error.message : error
    });
    return trackedRequest;
  }
}

export const webpagesRouter = Router();

webpagesRouter.get("/status", async (request, response) => {
  const rawUrl =
    typeof request.query.url === "string" ? request.query.url.trim() : "";
  const requestId =
    typeof request.query.requestId === "string"
      ? request.query.requestId.trim()
      : typeof request.query.request_id === "string"
        ? request.query.request_id.trim()
        : "";
  const templateId =
    typeof request.query.templateId === "string"
      ? request.query.templateId.trim()
      : "";

  if (!rawUrl && !templateId && !requestId) {
    response.status(400).json({
      ok: false,
      error: "url, templateId, or requestId is required"
    });
    return;
  }

  if (requestId) {
    const trackedRequest = await refreshTrackedPreparePageRequest(requestId);

    if (trackedRequest) {
      const status =
        trackedRequest.status === "completed" && trackedRequest.analysisAvailable
          ? "completed"
          : trackedRequest.status;

      response.json({
        ok: true,
        url: trackedRequest.url || rawUrl || null,
        indexed: Boolean(
          trackedRequest.templateId && trackedRequest.analysisAvailable
        ),
        status,
        checkedAt: new Date().toISOString(),
        reason:
          status === "failed"
            ? "prepare_request_failed"
            : status === "completed"
              ? "prepare_request_completed"
              : "prepare_request_pending",
        analysisAvailable: trackedRequest.analysisAvailable,
        lastAnalyzedAt: trackedRequest.completedAt ?? null,
        templateId: trackedRequest.templateId ?? templateId ?? null,
        requestId: trackedRequest.requestId,
        error: trackedRequest.error ?? null,
        code: trackedRequest.code ?? null,
        creditsRemaining:
          typeof trackedRequest.creditsRemaining === "number"
            ? trackedRequest.creditsRemaining
            : null,
        recordCount:
          typeof trackedRequest.recordCount === "number"
            ? trackedRequest.recordCount
            : null
      });
      return;
    }

    if (!templateId) {
      response.status(404).json({
        ok: false,
        error: "Prepare request not found.",
        requestId
      });
      return;
    }
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
  const authToken =
    typeof request.body?.authToken === "string"
      ? request.body.authToken.trim()
      : typeof request.body?.samsarAuthToken === "string"
        ? request.body.samsarAuthToken.trim()
        : typeof request.body?.samsar_auth_token === "string"
          ? request.body.samsar_auth_token.trim()
          : "";
  const preferredLanguage =
    typeof request.body?.preferredLanguage === "string"
      ? request.body.preferredLanguage.trim()
      : "";
  const preferredVoiceId =
    typeof request.body?.preferredVoiceId === "string"
      ? request.body.preferredVoiceId.trim()
      : "";
  const maxPrepareCredits = normalizePreparePageCreditCap(
    request.body?.maxPrepareCredits ?? request.body?.max_prepare_credits
  );
  const prepareRequestId =
    readOptionalString(request.body?.prepareRequestId) ??
    readOptionalString(request.body?.requestId) ??
    createPreparePageRequestId();

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

  if (isExternalUtilityBillingEnabled() && !externalUserApiKey && !authToken) {
    response.status(401).json({
      ok: false,
      error:
        "No Samsar auth token or external-user API key was provided for production utility billing."
    });
    return;
  }

  try {
    upsertPreparePageRequest({
      requestId: prepareRequestId,
      browserSessionId: browserSessionId || undefined,
      url,
      title: title || null,
      status: "crawling",
      analysisAvailable: false,
      error: null,
      code: null,
      completedAt: null
    });

    const crawlResult = await crawlUrlsForPlainTextEmbeddings([url], {
      maxPrepareCredits: maxPrepareCredits ?? undefined
    });
    const crawlSummary = {
      url,
      inputUrlCount: crawlResult.inputUrlCount,
      processedUrlCount: crawlResult.processedUrlCount,
      crawlLevels: crawlResult.crawlLevels,
      maxLinks: crawlResult.maxLinks,
      maxPrepareCredits: crawlResult.maxPrepareCredits,
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
      authToken: authToken || undefined,
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
        recordCount: crawlResult.records.length,
        records: summarizeEmbeddingRecords(crawlResult.records)
      })
    );

    upsertPreparePageRequest({
      requestId: prepareRequestId,
      status: "embedding",
      analysisAvailable: false,
      error: null,
      code: null,
      completedAt: null
    });

    const result =
      authToken || externalUserApiKey
        ? await generateSamsarUserEmbeddingsFromPlainText(
            {
              name: createEmbeddingName(title || undefined, url),
              plain_text: crawlResult.records,
              field_options: getUrlEmbeddingFieldOptions()
            },
            {
              authToken: authToken || undefined,
              externalUserApiKey: externalUserApiKey || undefined,
              externalUser: browserSessionId
                ? buildStructureQueriesExternalUser({
                    browserSessionId,
                    preferredLanguage: preferredLanguage || undefined,
                    preferredVoiceId: preferredVoiceId || undefined
                  })
                : undefined
            }
          )
        : await samsarAdapter.generateEmbeddingsFromPlainText({
            name: createEmbeddingName(title || undefined, url),
            plain_text: crawlResult.records,
            field_options: getUrlEmbeddingFieldOptions()
          });

    const rawAnalysis = result.data as Record<string, unknown>;
    const upstreamStatusCode =
      "status" in result && typeof result.status === "number"
        ? result.status
        : undefined;
    const templateId = readOptionalString(result.data.template_id);
    const upstreamRequestId = readOptionalString(
      rawAnalysis.request_id
    );
    let prepareStatus = normalizePreparePageStatus(result.data.status, "completed");
    let analysisAvailable = prepareStatus === "completed";
    let recordCount =
      typeof result.data.record_count === "number"
        ? result.data.record_count
        : null;

    if (templateId) {
      try {
        const embeddingStatus = await samsarAdapter.getEmbeddingStatus(templateId);
        analysisAvailable = Boolean(embeddingStatus.data.has_embeddings);
        prepareStatus = analysisAvailable
          ? "completed"
          : normalizePreparePageStatus(
              embeddingStatus.data.status,
              prepareStatus
            );
        recordCount =
          typeof embeddingStatus.data.record_count === "number"
            ? embeddingStatus.data.record_count
            : recordCount;
      } catch (error) {
        console.warn("Failed to fetch embedding status after prepare-page run", {
          prepareRequestId,
          templateId,
          error: error instanceof Error ? error.message : error
        });
      }
    }

    upsertPreparePageRequest({
      requestId: prepareRequestId,
      status: prepareStatus,
      analysisAvailable,
      templateId,
      upstreamRequestId,
      recordCount,
      creditsRemaining:
        typeof result.creditsRemaining === "number"
          ? result.creditsRemaining
          : null,
      error: null,
      code: null,
      completedAt: analysisAvailable ? new Date().toISOString() : null
    });

    response.json({
      ok: true,
      prepareRequestId,
      prepareStatus,
      indexed: analysisAvailable,
      analysisAvailable,
      provider: "samsar",
      analysis: {
        url,
        title: title || undefined,
        templateId,
        templateHash: result.data.template_hash,
        recordCount: recordCount ?? result.data.record_count,
        source: "samsar",
        status: prepareStatus,
        analyzedAt,
        raw: {
          ...result.data,
          request_id: upstreamRequestId ?? rawAnalysis.request_id,
          status: prepareStatus,
          input_url_count: crawlResult.inputUrlCount,
          processed_url_count: crawlResult.processedUrlCount,
          firecrawl_credits_used: crawlResult.firecrawlCreditsUsed,
          crawl_levels: crawlResult.crawlLevels,
          max_links: crawlResult.maxLinks,
          max_prepare_credits: crawlResult.maxPrepareCredits,
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
          statusCode: upstreamStatusCode,
          creditsCharged: result.creditsCharged,
          creditsRemaining: result.creditsRemaining
        }
      }
    });
  } catch (error) {
    const samsarErrorContext = getSamsarErrorContext(error);
    const insufficientCredits = isSamsarCreditsIssue(error);
    const errorMessage = getSamsarErrorMessage(
      error,
      "Failed to analyze this document with Samsar."
    );

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
      samsar: samsarErrorContext
    });

    const statusCode =
      error &&
      typeof error === "object" &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : getSamsarErrorStatus(error);

    upsertPreparePageRequest({
      requestId: prepareRequestId,
      browserSessionId: browserSessionId || undefined,
      url,
      title: title || null,
      status: "failed",
      analysisAvailable: false,
      error: errorMessage,
      code: insufficientCredits ? "insufficient_credits" : null,
      creditsRemaining:
        typeof samsarErrorContext?.creditsRemaining === "number"
          ? samsarErrorContext.creditsRemaining
          : null,
      completedAt: new Date().toISOString()
    });

    response.status(statusCode).json({
      ok: false,
      prepareRequestId,
      error: errorMessage,
      ...(insufficientCredits
        ? {
            code: "insufficient_credits",
            creditsRemaining:
              typeof samsarErrorContext?.creditsRemaining === "number"
                ? samsarErrorContext.creditsRemaining
                : 0
          }
        : {})
    });
  }
});
