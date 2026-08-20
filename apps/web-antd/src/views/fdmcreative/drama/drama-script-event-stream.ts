import type { CreativeLongId } from '../workbench/editor/creative-long-id';
import type {
  RawSseMessage,
  SequencedSseEvent,
  SseEventStreamHandle,
  SseEventStreamOptions,
} from '../workbench/editor/sse-event-stream';

import {
  assertSafeSsePayload,
  createSseEventStream,
  numericSequence,
  SseEventStreamProtocolError,
} from '../workbench/editor/sse-event-stream';

export const DRAMA_SCRIPT_EVENT_TYPES = [
  'SCRIPT_CREATED',
  'SCRIPT_FAILED',
  'SCRIPT_GENERATION_STARTED',
  'SCRIPT_MODEL_SUBMITTED',
  'SCRIPT_PREVIEW_READY',
  'SCRIPT_CONFIRMED',
] as const;

export type DramaScriptEventType = (typeof DRAMA_SCRIPT_EVENT_TYPES)[number];

export interface DramaScriptEvent<
  TPayload = unknown,
> extends SequencedSseEvent<TPayload> {
  eventType: DramaScriptEventType;
  eventTime?: string;
}

export interface DramaScriptEventStreamOptions extends Omit<
  SseEventStreamOptions<DramaScriptEvent>,
  | 'cursorParam'
  | 'eventLabel'
  | 'eventsPath'
  | 'parseEvent'
  | 'parsePersistedEvents'
  | 'queryParameters'
  | 'resourceId'
  | 'resourceIdParam'
  | 'streamPath'
> {
  projectId: CreativeLongId | number;
  scriptRevisionId: CreativeLongId | number;
}

const EVENTS_PATH = '/fdmcreative/drama/script/events';
const STREAM_PATH = '/fdmcreative/drama/script/events/stream';

export function createDramaScriptEventStream(
  options: DramaScriptEventStreamOptions,
): SseEventStreamHandle {
  const { projectId, scriptRevisionId, ...transportOptions } = options;
  return createSseEventStream({
    ...transportOptions,
    cursorParam: 'afterId',
    eventLabel: '短剧剧本事件',
    eventsPath: EVENTS_PATH,
    parseEvent: parseDramaScriptEvent,
    parsePersistedEvents: parsePersistedDramaScriptEvents,
    queryParameters: { projectId },
    resourceId: scriptRevisionId,
    resourceIdParam: 'scriptRevisionId',
    streamPath: STREAM_PATH,
  });
}

export function parseDramaScriptEvent(
  message: RawSseMessage,
): DramaScriptEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(message.data);
  } catch (error) {
    throw new SseEventStreamProtocolError(
      `短剧剧本事件不是有效 JSON：${errorMessage(error)}`,
    );
  }
  if (!isRecord(raw)) {
    throw new SseEventStreamProtocolError('短剧剧本事件必须是 JSON 对象');
  }
  const eventType =
    typeof raw.eventType === 'string' && raw.eventType.length > 0
      ? raw.eventType
      : message.event;
  if (!isDramaScriptEventType(eventType)) {
    throw new SseEventStreamProtocolError(
      `短剧剧本事件类型不受支持：${eventType}`,
    );
  }
  let sequenceNo: number;
  try {
    sequenceNo = numericSequence(raw.id ?? raw.sequenceNo ?? message.id);
  } catch {
    throw new SseEventStreamProtocolError('短剧剧本事件缺少有效 id');
  }
  const event: DramaScriptEvent = { eventType, sequenceNo };
  if (typeof raw.eventTime === 'string') {
    event.eventTime = raw.eventTime;
    event.createTime = raw.eventTime;
  }
  if (typeof raw.payloadJson === 'string') {
    event.payloadJson = raw.payloadJson;
    try {
      event.payload = JSON.parse(raw.payloadJson);
      assertSafeSsePayload(event.payload);
    } catch (error) {
      if (error instanceof SseEventStreamProtocolError) throw error;
      throw new SseEventStreamProtocolError(
        `短剧剧本事件 payloadJson 不是有效 JSON：${errorMessage(error)}`,
      );
    }
  }
  return event;
}

function parsePersistedDramaScriptEvents(
  body: unknown,
): readonly Record<string, unknown>[] {
  const rows = isRecord(body) && body.code === 0 ? body.data : body;
  if (!Array.isArray(rows)) {
    throw new SseEventStreamProtocolError('短剧剧本事件补拉响应格式无效');
  }
  return rows.map((row) => {
    if (!isRecord(row)) {
      throw new SseEventStreamProtocolError('短剧剧本事件补拉项格式无效');
    }
    return { ...row, sequenceNo: row.id };
  });
}

function isDramaScriptEventType(value: string): value is DramaScriptEventType {
  return (DRAMA_SCRIPT_EVENT_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
