import { Router } from "express";

import { elevenLabsAdapter } from "../adapters/elevenlabs.js";

interface VoiceOption {
  voiceId: string;
  name: string;
  description?: string;
  category?: string;
  previewUrl?: string;
  provider: "elevenlabs";
}

export const voicesRouter = Router();

voicesRouter.get("/", async (_request, response) => {
  if (!elevenLabsAdapter.isConfigured()) {
    response.status(503).json({
      ok: false,
      error: "ELEVENLABS_API_KEY is not configured.",
      provider: "elevenlabs",
      voices: []
    });
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
    response.status(502).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch ElevenLabs voices.",
      provider: "elevenlabs",
      voices: []
    });
  }
});
