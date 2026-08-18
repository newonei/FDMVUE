import type { CreativeLongId } from './creative-long-id';

import { requireCreativeLongId } from './creative-long-id';

export type SseEventStreamState =
  | 'closed'
  | 'connecting'
  | 'open'
  | 'reconnecting';

export interface RawSseMessage {
  data: string;
  event: string;
  id?: string;
  retry?: number;
}

export interface SequencedSseEvent<TPayload = unknown> {
  createTime?: string;
  eventType: string;
  payload?: TPayload;
  payloadJson?: string;
  sequenceNo: number;
}

export interface SseEventStreamErrorContext {
  attempt: number;
  reconnecting: boolean;
}

export type MaybePromise<T> = Promise<T> | T;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SseEventStreamOptions<
  TEvent extends SequencedSseEvent = SequencedSseEvent,
> {
  /** API prefix, for example `/admin-api`. */
  baseUrl?: string;
  /** Resume cursor. Events at or below this sequence are ignored. */
  afterSequence?: number;
  /** Fetch persisted events after `ready` and whenever a sequence gap is seen. */
  backfill?: boolean;
  credentials?: RequestCredentials;
  /** Human-readable text used only in transport errors. */
  eventLabel?: string;
  /** Optional durable-event endpoint. Without it, the stream has no backfill request. */
  eventsPath?: string;
  fetch?: FetchLike;
  headers?: (() => MaybePromise<HeadersInit>) | HeadersInit;
  maxReconnectAttempts?: number;
  maxReconnectDelayMs?: number;
  onCursorChange?: (sequenceNo: number) => void;
  onError?: (error: Error, context: SseEventStreamErrorContext) => void;
  onEvent: (event: TEvent, message: RawSseMessage) => MaybePromise<void>;
  onInvalidEvent?: (error: Error, message: RawSseMessage) => void;
  onReady?: () => MaybePromise<void>;
  onStateChange?: (state: SseEventStreamState) => void;
  /** JSON response parser for the durable-event endpoint. */
  parsePersistedEvents?: (
    body: unknown,
  ) => readonly Record<string, unknown>[];
  /** Converts a raw SSE data message into the resource-specific event contract. */
  parseEvent: (message: RawSseMessage) => TEvent;
  random?: () => number;
  reconnectDelayMs?: number;
  reconnectJitter?: number;
  /** Resource key stays a string where it originates from a Java Long. */
  resourceId: CreativeLongId | number;
  /** Query parameter that carries `resourceId`; defaults to `id`. */
  resourceIdParam?: string;
  signal?: AbortSignal;
  streamPath: string;
}

export interface SseEventStreamHandle {
  close: () => void;
  readonly done: Promise<void>;
  getCursor: () => number;
  getLastEventId: () => string | undefined;
  getState: () => SseEventStreamState;
}

export class SseEventStreamHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'SseEventStreamHttpError';
  }
}

export class SseEventStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SseEventStreamProtocolError';
  }
}

/**
 * Incremental parser for the SSE grammar used by Spring's SseEmitter. It handles multiline data,
 * CRLF and field values split across chunks so each product stream shares one proven parser.
 */
