import type { RetrievedChunk } from "./chat-completions.js";

export interface DynamicPronunciationRule {
  alias: string;
  caseSensitive?: boolean;
  stringToReplace: string;
  wordBoundaries?: boolean;
}

export interface PreparedAssistantSpeech {
  pronunciationRules: DynamicPronunciationRule[];
  speechText: string;
  technicalTerms: string[];
}

const MAX_DYNAMIC_RULES = 24;
const MAX_TERM_LENGTH = 40;

const EXACT_SPOKEN_FORMS = new Map<string, string>([
  ["API", "A P I"],
  ["APIs", "A P I's"],
  ["CLI", "C L I"],
  ["CLIs", "C L I's"],
  ["CPU", "C P U"],
  ["CPUs", "C P U's"],
  ["CSS", "C S S"],
  ["CSV", "C S V"],
  ["CDN", "C D N"],
  ["CDNs", "C D N's"],
  ["DNS", "D N S"],
  ["FAQ", "F A Q"],
  ["GPU", "G P U"],
  ["GPUs", "G P U's"],
  ["GPT", "G P T"],
  ["GraphQL", "Graph Q L"],
  ["HTML", "H T M L"],
  ["HTTP", "H T T P"],
  ["HTTPS", "H T T P S"],
  ["IaaS", "eye as"],
  ["IDE", "I D E"],
  ["IDEs", "I D E's"],
  ["JSON", "jay son"],
  ["JWT", "J W T"],
  ["LLM", "L L M"],
  ["LLMs", "L L M's"],
  ["MongoDB", "Mongo D B"],
  ["MySQL", "my sequel"],
  ["Next.js", "Next J S"],
  ["NoSQL", "no sequel"],
  ["Node.js", "Node J S"],
  ["OAuth", "oh auth"],
  ["OCR", "O C R"],
  ["OpenAI", "Open A I"],
  ["PaaS", "pass"],
  ["PDF", "P D F"],
  ["PDFs", "P D F's"],
  ["PostgreSQL", "Postgres S Q L"],
  ["REST", "rest"],
  ["S3", "S 3"],
  ["SaaS", "sass"],
  ["SDK", "S D K"],
  ["SDKs", "S D K's"],
  ["SQL", "sequel"],
  ["SSH", "S S H"],
  ["TCP", "T C P"],
  ["TLS", "T L S"],
  ["TS", "T S"],
  ["TypeScript", "Type Script"],
  ["UDP", "U D P"],
  ["UI", "U I"],
  ["URL", "U R L"],
  ["URLs", "U R L's"],
  ["URI", "U R I"],
  ["URIs", "U R I's"],
  ["UX", "U X"],
  ["WebSocket", "web socket"],
  ["WebSockets", "web sockets"],
  ["XML", "X M L"]
]);
const CASE_INSENSITIVE_SPOKEN_FORMS = new Map<string, string>(
  [...EXACT_SPOKEN_FORMS.entries()].map(([key, value]) => [key.toLowerCase(), value])
);

const IGNORED_TOKENS = new Set([
  "A",
  "I",
  "OK"
]);

const SMALL_NUMBER_WORDS = new Map<number, string>([
  [0, "zero"],
  [1, "one"],
  [2, "two"],
  [3, "three"],
  [4, "four"],
  [5, "five"],
  [6, "six"],
  [7, "seven"],
  [8, "eight"],
  [9, "nine"],
  [10, "ten"],
  [11, "eleven"],
  [12, "twelve"],
  [13, "thirteen"],
  [14, "fourteen"],
  [15, "fifteen"],
  [16, "sixteen"],
  [17, "seventeen"],
  [18, "eighteen"],
  [19, "nineteen"],
  [20, "twenty"],
  [30, "thirty"],
  [40, "forty"],
  [50, "fifty"],
  [60, "sixty"],
  [70, "seventy"],
  [80, "eighty"],
  [90, "ninety"]
]);

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdownForSpeech(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\|/g, " ");
}

