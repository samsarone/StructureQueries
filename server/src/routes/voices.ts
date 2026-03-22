import { Router } from "express";

import { elevenLabsAdapter } from "../adapters/elevenlabs.js";
import { env } from "../config/env.js";

interface VoiceOption {
  voiceId: string;
  name: string;
  description?: string;
  category?: string;
  previewUrl?: string;
  provider: "elevenlabs";
}

export const voicesRouter = Router();

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readVoiceOptions(value: unknown): VoiceOption[] {
  const payload =
    value && typeof value === "object" && "data" in value
      ? (value as { data?: unknown }).data
      : value;
  const voices =
    payload && typeof payload === "object" && "voices" in payload
      ? (payload as { voices?: unknown }).voices
      : [];

  if (!Array.isArray(voices)) {
    return [];
  }

  return voices.flatMap((voice) => {
    if (!voice || typeof voice !== "object") {
      return [];
    }

    const candidate = voice as Record<string, unknown>;
    const voiceId =
      readOptionalString(candidate.voiceId) ??
      readOptionalString(candidate.voice_id);

    if (!voiceId) {
      return [];
    }

    return [
      {
        voiceId,
        name: readOptionalString(candidate.name) ?? voiceId,
        description: readOptionalString(candidate.description),
        category: readOptionalString(candidate.category),
        previewUrl:
          readOptionalString(candidate.previewUrl) ??
          readOptionalString(candidate.preview_url),
        provider: "elevenlabs"
      }
    ];
  });
}

function createFallbackVoicesPayload(reason?: string) {
  const defaultVoiceId = env.integrations.elevenLabs.defaultVoiceId;

  return {
    ok: true,
    provider: "placeholder" as const,
    voices: [
      {
        voiceId: defaultVoiceId ?? "",
        name: defaultVoiceId ? "Server default voice" : "Browser voice fallback",
        description: defaultVoiceId
          ? "Uses the proxy default voice when ElevenLabs voice listing is unavailable."
          : "Uses browser speech fallback when no remote voice can be selected."
      }
    ],
    warnings: reason ? [reason] : []
  };
}

voicesRouter.get("/", async (_request, response) => {
  if (!elevenLabsAdapter.isConfigured()) {
    response.json(
      createFallbackVoicesPayload(
        "ELEVENLABS_API_KEY is not configured. Using browser voice fallback."
      )
    );
    return;
  }

  try {
    const result = await elevenLabsAdapter.listVoices();
    const voices = readVoiceOptions(result);

    response.json({
      ok: true,
      provider: "elevenlabs",
      voices
    });
  } catch (error) {
    response.json(
      createFallbackVoicesPayload(
        error instanceof Error
          ? error.message
          : "Failed to fetch ElevenLabs voices."
      )
    );
  }
});
