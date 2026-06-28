import { uploadFile } from '#/api/infra/file';

const DEFAULT_PRINT_PREP_API_BASE = '/print-prep-api';
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

export const PRINT_PREP_API_BASE = (
  import.meta.env.VITE_PRINT_PREP_API_BASE || DEFAULT_PRINT_PREP_API_BASE
).replace(/\/+$/, '');

function joinPrintPrepApiUrl(value: string) {
  if (!value) return PRINT_PREP_API_BASE || '/';
  if (ABSOLUTE_HTTP_URL_RE.test(PRINT_PREP_API_BASE)) {
    return new URL(value, `${PRINT_PREP_API_BASE}/`).href;
  }
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${PRINT_PREP_API_BASE}${path}`;
}

function resolvePrintPrepApiUrl(value: string) {
  const text = value.trim();
  if (!text) return '';
  if (ABSOLUTE_HTTP_URL_RE.test(text)) {
    if (ABSOLUTE_HTTP_URL_RE.test(PRINT_PREP_API_BASE)) return text;
    const parsed = new URL(text);
    if (
      typeof window !== 'undefined' &&
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith(`${PRINT_PREP_API_BASE}/`)
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return joinPrintPrepApiUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  }
  return joinPrintPrepApiUrl(text);
}

export type PrintPrepOutputFileKey =
  | 'ai'
  | 'ai_preprocessed'
  | 'base_image'
  | 'jpg'
  | 'pdf'
  | 'preview'
  | 'report'
  | 'super_resolved';

export const PRINT_PREP_OUTPUT_FILE_DEFINITIONS: Array<{
  fallbackExt: string;
  key: PrintPrepOutputFileKey;
  label: string;
  mimeType: string;
  namePart: string;
}> = [
  {
    fallbackExt: 'jpg',
    key: 'base_image',
    label: 'AI 底图',
    mimeType: 'image/jpeg',
    namePart: 'base-image',
  },
  {
    fallbackExt: 'jpg',
    key: 'ai_preprocessed',
    label: 'AI 预处理图',
    mimeType: 'image/jpeg',
    namePart: 'ai-preprocessed',
  },
  {
    fallbackExt: 'jpg',
    key: 'super_resolved',
    label: '高清修复图',
    mimeType: 'image/jpeg',
    namePart: 'super-resolved',
  },
  {
    fallbackExt: 'jpg',
    key: 'preview',
    label: '套入预览图',
    mimeType: 'image/jpeg',
    namePart: 'placement-preview',
  },
  {
    fallbackExt: 'jpg',
    key: 'jpg',
    label: 'JPG',
    mimeType: 'image/jpeg',
    namePart: 'final',
  },
  {
    fallbackExt: 'pdf',
    key: 'pdf',
    label: 'PDF',
    mimeType: 'application/pdf',
    namePart: 'print',
  },
  {
    fallbackExt: 'ai',
    key: 'ai',
    label: 'AI-compatible',
    mimeType: 'application/octet-stream',
    namePart: 'ai-compatible',
  },
  {
    fallbackExt: 'json',
    key: 'report',
    label: 'report JSON',
    mimeType: 'application/json',
    namePart: 'report',
  },
];

export namespace PrintPrepApi {
  export interface FileInfo {
    path?: string;
    url?: string;
    local_path?: string;
    localTempPath?: string;
    local_temp_path?: string;
    file_path?: string;
    absolute_path?: string;
  }

  export interface ResultFiles {
    original_upload?: FileInfo;
    base_image?: FileInfo;
    base_preview?: FileInfo;
    ai_preprocessed?: FileInfo;
    super_resolved?: FileInfo;
    preview?: FileInfo;
    jpg?: FileInfo;
    pdf?: FileInfo;
    ai?: FileInfo;
    report?: FileInfo;
  }

  export interface JobCreateResp {
    job_id: string;
    message?: string;
    status_url?: string;
  }

  export interface JobStatusResp {
    created_at?: string;
    error?: string;
    message?: string;
    result?: PrintPrepResult;
    started_at?: string;
    status: 'completed' | 'failed' | 'pending' | 'running' | string;
  }

  export interface ReferenceUploadResp {
    upload?: {
      url?: string;
    };
    url?: string;
  }

  export interface PrintPrepResult {
    bleed_cm?: number;
    bleed_margin_cm?: number;
    bleed_mode?: string;
    canvas_size_cm?: {
      height?: number;
      width?: number;
    };
    files?: ResultFiles;
    layout_mode?: string;
    local_directory?: string;
    order_no?: string;
    pixel_size?: {
      height?: number;
      width?: number;
    };
    product_type?: string;
    report?: unknown;
    shared_copy?: {
      directory?: string;
      enabled?: boolean;
      error?: string;
      status?: string;
    };
    size_cm?: string;
  }

  export interface OptionsResp {
    product_sizes?: Record<string, string[]>;
    products?: Array<{
      label?: string;
      name?: string;
      sizes?: string[];
      value?: string;
    }>;
    sizes?: Record<string, string[]>;
    print_size_options?: Record<string, string[]>;
  }

  export interface HistoryItem {
    background_mode?: string;
    bleed_cm?: number;
    bleed_margin_cm?: number;
    bleed_mode?: string;
    customer_prompt?: string;
    directory?: string;
    files?: ResultFiles;
    layout_mode?: string;
    order_no?: string;
    product_type?: string;
    size_cm?: string;
    template_id?: string;
  }

  export interface HistoryResp {
    count?: number;
    items?: HistoryItem[];
    list?: HistoryItem[];
    total?: number;
  }
}

export function resolvePrintPrepAssetUrl(url?: string) {
  if (!url) return '';
  const value = url.trim();
  if (!value || /^[a-z]:[\\/]/i.test(value)) return '';
  return resolvePrintPrepApiUrl(value);
}

export function getPrintPrepFileLocation(file?: PrintPrepApi.FileInfo) {
  return (
    file?.url ||
    file?.path ||
    file?.file_path ||
    file?.local_path ||
    file?.localTempPath ||
    file?.local_temp_path ||
    file?.absolute_path ||
    ''
  );
}

export async function fetchPrintPrepOutputBlob(file: PrintPrepApi.FileInfo) {
  const sourceUrl = resolvePrintPrepAssetUrl(getPrintPrepFileLocation(file));
  if (!sourceUrl) {
    throw new Error('Python 返回的是本地路径或空路径，前端无法读取并上传');
  }
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText || ''}`.trim());
    }
    return {
      blob: await response.blob(),
      sourceUrl,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法读取 Python 输出文件：${text}。如果是跨域问题，请检查 Python 静态文件 CORS。`,
    );
  }
}

export async function uploadPrintPrepOutputBlob({
  blob,
  directory,
  fileName,
  mimeType,
}: {
  blob: Blob;
  directory: string;
  fileName: string;
  mimeType?: string;
}) {
  const file = new File([blob], fileName, {
    type: blob.type || mimeType || 'application/octet-stream',
  });
  return await uploadFile({ directory, file });
}

export async function uploadPrintPrepReferenceBlob({
  blob,
  fileName,
}: {
  blob: Blob;
  fileName: string;
}) {
  const form = new FormData();
  form.append(
    'file',
    new File([blob], fileName, {
      type: blob.type || 'image/png',
    }),
  );
  return fetchJson<PrintPrepApi.ReferenceUploadResp>(
    '/api/v1/workflows/reference-upload',
    {
      method: 'POST',
      body: form,
    },
  );
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolvePrintPrepApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

async function fetchBlob(path: string, form: FormData): Promise<Blob> {
  const response = await fetch(resolvePrintPrepApiUrl(path), {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return await response.blob();
}

export function getPrintPrepOptions() {
  return fetchJson<PrintPrepApi.OptionsResp>('/api/v1/print-prep/options');
}

export function previewPrintPrep(form: FormData) {
  return fetchBlob('/api/v1/print-prep/preview', form);
}

export function createPrintPrepBaseJob(form: FormData) {
  return fetchJson<PrintPrepApi.JobCreateResp>(
    '/api/v1/print-prep/base/jobs',
    {
      method: 'POST',
      body: form,
    },
  );
}

export function createPrintPrepLayoutJob(form: FormData) {
  return fetchJson<PrintPrepApi.JobCreateResp>(
    '/api/v1/print-prep/layout/jobs',
    {
      method: 'POST',
      body: form,
    },
  );
}

export function getPrintPrepJob(jobId: string) {
  return fetchJson<PrintPrepApi.JobStatusResp>(
    `/api/v1/print-prep/jobs/${encodeURIComponent(jobId)}`,
  );
}

export function getPrintPrepHistory() {
  return fetchJson<PrintPrepApi.HistoryItem[] | PrintPrepApi.HistoryResp>(
    '/api/v1/print-prep/history',
  );
}
