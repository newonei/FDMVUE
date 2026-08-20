export const CREATIVE_SCHEMA_VERSIONS = {
  agentReference: 1,
  canvasPatch: 1,
  workflowDefinition: 1,
  workflowExport: 1,
} as const;

export type CreativeJsonContract = keyof typeof CREATIVE_SCHEMA_VERSIONS;

export interface CreativeSchemaEnvelope {
  schemaVersion: number;
}

/**
 * A common guard for persisted/imported/model JSON. Individual contracts still validate their
 * fields separately; this prevents an unsupported version from being interpreted as v1.
 */
export function parseCreativeSchemaEnvelope<
  TEnvelope extends CreativeSchemaEnvelope,
>(value: unknown, contract: CreativeJsonContract): TEnvelope {
  if (!isRecord(value)) {
    throw new TypeError(`${contract} JSON 必须是对象`);
  }
  const expectedVersion = CREATIVE_SCHEMA_VERSIONS[contract];
  if (value.schemaVersion !== expectedVersion) {
    throw new TypeError(`${contract} schemaVersion 必须为 ${expectedVersion}`);
  }
  return value as TEnvelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
