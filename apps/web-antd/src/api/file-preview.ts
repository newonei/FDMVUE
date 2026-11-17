import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

const MAX_CACHE_BYTES = 48 * 1024 * 1024;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { blob: Blob; expires: number }>();
let cacheBytes = 0;
let cacheScope = '';

function currentScope() {
  const access = useAccessStore();
  return JSON.stringify([
    access.accessToken,
    access.tenantId,
    access.visitTenantId,
  ]);
}

function discard(key: string) {
  const entry = cache.get(key);
  if (entry) cacheBytes -= entry.blob.size;
  cache.delete(key);
}

/** Only cache after the caller has obtained the original through its business permission API.
 * Source bytes, extension and login/tenant context must match. Nothing is persisted to disk.
 */
export async function convertOfficePreview(
  file: File,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  const scope = currentScope();
  if (scope !== cacheScope) {
    cache.clear();
    cacheBytes = 0;
    cacheScope = scope;
  }
  for (const [key, entry] of cache) {
    if (entry.expires <= Date.now()) discard(key);
  }
  // In insecure LAN HTTP contexts Web Crypto may be unavailable; the server cache still works.
  let key = '';
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer(),
    );
    signal.throwIfAborted();
    key = `${file.name.split('.').at(-1)?.toLowerCase()}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const hit = cache.get(key);
    if (hit && scope === currentScope() && scope === cacheScope) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.blob;
    }
  }
  signal.throwIfAborted();
  if (scope !== currentScope())
    throw new Error('登录或租户已切换，请重新打开附件');
  const blob: Blob = await requestClient.upload(
    '/fdmstorage/file-preview/convert',
    { file },
    {
      responseType: 'blob',
      responseReturn: 'body',
      signal,
      timeout: 120_000,
    },
  );
  signal.throwIfAborted();
  if (scope !== currentScope())
    throw new Error('登录或租户已切换，请重新打开附件');
  if (
    key &&
    blob.type.toLowerCase().includes('application/pdf') &&
    blob.size <= MAX_CACHE_BYTES &&
    scope === cacheScope
  ) {
    discard(key);
    while (cacheBytes + blob.size > MAX_CACHE_BYTES && cache.size > 0)
      discard(cache.keys().next().value!);
    cache.set(key, { blob, expires: Date.now() + CACHE_TTL });
    cacheBytes += blob.size;
  }
  return blob;
}
