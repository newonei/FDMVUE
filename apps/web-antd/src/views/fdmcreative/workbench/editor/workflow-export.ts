import type { FdmCreativeApi } from '#/api/fdmcreative';

import { parseCreativeSchemaEnvelope } from './creative-json-contract';
import { normalizeWorkflowDefinitionForTransport } from './workflow-definition-hash';

export const WORKFLOW_EXPORT_FORMAT = 'FdmCreativeWorkflowExport';
export const WORKFLOW_EXPORT_MAX_BYTES = 8_454_144;

export interface WorkflowExportDocument {
  definition: FdmCreativeApi.WorkflowDefinition;
  exportedAt: number;
  format: typeof WORKFLOW_EXPORT_FORMAT;
  metadata: {
    definitionSchemaVersion: 1;
    edgeCount: number;
    nodeCount: number;
  };
  schemaVersion: 1;
}

const forbiddenFieldNames = new Set([
  'apikey',
  'authorization',
  'base64',
  'blob',
  'bloburl',
  'cookie',
  'dataurl',
  'executionid',
  'executionlog',
  'executionlogs',
  'file',
  'filepath',
  'fileurl',
  'lastresult',
  'log',
  'logs',
  'noderunid',
  'output',
  'outputs',
  'path',
  'preview',
  'previewurl',
  'providerjobid',
  'providertaskid',
  'result',
  'results',
  'runid',
  'runlog',
  'runlogs',
  'runtime',
  'runtimestatus',
  'signature',
  'signedurl',
  'status',
  'url',
  'urls',
]);
const signedUrlMarker =
  /(?:[?&](?:signature|credential|x-amz-signature|x-amz-credential|x-oss-signature|x-goog-signature|securitytoken|access_token)=|xamzcredential=|ossaccesskeyid=)/i;
const base64Like = /^[a-z0-9+/\r\n]+={0,2}$/i;

export function createWorkflowExport(
  definition: FdmCreativeApi.WorkflowDefinition,
  exportedAt = Date.now(),
): WorkflowExportDocument {
  const safeDefinition = sanitizeWorkflowDefinitionForExport(definition);
  return {
    definition: safeDefinition,
    exportedAt,
    format: WORKFLOW_EXPORT_FORMAT,
    metadata: {
      definitionSchemaVersion: 1,
      edgeCount: safeDefinition.edges.length,
      nodeCount: safeDefinition.nodes.length,
    },
    schemaVersion: 1,
  };
}

/**
 * Browser-side protection is intentionally stricter than convenience: a
 * selected import file must not carry provider output, signed links, tokens or
 * inline binary into the page before the backend performs the authoritative
 * normalisation and validation again.
 */
export function parseWorkflowExport(rawDocument: string): WorkflowExportDocument {
  const bytes = new TextEncoder().encode(rawDocument).byteLength;
  if (bytes > WORKFLOW_EXPORT_MAX_BYTES) {
    throw new TypeError('导入文件超过工作流大小限制');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDocument) as unknown;
  } catch {
    throw new TypeError('导入文件不是有效 JSON');
  }
  const document = parseCreativeSchemaEnvelope<WorkflowExportDocument>(
    parsed,
    'workflowExport',
  );
  if (document.format !== WORKFLOW_EXPORT_FORMAT) {
    throw new TypeError('导入文件 format 不受支持');
  }
  if (
    !Number.isSafeInteger(document.exportedAt) ||
    document.exportedAt <= 0 ||
    !isRecord(document.metadata) ||
    !isWorkflowDefinition(document.definition)
  ) {
    throw new TypeError('导入文件结构不完整');
  }
  assertSafeImportValue(document.definition, '$.definition');
  return {
    definition: normalizeWorkflowDefinitionForTransport(document.definition),
    exportedAt: document.exportedAt,
    format: WORKFLOW_EXPORT_FORMAT,
    metadata: {
      definitionSchemaVersion: 1,
      edgeCount: document.definition.edges.length,
      nodeCount: document.definition.nodes.length,
    },
    schemaVersion: 1,
  };
}

export function downloadWorkflowExport(
  document: WorkflowExportDocument,
  fileName = `fdmcreative-workflow-${formatExportTime(document.exportedAt)}.json`,
) {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateAnchor();
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function sanitizeWorkflowDefinitionForExport(
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  const cloned = JSON.parse(
    JSON.stringify(definition),
  ) as FdmCreativeApi.WorkflowDefinition;
  for (const node of cloned.nodes) {
    node.config = sanitizeConfigValue(node.config) as Record<string, unknown>;
  }
  return normalizeWorkflowDefinitionForTransport(cloned);
}

function sanitizeConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isUnsafeString(item))
      .map((item) => sanitizeConfigValue(item));
  }
  if (!isRecord(value)) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenField(key) || isUnsafeString(nested)) {
      continue;
    }
    safe[key] = sanitizeConfigValue(nested);
  }
  return safe;
}

function assertSafeImportValue(value: unknown, path: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeImportValue(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    if (isUnsafeString(value)) {
      throw new TypeError(`${path} 包含不安全的运行态内容`);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenField(key) || isUnsafeString(nested)) {
      throw new TypeError(`${path}.${key} 包含不允许导入的运行态字段`);
    }
    assertSafeImportValue(nested, `${path}.${key}`);
  }
}

function isUnsafeString(value: unknown) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:') ||
    signedUrlMarker.test(trimmed) ||
    (trimmed.length > 1024 && base64Like.test(trimmed))
  );
}

function isWorkflowDefinition(
  value: unknown,
): value is FdmCreativeApi.WorkflowDefinition {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    (value.viewport === undefined || isRecord(value.viewport))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeField(value: string) {
  return value.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
}

function isForbiddenField(value: string) {
  const normalized = normalizeField(value);
  return (
    forbiddenFieldNames.has(normalized) ||
    normalized.includes('credential') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('signature')
  );
}

function formatExportTime(value: number) {
  return new Date(value).toISOString().replaceAll(/[:.]/g, '-');
}

function documentCreateAnchor() {
  if (typeof document === 'undefined') {
    throw new TypeError('当前环境不支持下载工作流文件');
  }
  return document.createElement('a');
}
