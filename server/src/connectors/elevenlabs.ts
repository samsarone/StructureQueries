import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { env } from "../config/env.js";

let elevenLabsClient: ElevenLabsClient | undefined;

function getElevenLabsConfig() {
  const { apiKey, timeoutSeconds } = env.integrations.elevenLabs;

  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. Add it before using the ElevenLabs connector."
    );
  }

  return {
    apiKey,
    timeoutSeconds
  };
}

export function isElevenLabsConfigured() {
  return Boolean(env.integrations.elevenLabs.apiKey);
}

export function getElevenLabsClient() {
  if (!elevenLabsClient) {
    const { apiKey, timeoutSeconds } = getElevenLabsConfig();

    elevenLabsClient = new ElevenLabsClient({
      apiKey,
      timeoutInSeconds: timeoutSeconds
    });
  }

  return elevenLabsClient;
}

export const elevenLabsConnector = {
  id: "elevenlabs",
  packageName: "@elevenlabs/elevenlabs-js",
  runtime: "sdk",
  isConfigured: isElevenLabsConfigured,
  getClient: getElevenLabsClient
} as const;
