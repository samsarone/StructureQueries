import { env } from "../config/env.js";
import { samsarAdapter } from "../adapters/samsar.js";
import {
  extractMessageText,
  getLastUserMessage,
  type ChatMessage,
  type GroundedAssistantReply,
  type RetrievedChunk
} from "./chat-completions.js";

interface GenerateGroundedAssistantReplyInput {
  externalUserApiKey?: string;
  browserSessionId?: string;
  conversationId?: string;
  language?: string | null;
  messages?: ChatMessage[];
  metadata?: Record<string, unknown>;
  model?: string;
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

function readBooleanValue(value: unknown) {
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

  return undefined;
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

function limitText(value: string, maxLength = 1_600) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalizeRole(role?: string) {
  if (
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "user"
  ) {
    return role;
  }

  return "user";
}

function flattenRecordValue(value: unknown, prefix?: string): string[] {
  if (typeof value === "string") {
    const text = value.trim();

    return text ? [prefix ? `${prefix}: ${text}` : text] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [prefix ? `${prefix}: ${String(value)}` : String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRecordValue(item, prefix));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, entryValue]) =>
        flattenRecordValue(entryValue, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [];
}

function createChunkText(record: Record<string, unknown> | undefined) {
  if (!record) {
    return "";
  }

  const preferredKeys = [
    "title",
    "heading",
    "summary",
    "content",
    "chunk",
    "markdown",
    "text",
    "description"
  ];
  const preferredLines = preferredKeys.flatMap((key) =>
    flattenRecordValue(record[key], key)
  );
  const allLines = flattenRecordValue(record);
  const lines = uniqueStrings(
    (preferredLines.length > 0 ? preferredLines : allLines).map((line) =>
      limitText(line, 320)
    )
  );

  return limitText(lines.join("\n"), 1_400);
}

function createRetrievedChunks(
  searchResults: Array<{
    id: string;
    score?: number;
    record?: Record<string, unknown>;
  }> = [],
  similarityMatches: Array<{
    id: string;
    score?: number;
  }> = []
) {
  const similarityScoreById = new Map(
    similarityMatches.map((match) => [match.id, match.score])
  );

  const chunks = searchResults
    .map((result) => ({
      id: result.id,
      score: result.score ?? similarityScoreById.get(result.id),
      text: createChunkText(result.record)
    }))
    .filter((chunk) => chunk.text);

  if (chunks.length > 0) {
    return chunks;
  }

  return similarityMatches.map((match) => ({
    id: match.id,
    score: match.score,
    text: `Matched embedding record ${match.id} with score ${match.score ?? "unknown"}.`
  }));
}

function buildGroundingBlock(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return "No relevant indexed webpage chunks were retrieved for this turn.";
  }

  return chunks
    .map((chunk, index) => {
      const scoreSuffix =
        typeof chunk.score === "number" ? ` (score: ${chunk.score.toFixed(4)})` : "";

      return `[${index + 1}] ${chunk.id}${scoreSuffix}\n${chunk.text}`;
    })
    .join("\n\n");
}

function wantsImageResponse(
  query: string,
  metadata: Record<string, unknown> = {}
) {
  if (readBooleanValue(metadata.allowImageGeneration) === true) {
    return true;
  }

  return /\b(image|illustration|draw|visual|thumbnail|poster|banner|mockup|logo|picture|generate an image|show me)\b/i.test(
    query
  );
}

export class GroundedAssistantError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GroundedAssistantError";
    this.status = status;
  }
}

function resolveTemplateId(input: GenerateGroundedAssistantReplyInput) {
  const metadata = input.metadata ?? {};
  return (
    readStringValue(input.templateId) ??
    readStringAlias(metadata, ["templateId", "template_id"])
  );
}

function normalizeAssistantMessages(messages: ChatMessage[] = []) {
  return messages
    .slice(-8)
    .map((message) => {
      const content = extractMessageText(message.content).trim();

      if (!content) {
        return undefined;
      }

      return {
        role: normalizeRole(message.role),
        content
      };
    })
    .filter(
      (
        message
      ): message is {
        role: "assistant" | "developer" | "system" | "user";
        content: string;
      } => Boolean(message)
    );
}

function buildGroundedTurnContent(input: {
  query: string;
  pageTitle?: string;
  pageUrl?: string;
  language?: string | null;
  groundingBlock: string;
}) {
  const parts = [
    input.query.trim(),
    [
      "Retrieved document context:",
      `Page title: ${input.pageTitle ?? "unknown"}`,
      `Page URL: ${input.pageUrl ?? "unknown"}`,
      `Language: ${input.language ?? "unknown"}`,
      "",
      input.groundingBlock
    ].join("\n")
  ].filter(Boolean);

  return parts.join("\n\n");
}

