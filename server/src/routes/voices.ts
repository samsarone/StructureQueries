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

function readVoicePreviewUrl(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  return (
    readOptionalString(candidate.previewUrl) ??
    readOptionalString(candidate.preview_url)
  );
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

voicesRouter.get("/preview", async (request, response) => {
  const voiceId = readOptionalString(
    typeof request.query.voiceId === "string" ? request.query.voiceId : undefined
  );

  if (!voiceId) {
    response.status(400).json({
      ok: false,
      error: "voiceId is required"
    });
    return;
  }

  if (!elevenLabsAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "ELEVENLABS_API_KEY is not configured."
    });
    return;
  }

  try {
    const voice = await elevenLabsAdapter.getVoice(voiceId);
    const previewUrl = readVoicePreviewUrl(voice);

    if (!previewUrl) {
      response.status(404).json({
        ok: false,
        error: "Preview audio is not available for this voice."
      });
      return;
    }

    const previewResponse = await fetch(previewUrl);

    if (!previewResponse.ok) {
      throw new Error(`Preview request failed with ${previewResponse.status}`);
    }

    const previewAudio = Buffer.from(await previewResponse.arrayBuffer());

    response.set(
      "Content-Type",
      previewResponse.headers.get("content-type") ?? "audio/mpeg"
    );
    response.set("Cache-Control", "private, max-age=3600");
    response.send(previewAudio);
  } catch (error) {
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch ElevenLabs preview audio."
    });
  }
});

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
