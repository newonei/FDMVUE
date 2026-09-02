import type { FdmWaimaoAiContextMode, FdmWaimaoAiSurfaceKey } from './surfaces';

import {
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
  watchEffect,
} from 'vue';

export interface FdmWaimaoAiPageContext {
  businessId?: string;
  companyId?: string;
  context: Record<string, unknown>;
  contextMode: FdmWaimaoAiContextMode;
  entityLabel?: string;
  surfaceKey: 'product' | FdmWaimaoAiSurfaceKey;
  variant?: 'consumption' | 'receipt';
  volatile?: boolean;
}

const MAX_ARRAY_ITEMS = 24;
const MAX_CONTEXT_CHARACTERS = 48_000;
const MAX_DEPTH = 5;
const MAX_OBJECT_KEYS = 48;
const MAX_STRING_CHARACTERS = 1000;
const CONTACT_KEY_PATTERN =
  /(email|linkedin|mobile|phone|tel|wechat|whatsapp)/i;
const SECRET_KEY_PATTERN =
  /(access.?token|authorization|client.?secret|credential|password|secret|token)/i;

const activeContext = shallowRef<FdmWaimaoAiPageContext>();
let activeOwner: symbol | undefined;

function sanitizeValue(
  value: unknown,
  depth: number,
  visited: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_CHARACTERS);
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value !== 'object') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[已省略深层数据]';
  if (visited.has(value)) return '[已省略循环引用]';
  visited.add(value);

  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, visited));
    if (value.length > MAX_ARRAY_ITEMS) {
      result.push(`[其余 ${value.length - MAX_ARRAY_ITEMS} 项已省略]`);
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    MAX_OBJECT_KEYS,
  );
  for (const [key, item] of entries) {
    const normalizedKey = key.replaceAll(/[^a-z0-9]/gi, '');
    if (SECRET_KEY_PATTERN.test(normalizedKey)) continue;
    if (CONTACT_KEY_PATTERN.test(normalizedKey)) {
      result[key] =
        item === null || item === undefined || String(item).trim() === ''
          ? '未提供'
          : '已提供';
      continue;
    }
    const sanitized = sanitizeValue(item, depth + 1, visited);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  const keyCount = Object.keys(value as Record<string, unknown>).length;
  if (keyCount > MAX_OBJECT_KEYS) {
    result._truncatedFields = keyCount - MAX_OBJECT_KEYS;
  }
  return result;
}

export function sanitizeFdmWaimaoAiContext(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0, new WeakSet<object>());
  const record = (sanitized ?? {}) as Record<string, unknown>;
  const serialized = JSON.stringify(record);
  if (serialized.length <= MAX_CONTEXT_CHARACTERS) return record;

  return {
    _contextTruncated: true,
    _originalCharacters: serialized.length,
    message:
      '页面上下文超过传输上限，已仅保留摘要。请缩小筛选范围或打开具体记录后再提问。',
  };
}

function sanitizedContext(
  context: FdmWaimaoAiPageContext,
): FdmWaimaoAiPageContext {
  return {
    ...context,
    businessId: context.businessId ? String(context.businessId) : undefined,
    companyId: context.companyId ? String(context.companyId) : undefined,
    context: sanitizeFdmWaimaoAiContext(context.context),
  };
}

export function useFdmWaimaoAiContext(
  factory: () => FdmWaimaoAiPageContext | undefined,
) {
  const owner = Symbol('fdm-waimao-ai-context');
  const enabled = ref(true);

  function clearOwnedContext() {
    if (activeOwner !== owner) return;
    activeOwner = undefined;
    activeContext.value = undefined;
  }

  function publish() {
    if (!enabled.value) return;
    const context = factory();
    if (!context) {
      clearOwnedContext();
      return;
    }
    activeOwner = owner;
    activeContext.value = sanitizedContext(context);
  }

  watchEffect(publish);
  onActivated(() => {
    enabled.value = true;
    publish();
  });
  onDeactivated(() => {
    enabled.value = false;
    clearOwnedContext();
  });
  onBeforeUnmount(clearOwnedContext);
}

export function useCurrentFdmWaimaoAiContext() {
  return activeContext;
}

/** 产品中心与外贸真实页面共用同一个 route-aware AI Host。 */
export const useFdmProductAiContext = useFdmWaimaoAiContext;
