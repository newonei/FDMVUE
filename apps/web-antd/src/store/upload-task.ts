import type { RouteLocationRaw } from 'vue-router';

import { computed, reactive, ref, watch } from 'vue';

import { defineStore } from 'pinia';

export type UploadTaskStatus =
  | 'canceled'
  | 'error'
  | 'processing'
  | 'queued'
  | 'success'
  | 'uploading';

export interface UploadTaskContext {
  /** 上报已发送字节数；发送完毕后任务自动进入「服务器处理中」 */
  onProgress: (loaded: number, total?: number) => void;
  signal: AbortSignal;
}

export type UploadTaskRunner<T = unknown> = (
  file: File,
  context: UploadTaskContext,
) => Promise<T>;

export interface UploadTaskOptions<T = unknown> {
  file: File;
  /** 在上传面板中点击「查看」时跳转的位置 */
  link?: RouteLocationRaw;
  /** 在上传面板中点击「查看」、跳转完成后执行，如重新打开所在弹窗 */
  onOpen?: () => void;
  onSuccess?: (result: T) => void;
  /** 任务来源，显示在上传面板中，如「内销定制订单」 */
  source?: string;
  upload: UploadTaskRunner<T>;
}

export interface UploadTask {
  createdAt: number;
  error?: string;
  finishedAt?: number;
  id: string;
  link?: RouteLocationRaw;
  name: string;
  /** 是否可以从上传面板跳回来源位置 */
  openable: boolean;
  /** 文件字节全部发出、开始等待服务端处理的时间 */
  processingAt?: number;
  /** 0 ~ 1，按请求体发送进度计算 */
  progress: number;
  size: number;
  source?: string;
  /** 字节/秒 */
  speed: number;
  startedAt?: number;
  status: UploadTaskStatus;
}

interface UploadTaskRuntime {
  controller?: AbortController;
  options: UploadTaskOptions<any>;
}

/** 同时上传的文件数。大文件串行会让后面的文件长时间停在 0%。 */
export const UPLOAD_TASK_CONCURRENCY = 3;

const ACTIVE_STATUSES = new Set<UploadTaskStatus>([
  'processing',
  'queued',
  'uploading',
]);
const SPEED_SAMPLE_INTERVAL_MS = 500;

let taskSeq = 0;

export function isUploadTaskActive(task?: UploadTask) {
  return !!task && ACTIVE_STATUSES.has(task.status);
}

export function resolveUploadErrorMessage(error: unknown) {
  const record = (error ?? {}) as Record<string, any>;
  // 业务错误会以 {code, msg, data} 本身被 reject；HTTP 错误则挂在 response.data 上
  const businessMessage = [record.response?.data, record.data, record]
    .map((item) => (item && typeof item === 'object' ? item.msg : undefined))
    .find((item) => typeof item === 'string' && item.trim());
  if (businessMessage) return businessMessage.trim();
  const message = String(record.message ?? '');
  if (message.includes('Network Error')) return '网络异常，请检查网络后重试';
  if (message.includes('timeout')) return '上传超时，请重试';
  const status = record.response?.status;
  if (status === 413) return '文件超过服务器允许的大小';
  if (status) return `上传失败（HTTP ${status}）`;
  return message || '上传失败';
}

