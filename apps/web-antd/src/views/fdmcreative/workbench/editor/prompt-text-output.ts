export type PromptLanguage = 'AUTO' | 'EN' | 'ZH_CN';
export type PromptTargetType = 'GENERAL' | 'IMAGE' | 'NEGATIVE' | 'VIDEO';

export interface PromptTextOutput {
  contentType: 'PROMPT_TEXT';
  language: PromptLanguage;
  schemaVersion: 1;
  targetType: PromptTargetType;
  text: string;
}

const TARGET_TYPES = new Set<PromptTargetType>([
  'GENERAL',
  'IMAGE',
  'NEGATIVE',
  'VIDEO',
]);
const LANGUAGES = new Set<PromptLanguage>(['AUTO', 'EN', 'ZH_CN']);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function trimmed(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function option<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
) {
  const candidate = trimmed(value)?.toUpperCase() as T | undefined;
  return candidate && allowed.has(candidate) ? candidate : fallback;
}

function parseJson(outputJson?: string) {
  if (!outputJson?.trim()) return undefined;
  try {
    return JSON.parse(outputJson) as unknown;
  } catch {
    return undefined;
  }
}

/** Parses the stable PROMPT_TEXT envelope persisted by fdmcreative. */
export function parsePromptTextOutput(
  outputJson?: string,
): PromptTextOutput | undefined {
  const value = asRecord(parseJson(outputJson));
  const text = trimmed(value?.text);
  if (value?.contentType !== 'PROMPT_TEXT' || !text) return undefined;
  return {
    contentType: 'PROMPT_TEXT',
    language: option(value.language, LANGUAGES, 'AUTO'),
    schemaVersion: 1,
    targetType: option(value.targetType, TARGET_TYPES, 'GENERAL'),
    text,
  };
}

function findGeneratedText(value: unknown, depth: number): string | undefined {
  if (value === null || value === undefined || depth > 12) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findGeneratedText(item, depth + 1);
      if (text) return text;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const type = trimmed(record.type)?.toUpperCase();
  const contentType = trimmed(record.contentType)?.toUpperCase();
  if (type === 'TEXT' || contentType === 'PROMPT_TEXT') {
    return trimmed(record.text);
  }
  for (const key of ['outputs', 'output', 'data', 'result']) {
    const text = findGeneratedText(record[key], depth + 1);
    if (text) return text;
  }
  return undefined;
}

/** Extracts text from either the stable envelope or a nested provider result. */
export function extractPromptText(outputJson?: string) {
  const stable = parsePromptTextOutput(outputJson);
  return stable?.text ?? findGeneratedText(parseJson(outputJson), 0);
}
