<script setup lang="ts">
import type {
  Experience,
  ExperienceInput,
  ExperienceSeed,
} from '#/api/fdmmcp/experience';
import type { FdmReqApi } from '#/api/fdmreq';

import { onBeforeUnmount, ref, watch } from 'vue';

import { Button, Modal } from 'ant-design-vue';

import { experienceApi } from '#/api/fdmmcp/experience';
import ExperienceEditor from '#/views/fdmmcp/experience/ExperienceEditor.vue';
import { lengths, sha256Hex } from '#/views/fdmmcp/experience/report';

const props = defineProps<{
  requirement: FdmReqApi.Requirement;
  risk?: string;
  summary: string;
}>();
const seed = ref<ExperienceSeed>();
const existing = ref<Experience>();
const busy = ref(false);
const notice = ref('');
const errorMessage = ref('');
let request: AbortController | undefined;
function reset() {
  request?.abort();
  busy.value = false;
  existing.value = undefined;
  seed.value = undefined;
  errorMessage.value = '';
  notice.value = '';
}
watch([() => props.requirement.reqNo, () => props.requirement.status], reset, {
  flush: 'sync',
});
onBeforeUnmount(reset);
async function open() {
  if (
    busy.value ||
    !['ACCEPTED', 'COMPLETED'].includes(props.requirement.status)
  )
    return;
  reset();
  const call = new AbortController();
  request = call;
  busy.value = true;
  try {
    const req = props.requirement;
    const sourceKey = `task:${await sha256Hex(JSON.stringify(['fdmreq.requirement', req.reqNo]))}`;
    if (call.signal.aborted) return;
    const { id } = await experienceApi(
      'sourceLookup',
      { sourceKey },
      call.signal,
    );
    if (call.signal.aborted) return;
    const item = id
      ? await experienceApi('own', { id }, call.signal)
      : undefined;
    if (call.signal.aborted) return;
    existing.value = item;
    seed.value = {
      sourceKey,
      title: '从已完成任务沉淀经验',
      fields: {
        title: req.title.slice(0, lengths.title),
        scenario: (
          req.rawDescription?.match(/【当前问题】\s*([^【]+)/)?.[1]?.trim() ||
          req.title
        ).slice(0, lengths.scenario),
        method: props.summary.slice(0, lengths.method),
        exception: props.risk?.slice(0, lengths.exception) || '',
        source: `已验收需求 ${req.reqNo}`.slice(0, lengths.source),
      },
    };
  } catch (error) {
    if (!call.signal.aborted)
      errorMessage.value =
        error instanceof Error ? error.message : '读取个人经验失败，请重试。';
  } finally {
    if (!call.signal.aborted) busy.value = false;
  }
}
async function save(
  input: ExperienceInput &
    ({ id: string; version: number } | { sourceKey: string }),
) {
  if (busy.value || !seed.value) return;
  const call = new AbortController();
  request = call;
  busy.value = true;
  errorMessage.value = '';
  try {
    await experienceApi('save', input, call.signal);
    if (!call.signal.aborted) {
      seed.value = undefined;
      notice.value = '已保存到我的经验。';
    }
  } catch (error) {
    if (!call.signal.aborted)
      errorMessage.value =
        error instanceof Error ? error.message : '保存失败，请重试。';
  } finally {
    if (!call.signal.aborted) busy.value = false;
  }
}
</script>
<template>
  <template
    v-if="
      requirement.reqNo &&
      ['COMPLETED', 'ACCEPTED'].includes(requirement.status)
    "
  >
    <Button :disabled="busy" @click="open">沉淀为我的经验</Button>
    <span v-if="notice" role="status">{{ notice }}</span>
    <span v-if="errorMessage && !seed" role="alert">{{ errorMessage }}</span>
    <Modal
      v-if="seed && existing?.status === 'pending'"
      :open="true"
      title="这条个人经验已提交审核"
      :footer="null"
      @cancel="reset"
    >
      <p>{{ existing.title }} · v{{ existing.version }}</p>
      <p>{{ existing.method }}</p>
    </Modal>
    <ExperienceEditor
      v-else-if="seed"
      kind="capture"
      :seed="seed"
      :item="existing"
      :busy="busy"
      :error="errorMessage"
      @close="reset"
      @save="save"
    />
  </template>
</template>
