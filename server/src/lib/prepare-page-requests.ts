import { randomUUID } from "node:crypto";

const PREPARE_PAGE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export interface PreparePageRequestRecord {
  requestId: string;
  url: string;
  browserSessionId?: string;
  title?: string;
  status: string;
  analysisAvailable: boolean;
  templateId?: string;
  upstreamRequestId?: string;
  recordCount?: number | null;
  creditsRemaining?: number | null;
  error?: string;
  code?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface PreparePageRequestUpdate {
  requestId: string;
  url?: string;
  browserSessionId?: string;
  title?: string | null;
  status?: string;
  analysisAvailable?: boolean;
  templateId?: string | null;
  upstreamRequestId?: string | null;
  recordCount?: number | null;
  creditsRemaining?: number | null;
  error?: string | null;
  code?: string | null;
  completedAt?: string | null;
}

const preparePageRequests = new Map<string, PreparePageRequestRecord>();

function readTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneExpiredPreparePageRequests(now = Date.now()) {
  for (const [requestId, record] of preparePageRequests.entries()) {
    const mostRecentTimestamp = Math.max(
      readTimestamp(record.completedAt),
      readTimestamp(record.updatedAt),
      readTimestamp(record.startedAt)
    );

    if (
      mostRecentTimestamp > 0 &&
      now - mostRecentTimestamp > PREPARE_PAGE_REQUEST_TTL_MS
    ) {
      preparePageRequests.delete(requestId);
    }
  }
}

export function createPreparePageRequestId() {
  pruneExpiredPreparePageRequests();
  return randomUUID();
}

export function getPreparePageRequest(requestId: string) {
  pruneExpiredPreparePageRequests();
  return preparePageRequests.get(requestId);
}

export function upsertPreparePageRequest(
  update: PreparePageRequestUpdate
) {
  pruneExpiredPreparePageRequests();

  const existing = preparePageRequests.get(update.requestId);
  const now = new Date().toISOString();
  const nextRecord: PreparePageRequestRecord = {
    requestId: update.requestId,
    url: update.url ?? existing?.url ?? "",
    browserSessionId: update.browserSessionId ?? existing?.browserSessionId,
    title:
      update.title === undefined
        ? existing?.title
        : update.title ?? undefined,
    status: update.status ?? existing?.status ?? "pending",
    analysisAvailable:
      update.analysisAvailable ?? existing?.analysisAvailable ?? false,
    templateId:
      update.templateId === undefined
        ? existing?.templateId
        : update.templateId ?? undefined,
    upstreamRequestId:
      update.upstreamRequestId === undefined
        ? existing?.upstreamRequestId
        : update.upstreamRequestId ?? undefined,
    recordCount:
      update.recordCount === undefined
        ? existing?.recordCount
        : update.recordCount,
    creditsRemaining:
      update.creditsRemaining === undefined
        ? existing?.creditsRemaining
        : update.creditsRemaining,
    error:
      update.error === undefined
        ? existing?.error
        : update.error ?? undefined,
    code:
      update.code === undefined
        ? existing?.code
        : update.code ?? undefined,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    completedAt:
      update.completedAt === undefined
        ? existing?.completedAt
        : update.completedAt ?? undefined
  };

  preparePageRequests.set(update.requestId, nextRecord);
  return nextRecord;
}
