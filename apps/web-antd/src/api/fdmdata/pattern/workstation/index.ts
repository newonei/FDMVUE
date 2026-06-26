const DEFAULT_PATTERN_RECOGNITION_API_BASE = '/pattern-recognition-api';
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

export const PATTERN_RECOGNITION_API_BASE = (
  import.meta.env.VITE_PATTERN_RECOGNITION_API_BASE ||
  DEFAULT_PATTERN_RECOGNITION_API_BASE
).replace(/\/+$/, '');

function joinPatternRecognitionApiUrl(value: string) {
  if (!value) return PATTERN_RECOGNITION_API_BASE || '/';
  if (ABSOLUTE_HTTP_URL_RE.test(PATTERN_RECOGNITION_API_BASE)) {
    return new URL(value, `${PATTERN_RECOGNITION_API_BASE}/`).href;
  }
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${PATTERN_RECOGNITION_API_BASE}${path}`;
}

function resolvePatternRecognitionApiUrl(value: string) {
  const text = value.trim();
  if (!text) return '';
  if (ABSOLUTE_HTTP_URL_RE.test(text)) {
    if (ABSOLUTE_HTTP_URL_RE.test(PATTERN_RECOGNITION_API_BASE)) return text;
    const parsed = new URL(text);
    if (
      typeof window !== 'undefined' &&
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith(`${PATTERN_RECOGNITION_API_BASE}/`)
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return joinPatternRecognitionApiUrl(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
    );
  }
  return joinPatternRecognitionApiUrl(text);
}

export namespace PatternRecognitionApi {
  export interface UploadProgressEvent {
    loaded: number;
    percent: number;
    total?: number;
  }

  export interface UploadOptions {
    onUploadComplete?: () => void;
    onUploadProgress?: (event: UploadProgressEvent) => void;
    timeoutMs?: number;
  }

  export interface Candidate {
    design_image_url: string;
    preview_image_url?: null | string;
    detail_score?: null | number;
    embedding_score?: null | number;
    feature_score?: null | number;
    item_id: string;
    item_no: string;
    local_image_url: string;
    order_no: string;
    patch_score?: null | number;
    pattern_group_id: string;
    quantity: number;
    recognized_count: number;
    score: number;
    status: string;
  }

  export interface UploadMatchResponse {
    best_match?: Candidate | null;
    capture_id: string;
    decision: 'auto_match' | 'manual_review' | 'no_match' | string;
    image_quality?: Record<string, any>;
    top_candidates: Candidate[];
  }

  export interface ConfirmRequest {
    capture_id: string;
    item_id?: null | string;
    order_no: string;
  }

  export interface ConfirmResponse {
    allocated_item_id: string;
    allocated_item_no: string;
    allocated_order_no: string;
    capture_id: string;
    index_removed_count: number;
    order_status: string;
    pattern_group_id: string;
    quantity: number;
    ready_to_ship: boolean;
    recognized_count: number;
    removed_from_index: boolean;
    requested_item_id?: null | string;
    requested_order_no: string;
    status: string;
  }

  export interface SyncOrdersResponse {
    active_model_id?: string;
    indexed_orders?: number;
    orders_changed?: number;
    orders_synced?: number;
  }

  export interface HealthResponse {
    active_device?: string;
    active_model_id?: string;
    data_dir?: string;
    ok: boolean;
  }
}

export function resolvePatternRecognitionAssetUrl(url?: string) {
  if (!url) return '';
  const value = url.trim();
  if (!value || /^[a-z]:[\\/]/i.test(value)) return '';
  return resolvePatternRecognitionApiUrl(value);
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) return response.statusText || `HTTP ${response.status}`;
  try {
    const data = JSON.parse(text);
    return data.detail || data.message || data.msg || text;
  } catch {
    return text;
  }
}

function readErrorMessageFromText(
  text: string,
  status: number,
  statusText: string,
) {
  if (!text) return statusText || `HTTP ${status}`;
  try {
    const data = JSON.parse(text);
    return data.detail || data.message || data.msg || text;
  } catch {
    return text;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(resolvePatternRecognitionApiUrl(path), {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

function xhrPostJson<T>(
  path: string,
  body: FormData,
  options: PatternRecognitionApi.UploadOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = resolvePatternRecognitionApiUrl(path);
    let uploadCompleteNotified = false;

    function notifyUploadComplete() {
      if (uploadCompleteNotified) return;
      uploadCompleteNotified = true;
      options.onUploadComplete?.();
    }

    xhr.open('POST', url);
    xhr.timeout = options.timeoutMs ?? 0;
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.addEventListener('progress', (event) => {
      const total = event.lengthComputable ? event.total : undefined;
      const percent = total
        ? Math.min(100, Math.round((event.loaded / total) * 100))
        : 0;
      options.onUploadProgress?.({
        loaded: event.loaded,
        percent,
        total,
      });
      if (total && event.loaded >= total) {
        notifyUploadComplete();
      }
    });

    xhr.upload.addEventListener('load', () => {
      notifyUploadComplete();
    });

    xhr.addEventListener('load', () => {
      const text = String(xhr.responseText || '');
      if (xhr.status >= 200 && xhr.status < 400) {
        try {
          resolve((text ? JSON.parse(text) : {}) as T);
        } catch (error) {
          reject(new Error('识别服务返回内容不是有效 JSON', { cause: error }));
        }
        return;
      }
      reject(new Error(readErrorMessageFromText(text, xhr.status, xhr.statusText)));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('识别请求超时'));
    });

    xhr.addEventListener('error', () => {
      reject(new Error('识别服务连接失败'));
    });

    xhr.send(body);
  });
}

export function getPatternRecognitionHealth() {
  return fetchJson<PatternRecognitionApi.HealthResponse>('/api/health');
}

export function syncPatternRecognitionOrders(incremental = true) {
  return fetchJson<PatternRecognitionApi.SyncOrdersResponse>(
    incremental ? '/api/admin/sync-orders/incremental' : '/api/admin/sync-orders',
    { method: 'POST' },
  );
}

export function uploadPatternCapture(
  form: FormData,
  options?: PatternRecognitionApi.UploadOptions,
) {
  return xhrPostJson<PatternRecognitionApi.UploadMatchResponse>(
    '/api/match/upload',
    form,
    options,
  );
}

export function confirmPatternMatch(data: PatternRecognitionApi.ConfirmRequest) {
  return fetchJson<PatternRecognitionApi.ConfirmResponse>('/api/match/confirm', {
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}