export const useUploadTaskStore = defineStore('fdm-upload-task', () => {
  const tasks = ref<UploadTask[]>([]);
  const collapsed = ref(false);
  /** 每秒刷新一次，用于剩余时间、处理耗时等展示 */
  const now = ref(Date.now());
  const runtimes = new Map<string, UploadTaskRuntime>();
  let ticker: ReturnType<typeof setInterval> | undefined;

  const activeTasks = computed(() => tasks.value.filter(isUploadTaskActive));
  const hasActive = computed(() => activeTasks.value.length > 0);

  const summary = computed(() => {
    let totalBytes = 0;
    let loadedBytes = 0;
    let speed = 0;
    let success = 0;
    let failed = 0;
    let processing = 0;
    for (const task of tasks.value) {
      if (task.status === 'success') success++;
      if (task.status === 'error') failed++;
      if (task.status === 'processing') processing++;
      if (task.status === 'uploading') speed += task.speed;
      if (task.status === 'canceled') continue;
      totalBytes += task.size;
      loadedBytes += task.size * task.progress;
    }
    return {
      active: activeTasks.value.length,
      failed,
      loadedBytes,
      processing,
      speed,
      success,
      total: tasks.value.length,
      totalBytes,
    };
  });

  function getTask(id?: string) {
    return id ? tasks.value.find((task) => task.id === id) : undefined;
  }

  function add<T>(options: UploadTaskOptions<T>) {
    const id = `upload-${Date.now().toString(36)}-${++taskSeq}`;
    const task = reactive<UploadTask>({
      createdAt: Date.now(),
      id,
      link: options.link,
      name: options.file.name,
      openable: !!(options.link || options.onOpen),
      progress: 0,
      size: options.file.size,
      source: options.source,
      speed: 0,
      status: 'queued',
    });
    runtimes.set(id, { options });
    tasks.value.push(task);
    pump();
    return id;
  }

  function pump() {
    let running = tasks.value.filter(
      (task) => task.status === 'uploading' || task.status === 'processing',
    ).length;
    for (const task of tasks.value) {
      if (running >= UPLOAD_TASK_CONCURRENCY) break;
      if (task.status !== 'queued') continue;
      running++;
      void run(task);
    }
  }

  async function run(task: UploadTask) {
    const runtime = runtimes.get(task.id);
    if (!runtime) return;
    const controller = new AbortController();
    runtime.controller = controller;
    Object.assign(task, {
      error: undefined,
      finishedAt: undefined,
      processingAt: undefined,
      progress: 0,
      speed: 0,
      startedAt: Date.now(),
      status: 'uploading',
    } satisfies Partial<UploadTask>);

    let sampleTime = performance.now();
    let sampleLoaded = 0;
    const onProgress = (loaded: number, total?: number) => {
      if (controller.signal.aborted || task.status !== 'uploading') return;
      const size = total && total > 0 ? total : task.size;
      task.progress = size > 0 ? Math.min(1, loaded / size) : 0;
      const current = performance.now();
      const elapsed = current - sampleTime;
      if (elapsed >= SPEED_SAMPLE_INTERVAL_MS) {
        const rate = ((loaded - sampleLoaded) * 1000) / elapsed;
        task.speed = task.speed > 0 ? task.speed * 0.6 + rate * 0.4 : rate;
        sampleTime = current;
        sampleLoaded = loaded;
      }
      if (task.progress >= 1) {
        task.status = 'processing';
        task.processingAt = Date.now();
        task.speed = 0;
      }
    };

    try {
      const result = await runtime.options.upload(runtime.options.file, {
        onProgress,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      Object.assign(task, {
        finishedAt: Date.now(),
        progress: 1,
        speed: 0,
        status: 'success',
      } satisfies Partial<UploadTask>);
      try {
        runtime.options.onSuccess?.(result);
      } catch (error) {
        console.error('Upload task success callback failed', error);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      Object.assign(task, {
        error: resolveUploadErrorMessage(error),
        finishedAt: Date.now(),
        speed: 0,
        status: 'error',
      } satisfies Partial<UploadTask>);
    } finally {
      if (runtime.controller === controller) runtime.controller = undefined;
      pump();
    }
  }

  function cancel(id: string) {
    const task = getTask(id);
    if (!task || !isUploadTaskActive(task)) return;
    runtimes.get(id)?.controller?.abort();
    Object.assign(task, {
      finishedAt: Date.now(),
      speed: 0,
      status: 'canceled',
    } satisfies Partial<UploadTask>);
    pump();
  }

  function retry(id: string) {
    const task = getTask(id);
    if (!task || (task.status !== 'error' && task.status !== 'canceled')) {
      return;
    }
    Object.assign(task, {
      error: undefined,
      finishedAt: undefined,
      progress: 0,
      status: 'queued',
    } satisfies Partial<UploadTask>);
    pump();
  }

  function getOpenHandler(id: string) {
    return runtimes.get(id)?.options.onOpen;
  }

  function remove(id: string) {
    cancel(id);
    runtimes.delete(id);
    tasks.value = tasks.value.filter((task) => task.id !== id);
  }

  function clearFinished() {
    for (const task of tasks.value) {
      if (!isUploadTaskActive(task)) runtimes.delete(task.id);
    }
    tasks.value = tasks.value.filter(isUploadTaskActive);
  }

  function cancelAll() {
    for (const task of activeTasks.value) cancel(task.id);
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    // 旧版浏览器需要 returnValue 才会弹出确认框
    event.returnValue = '';
  }

  watch(hasActive, (active) => {
    if (typeof window === 'undefined') return;
    if (active) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      now.value = Date.now();
      ticker ??= setInterval(() => {
        now.value = Date.now();
      }, 1000);
      return;
    }
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (ticker) {
      clearInterval(ticker);
      ticker = undefined;
    }
    now.value = Date.now();
  });

  function $reset() {
    cancelAll();
    runtimes.clear();
    tasks.value = [];
    collapsed.value = false;
  }

  return {
    $reset,
    activeTasks,
    add,
    cancel,
    cancelAll,
    clearFinished,
    collapsed,
    getOpenHandler,
    getTask,
    hasActive,
    now,
    remove,
    retry,
    summary,
    tasks,
  };
});
