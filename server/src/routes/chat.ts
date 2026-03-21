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

function buildGroundedReplyInput(request: Request) {
  const body = request.body as ProxyChatCompletionRequestBody;
  const metadata = body.metadata ?? {};

  return {
    externalUserApiKey:
      readStringValue(body.externalUserApiKey) ??
      readStringValue(metadata.externalUserApiKey),
    browserSessionId:
      readStringValue(body.browserSessionId) ??
      readStringValue(metadata.browserSessionId),
    conversationId:
      readStringValue(body.conversationId) ??
      readStringValue(metadata.conversationId),
    language:
      readStringValue(body.language) ??
      readStringValue(metadata.language) ??
      null,
    messages: body.messages,
    metadata,
    model: body.model,
    pageTitle:
      readStringValue(body.pageTitle) ?? readStringValue(metadata.pageTitle),
    pageUrl: readStringValue(body.pageUrl) ?? readStringValue(metadata.pageUrl),
    previousResponseId:
      readStringValue(body.previousResponseId) ??
      readStringValue(metadata.previousResponseId),
    samsarSessionId:
      readStringValue(body.assistantSessionId) ??
      readStringValue(body.samsarSessionId) ??
      readStringValue(metadata.assistantSessionId) ??
      readStringValue(metadata.samsarSessionId),
    templateId:
      readStringValue(body.templateId) ?? readStringValue(metadata.templateId),
    transcript:
      readStringValue(body.transcript) ?? readStringValue(metadata.transcript),
    user: readStringValue(body.user) ?? readStringValue(metadata.user)
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