function applyEnglishContractions(value: string) {
  return value
    .replace(/\bI am\b/g, "I'm")
    .replace(/\bI will\b/g, "I'll")
    .replace(/\bI would\b/g, "I'd")
    .replace(/\bit is\b/gi, "it's")
    .replace(/\bthat is\b/gi, "that's")
    .replace(/\bthere is\b/gi, "there's")
    .replace(/\bwe are\b/gi, "we're")
    .replace(/\bwe will\b/gi, "we'll")
    .replace(/\bthey are\b/gi, "they're")
    .replace(/\bdo not\b/gi, "don't")
    .replace(/\bdoes not\b/gi, "doesn't")
    .replace(/\bdid not\b/gi, "didn't")
    .replace(/\bcannot\b/gi, "can't")
    .replace(/\bwill not\b/gi, "won't")
    .replace(/\bis not\b/gi, "isn't")
    .replace(/\bare not\b/gi, "aren't")
    .replace(/\bwas not\b/gi, "wasn't")
    .replace(/\bwere not\b/gi, "weren't")
    .replace(/\bhave not\b/gi, "haven't")
    .replace(/\bhas not\b/gi, "hasn't");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyKnownTechnicalSpeechRewrites(value: string) {
  let nextValue = value;
  const knownTerms = [...EXACT_SPOKEN_FORMS.keys()].sort(
    (left, right) => right.length - left.length
  );

  for (const term of knownTerms) {
    const spokenForm = EXACT_SPOKEN_FORMS.get(term);

    if (!spokenForm) {
      continue;
    }

    const boundaryWrapped = /^[A-Za-z0-9]+$/.test(term)
      ? `\\b${escapeRegExp(term)}\\b`
      : escapeRegExp(term);

    nextValue = nextValue.replace(
      new RegExp(boundaryWrapped, "g"),
      spokenForm
    );
  }

  return nextValue;
}

function normalizeLanguageKey(language?: string | null) {
  const trimmed = language?.trim().toLowerCase();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.split(/[-_]/)[0];
}

function normalizeSpeechText(value: string, language?: string | null) {
  const languageKey = normalizeLanguageKey(language);
  const cleanedText = stripMarkdownForSpeech(value);
  const baseText =
    languageKey && languageKey !== "en"
      ? cleanedText
      : cleanedText
          .replace(/\be\.g\./gi, "for example")
          .replace(/\bi\.e\./gi, "that is")
          .replace(/\betc\./gi, "etcetera")
          .replace(/\bvs\./gi, "versus")
          .replace(/\bw\//gi, "with ")
          .replace(/\s*&\s*/g, " and ")
          .replace(/\b[vV](\d+(?:\.\d+)+(?:[a-z])?)\b/g, "version $1");
  const normalizedText = normalizeWhitespace(baseText.replace(/;\s+/g, ". "));

  if (languageKey && languageKey !== "en") {
    return normalizedText;
  }

  return normalizeWhitespace(
    applyEnglishContractions(applyKnownTechnicalSpeechRewrites(normalizedText))
  );
}

function getSpokenOverride(value: string) {
  return EXACT_SPOKEN_FORMS.get(value) ?? CASE_INSENSITIVE_SPOKEN_FORMS.get(value.toLowerCase());
}

function addPatternMatches(set: Set<string>, text: string, pattern: RegExp) {
  for (const match of text.matchAll(pattern)) {
    const candidate = typeof match[0] === "string" ? match[0].trim() : "";

    if (candidate) {
      set.add(candidate);
    }
  }
}

function isLikelyUrlToken(value: string) {
  return /^(https?:\/\/|www\.)/i.test(value);
}

function isLikelyTechnicalTerm(value: string) {
  if (
    !value ||
    value.length < 2 ||
    value.length > MAX_TERM_LENGTH ||
    IGNORED_TOKENS.has(value) ||
    isLikelyUrlToken(value)
  ) {
    return false;
  }

  return (
    Boolean(getSpokenOverride(value)) ||
    /[A-Z]{2,}/.test(value) ||
    /[._-]/.test(value) ||
    /\d/.test(value) ||
    /[a-z][A-Z]/.test(value) ||
    /[A-Z][a-z]+[A-Z]/.test(value)
  );
}

function collectTechnicalTerms(text: string) {
  const matches = new Set<string>();

  addPatternMatches(matches, text, /\b[A-Z]{2,8}(?:s)?\b/g);
  addPatternMatches(matches, text, /\b[A-Za-z]+\.js\b/g);
  addPatternMatches(matches, text, /\b[A-Za-z]+(?:\.[A-Za-z0-9]+)+\b/g);
  addPatternMatches(matches, text, /\b[A-Za-z]+-\d+(?:\.\d+)*(?:[A-Za-z])?\b/g);
  addPatternMatches(matches, text, /\bv\d+(?:\.\d+)*(?:[A-Za-z])?\b/gi);
  addPatternMatches(matches, text, /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g);
  addPatternMatches(matches, text, /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g);
  addPatternMatches(matches, text, /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g);

  return [...matches].filter(isLikelyTechnicalTerm);
}

function splitCamelCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function toSpelledLetters(value: string) {
  return value
    .split("")
    .filter(Boolean)
    .map((character) =>
      character.toLowerCase() === "o" ? "oh" : character.toUpperCase()
    )
    .join(" ");
}

function numberToSpeech(value: string): string {
  if (/^\d{4}$/.test(value) && value.startsWith("20")) {
    return value.split("").map((digit) => SMALL_NUMBER_WORDS.get(Number(digit)) ?? digit).join(" ");
  }

  if (/^\d+$/.test(value)) {
    const numericValue = Number(value);

    if (SMALL_NUMBER_WORDS.has(numericValue)) {
      return SMALL_NUMBER_WORDS.get(numericValue)!;
    }

    if (numericValue < 100) {
      const tens = Math.floor(numericValue / 10) * 10;
      const ones = numericValue % 10;
      const tensWord = SMALL_NUMBER_WORDS.get(tens);
      const onesWord = SMALL_NUMBER_WORDS.get(ones);

      if (tensWord && onesWord) {
        return `${tensWord} ${onesWord}`;
      }
    }

    return value
      .split("")
      .map((digit) => SMALL_NUMBER_WORDS.get(Number(digit)) ?? digit)
      .join(" ");
  }

  if (/^\d+\.\d+$/.test(value)) {
    return value
      .split(".")
      .map((part, index) => (index === 0 ? numberToSpeech(part) : part.split("").map((digit) => SMALL_NUMBER_WORDS.get(Number(digit)) ?? digit).join(" ")))
      .join(" point ");
  }

  return value;
}

function normalizeSpeechSegment(segment: string) {
  if (!segment) {
    return "";
  }

  const spokenOverride = getSpokenOverride(segment);

  if (spokenOverride) {
    return spokenOverride;
  }

  if (/^[A-Z]{2,}$/.test(segment)) {
    return toSpelledLetters(segment);
  }

  if (/^\d+(?:\.\d+)?$/.test(segment)) {
    return numberToSpeech(segment);
  }

  if (/^[A-Za-z]$/.test(segment)) {
    return segment.toLowerCase() === "o" ? "oh" : segment.toUpperCase();
  }

  return segment.toLowerCase();
}

function createAliasFromStructuredToken(token: string): string {
  if (/^v\d+(?:\.\d+)*(?:[A-Za-z])?$/i.test(token)) {
    return `version ${createAliasFromStructuredToken(token.slice(1))}`;
  }

  if (/^[A-Za-z]+\.js$/.test(token)) {
    const [base] = token.split(".");
    return `${normalizeSpeechSegment(base)} J S`;
  }

  if (token.includes("_")) {
    return token
      .split("_")
      .map((part) => normalizeSpeechSegment(part))
      .join(" ");
  }

  if (token.includes("-")) {
    return token
      .split("-")
      .flatMap((part) => splitVersionSuffix(part))
      .map((part) => normalizeSpeechSegment(part))
      .join(" ");
  }

  if (/[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(token)) {
    return splitCamelCase(token)
      .split(/\s+/)
      .map((part) => normalizeSpeechSegment(part))
      .join(" ");
  }

  if (/^[A-Za-z]+(?:\.[A-Za-z0-9]+)+$/.test(token)) {
    return token
      .split(".")
      .flatMap((part) => splitVersionSuffix(part))
      .map((part) => normalizeSpeechSegment(part))
      .join(" ");
  }

  if (/^[A-Z]{2,8}s$/.test(token)) {
    return `${toSpelledLetters(token.slice(0, -1))}'s`;
  }

  if (/^[A-Z]{2,8}$/.test(token)) {
    return toSpelledLetters(token);
  }

  return "";
}

function splitVersionSuffix(value: string) {
  if (!value) {
    return [];
  }

  return value
    .match(/[A-Z]{2,}|[A-Z]?[a-z]+|\d+(?:\.\d+)?|[A-Z]/g)
    ?.filter(Boolean) ?? [value];
}

function createPronunciationRule(term: string): DynamicPronunciationRule | null {
  const exactOverride = getSpokenOverride(term);

  const alias = normalizeWhitespace(
    exactOverride ?? createAliasFromStructuredToken(term)
  );

  if (!alias) {
    return null;
  }

  const normalizedAlias = alias.replace(/[\s.'-]+/g, "").toLowerCase();
  const normalizedTerm = term.replace(/[\s.'-]+/g, "").toLowerCase();

  if (!normalizedAlias || normalizedAlias === normalizedTerm) {
    return null;
  }

  return {
    alias,
    caseSensitive: /[A-Z]/.test(term),
    stringToReplace: term,
    wordBoundaries: /^[A-Za-z0-9]+$/.test(term)
  };
}

function sortTermsByFirstAppearance(terms: string[], text: string) {
  const lowerText = text.toLowerCase();

  return [...terms].sort((left, right) => {
    const leftIndex = lowerText.indexOf(left.toLowerCase());
    const rightIndex = lowerText.indexOf(right.toLowerCase());

    if (leftIndex === rightIndex) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

export function prepareAssistantTextForSpeech(input: {
  language?: string | null;
  retrievalChunks?: RetrievedChunk[];
  text: string;
}): PreparedAssistantSpeech {
  const speechText = normalizeSpeechText(input.text, input.language);
  const retrievalText = (input.retrievalChunks ?? [])
    .map((chunk) => chunk.text)
    .filter(Boolean)
    .join("\n");
  const terms = sortTermsByFirstAppearance(
    uniqueStrings([
      ...collectTechnicalTerms(speechText),
      ...collectTechnicalTerms(retrievalText)
    ]).filter((term) => speechText.toLowerCase().includes(term.toLowerCase())),
    speechText
  ).slice(0, MAX_DYNAMIC_RULES);

  const pronunciationRules = terms
    .map((term) => createPronunciationRule(term))
    .filter((rule): rule is DynamicPronunciationRule => Boolean(rule));

  return {
    pronunciationRules,
    speechText,
    technicalTerms: terms
  };
}