export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventType = '';
  private firstChunk = true;
  private lastEventId: string | undefined;
  private reconnectDelay: number | undefined;

  finish(): RawSseMessage[] {
    const messages: RawSseMessage[] = [];
    if (this.buffer.length > 0) {
      this.processLine(this.buffer.replace(/\r$/, ''), messages);
      this.buffer = '';
    }
    this.dispatch(messages);
    return messages;
  }

  getLastEventId(): string | undefined {
    return this.lastEventId;
  }

  getReconnectDelay(): number | undefined {
    return this.reconnectDelay;
  }

  push(chunk: string): RawSseMessage[] {
    if (this.firstChunk) {
      this.firstChunk = false;
      chunk = chunk.replace(/^\uFEFF/, '');
    }
    this.buffer += chunk;
    const messages: RawSseMessage[] = [];
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.processLine(line, messages);
      newlineIndex = this.buffer.indexOf('\n');
    }
    return messages;
  }

  private dispatch(messages: RawSseMessage[]) {
    if (this.dataLines.length === 0) {
      this.eventType = '';
      return;
    }
    const message: RawSseMessage = {
      data: this.dataLines.join('\n'),
      event: this.eventType || 'message',
    };
    if (this.lastEventId !== undefined) {
      message.id = this.lastEventId;
    }
    if (this.reconnectDelay !== undefined) {
      message.retry = this.reconnectDelay;
    }
    messages.push(message);
    this.dataLines = [];
    this.eventType = '';
  }

  private processLine(line: string, messages: RawSseMessage[]) {
    if (line === '') {
      this.dispatch(messages);
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    switch (field) {
      case 'data': {
        this.dataLines.push(value);
        break;
      }
      case 'event': {
        this.eventType = value;
        break;
      }
      case 'id': {
        if (!value.includes('\0')) {
          this.lastEventId = value;
        }
        break;
      }
      case 'retry': {
        if (/^\d+$/.test(value)) {
          this.reconnectDelay = Number(value);
        }
        break;
      }
    }
  }
}

/**
 * A resource-neutral durable SSE transport. It owns cursor propagation, reconnect backoff,
 * persisted-event backfill, duplicate filtering and Abort handling. Product streams provide only
 * their endpoint paths and contract parser.
 */
export function createSseEventStream<
  TEvent extends SequencedSseEvent = SequencedSseEvent,
