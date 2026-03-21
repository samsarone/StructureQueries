import type { Response } from "express";
import { randomUUID } from "node:crypto";

import type {
  ChatCompletionRequestLike,
  ChatMessage,
  GroundedAssistantReply
} from "./chat-types.js";

function extractTextPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (part && typeof part === "object") {
    const text = (part as { text?: unknown }).text;

    if (typeof text === "string") {
      return text;
    }
  }

  return "";
}

export function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => extractTextPart(part))
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function getLastUserMessage(messages?: ChatMessage[]) {
  const lastMessage = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");

  return extractMessageText(lastMessage?.content);
}

function normalizeAssistantReply(
  assistantReply: GroundedAssistantReply
): GroundedAssistantReply {
  return {
    ...assistantReply,
    images: assistantReply.images ?? [],
    modalities:
      assistantReply.modalities ??
      (assistantReply.images.length > 0 ? ["image", "text"] : ["text"])
  };
}

function getUsageRecord(assistantReply: GroundedAssistantReply) {
  const usage = assistantReply.usage ?? {};
  const promptTokens =
    typeof usage.prompt_tokens === "number"
      ? usage.prompt_tokens
      : typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : 0;
  const completionTokens =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : 0;
  const totalTokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : promptTokens + completionTokens;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens
  };
}

export function createChatCompletionPayload(
  request: ChatCompletionRequestLike,
  assistantReplyInput: GroundedAssistantReply
) {
  const assistantReply = normalizeAssistantReply(assistantReplyInput);

  return {
    id: `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: request.model ?? assistantReply.model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: assistantReply.text
        }
      }
    ],
    usage: getUsageRecord(assistantReply),
    structuredqueries: {
      provider: assistantReply.provider,
      responseId: assistantReply.responseId ?? null,
      status: assistantReply.status ?? null,
      templateId: assistantReply.templateId ?? null,
      warnings: assistantReply.warnings ?? [],
      images: assistantReply.images,
      modalities: assistantReply.modalities,
      retrieval: assistantReply.retrieval ?? null
    }
  };
}

export async function streamChatCompletion(
  response: Response,
  request: ChatCompletionRequestLike,
  assistantReplyInput: GroundedAssistantReply
) {
  const assistantReply = normalizeAssistantReply(assistantReplyInput);
  const payload = createChatCompletionPayload(request, assistantReply);
  const created = payload.created;
  const model = payload.model;
  const assistantText = assistantReply.text;
  const contentChunks = assistantText.match(/.{1,80}(\s|$)/g) ?? [assistantText];

  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  response.write(
    `data: ${JSON.stringify({
      id: payload.id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant"
          },
          finish_reason: null
        }
      ]
    })}\n\n`
  );

  for (const chunk of contentChunks) {
    response.write(
      `data: ${JSON.stringify({
        id: payload.id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {
              content: chunk
            },
            finish_reason: null
          }
        ]
      })}\n\n`
    );
  }

  response.write(
    `data: ${JSON.stringify({
      id: payload.id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop"
        }
      ]
    })}\n\n`
  );
  response.write("data: [DONE]\n\n");
  response.end();
}

export type {
  AssistantImageAsset,
  ChatCompletionRequestLike,
  ChatMessage,
  GroundedAssistantReply,
  RetrievalSummary,
  RetrievedChunk
} from "./chat-types.js";
