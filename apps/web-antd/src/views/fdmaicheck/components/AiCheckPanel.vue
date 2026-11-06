<script setup lang="ts">
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Alert, Button, Input, message, Modal, Tooltip } from 'ant-design-vue';

import {
  getAiCheckResult,
  handleAiCheckFinding,
  recheckAiCheck,
} from '#/api/fdmaicheck';

import AiCheckBar from './AiCheckBar.vue';
import AiCheckChecklist from './AiCheckChecklist.vue';
import AiCheckDrawer from './AiCheckDrawer.vue';
import { buildChecklist, defaultExpanded } from './checklist';
import { aiStatusText, attachmentSummary, needsReason } from './risk';

/**
 * 单据详情里的 AI 检查：单据保存后后台自动检查，每个检查点都有结论。
 * 收起时一行结果条；展开后问题逐条处理、通过的缩成标签；「全部依据」在侧边抽屉里逐项看。
 * 只是提醒，不影响单据办理。
 */
const props = defineProps<{ docId?: string; docType: FdmAiCheckApi.DocType }>();
const emit = defineEmits<{ changed: [level?: FdmAiCheckApi.Severity] }>();

const POLL_MS = 5000;
const MAX_POLLS = 60;

const result = ref<FdmAiCheckApi.Result>();
const loading = ref(false);
const error = ref('');
const drawerOpen = ref(false);
/** 用户手动展开或收起过（按单据类型记住）；没选过时按有没有问题决定。 */
const expandChoice = ref<null | string>(null);
const rechecking = ref(false);
const handling = ref<number>();
const reasonFor = ref<{
  finding: FdmAiCheckApi.Finding;
  status: FdmAiCheckApi.FindingStatus;
}>();
const reason = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let polls = 0;
let seq = 0;

const list = computed(() =>
  buildChecklist(result.value?.latest?.checks, result.value?.findings ?? []),
);
const expanded = computed(() =>
  defaultExpanded(list.value, expandChoice.value),
);
const storageKey = computed(() => `fdmaicheck.expanded.${props.docType}`);
const notice = computed(() => aiStatusText(result.value?.latest?.aiStatus));
const attachmentInfo = computed(() =>
  attachmentSummary(result.value?.latest?.attachments),
);
const checkedAt = computed(() => {
  const time = result.value?.latest?.finishedTime;
  return time ? formatDateTime(time) : '';
});

function readChoice() {
  try {
    expandChoice.value = localStorage.getItem(storageKey.value);
  } catch {
    expandChoice.value = null;
  }
}

function toggle() {
  const next = expanded.value ? '0' : '1';
  expandChoice.value = next;
  try {
    localStorage.setItem(storageKey.value, next);
  } catch {
    // 浏览器不让存时只对这次有效
  }
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}

async function load(quiet = false) {
  stop();
  const id = props.docId;
  if (!id) {
    result.value = undefined;
    return;
  }
  const current = ++seq;
  if (!quiet) loading.value = true;
  try {
    const value = await getAiCheckResult(props.docType, id);
    if (current !== seq) return;
    const before = result.value?.riskLevel;
    result.value = value;
    error.value = '';
    if (value.riskLevel !== before) emit('changed', value.riskLevel);
    if (value.running && polls < MAX_POLLS) {
      polls += 1;
      timer = setTimeout(() => load(true), POLL_MS);
    }
  } catch (error_: unknown) {
    if (current === seq)
      error.value =
        error_ instanceof Error ? error_.message : '风险检查结果暂未读取';
  } finally {
    if (current === seq) loading.value = false;
  }
}

async function recheck() {
  if (!props.docId) return;
  rechecking.value = true;
  try {
    await recheckAiCheck(props.docType, props.docId);
    message.success('已重新排队检查，稍后自动刷新');
    polls = 0;
    await load(true);
  } catch (error_: unknown) {
    message.error(error_ instanceof Error ? error_.message : '重新检查失败');
  } finally {
    rechecking.value = false;
  }
}

function startHandle(
  finding: FdmAiCheckApi.Finding,
  status: FdmAiCheckApi.FindingStatus,
) {
  if (needsReason(status)) {
    reason.value = '';
    reasonFor.value = { finding, status };
    return;
  }
  void submitHandle(finding, status);
}

async function submitHandle(
  finding: FdmAiCheckApi.Finding,
  status: FdmAiCheckApi.FindingStatus,
  text?: string,
) {
  handling.value = finding.id;
  try {
    await handleAiCheckFinding(finding.id, status, text);
    reasonFor.value = undefined;
    await load(true);
  } catch (error_: unknown) {
    message.error(error_ instanceof Error ? error_.message : '处理失败');
  } finally {
    handling.value = undefined;
  }
}

