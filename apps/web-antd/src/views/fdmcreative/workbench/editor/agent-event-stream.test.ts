import { describe, expect, it, vi } from 'vitest';

import {
  createAgentEventStream,
  parseCreativeAgentEvent,
} from './agent-event-stream';

function sse(chunk: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' } },
  );
}

describe('agent event stream', () => {
  it('uses the shared resource transport while preserving a distinct event contract', async () => {
    const received: string[] = [];
    const event = {
      eventType: 'PLAN_READY',
      payloadJson: JSON.stringify({ runId: '2083489455964938241' }),
      sequenceNo: 3,
    };
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        sse(`id:3\nevent:PLAN_READY\ndata:${JSON.stringify(event)}\n\n`),
    );
    const stream = createAgentEventStream({
      agentRunId: '2083489455964938241',
      backfill: false,
      fetch: fetchMock,
      onEvent(value) {
        received.push(value.eventType);
        stream.close();
      },
    });

    await stream.done;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/fdmcreative/agent/run/events/stream?id=2083489455964938241&afterSequence=0',
    );
    expect(received).toEqual(['PLAN_READY']);
  });

  it('preserves authenticated headers and resumes from the durable cursor', async () => {
    const received: number[] = [];
    const first = {
      eventType: 'PLANNING_STARTED',
      payloadJson: JSON.stringify({ status: 'PLANNING' }),
      sequenceNo: 4,
    };
    const second = {
      eventType: 'PLAN_READY',
      payloadJson: JSON.stringify({ status: 'READY' }),
      sequenceNo: 5,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sse(`id:4\nevent:PLANNING_STARTED\ndata:${JSON.stringify(first)}\n\n`),
      )
      .mockResolvedValueOnce(
        sse(
          `id:4\nevent:PLANNING_STARTED\ndata:${JSON.stringify(first)}\n\n` +
            `id:5\nevent:PLAN_READY\ndata:${JSON.stringify(second)}\n\n`,
        ),
      );
    const stream = createAgentEventStream({
      agentRunId: '2083489455964938241',
      backfill: false,
      fetch: fetchMock,
      headers: {
        Authorization: 'Bearer access-token',
        'tenant-id': '9',
        'visit-tenant-id': '10',
      },
      maxReconnectAttempts: 1,
      onEvent(value) {
        received.push(value.sequenceNo);
        if (value.sequenceNo === 5) stream.close();
      },
      reconnectDelayMs: 0,
      reconnectJitter: 0,
    });

    await stream.done;
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer access-token');
    expect(firstHeaders.get('tenant-id')).toBe('9');
    expect(firstHeaders.get('visit-tenant-id')).toBe('10');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('afterSequence=4');
    expect(secondHeaders.get('Last-Event-ID')).toBe('4');
    expect(received).toEqual([4, 5]);
  });

  it('stops cleanly on Abort and does not retry a forbidden stream', async () => {
    const abortStream = createAgentEventStream({
      agentRunId: '44',
      backfill: false,
      fetch: vi.fn(async () => sse('')),
      onError(_error, context) {
        if (context.reconnecting) abortStream.close();
      },
      onEvent: vi.fn(),
      reconnectDelayMs: 10_000,
    });
    await expect(abortStream.done).resolves.toBeUndefined();

    const onError = vi.fn();
    const forbiddenStream = createAgentEventStream({
      agentRunId: '45',
      backfill: false,
      fetch: vi.fn(async () =>
        Response.json({ code: 403, msg: '没有权限' }, { status: 403 }),
      ),
      maxReconnectAttempts: 3,
      onError,
      onEvent: vi.fn(),
      reconnectDelayMs: 0,
    });
    await expect(forbiddenStream.done).rejects.toMatchObject({ status: 403 });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      { attempt: 1, reconnecting: false },
    );
  });

  it('rejects a payload that carries a temporary URL or credential-like field', () => {
    expect(() =>
      parseCreativeAgentEvent({
        data: JSON.stringify({
          eventType: 'MODEL_STATUS',
          payloadJson: JSON.stringify({ signedUrl: 'https://private.example' }),
          sequenceNo: 1,
        }),
        event: 'MODEL_STATUS',
        id: '1',
      }),
    ).toThrow('禁止字段');
  });
});