>(options: SseEventStreamOptions<TEvent>): SseEventStreamHandle {
  const resourceId = requireCreativeLongId(options.resourceId, 'resourceId');
  const resourceIdParam = options.resourceIdParam ?? 'id';
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(resourceIdParam)) {
    throw new TypeError('resourceIdParam 必须是合法查询参数名称');
  }
  const initialCursor = options.afterSequence ?? 0;
  if (!Number.isSafeInteger(initialCursor) || initialCursor < 0) {
    throw new TypeError('afterSequence 必须是非负整数');
  }

  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error('当前环境不支持 fetch');
  }

  const label = options.eventLabel ?? '事件';
  const lifecycle = new AbortController();
  let cursor = initialCursor;
  let state: SseEventStreamState = 'closed';
  let reconnectAttempts = 0;
  let serverReconnectDelay: number | undefined;
  let removeExternalAbortListener: (() => void) | undefined;

  const setState = (next: SseEventStreamState) => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  if (options.signal) {
    const abortFromExternalSignal = () =>
      lifecycle.abort(options.signal?.reason);
    if (options.signal.aborted) {
      abortFromExternalSignal();
    } else {
      options.signal.addEventListener('abort', abortFromExternalSignal, {
        once: true,
      });
      removeExternalAbortListener = () =>
        options.signal?.removeEventListener('abort', abortFromExternalSignal);
    }
  }

  const resolveHeaders = async (accept: string) => {
    const configured =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers;
    const headers = new Headers(configured);
    headers.set('Accept', accept);
    headers.set('Cache-Control', 'no-cache');
    if (cursor > 0) {
      headers.set('Last-Event-ID', String(cursor));
    } else {
      headers.delete('Last-Event-ID');
    }
    return headers;
  };

  const reportInvalidEvent = (error: unknown, message: RawSseMessage) => {
    options.onInvalidEvent?.(asError(error), message);
  };

  const dispatchEvent = async (event: TEvent, message: RawSseMessage) => {
    if (event.sequenceNo <= cursor) return;
    cursor = event.sequenceNo;
    options.onCursorChange?.(cursor);
    await options.onEvent(event, message);
  };

  const fetchBacklog = async () => {
    if (
      options.backfill === false ||
      !options.eventsPath ||
      lifecycle.signal.aborted
    ) {
      return;
    }
    const url = withCursorQuery(
      joinUrl(options.baseUrl, options.eventsPath),
      resourceIdParam,
      resourceId,
      cursor,
    );
    const headers = await resolveHeaders('application/json');
    headers.delete('Last-Event-ID');
    const response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: options.credentials ?? 'same-origin',
      headers,
      method: 'GET',
      signal: lifecycle.signal,
    });
    if (!response.ok) {
      throw await httpError(response, `补拉${label}失败`);
    }
    const body = await response.json();
    const rows = (options.parsePersistedEvents ?? parsePersistedEvents)(body).toSorted(
      (left, right) =>
        numericSequence(left.sequenceNo) - numericSequence(right.sequenceNo),
    );
    for (const row of rows) {
      const message: RawSseMessage = {
        data: JSON.stringify(row),
        event: typeof row.eventType === 'string' ? row.eventType : 'message',
        id: String(row.sequenceNo ?? ''),
      };
      try {
        await dispatchEvent(options.parseEvent(message), message);
      } catch (error) {
        reportInvalidEvent(error, message);
      }
    }
  };

  const processMessage = async (message: RawSseMessage) => {
    if (message.retry !== undefined) {
      serverReconnectDelay = message.retry;
    }
    if (message.event === 'ready') {
      // A persisted read after subscription closes the backend registration race window.
      await fetchBacklog();
      await options.onReady?.();
      return;
    }
    let event: TEvent;
    try {
      event = options.parseEvent(message);
    } catch (error) {
      reportInvalidEvent(error, message);
      return;
    }
    if (event.sequenceNo > cursor + 1 && options.backfill !== false) {
      await fetchBacklog();
    }
    await dispatchEvent(event, message);
  };

  const connect = async () => {
    setState(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    const url = withCursorQuery(
      joinUrl(options.baseUrl, options.streamPath),
      resourceIdParam,
      resourceId,
      cursor,
    );
    const response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: options.credentials ?? 'same-origin',
      headers: await resolveHeaders('text/event-stream'),
      method: 'GET',
      signal: lifecycle.signal,
    });
    if (!response.ok) {
      throw await httpError(response, `订阅${label}失败`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (!contentType?.includes('text/event-stream')) {
      const responseText = await response.text();
      const body = responseText.slice(0, 1000);
      throw new SseEventStreamProtocolError(
        `${label}接口返回了非 SSE 响应${body ? `：${body}` : ''}`,
      );
    }
    if (!response.body) {
      throw new SseEventStreamProtocolError(`${label}响应没有可读流`);
    }

    setState('open');
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    try {
      while (!lifecycle.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        const messages = parser.push(decoder.decode(value, { stream: true }));
        for (const message of messages) {
          await processMessage(message);
        }
      }
      if (!lifecycle.signal.aborted) {
        const messages = [...parser.push(decoder.decode()), ...parser.finish()];
        for (const message of messages) {
          await processMessage(message);
        }
        serverReconnectDelay = parser.getReconnectDelay();
        throw new Error(`${label}流已断开`);
      }
    } finally {
      reader.releaseLock();
    }
  };

  const run = async () => {
    try {
      while (!lifecycle.signal.aborted) {
        try {
          await connect();
        } catch (error) {
          if (lifecycle.signal.aborted || isAbortError(error)) return;
          const normalized = asError(error);
          const nextAttempt = reconnectAttempts + 1;
          const reconnecting =
            isRetryable(normalized) &&
            nextAttempt <= (options.maxReconnectAttempts ?? Infinity);
          options.onError?.(normalized, {
            attempt: nextAttempt,
            reconnecting,
          });
          if (!reconnecting) {
            throw normalized;
          }
          reconnectAttempts = nextAttempt;
          setState('reconnecting');
          try {
            await abortableDelay(
              reconnectDelay(options, reconnectAttempts, serverReconnectDelay),
              lifecycle.signal,
            );
          } catch (delayError) {
            if (lifecycle.signal.aborted || isAbortError(delayError)) return;
            throw delayError;
          }
        }
      }
    } finally {
      removeExternalAbortListener?.();
      setState('closed');
    }
  };

  const done = run();
  return {
    close: () => lifecycle.abort(),
    done,
    getCursor: () => cursor,
    getLastEventId: () => (cursor > 0 ? String(cursor) : undefined),
    getState: () => state,
  };
}

