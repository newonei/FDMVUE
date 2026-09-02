import type { AiGenerationDataSource, AiGenerationJob } from './types';

import { getCurrentInstance, onBeforeUnmount, ref } from 'vue';

export const TERMINAL_AI_JOB_STATUSES = new Set([
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'MATERIALIZED',
  'READY',
  'RULE_BLOCKED',
  'STALE',
]);

export function isTerminalAiGenerationJob(job?: AiGenerationJob<unknown>) {
  return Boolean(job && TERMINAL_AI_JOB_STATUSES.has(job.status));
}

export function aiPollRetryDelay(baseDelay: number, consecutiveErrors: number) {
  return Math.min(
    baseDelay * 8,
    baseDelay * 2 ** Math.max(0, consecutiveErrors - 1),
  );
}

export function useAiGenerationJob<TStartReq, TProposal>(options: {
  dataSource: AiGenerationDataSource<TStartReq, TProposal>;
  maxConsecutivePollErrors?: number;
  pollIntervalMs?: number;
}) {
  const job = ref<AiGenerationJob<TProposal>>();
  const loading = ref(false);
  const cancelling = ref(false);
  const errorMessage = ref('');
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const maxConsecutivePollErrors = options.maxConsecutivePollErrors ?? 3;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestVersion = 0;
  let consecutivePollErrors = 0;
  let lastJobId: string | undefined;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function stop() {
    requestVersion += 1;
    clearTimer();
    loading.value = false;
    cancelling.value = false;
    consecutivePollErrors = 0;
  }

  function errorText(cause: unknown) {
    return cause instanceof Error && cause.message.trim()
      ? cause.message
      : 'AI 生成状态读取失败，请稍后重试。';
  }

  function schedule(jobId: string, version: number, delay = pollIntervalMs) {
    clearTimer();
    timer = setTimeout(() => void poll(jobId, version), delay);
  }

  async function poll(jobId: string, version = requestVersion) {
    if (version !== requestVersion) return;
    try {
      const result = await options.dataSource.getJob(jobId);
      if (version !== requestVersion || result.id !== jobId) return;
      consecutivePollErrors = 0;
      lastJobId = result.id;
      job.value = result;
      errorMessage.value = result.errorMessage?.trim() || '';
      if (!isTerminalAiGenerationJob(result)) schedule(jobId, version);
    } catch (error) {
      if (version !== requestVersion) return;
      consecutivePollErrors += 1;
      errorMessage.value = errorText(error);
      if (consecutivePollErrors <= maxConsecutivePollErrors) {
        const backoff = aiPollRetryDelay(pollIntervalMs, consecutivePollErrors);
        schedule(jobId, version, backoff);
      } else {
        loading.value = false;
      }
    } finally {
      if (version === requestVersion && isTerminalAiGenerationJob(job.value)) {
        loading.value = false;
        cancelling.value = false;
      }
    }
  }

  async function start(req: TStartReq) {
    stop();
    const version = requestVersion;
    loading.value = true;
    errorMessage.value = '';
    job.value = undefined;
    cancelling.value = false;
    try {
      const result = await options.dataSource.start(req);
      if (version !== requestVersion) return;
      job.value = result;
      lastJobId = result.id;
      errorMessage.value = result.errorMessage?.trim() || '';
      if (isTerminalAiGenerationJob(result)) {
        loading.value = false;
      } else {
        schedule(result.id, version);
      }
    } catch (error) {
      if (version !== requestVersion) return;
      loading.value = false;
      errorMessage.value = errorText(error);
    }
  }

  async function resume(jobId: string) {
    stop();
    const version = requestVersion;
    lastJobId = jobId;
    loading.value = true;
    errorMessage.value = '';
    job.value = undefined;
    cancelling.value = false;
    await poll(jobId, version);
  }

  async function retry() {
    const current = job.value;
    if (!current) {
      if (lastJobId) await resume(lastJobId);
      return;
    }
    if (!options.dataSource.retry || current.version === undefined) {
      await resume(current.id);
      return;
    }
    stop();
    const version = requestVersion;
    loading.value = true;
    errorMessage.value = '';
    cancelling.value = false;
    try {
      const result = await options.dataSource.retry(
        current.id,
        current.version,
      );
      if (version !== requestVersion) return;
      job.value = result;
      lastJobId = result.id;
      if (isTerminalAiGenerationJob(result)) {
        loading.value = false;
      } else {
        schedule(result.id, version);
      }
    } catch (error) {
      if (version !== requestVersion) return;
      errorMessage.value = errorText(error);
      loading.value = false;
    }
  }

  async function cancel() {
    const current = job.value;
    if (
      !current ||
      !options.dataSource.cancel ||
      current.version === undefined
    ) {
      return;
    }
    clearTimer();
    const version = ++requestVersion;
    cancelling.value = true;
    loading.value = true;
    try {
      const result = await options.dataSource.cancel(
        current.id,
        current.version,
      );
      if (version !== requestVersion) return;
      job.value = result;
      lastJobId = result.id;
      errorMessage.value = result.errorMessage?.trim() || '';
      if (isTerminalAiGenerationJob(result)) {
        loading.value = false;
        cancelling.value = false;
      } else {
        schedule(result.id, version);
      }
    } catch (error) {
      if (version !== requestVersion) return;
      errorMessage.value = errorText(error);
      loading.value = false;
      cancelling.value = false;
    }
  }

  if (getCurrentInstance()) onBeforeUnmount(stop);

  return {
    cancel,
    cancelling,
    error: errorMessage,
    job,
    loading,
    resume,
    retry,
    start,
    stop,
  };
}