function confirmReason() {
  const target = reasonFor.value;
  if (!target) return;
  const text = reason.value.trim();
  if (!text) {
    message.warning('请填写理由，下次检查时 AI 会参考');
    return;
  }
  void submitHandle(target.finding, target.status, text);
}

watch(
  () => [props.docType, props.docId],
  () => {
    polls = 0;
    drawerOpen.value = false;
    readChoice();
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(stop);

defineExpose({ reload: () => load(true) });
</script>

<template>
  <section v-if="docId" class="ai-check" aria-label="AI 检查">
    <AiCheckBar :list="list" :summary="result?.latest?.summary">
      <span v-if="result?.running" class="ai-check-running">检查中…</span>
      <span v-else-if="!result?.latest && !loading" class="ai-check-muted">单据保存后会自动检查</span>
      <span v-if="checkedAt">{{ checkedAt }}</span>
      <Tooltip title="按单据当前内容重新检查">
        <Button
          size="small"
          :loading="rechecking"
          :disabled="result?.running"
          @click="recheck"
        >
          重新检查
        </Button>
      </Tooltip>
      <Button
        v-if="list.total > 0"
        size="small"
        type="link"
        class="ai-check-link"
        @click="toggle"
      >
        {{ expanded ? '收起' : '展开' }}
      </Button>
      <Button
        v-if="list.total > 0"
        size="small"
        type="link"
        class="ai-check-link"
        @click="drawerOpen = true"
      >
        全部依据
      </Button>
    </AiCheckBar>
    <Alert
      v-if="error"
      type="warning"
      :message="error"
      show-icon
      class="ai-check-alert"
    />
    <Alert
      v-else-if="result?.lastError"
      type="warning"
      :message="`最近一次检查未完成：${result.lastError}`"
      show-icon
      class="ai-check-alert"
    />
    <template v-if="expanded || list.total === 0">
      <div v-if="notice" class="ai-check-muted ai-check-notice">
        {{ notice }}
      </div>
      <div
        v-if="result?.latest?.summary && list.total > 0"
        class="ai-check-muted ai-check-notice"
      >
        AI 结论：{{ result.latest.summary }}
      </div>
      <div v-if="attachmentInfo.read" class="ai-check-muted ai-check-notice">
        {{ attachmentInfo.read }}
      </div>
      <div
        v-for="line in attachmentInfo.others"
        :key="line"
        class="ai-check-notice ai-check-unread"
      >
        {{ line }}
      </div>
      <div
        v-if="result?.latest && !list.hasChecks && list.total > 0"
        class="ai-check-muted ai-check-notice"
      >
        这次检查是旧版本，只列出了问题；点「重新检查」可看到每个检查点的结论。
      </div>
      <AiCheckChecklist
        v-if="list.total > 0"
        class="ai-check-list"
        :list="list"
        :handling="handling"
        actions
        @handle="startHandle"
      />
    </template>
    <AiCheckDrawer
      :list="list"
      :open="drawerOpen"
      @close="drawerOpen = false"
    />
    <Modal
      :open="!!reasonFor"
      :title="
        reasonFor?.status === 'FALSE_POSITIVE' ? '标为误报' : '忽略这条风险'
      "
      ok-text="确定"
      :confirm-loading="handling !== undefined"
      @ok="confirmReason"
      @cancel="reasonFor = undefined"
    >
      <p class="ai-check-muted">{{ reasonFor?.finding.message }}</p>
      <Input.TextArea
        v-model:value="reason"
        :maxlength="500"
        :rows="3"
        show-count
        placeholder="说明为什么不是问题，例如：样品单允许零价、客户已书面确认。下次检查时 AI 会参考，同一问题不再提醒。"
      />
    </Modal>
  </section>
</template>

<style scoped>
.ai-check {
  padding: 8px 12px;
  margin: 8px 0;
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 6px;
}

.ai-check-muted {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ai-check-running {
  color: var(--ant-color-primary, #1677ff);
}

.ai-check-link {
  height: 22px;
  padding: 0 2px;
}

.ai-check-unread {
  font-size: 12px;
  color: var(--ant-color-warning-text, #d48806);
  overflow-wrap: anywhere;
}

.ai-check-notice,
.ai-check-alert {
  margin-top: 6px;
}

.ai-check-list {
  margin-top: 8px;
}
</style>