export function numericSequence(value: unknown): number {
  const sequenceNo =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof sequenceNo !== 'number' ||
    !Number.isSafeInteger(sequenceNo) ||
    sequenceNo <= 0
  ) {
    throw new SseEventStreamProtocolError('事件缺少有效 sequenceNo');
  }
  return sequenceNo;
}

/** Reject data that should be represented by a stable FDM id, not an SSE payload. */
export function assertSafeSsePayload(value: unknown, location = 'payload'): void {
  if (value === null || value === undefined || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeSsePayload(item, `${location}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) {
    throw new SseEventStreamProtocolError(`${location} 必须是 JSON 值`);
  }
  for (const [field, nested] of Object.entries(value)) {
    if (isSensitiveEventField(field)) {
      throw new SseEventStreamProtocolError(
        `${location} 包含禁止字段：${field}`,
      );
    }
    assertSafeSsePayload(nested, `${location}.${field}`);
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(abortError());
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function httpError(
  response: Response,
  prefix: string,
): Promise<SseEventStreamHttpError> {
  let body = '';
  try {
    const responseText = await response.text();
    body = responseText.slice(0, 1000);
  } catch {
    // The status still contains enough information for callers.
  }
  return new SseEventStreamHttpError(
    `${prefix}（HTTP ${response.status}）${body ? `：${body}` : ''}`,
    response.status,
    body || undefined,
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryable(error: Error): boolean {
  if (error instanceof SseEventStreamProtocolError) return false;
  if (error instanceof SseEventStreamHttpError) {
    return (
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  return true;
}

function isSensitiveEventField(fieldName: string): boolean {
  const normalized = fieldName
    .toLowerCase()
    .replaceAll('_', '')
    .replaceAll('-', '');
  return (
    normalized.includes('apikey') ||
    normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('providertask') ||
    normalized.includes('signedurl') ||
    normalized.includes('presigned') ||
    normalized.endsWith('url') ||
    normalized.endsWith('path')
  );
}

function joinUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl ?? '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function parsePersistedEvents(body: unknown): Record<string, unknown>[] {
  let data: unknown;
  if (Array.isArray(body)) {
    data = body;
  } else if (isRecord(body) && body.code === 0) {
    data = body.data;
  }
  if (!Array.isArray(data) || !data.every((row) => isRecord(row))) {
    throw new SseEventStreamProtocolError('事件补拉响应格式无效');
  }
  return data;
}

function reconnectDelay<TEvent extends SequencedSseEvent>(
  options: SseEventStreamOptions<TEvent>,
  attempt: number,
  serverDelay: number | undefined,
): number {
  const base = Math.max(0, serverDelay ?? options.reconnectDelayMs ?? 1000);
  const maximum = Math.max(base, options.maxReconnectDelayMs ?? 30_000);
  const exponential = Math.min(maximum, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.min(1, Math.max(0, options.reconnectJitter ?? 0.2));
  const random = options.random ?? Math.random;
  return Math.max(
    0,
    Math.round(exponential * (1 + (random() * 2 - 1) * jitter)),
  );
}

function withCursorQuery(
  url: string,
  resourceIdParam: string,
  resourceId: CreativeLongId,
  afterSequence: number,
): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${resourceIdParam}=${encodeURIComponent(resourceId)}&afterSequence=${encodeURIComponent(afterSequence)}`;
}
