export interface ChatMessage {
  role?: string;
  content?: unknown;
}

export interface ChatCompletionRequestLike {
  model?: string;
  stream?: boolean;
  messages?: ChatMessage[];
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  id: string;
  score?: number;
  text: string;
}

export interface AssistantImageAsset {
  base64?: string;
  dataUrl?: string;
  url?: string;
  mimeType: string;
}

export interface RetrievalSummary {
  query: string;
  templateId?: string;
  chunks: RetrievedChunk[];
  similarityMatches?: Array<{
    id: string;
    score?: number;
  }>;
}

export interface GroundedAssistantReply {
  provider: "samsar";
  model: string;
  text: string;
  images: AssistantImageAsset[];
  modalities: Array<"image" | "text">;
  templateId?: string;
  retrieval?: RetrievalSummary;
  usage?: Record<string, unknown>;
  warnings?: string[];
  responseId?: string;
  status?: string;
}
