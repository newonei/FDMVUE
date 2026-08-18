import type { CreativeLongId } from './creative-long-id';
import type {
  RawSseMessage,
  SequencedSseEvent,
  SseEventStreamHandle,
  SseEventStreamOptions,
  SseEventStreamState,
} from './sse-event-stream';

import {
  assertSafeSsePayload,
  createSseEventStream,
  numericSequence,
  SseEventStreamProtocolError,
} from './sse-event-stream';

export type ExecutionEventStreamState = SseEventStreamState;
export type {
  SseEventStreamHandle as ExecutionEventStreamHandle,
  RawSseMessage,
};
export type ExecutionEventStreamErrorContext = import('./sse-event-stream').SseEventStreamErrorContext;

export type CreativeExecutionEvent<TPayload = unknown> =
  SequencedSseEvent<TPayload>;

export interface ExecutionEventStreamOptions
  extends Omit<
    SseEventStreamOptions<CreativeExecutionEvent>,
    | 'eventLabel'
    | 'parseEvent'
    | 'resourceId'
    | 'resourceIdParam'
    | 'streamPath'
  > {
  executionId: CreativeLongId | number;
  streamPath?: string;
}

export {
  SseEventStreamHttpError as ExecutionEventStreamHttpError,
  SseEventStreamProtocolError as ExecutionEventStreamProtocolError,
  SseParser,
} from './sse-event-stream';

const DEFAULT_STREAM_PATH = '/fdmcreative/execution/events/stream';
const DEFAULT_EVENTS_PATH = '/fdmcreative/execution/events';

export function parseCreativeExecutionEvent(
  message: RawSseMessage,
): CreativeExecutionEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(message.data);
  } catch (error) {
    throw new SseEventStreamProtocolError(
      `执行事件不是有效 JSON：${errorMessage(error)}`,
    );
  }
  if (!isRecord(raw)) {
    throw new SseEventStreamProtocolError('执行事件必须是 JSON 对象');
  }
  let sequenceNo: number;
  try {
    sequenceNo = numericSequence(raw.sequenceNo ?? message.id);
  } catch {
    throw new SseEventStreamProtocolError('执行事件缺少有效 sequenceNo');
  }
  const eventType =
    typeof raw.eventType === 'string' && raw.eventType.length > 0
      ? raw.eventType
      : message.event;
  if (!eventType || eventType === 'message') {
    throw new SseEventStreamProtocolError('执行事件缺少 eventType');
  }

  const event: CreativeExecutionEvent = { eventType, sequenceNo };
  if (typeof raw.createTime === 'string') {
    event.createTime = raw.createTime;
  }
  if (typeof raw.payloadJson === 'string') {
    event.payloadJson = raw.payloadJson;
    try {
      event.payload = JSON.parse(raw.payloadJson);
      assertSafeSsePayload(event.payload);
    } catch (error) {
      if (error instanceof SseEventStreamProtocolError) {
        throw error;
      }
      throw new SseEventStreamProtocolError(
        `执行事件 payloadJson 不是有效 JSON：${errorMessage(error)}`,
      );
    }
  }
  return event;
}

/**
 * Execution-specific facade over the shared durable SSE transport. Its URL, cursor semantics and
 * callback contract remain unchanged for current workbench callers.
 */
export function createExecutionEventStream(
  options: ExecutionEventStreamOptions,
): SseEventStreamHandle {
  const { executionId, streamPath, ...transportOptions } = options;
  return createSseEventStream({
    ...transportOptions,
    eventLabel: '执行事件',
    eventsPath: transportOptions.eventsPath ?? DEFAULT_EVENTS_PATH,
    parseEvent: parseCreativeExecutionEvent,
    resourceId: executionId,
    resourceIdParam: 'id',
    streamPath: streamPath ?? DEFAULT_STREAM_PATH,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
