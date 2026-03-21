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
    const voices = ("voices" in result ? result.voices : []).map((voice) => ({
      voiceId: voice.voiceId,
      name: voice.name ?? voice.voiceId,
      description: voice.description,
      category: voice.category,
      previewUrl: voice.previewUrl,
      provider: "elevenlabs" as const
    }));

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
