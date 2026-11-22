<script setup lang="ts">
import type {
  Experience,
  ExperienceInput,
  ExperienceProfile,
  ExperienceSeed,
} from '#/api/fdmmcp/experience';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { Alert, Button } from 'ant-design-vue';

import { experienceApi } from '#/api/fdmmcp/experience';

import {
  captureEvent,
  claimCapture,
  clearCapture,
  pendingCapture,
} from './DesktopCaptureTransfer';
import ExperienceEditor from './ExperienceEditor.vue';

const props = defineProps<{ profile: ExperienceProfile }>();
const emit = defineEmits<{ saved: [entry: Experience] }>();
const seed = ref<ExperienceSeed>();
const existing = ref<Experience>();
const status = ref('');
const errorMessage = ref('');
const busy = ref(false);
const ready = ref(false);
let request: AbortController | undefined;
let activeTicket = '';

function reset() {
  request?.abort();
  if (activeTicket) clearCapture(activeTicket);
  activeTicket = '';
  seed.value = undefined;
  existing.value = undefined;
  status.value = '';
  errorMessage.value = '';
  busy.value = false;
  ready.value = false;
}
async function lookup(signal: AbortSignal) {
  const key = seed.value?.sourceKey;
  if (!key) return;
  const { id } = await experienceApi(
    'sourceLookup',
    { sourceKey: key },
    signal,
  );
  const record = id ? await experienceApi('own', { id }, signal) : undefined;
  if (signal.aborted) return;
  existing.value = record;
  ready.value = record?.status !== 'pending';
  status.value = ready.value
    ? ''
    : `这段对话已沉淀为「${
        record!.title
      }」，正在审核中。可在“我的经验”查看进度。`;
}
async function open() {
  const grant = pendingCapture();
  if (!grant || activeTicket === grant.ticket) return;
  reset();
  activeTicket = grant.ticket;
  const call = new AbortController();
  request = call;
  busy.value = true;
  status.value = '正在接收桌面对话草稿…';
  try {
    const value = await claimCapture(grant, props.profile, call.signal);
    if (call.signal.aborted) return;
    clearCapture(grant.ticket);
    seed.value = value;
    await lookup(call.signal);
  } catch (error) {
    if (!call.signal.aborted) {
      status.value = '';
      errorMessage.value =
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : '连接本机草稿失败，请从原桌面对话重新打开。';
    }
  } finally {
    if (!call.signal.aborted) busy.value = false;
  }
}
async function retryLookup() {
  if (busy.value || !request) return;
  const { signal } = request;
  busy.value = true;
  errorMessage.value = '';
  try {
    await lookup(signal);
  } catch {
    if (!signal.aborted)
      errorMessage.value = '无法查询这段对话的已有经验，请重试。';
  } finally {
    if (!signal.aborted) busy.value = false;
  }
}
async function save(
  data: ExperienceInput &
    ({ id: string; version: number } | { sourceKey: string }),
) {
  if (!ready.value || busy.value || !request) return;
  const { signal } = request;
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = await experienceApi('save', data, signal);
    if (signal.aborted) return;
    reset();
    emit('saved', result);
  } catch (error) {
    if (!signal.aborted)
      errorMessage.value =
        error instanceof Error ? error.message : '保存失败，请重试。';
  } finally {
    if (!signal.aborted) busy.value = false;
  }
}
onMounted(() => {
  window.addEventListener(captureEvent, open);
  void open();
});
onBeforeUnmount(() => {
  window.removeEventListener(captureEvent, open);
  reset();
});
</script>
<template>
  <Alert
    v-if="!ready && (status || errorMessage)"
    :type="errorMessage ? 'warning' : 'info'"
    :message="errorMessage || status"
    show-icon
  >
    <template v-if="errorMessage || existing?.status === 'pending'" #action>
      <Button v-if="errorMessage && seed" type="link" @click="retryLookup">
        重试
      </Button>
      <Button type="link" @click="reset">关闭</Button>
    </template>
  </Alert>
  <ExperienceEditor
    v-if="ready && seed"
    :key="seed.sourceKey"
    :kind="existing ? 'edit' : 'capture'"
    :seed="seed"
    :item="existing"
    :busy="busy"
    :error="errorMessage"
    @close="reset"
    @save="save"
  />
</template>
