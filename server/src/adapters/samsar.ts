import {
  getSamsarClient,
  isSamsarConfigured
} from "../connectors/samsar.js";

type SamsarCreateVideoFromImageListInput = Parameters<
  ReturnType<typeof getSamsarClient>["createVideoFromImageList"]
>[0];
type SamsarCreateVideoFromTextInput = Parameters<
  ReturnType<typeof getSamsarClient>["createVideoFromText"]
>[0];
type SamsarEnhanceMessageInput = Parameters<
  ReturnType<typeof getSamsarClient>["enhanceMessage"]
>[0];
type SamsarCreateEmbeddingFromUrlInput = Parameters<
  ReturnType<typeof getSamsarClient>["createEmbeddingFromUrl"]
>[0];
type SamsarGenerateEmbeddingsFromPlainTextInput = Parameters<
  ReturnType<typeof getSamsarClient>["generateEmbeddingsFromPlainText"]
>[0];
type SamsarCreateAssistantCompletionInput = Parameters<
  ReturnType<typeof getSamsarClient>["createAssistantCompletion"]
>[0];
type SamsarCreateExternalAssistantCompletionInput = Parameters<
  ReturnType<typeof getSamsarClient>["createExternalAssistantCompletion"]
>[0];
type SamsarChargeExternalUserUtilityUsageInput = Parameters<
  ReturnType<typeof getSamsarClient>["chargeExternalUserUtilityUsage"]
>[0];
type SamsarCreateExternalAssistantSessionInput = Parameters<
  ReturnType<typeof getSamsarClient>["createExternalAssistantSession"]
>[1];
type SamsarExternalUserIdentity = Parameters<
  ReturnType<typeof getSamsarClient>["createExternalUserSession"]
>[0];
type SamsarRequestOptions = Parameters<
  ReturnType<typeof getSamsarClient>["createExternalUserSession"]
>[1];
type SamsarGetEmbeddingStatusInput = Parameters<
  ReturnType<typeof getSamsarClient>["getEmbeddingStatus"]
>[0];
type SamsarSearchEmbeddingsInput = Parameters<
  ReturnType<typeof getSamsarClient>["searchAgainstEmbeddings"]
>[0];
type SamsarSetExternalAssistantSystemPromptInput = Parameters<
  ReturnType<typeof getSamsarClient>["setExternalAssistantSystemPrompt"]
>[0];
type SamsarSimilarToEmbeddingInput = Parameters<
  ReturnType<typeof getSamsarClient>["similarToEmbedding"]
>[0];

export async function createSamsarVideoFromText(
  input: SamsarCreateVideoFromTextInput
) {
  return getSamsarClient().createVideoFromText(input);
}

export async function createSamsarVideoFromImageList(
  input: SamsarCreateVideoFromImageListInput
) {
  return getSamsarClient().createVideoFromImageList(input);
}

export async function enhanceSamsarMessage(
  input: SamsarEnhanceMessageInput
) {
  return getSamsarClient().enhanceMessage(input);
}

export async function createSamsarEmbeddingFromUrl(
  input: SamsarCreateEmbeddingFromUrlInput
) {
  return getSamsarClient().createEmbeddingFromUrl(input);
}

export async function generateSamsarEmbeddingsFromPlainText(
  input: SamsarGenerateEmbeddingsFromPlainTextInput
) {
  return getSamsarClient().generateEmbeddingsFromPlainText(input);
}

export async function createSamsarAssistantCompletion(
  input: SamsarCreateAssistantCompletionInput
) {
  return getSamsarClient().createAssistantCompletion(input);
}

export async function createSamsarExternalAssistantCompletion(
  input: SamsarCreateExternalAssistantCompletionInput,
  externalUser?: SamsarExternalUserIdentity | null,
  options?: SamsarRequestOptions
) {
  return getSamsarClient().createExternalAssistantCompletion(
    input,
    externalUser,
    options
  );
}

export async function chargeSamsarExternalUserUtilityUsage(
  input: SamsarChargeExternalUserUtilityUsageInput,
  externalUser?: SamsarExternalUserIdentity | null,
  options?: SamsarRequestOptions
) {
  return getSamsarClient().chargeExternalUserUtilityUsage(
    input,
    externalUser,
    options
  );
}

export async function createSamsarExternalAssistantSession(
  externalUser?: SamsarExternalUserIdentity | null,
  input?: SamsarCreateExternalAssistantSessionInput,
  options?: SamsarRequestOptions
) {
  return getSamsarClient().createExternalAssistantSession(
    externalUser,
    input,
    options
  );
}

export async function createSamsarExternalUserSession(
  externalUser: SamsarExternalUserIdentity,
  options?: SamsarRequestOptions
) {
  return getSamsarClient().createExternalUserSession(externalUser, options);
}

export async function getSamsarEmbeddingStatus(
  templateId: SamsarGetEmbeddingStatusInput
) {
  return getSamsarClient().getEmbeddingStatus(templateId);
}

export async function searchSamsarEmbeddings(
  input: SamsarSearchEmbeddingsInput
) {
  return getSamsarClient().searchAgainstEmbeddings(input);
}

export async function setSamsarExternalAssistantSystemPrompt(
  payload: SamsarSetExternalAssistantSystemPromptInput,
  externalUser?: SamsarExternalUserIdentity | null,
  options?: SamsarRequestOptions
) {
  return getSamsarClient().setExternalAssistantSystemPrompt(
    payload,
    externalUser,
    options
  );
}

export async function similarToSamsarEmbedding(
  input: SamsarSimilarToEmbeddingInput
) {
  return getSamsarClient().similarToEmbedding(input);
}

export async function getSamsarCreditsBalance() {
  return getSamsarClient().getCreditsBalance();
}

export async function listSamsarCompletedSessions(limit = 20) {
  return getSamsarClient().listCompletedVideoSessions({
    limit
  });
}

export const samsarAdapter = {
  id: "samsar",
  isConfigured: isSamsarConfigured,
  getClient: getSamsarClient,
  createAssistantCompletion: createSamsarAssistantCompletion,
  createExternalAssistantSession: createSamsarExternalAssistantSession,
  createExternalAssistantCompletion: createSamsarExternalAssistantCompletion,
  chargeExternalUserUtilityUsage: chargeSamsarExternalUserUtilityUsage,
  createExternalUserSession: createSamsarExternalUserSession,
  createVideoFromImageList: createSamsarVideoFromImageList,
  createVideoFromText: createSamsarVideoFromText,
  createEmbeddingFromUrl: createSamsarEmbeddingFromUrl,
  generateEmbeddingsFromPlainText: generateSamsarEmbeddingsFromPlainText,
  enhanceMessage: enhanceSamsarMessage,
  getEmbeddingStatus: getSamsarEmbeddingStatus,
  getCreditsBalance: getSamsarCreditsBalance,
  listCompletedVideoSessions: listSamsarCompletedSessions,
  searchEmbeddings: searchSamsarEmbeddings,
  setExternalAssistantSystemPrompt: setSamsarExternalAssistantSystemPrompt,
  similarToEmbedding: similarToSamsarEmbedding
} as const;
