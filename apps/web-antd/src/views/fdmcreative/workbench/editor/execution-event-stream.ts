export type ExecutionEventStreamState =
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

export interface CreativeExecutionEvent<TPayload = unknown> {
  createTime?: string;
  eventType: string;
  payload?: TPayload;
  payloadJson?: string;
  sequenceNo: number;
}

export interface ExecutionEventStreamErrorContext {
  attempt: number;
  reconnecting: boolean;
}

type MaybePromise<T> = Promise<T> | T;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ExecutionEventStreamOptions {
  /** API prefix, for example `/admin-api`. */
  baseUrl?: string;
  /** Resume cursor. Events at or below this sequence are ignored. */
  afterSequence?: number;
  /** Fetch persisted events after `ready` and whenever a sequence gap is seen. */
  backfill?: boolean;
  credentials?: RequestCredentials;
  eventsPath?: string;
  executionId: number;
  fetch?: FetchLike;
  headers?: (() => MaybePromise<HeadersInit>) | HeadersInit;
  maxReconnectAttempts?: number;
  maxReconnectDelayMs?: number;
  onCursorChange?: (sequenceNo: number) => void;
  onError?: (error: Error, context: ExecutionEventStreamErrorContext) => void;
  onEvent: (
    event: CreativeExecutionEvent,
    message: RawSseMessage,
  ) => MaybePromise<void>;
  onInvalidEvent?: (error: Error, message: RawSseMessage) => void;
  onReady?: () => MaybePromise<void>;
  onStateChange?: (state: ExecutionEventStreamState) => void;
  random?: () => number;
  reconnectDelayMs?: number;
  reconnectJitter?: number;
  signal?: AbortSignal;
  streamPath?: string;
}

export interface ExecutionEventStreamHandle {
  close: () => void;
  readonly done: Promise<void>;
  getCursor: () => number;
  getLastEventId: () => string | undefined;
  getState: () => ExecutionEventStreamState;
}

const DEFAULT_STREAM_PATH = '/fdmcreative/execution/events/stream';
const DEFAULT_EVENTS_PATH = '/fdmcreative/execution/events';

export class ExecutionEventStreamHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'ExecutionEventStreamHttpError';
  }
}

export class ExecutionEventStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionEventStreamProtocolError';
  }
}

