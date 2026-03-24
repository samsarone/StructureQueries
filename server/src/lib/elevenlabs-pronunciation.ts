import { createHash } from "node:crypto";

import { elevenLabsAdapter } from "../adapters/elevenlabs.js";
import type { DynamicPronunciationRule } from "./speech-prep.js";

interface PronunciationDictionaryLocator {
  pronunciationDictionaryId: string;
  versionId: string;
}

interface SessionDictionaryState {
  dictionaryId: string;
  rulesHash: string;
  versionId: string;
}

const sessionDictionaries = new Map<string, SessionDictionaryState>();
const pendingDictionaryUpdates = new Map<
  string,
  Promise<PronunciationDictionaryLocator[] | undefined>
>();

function normalizeRule(rule: DynamicPronunciationRule) {
  return {
    alias: rule.alias.trim(),
    caseSensitive: rule.caseSensitive ?? false,
    stringToReplace: rule.stringToReplace.trim(),
    type: "alias" as const,
    wordBoundaries: rule.wordBoundaries ?? true
  };
}

function dedupeRules(rules: DynamicPronunciationRule[]) {
  const uniqueRules = new Map<
    string,
    ReturnType<typeof normalizeRule>
  >();

  for (const rule of rules) {
    const normalizedRule = normalizeRule(rule);

    if (!normalizedRule.alias || !normalizedRule.stringToReplace) {
      continue;
    }

    uniqueRules.set(
      normalizedRule.stringToReplace.toLowerCase(),
      normalizedRule
    );
  }

  return [...uniqueRules.values()].sort((left, right) =>
    left.stringToReplace.localeCompare(right.stringToReplace)
  );
}

function buildRulesHash(rules: ReturnType<typeof dedupeRules>) {
  return createHash("sha1").update(JSON.stringify(rules)).digest("hex");
}

function buildLocator(state: SessionDictionaryState) {
  return [
    {
      pronunciationDictionaryId: state.dictionaryId,
      versionId: state.versionId
    }
  ];
}

function buildDictionaryName(sessionKey: string) {
  return `Structure Queries technical terms ${sessionKey.slice(-12)}`;
}

async function createOrUpdateDictionary(
  sessionKey: string,
  rules: ReturnType<typeof dedupeRules>,
  rulesHash: string
) {
  const cachedState = sessionDictionaries.get(sessionKey);
  const client = elevenLabsAdapter.getClient();

  if (!cachedState) {
    const createdDictionary =
      await client.pronunciationDictionaries.createFromRules({
        description:
          "Dynamic technical-term pronunciation dictionary for Structure Queries voice responses.",
        name: buildDictionaryName(sessionKey),
        rules
      });
    const nextState = {
      dictionaryId: createdDictionary.id,
      rulesHash,
      versionId: createdDictionary.versionId
    } satisfies SessionDictionaryState;

    sessionDictionaries.set(sessionKey, nextState);
    return buildLocator(nextState);
  }

  const updatedDictionary =
    await client.pronunciationDictionaries.rules.set(cachedState.dictionaryId, {
      rules
    });
  const nextState = {
    ...cachedState,
    rulesHash,
    versionId: updatedDictionary.versionId
  } satisfies SessionDictionaryState;

  sessionDictionaries.set(sessionKey, nextState);
  return buildLocator(nextState);
}

export async function ensureSessionPronunciationDictionary(input: {
  rules: DynamicPronunciationRule[];
  sessionKey?: string;
}) {
  const sessionKey = input.sessionKey?.trim();

  if (!sessionKey || !elevenLabsAdapter.isConfigured()) {
    return undefined;
  }

  const rules = dedupeRules(input.rules);

  if (rules.length === 0) {
    return undefined;
  }

  const rulesHash = buildRulesHash(rules);
  const cachedState = sessionDictionaries.get(sessionKey);

  if (cachedState?.rulesHash === rulesHash) {
    return buildLocator(cachedState);
  }

  const pendingUpdate = pendingDictionaryUpdates.get(sessionKey);

  if (pendingUpdate) {
    return pendingUpdate;
  }

  const updatePromise = createOrUpdateDictionary(sessionKey, rules, rulesHash)
    .catch((error) => {
      console.warn(
        "Failed to synchronize ElevenLabs pronunciation dictionary",
        {
          error: error instanceof Error ? error.message : error,
          rulesCount: rules.length,
          sessionKey
        }
      );

      return cachedState ? buildLocator(cachedState) : undefined;
    })
    .finally(() => {
      pendingDictionaryUpdates.delete(sessionKey);
    });

  pendingDictionaryUpdates.set(sessionKey, updatePromise);
  return updatePromise;
}
