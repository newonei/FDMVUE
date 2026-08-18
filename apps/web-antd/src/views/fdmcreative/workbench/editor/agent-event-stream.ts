import type { CreativeLongId } from './creative-long-id';
import type {
  RawSseMessage,
  SequencedSseEvent,
  SseEventStreamHandle,
  SseEventStreamOptions,
} from './sse-event-stream';

import {
  assertSafeSsePayload,
  createSseEventStream,
  numericSequence,
  SseEventStreamProtocolError,
} from './sse-event-stream';

export type AgentEventStreamState = import('./sse-event-stream').SseEventStreamState;
export type {
  SseEventStreamHandle as AgentEventStreamHandle,
  RawSseMessage,
};
export type AgentEventStreamErrorContext = import('./sse-event-stream').SseEventStreamErrorContext;

/**
 * Agent has its own durable event vocabulary. P1 supplies the matching API and persistence while
 * this contract already reuses the same authenticated, cursor-aware SSE transport as execution.
 */
export const CREATIVE_AGENT_EVENT_TYPES = [
  'APPLIED',
  'CANCELED',
  'CONFLICT',
  'EXECUTION_LINKED',
  'FAILED',
  'MODEL_STATUS',
  'PLAN_READY',
  'PLANNING_STARTED',
  'RUN_CREATED',
] as const;

export type CreativeAgentEventType =
  (typeof CREATIVE_AGENT_EVENT_TYPES)[number];

export interface CreativeAgentEvent<TPayload = unknown>
  extends SequencedSseEvent<TPayload> {
  eventType: CreativeAgentEventType;
}

export interface AgentEventStreamOptions
  extends Omit<
    SseEventStreamOptions<CreativeAgentEvent>,
    | 'eventLabel'
    | 'parseEvent'
    | 'resourceId'
    | 'resourceIdParam'
    | 'streamPath'
  > {
  agentRunId: CreativeLongId | number;
  streamPath?: string;
}

const DEFAULT_AGENT_STREAM_PATH = '/fdmcreative/agent/run/events/stream';
const DEFAULT_AGENT_EVENTS_PATH = '/fdmcreative/agent/run/events';

export function createAgentEventStream(
  options: AgentEventStreamOptions,
): SseEventStreamHandle {
  const { agentRunId, streamPath, ...transportOptions } = options;
  return createSseEventStream({
    ...transportOptions,
    eventLabel: 'Agent 事件',
    eventsPath: transportOptions.eventsPath ?? DEFAULT_AGENT_EVENTS_PATH,
    parseEvent: parseCreativeAgentEvent,
    resourceId: agentRunId,
    resourceIdParam: 'id',
    streamPath: streamPath ?? DEFAULT_AGENT_STREAM_PATH,
  });
}

export function parseCreativeAgentEvent(
  message: RawSseMessage,
): CreativeAgentEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(message.data);
  } catch (error) {
    throw new SseEventStreamProtocolError(
      `Agent 事件不是有效 JSON：${errorMessage(error)}`,
    );
  }
  if (!isRecord(raw)) {
    throw new SseEventStreamProtocolError('Agent 事件必须是 JSON 对象');
  }
  let sequenceNo: number;
  try {
    sequenceNo = numericSequence(raw.sequenceNo ?? message.id);
  } catch {
    throw new SseEventStreamProtocolError('Agent 事件缺少有效 sequenceNo');
  }
  const eventType =
    typeof raw.eventType === 'string' && raw.eventType.length > 0
      ? raw.eventType
      : message.event;
  if (!isAgentEventType(eventType)) {
    throw new SseEventStreamProtocolError(`Agent 事件类型不受支持：${eventType}`);
  }

  const event: CreativeAgentEvent = { eventType, sequenceNo };
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
        `Agent 事件 payloadJson 不是有效 JSON：${errorMessage(error)}`,
      );
    }
  }
  return event;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAgentEventType(value: string): value is CreativeAgentEventType {
  return (CREATIVE_AGENT_EVENT_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