function attachGroundingContextToMessages(
  messages: Array<{
    role: "assistant" | "developer" | "system" | "user";
    content: string;
  }>,
  input: {
    query: string;
    pageTitle?: string;
    pageUrl?: string;
    language?: string | null;
    groundingBlock: string;
  }
) {
  const groundedTurnContent = buildGroundedTurnContent(input);

  if (messages.length === 0) {
    return [
      {
        role: "user" as const,
        content: groundedTurnContent
      }
    ];
  }

  const normalizedMessages = [...messages];

  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    if (normalizedMessages[index]?.role !== "user") {
      continue;
    }

    normalizedMessages[index] = {
      ...normalizedMessages[index]!,
      content: groundedTurnContent
    };

    return normalizedMessages;
  }

  normalizedMessages.push({
    role: "user",
    content: groundedTurnContent
  });

  return normalizedMessages;
}

function extractAssistantText(response: {
  output_text?: string;
  output?: Array<{
    role?: string;
    content?: Array<{
      text?: string;
    }>;
  }>;
}) {
  if (readStringValue(response.output_text)) {
    return response.output_text!.trim();
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function collectAssistantImages(response: {
  output?: Array<{
    id?: string;
    type?: string;
    result?: string;
  }>;
}) {
  return (response.output ?? [])
    .filter(
      (item) =>
        item.type === "image_generation_call" &&
        typeof item.result === "string" &&
        item.result.trim()
    )
    .map((item) => {
      const result = item.result!.trim();

      if (/^https?:\/\//i.test(result)) {
        return {
          url: result,
          mimeType: "image/png"
        };
      }

      if (/^data:image\//i.test(result)) {
        const mimeTypeMatch = /^data:([^;,]+)[;,]/i.exec(result);

        return {
          dataUrl: result,
          url: result,
          mimeType: mimeTypeMatch?.[1] ?? "image/png"
        };
      }

      return {
        base64: result,
        dataUrl: `data:image/png;base64,${result}`,
        mimeType: "image/png"
      };
    });
}

export async function generateGroundedAssistantReply(
  input: GenerateGroundedAssistantReplyInput
): Promise<GroundedAssistantReply> {
  const metadata = input.metadata ?? {};
  const browserSessionId =
    readStringValue(input.browserSessionId) ??
    readStringAlias(metadata, ["browserSessionId", "browser_session_id"]);
  const conversationId =
    readStringValue(input.conversationId) ??
    readStringAlias(metadata, ["conversationId", "conversation_id"]);
  const pageUrl =
    readStringValue(input.pageUrl) ??
    readStringAlias(metadata, ["pageUrl", "page_url"]);
  const pageTitle =
    readStringValue(input.pageTitle) ??
    readStringAlias(metadata, ["pageTitle", "page_title"]);
  const language =
    readStringValue(input.language ?? undefined) ??
    readStringAlias(metadata, ["language"]) ??
    null;
  const query =
    readStringValue(input.transcript) ?? getLastUserMessage(input.messages);
  const templateId = resolveTemplateId(input);
  const externalUserApiKey =
    readStringValue(input.externalUserApiKey) ??
    readStringAlias(metadata, [
      "externalUserApiKey",
      "external_user_api_key"
    ]);
  const samsarSessionId =
    readStringValue(input.samsarSessionId) ??
    readStringAlias(metadata, [
      "samsarSessionId",
      "samsar_session_id",
      "assistantSessionId",
      "assistant_session_id"
    ]);

  if (!query) {
    throw new GroundedAssistantError("No user query was found in the request body.", 400);
  }

  if (!samsarAdapter.isConfigured()) {
    throw new GroundedAssistantError(
      "SAMSAR_API_KEY is not configured.",
      503
    );
  }

  if (!templateId) {
    throw new GroundedAssistantError(
      "No embedding template is associated with this page or request yet. Analyze the webpage first or send templateId explicitly.",
      400
    );
  }

  if (!externalUserApiKey) {
    throw new GroundedAssistantError(
      "No Samsar external-user API key was provided for this request.",
      401
    );
  }

  if (!samsarSessionId) {
    throw new GroundedAssistantError(
      "No Samsar external assistant session is associated with this request yet.",
      400
    );
  }

  const warnings: string[] = [];
  const rerank =
    readBooleanValue(metadata.rerank) ??
    readBooleanValue(metadata.rerankResults) ??
    env.integrations.samsar.rerankResults;
  const structuredFilters = readObjectAlias(metadata, [
    "structuredFilters",
    "structured_filters",
    "filters"
  ]);
  const searchParams = readObjectAlias(metadata, [
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
  const searchRecord = readObjectAlias(metadata, [
    "searchRecord",
    "search_record",
    "searchJson",
    "search_json",
    "structuredQuery",
    "structured_query"
  ]);
  const searchDate = readStringAlias(metadata, [
    "searchDate",
    "search_date"
  ]);
  const similarityLimit = env.integrations.samsar.similarityLimit;
  const retrievalLimit = env.integrations.samsar.retrievalLimit;

  let similarityMatches: Array<{
    id: string;
    score?: number;
  }> = [];
  let retrievedChunks: RetrievedChunk[] = [];

  try {
    const similarityResult = await samsarAdapter.similarToEmbedding({
      template_id: templateId,
      search_term: query,
      search_date: searchDate,
      search_json: searchRecord,
      structured_filters: structuredFilters,
      limit: similarityLimit,
      num_candidates: Math.max(similarityLimit, retrievalLimit)
    });

    similarityMatches = (similarityResult.data.matches ?? []).map((match) => ({
      id: match.id,
      score: match.score
    }));
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Similarity search failed: ${error.message}`
        : "Similarity search failed."
    );
  }

  try {
    const searchResult = await samsarAdapter.searchEmbeddings({
      template_id: templateId,
      search_term: query,
      search_date: searchDate,
      structured_filters: structuredFilters,
      search_params: searchParams,
      include_raw: true,
      limit: retrievalLimit,
      num_candidates: Math.max(similarityLimit, retrievalLimit),
      rerank
    });

    retrievedChunks = createRetrievedChunks(
      searchResult.data.results,
      similarityMatches
    ).slice(0, retrievalLimit);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Reranked retrieval failed: ${error.message}`
        : "Reranked retrieval failed."
    );
  }

  const groundingBlock = buildGroundingBlock(retrievedChunks);
  const assistantMessages = attachGroundingContextToMessages(
    normalizeAssistantMessages(input.messages),
    {
      query,
      pageTitle,
      pageUrl,
      language,
      groundingBlock
    }
  );

  const imageResponseEnabled =
    env.integrations.samsar.imageToolEnabled &&
    wantsImageResponse(query, metadata);

  const assistantResult = await samsarAdapter.createExternalAssistantCompletion(
    {
      session_id: samsarSessionId,
      previous_response_id:
        readStringValue(input.previousResponseId) ??
        readStringValue(metadata.previousResponseId),
      input: assistantMessages,
      max_output_tokens: env.integrations.samsar.assistantMaxOutputTokens,
      metadata: {
        browserSessionId,
        conversationId,
        language,
        pageTitle,
        pageUrl,
        templateId,
        user:
          readStringValue(input.user) ?? readStringValue(metadata.user) ?? "anonymous"
      },
      model: env.integrations.samsar.assistantModel ?? input.model,
      reasoning_effort: env.integrations.samsar.assistantReasoningEffort,
      tool_choice: imageResponseEnabled ? "auto" : "none",
      tools: imageResponseEnabled
        ? [
            {
              type: "image_generation",
              format: "png",
              quality: "high",
              size: env.integrations.samsar.assistantImageSize
            }
          ]
        : undefined,
      user:
        readStringValue(input.user) ?? readStringValue(metadata.user) ?? "anonymous"
    },
    null,
    {
      externalUserApiKey
    }
  );

  const images = collectAssistantImages(assistantResult.data);
  const text =
    extractAssistantText(assistantResult.data)?.trim() ||
    (images.length > 0
      ? "I generated an image response based on the indexed page context."
      : `I could not produce a grounded response for "${query}".`);
  const modalities: Array<"image" | "text"> = [];

  if (text) {
    modalities.push("text");
  }

  if (images.length > 0) {
    modalities.push("image");
  }

  return {
    provider: "samsar",
    model:
      assistantResult.data.model ??
      env.integrations.samsar.assistantModel ??
      "structuredqueries-samsar-rag",
    text,
    images,
    modalities,
    templateId,
    retrieval: {
      query,
      templateId,
      chunks: retrievedChunks,
      similarityMatches
    },
    usage: assistantResult.data.usage,
    warnings,
    responseId: assistantResult.data.id,
    status: assistantResult.data.status
  };
}
