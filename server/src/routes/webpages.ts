import { Router } from "express";

import { samsarAdapter } from "../adapters/samsar.js";

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

  if (!url) {
    response.status(400).json({
      ok: false,
      error: "url is required"
    });
    return;
  }

  const analyzedAt = new Date().toISOString();

  if (!samsarAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "SAMSAR_API_KEY is not configured."
    });
    return;
  }

  try {
    const result = await samsarAdapter.createEmbeddingFromUrl({
      name: createEmbeddingName(title || undefined, url),
      urls: [url]
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
          statusCode: result.status,
          creditsCharged: result.creditsCharged,
          creditsRemaining: result.creditsRemaining
        }
      }
    });
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to analyze webpage with Samsar."
    });
  }
});
