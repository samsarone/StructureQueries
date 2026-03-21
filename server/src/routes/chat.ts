import { Router, type Request, type Response } from "express";

import {
  createChatCompletionPayload,
  streamChatCompletion,
  type ChatCompletionRequestLike
} from "../lib/chat-completions.js";
import {
  GroundedAssistantError,
  generateGroundedAssistantReply
} from "../lib/chat-agent.js";

interface ProxyChatCompletionRequestBody extends ChatCompletionRequestLike {
  assistantSessionId?: string;
  browserSessionId?: string;
  conversationId?: string;
  externalUserApiKey?: string;
  language?: string | null;
  pageTitle?: string;
  pageUrl?: string;
  previousResponseId?: string;
  samsarSessionId?: string;
  templateId?: string;
  transcript?: string;
  user?: string;
}

function readStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readObjectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringAlias(
  record: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = readStringValue(record[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readObjectAlias(
  record: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = readObjectValue(record[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readBooleanAlias(
  record: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["true", "1", "yes", "y"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "n"].includes(normalized)) {
        return false;
      }
    }
  }

  return undefined;
}

function buildMetadata(body: Record<string, unknown>) {
  const metadata = {
    ...(readObjectValue(body.metadata) ?? {})
  };

  const structuredFilters = readObjectAlias(body, [
    "structuredFilters",
    "structured_filters",
    "filters"
  ]);
  const searchParams = readObjectAlias(body, [
    "searchParams",
    "search_params",
    "searchFilters",
    "search_filters",
    "filterPayload",
    "filter_payload",
    "preFilter",
    "pre_filter",
    "prefilter"
  ]);
  const searchRecord = readObjectAlias(body, [
    "searchRecord",
    "search_record",
    "searchJson",
    "search_json",
    "structuredQuery",
    "structured_query"
  ]);
  const searchDate = readStringAlias(body, [
    "searchDate",
    "search_date"
  ]);
  const rerank = readBooleanAlias(body, [
    "rerank",
    "rerankResults",
    "rerank_results"
  ]);

  if (
    structuredFilters &&
    !readObjectAlias(metadata, [
      "structuredFilters",
      "structured_filters",
      "filters"
    ])
  ) {
    metadata.structuredFilters = structuredFilters;
  }

  if (
    searchParams &&
    !readObjectAlias(metadata, [
      "searchParams",
      "search_params",
      "searchFilters",
      "search_filters",
      "filterPayload",
      "filter_payload",
      "preFilter",
      "pre_filter",
      "prefilter"
    ])
  ) {
    metadata.searchParams = searchParams;
  }

  if (
    searchRecord &&
    !readObjectAlias(metadata, [
      "searchRecord",
      "search_record",
      "searchJson",
      "search_json",
      "structuredQuery",
      "structured_query"
    ])
  ) {
    metadata.searchRecord = searchRecord;
  }

  if (
    searchDate &&
    !readStringAlias(metadata, [
      "searchDate",
      "search_date"
    ])
  ) {
    metadata.searchDate = searchDate;
  }

  if (
    rerank !== undefined &&
    readBooleanAlias(metadata, [
      "rerank",
      "rerankResults",
      "rerank_results"
    ]) === undefined
  ) {
    metadata.rerank = rerank;
  }

  return metadata;
}

function buildGroundedReplyInput(request: Request) {
  const body = request.body as ProxyChatCompletionRequestBody;
  const bodyRecord =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const metadata = buildMetadata(bodyRecord);

  return {
    externalUserApiKey:
      readStringAlias(bodyRecord, [
        "externalUserApiKey",
        "external_user_api_key"
      ]) ??
      readStringAlias(metadata, [
        "externalUserApiKey",
        "external_user_api_key"
      ]),
    browserSessionId:
      readStringAlias(bodyRecord, [
        "browserSessionId",
        "browser_session_id"
      ]) ??
      readStringAlias(metadata, [
        "browserSessionId",
        "browser_session_id"
      ]),
    conversationId:
      readStringAlias(bodyRecord, [
        "conversationId",
        "conversation_id"
      ]) ??
      readStringAlias(metadata, [
        "conversationId",
        "conversation_id"
      ]),
    language:
      readStringAlias(bodyRecord, ["language"]) ??
      readStringAlias(metadata, ["language"]) ??
      null,
    messages: body.messages,
    metadata,
    model: body.model,
    pageTitle:
      readStringAlias(bodyRecord, ["pageTitle", "page_title"]) ??
      readStringAlias(metadata, ["pageTitle", "page_title"]),
    pageUrl:
      readStringAlias(bodyRecord, ["pageUrl", "page_url"]) ??
      readStringAlias(metadata, ["pageUrl", "page_url"]),
    previousResponseId:
      readStringAlias(bodyRecord, [
        "previousResponseId",
        "previous_response_id"
      ]) ??
      readStringAlias(metadata, [
        "previousResponseId",
        "previous_response_id"
      ]),
    samsarSessionId:
      readStringAlias(bodyRecord, [
        "assistantSessionId",
        "assistant_session_id",
        "samsarSessionId",
        "samsar_session_id"
      ]) ??
      readStringAlias(metadata, [
        "assistantSessionId",
        "assistant_session_id",
        "samsarSessionId",
        "samsar_session_id"
      ]),
    templateId:
      readStringAlias(bodyRecord, ["templateId", "template_id"]) ??
      readStringAlias(metadata, ["templateId", "template_id"]),
    transcript:
      readStringAlias(bodyRecord, ["transcript"]) ??
      readStringAlias(metadata, ["transcript"]),
    user:
      readStringAlias(bodyRecord, ["user"]) ??
      readStringAlias(metadata, ["user"])
  };
}

export async function handleChatCompletionsRoute(
  request: Request,
  response: Response
) {
  const body = request.body as ChatCompletionRequestLike;
  let assistantReply;

  try {
    assistantReply = await generateGroundedAssistantReply(
      buildGroundedReplyInput(request)
    );
  } catch (error) {
    const status =
      error instanceof GroundedAssistantError ? error.status : 502;

    response.status(status).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate a grounded assistant reply."
    });
    return;
  }

  if (body.stream === false) {
    response.json(createChatCompletionPayload(body, assistantReply));
    return;
  }

  await streamChatCompletion(response, body, assistantReply);
}

export const chatCompletionsRouter = Router();
export const proxyChatCompletionRouter = Router();

chatCompletionsRouter.post("/completions", (request, response) => {
  void handleChatCompletionsRoute(request, response);
});

proxyChatCompletionRouter.post("/", (request, response) => {
  const body = request.body as ChatCompletionRequestLike;

  void generateGroundedAssistantReply(buildGroundedReplyInput(request))
    .then((assistantReply) => {
      response.json({
        ok: true,
        completion: createChatCompletionPayload(
          {
            ...body,
            stream: false
          },
          assistantReply
        ),
        response: assistantReply
      });
    })
    .catch((error) => {
      const status =
        error instanceof GroundedAssistantError ? error.status : 502;

      response.status(status).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate a grounded assistant reply."
      });
    });
});
