import { describe, expect, it, vi } from 'vitest';

import { createDramaScriptEventStream } from './drama-script-event-stream';

function event(id: number, eventType = 'SCRIPT_PREVIEW_READY') {
  return {
    eventTime: '2026-08-18T16:30:00',
    eventType,
    id,
    payloadJson: JSON.stringify({ revisionNo: 3, status: 'PREVIEW' }),
  };
}

function sse(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' } },
  );
}

describe('drama script event stream', () => {
  it('uses the durable drama cursor and nested project/script identifiers', async () => {
    const received: number[] = [];
    const payload = event(5);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) =>
      sse(
        `id:${payload.id}\nevent:${payload.eventType}\ndata:${JSON.stringify(payload)}\n\n`,
      ),
    );
    const stream = createDramaScriptEventStream({
      afterSequence: 4,
      backfill: false,
      baseUrl: '/admin-api',
      fetch: fetchMock,
      onEvent(value) {
        received.push(value.sequenceNo);
        stream.close();
      },
      projectId: 7,
      scriptRevisionId: 9,
    });

    await stream.done;

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/admin-api/fdmcreative/drama/script/events/stream?projectId=7&scriptRevisionId=9&afterId=4',
    );
    expect(received).toEqual([5]);
    expect(stream.getCursor()).toBe(5);
  });

  it('backfills replayable event rows by id after the subscription is ready', async () => {
    const received: number[] = [];
    const first = event(1, 'SCRIPT_MODEL_SUBMITTED');
    const second = event(2, 'SCRIPT_PREVIEW_READY');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/stream?')) {
        return sse(
          `id:${first.id}\nevent:${first.eventType}\ndata:${JSON.stringify(first)}\n\n`,
          'event:ready\ndata:connected\n\n',
        );
      }
      return Response.json({ code: 0, data: [first, second], msg: '' });
    });
    const stream = createDramaScriptEventStream({
      fetch: fetchMock,
      onEvent(value) {
        received.push(value.sequenceNo);
        if (value.sequenceNo === 2) stream.close();
      },
      projectId: 7,
      scriptRevisionId: 9,
    });

    await stream.done;

    expect(received).toEqual([1, 2]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/fdmcreative/drama/script/events?projectId=7&scriptRevisionId=9&afterId=1',
    );
  });
});
