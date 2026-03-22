import { SamsarRequestError } from "samsar-js";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractErrorDetail(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => extractErrorDetail(entry))
      .filter((entry): entry is string => Boolean(entry))
      .join("; ");

    return joined || undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const directMessage =
    readOptionalString(payload.error) ??
    readOptionalString(payload.message) ??
    readOptionalString(payload.detail) ??
    readOptionalString(payload.reason) ??
    readOptionalString(payload.description);

  if (directMessage) {
    return directMessage;
  }

  const nestedMessage =
    extractErrorDetail(payload.errors) ??
    extractErrorDetail(payload.details) ??
    extractErrorDetail(payload.data);

  if (nestedMessage) {
    return nestedMessage;
  }

  const issueFields = [
    readOptionalString(payload.code),
    readOptionalString(payload.type)
  ].filter((entry): entry is string => Boolean(entry));

  return issueFields.length > 0 ? issueFields.join(" ") : undefined;
}

function isCreditsIssue(error: SamsarRequestError, detail?: string) {
  return (
    error.status === 402 ||
    error.creditsRemaining === 0 ||
    Boolean(detail && /credit/i.test(detail))
  );
}

function normalizeActionMessage(actionMessage: string) {
  return actionMessage.trim().replace(/[.:]\s*$/, "");
}

export function isSamsarCreditsIssue(error: unknown) {
  if (!(error instanceof SamsarRequestError)) {
    return false;
  }

  return isCreditsIssue(error, extractErrorDetail(error.body));
}

export function getSamsarErrorStatus(error: unknown, fallbackStatus = 502) {
  if (
    error instanceof SamsarRequestError &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
  ) {
    return error.status;
  }

  return fallbackStatus;
}

export function getSamsarErrorMessage(
  error: unknown,
  actionMessage: string
) {
  const normalizedActionMessage = normalizeActionMessage(actionMessage);

  if (error instanceof SamsarRequestError) {
    const detail = extractErrorDetail(error.body);

    if (isCreditsIssue(error, detail)) {
      return `${normalizedActionMessage}: not enough Samsar credits are available for this request.`;
    }

    if (detail) {
      return `${normalizedActionMessage}: ${detail}`;
    }

    if (error.status === 400) {
      return `${normalizedActionMessage}: Samsar rejected the request. Make sure the URL is public and supported.`;
    }

    return normalizedActionMessage;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return normalizedActionMessage;
}

export function getSamsarErrorContext(error: unknown) {
  if (!(error instanceof SamsarRequestError)) {
    return undefined;
  }

  return {
    status: error.status,
    url: error.url,
    creditsCharged: error.creditsCharged,
    creditsRemaining: error.creditsRemaining,
    body: error.body
  };
}
