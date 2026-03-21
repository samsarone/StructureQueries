import { SamsarClient } from "samsar-js";

import { env } from "../config/env.js";

let samsarClient: SamsarClient | undefined;

function getSamsarConfig() {
  const { apiKey, timeoutMs } = env.integrations.samsar;

  if (!apiKey) {
    throw new Error(
      "SAMSAR_API_KEY is not configured. Add it before using the Samsar connector."
    );
  }

  return {
    apiKey,
    timeoutMs
  };
}

export function isSamsarConfigured() {
  return Boolean(env.integrations.samsar.apiKey);
}

export function getSamsarClient() {
  if (!samsarClient) {
    const { apiKey, timeoutMs } = getSamsarConfig();

    samsarClient = new SamsarClient({
      apiKey,
      timeoutMs
    });
  }

  return samsarClient;
}

export const samsarConnector = {
  id: "samsar",
  packageName: "samsar-js",
  runtime: "sdk",
  isConfigured: isSamsarConfigured,
  getClient: getSamsarClient
} as const;
