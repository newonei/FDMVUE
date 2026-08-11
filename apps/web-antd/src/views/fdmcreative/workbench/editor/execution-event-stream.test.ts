import { describe, expect, it, vi } from 'vitest';

import {
  createExecutionEventStream,
  SseParser,
} from './execution-event-stream';

function event(
  sequenceNo: number,
  eventType = 'NODE_RUNNING',
  payload?: Record<string, unknown>,
) {
  return {
    eventType,
    payloadJson: JSON.stringify(payload ?? { nodeRunId: sequenceNo }),
    sequenceNo,
  };
}

function sse(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' } },
  );
}

function sseEvent(value: ReturnType<typeof event>) {
  return `id:${value.sequenceNo}\nevent:${value.eventType}\ndata:${JSON.stringify(value)}\n\n`;
}

describe('sse parser', () => {
  it('parses CRLF, chunked fields, comments, multiline data and retry', () => {
    const parser = new SseParser();
    expect(parser.push('\uFEFF: keepalive\r\nid: 7\r\nevent: NODE_')).toEqual(
      [],
    );
    expect(
      parser.push('RUNNING\r\nretry: 2500\r\ndata: {"a":\r\ndata: 1}\r\n\r\n'),
    ).toEqual([
      {
        data: '{"a":\n1}',
        event: 'NODE_RUNNING',
        id: '7',
        retry: 2500,
      },
    ]);
    expect(parser.getReconnectDelay()).toBe(2500);
  });
});

describe('createExecutionEventStream', () => {
  it('sends auth and tenant headers, parses payloadJson, and closes cleanly', async () => {
    const received: unknown[] = [];
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        sse(sseEvent(event(3))),
    );
    const stream = createExecutionEventStream({
      afterSequence: 2,
      backfill: false,
      baseUrl: '/admin-api',
      executionId: 42,
      fetch: fetchMock,
      headers: {
        Authorization: 'Bearer access-token',
        'tenant-id': '9',
        'visit-tenant-id': '10',
      },
      onEvent(value) {
        received.push(value);
        stream.close();
      },
    });

    await stream.done;
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe(
      '/admin-api/fdmcreative/execution/events/stream?id=42&afterSequence=2',
    );
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('tenant-id')).toBe('9');
    expect(headers.get('visit-tenant-id')).toBe('10');
    expect(headers.get('Last-Event-ID')).toBe('2');
    expect(received).toEqual([
      expect.objectContaining({
        eventType: 'NODE_RUNNING',
        payload: { nodeRunId: 3 },
        sequenceNo: 3,
      }),
    ]);
    expect(stream.getCursor()).toBe(3);
    expect(stream.getState()).toBe('closed');
  });

  it('resumes with the latest cursor and deduplicates replayed events', async () => {
    const received: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse(sseEvent(event(1))))
      .mockResolvedValueOnce(
        sse(sseEvent(event(1)), sseEvent(event(2, 'NODE_SUCCEEDED'))),
      );
    const stream = createExecutionEventStream({
      backfill: false,
      executionId: 7,
      fetch: fetchMock,
      maxReconnectAttempts: 1,
      onEvent(value) {
        received.push(value.sequenceNo);
        if (value.sequenceNo === 2) stream.close();
      },
      reconnectDelayMs: 0,
      reconnectJitter: 0,
    });

    await stream.done;
    expect(received).toEqual([1, 2]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('afterSequence=1');
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Last-Event-ID'),
    ).toBe('1');
  });

  it('backfills after ready to close the backend subscribe race window', async () => {
    const received: number[] = [];
    const first = event(1);
    const second = event(2, 'NODE_SUCCEEDED');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/events/stream')) {
        return sse(sseEvent(first), 'event:ready\ndata:connected\n\n');
      }
      return Response.json({ code: 0, data: [first, second], msg: '' });
    });
    const stream = createExecutionEventStream({
      executionId: 11,
      fetch: fetchMock,
      onEvent(value) {
        received.push(value.sequenceNo);
        if (value.sequenceNo === 2) stream.close();
      },
    });

    await stream.done;
    expect(received).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/fdmcreative/execution/events?id=11&afterSequence=1',
    );
  });

  it('does not reconnect non-retryable authorization failures', async () => {
    const onError = vi.fn();
    const stream = createExecutionEventStream({
      executionId: 12,
      fetch: vi.fn(async () =>
        Response.json({ code: 401, msg: '账号未登录' }, { status: 401 }),
      ),
      maxReconnectAttempts: 3,
      onError,
      onEvent: vi.fn(),
      reconnectDelayMs: 0,
    });

    await expect(stream.done).rejects.toMatchObject({ status: 401 });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      { attempt: 1, reconnecting: false },
    );
  });

  it('settles cleanly when closed during reconnect backoff', async () => {
    const stream = createExecutionEventStream({
      backfill: false,
      executionId: 13,
      fetch: vi.fn(async () => sse()),
      onError(_error, context) {
        expect(context.reconnecting).toBe(true);
        stream.close();
      },
      onEvent: vi.fn(),
      reconnectDelayMs: 10_000,
    });

    await expect(stream.done).resolves.toBeUndefined();
    expect(stream.getState()).toBe('closed');
  });
});