/**
 * Incremental parser for the subset of the SSE grammar used by Spring's
 * SseEmitter. It also accepts multiline data and chunk boundaries inside a
 * field so it remains reusable if the backend starts sending richer events.
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

export function parseCreativeExecutionEvent(
  message: RawSseMessage,
): CreativeExecutionEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(message.data);
  } catch (error) {
    throw new ExecutionEventStreamProtocolError(
      `执行事件不是有效 JSON：${errorMessage(error)}`,
    );
  }
  if (!isRecord(raw)) {
    throw new ExecutionEventStreamProtocolError('执行事件必须是 JSON 对象');
  }
  const sequenceNo = numericSequence(raw.sequenceNo ?? message.id);
  const eventType =
    typeof raw.eventType === 'string' && raw.eventType.length > 0
      ? raw.eventType
      : message.event;
  if (!eventType || eventType === 'message') {
    throw new ExecutionEventStreamProtocolError('执行事件缺少 eventType');
  }

  const event: CreativeExecutionEvent = { eventType, sequenceNo };
  if (typeof raw.createTime === 'string') {
    event.createTime = raw.createTime;
  }
  if (typeof raw.payloadJson === 'string') {
    event.payloadJson = raw.payloadJson;
    try {
      event.payload = JSON.parse(raw.payloadJson);
    } catch (error) {
      throw new ExecutionEventStreamProtocolError(
        `执行事件 payloadJson 不是有效 JSON：${errorMessage(error)}`,
      );
    }
  }
  return event;
}

export function createExecutionEventStream(
  options: ExecutionEventStreamOptions,
): ExecutionEventStreamHandle {
  if (!Number.isSafeInteger(options.executionId) || options.executionId <= 0) {
    throw new TypeError('executionId 必须是正整数');
  }
  const initialCursor = options.afterSequence ?? 0;
  if (!Number.isSafeInteger(initialCursor) || initialCursor < 0) {
    throw new TypeError('afterSequence 必须是非负整数');
  }

  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error('当前环境不支持 fetch');
  }

  const lifecycle = new AbortController();
  let cursor = initialCursor;
  let state: ExecutionEventStreamState = 'closed';
  let reconnectAttempts = 0;
  let serverReconnectDelay: number | undefined;
  let removeExternalAbortListener: (() => void) | undefined;

  const setState = (next: ExecutionEventStreamState) => {
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

  const dispatchExecutionEvent = async (
    event: CreativeExecutionEvent,
    message: RawSseMessage,
  ) => {
    if (event.sequenceNo <= cursor) return;
    cursor = event.sequenceNo;
    options.onCursorChange?.(cursor);
    await options.onEvent(event, message);
  };

  const fetchBacklog = async () => {
    if (options.backfill === false || lifecycle.signal.aborted) return;
    const url = withExecutionQuery(
      joinUrl(options.baseUrl, options.eventsPath ?? DEFAULT_EVENTS_PATH),
      options.executionId,
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
      throw await httpError(response, '补拉执行事件失败');
    }
    const body = await response.json();
    const rows = persistedEvents(body).toSorted(
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
        await dispatchExecutionEvent(
          parseCreativeExecutionEvent(message),
          message,
        );
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
      // The backend queries the backlog immediately before registering the
      // SseEmitter. This second persisted read closes that small race window.
      await fetchBacklog();
      await options.onReady?.();
      return;
    }
    let event: CreativeExecutionEvent;
    try {
      event = parseCreativeExecutionEvent(message);
    } catch (error) {
      reportInvalidEvent(error, message);
      return;
    }
    if (event.sequenceNo > cursor + 1 && options.backfill !== false) {
      await fetchBacklog();
    }
    await dispatchExecutionEvent(event, message);
  };

  const connect = async () => {
    setState(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    const url = withExecutionQuery(
      joinUrl(options.baseUrl, options.streamPath ?? DEFAULT_STREAM_PATH),
      options.executionId,
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
      throw await httpError(response, '订阅执行事件失败');
    }
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (!contentType?.includes('text/event-stream')) {
      const responseText = await response.text();
      const body = responseText.slice(0, 1000);
      throw new ExecutionEventStreamProtocolError(
        `执行事件接口返回了非 SSE 响应${body ? `：${body}` : ''}`,
      );
    }
    if (!response.body) {
      throw new ExecutionEventStreamProtocolError('执行事件响应没有可读流');
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
        throw new Error('执行事件流已断开');
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function httpError(
  response: Response,
  prefix: string,
): Promise<ExecutionEventStreamHttpError> {
  let body = '';
  try {
    const responseText = await response.text();
    body = responseText.slice(0, 1000);
  } catch {
    // The status still contains enough information for callers.
  }
  return new ExecutionEventStreamHttpError(
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
  if (error instanceof ExecutionEventStreamProtocolError) return false;
  if (error instanceof ExecutionEventStreamHttpError) {
    return (
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  return true;
}

function joinUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl ?? '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function numericSequence(value: unknown): number {
  const sequenceNo =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof sequenceNo !== 'number' ||
    !Number.isSafeInteger(sequenceNo) ||
    sequenceNo <= 0
  ) {
    throw new ExecutionEventStreamProtocolError('执行事件缺少有效 sequenceNo');
  }
  return sequenceNo;
}

function persistedEvents(body: unknown): Record<string, unknown>[] {
  let data: unknown;
  if (Array.isArray(body)) {
    data = body;
  } else if (isRecord(body) && body.code === 0) {
    data = body.data;
  }
  if (!Array.isArray(data) || !data.every((row) => isRecord(row))) {
    throw new ExecutionEventStreamProtocolError('执行事件补拉响应格式无效');
  }
  return data;
}

function reconnectDelay(
  options: ExecutionEventStreamOptions,
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

function withExecutionQuery(
  url: string,
  executionId: number,
  afterSequence: number,
): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}id=${encodeURIComponent(executionId)}&afterSequence=${encodeURIComponent(afterSequence)}`;
}
