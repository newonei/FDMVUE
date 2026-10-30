<script setup lang="ts">
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Input,
  message,
  Modal,
  Space,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  getAiCheckResult,
  handleAiCheckFinding,
  recheckAiCheck,
} from '#/api/fdmaicheck';

import {
  aiStatusText,
  needsReason,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  sortFindings,
  STATUS_LABELS,
} from './risk';

/**
 * 单据详情里的 AI 风险检查：单据保存后后台自动检查，这里显示结论和风险项，负责人逐条处理。
 * 只是提醒，不影响单据办理。
 */
const props = defineProps<{ docId?: string; docType: FdmAiCheckApi.DocType }>();
const emit = defineEmits<{ changed: [level?: FdmAiCheckApi.Severity] }>();

const POLL_MS = 5000;
const MAX_POLLS = 60;

const result = ref<FdmAiCheckApi.Result>();
const loading = ref(false);
const error = ref('');
const showHandled = ref(false);
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

const findings = computed(() => sortFindings(result.value?.findings ?? []));
const open = computed(() => findings.value.filter((f) => f.status === 'OPEN'));
const handled = computed(() =>
  findings.value.filter((f) => f.status !== 'OPEN'),
);
const level = computed(() => result.value?.riskLevel);
const notice = computed(() => aiStatusText(result.value?.latest?.aiStatus));
const checkedAt = computed(() => {
  const time = result.value?.latest?.finishedTime;
  return time ? formatDateTime(time) : '';
});

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
    showHandled.value = false;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(stop);

defineExpose({ reload: () => load(true) });
</script>

<template>
  <section v-if="docId" class="ai-check" aria-label="AI 风险检查">
    <header class="ai-check-head">
      <span class="ai-check-title">AI 风险检查</span>
      <Tag v-if="level" :color="SEVERITY_COLORS[level]">
        {{
          level === 'NONE'
            ? '未发现风险'
            : `${SEVERITY_LABELS[level]} · ${open.length} 条待处理`
        }}
      </Tag>
      <Tag v-if="result?.running" color="processing">检查中…</Tag>
      <span
        v-if="result?.latest?.summary"
        class="ai-check-summary"
        :title="result.latest.summary"
      >
        {{ result.latest.summary }}
      </span>
      <span
        v-else-if="!result?.latest && !result?.running && !loading"
        class="ai-check-muted"
      >
        单据保存后会自动检查
      </span>
      <Space class="ai-check-actions" size="small">
        <span v-if="checkedAt" class="ai-check-muted">{{ checkedAt }}</span>
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
      </Space>
    </header>
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
    <div v-if="notice" class="ai-check-muted ai-check-notice">{{ notice }}</div>
    <ul v-if="open.length" class="ai-check-list">
      <li v-for="finding in open" :key="finding.id" class="ai-check-item">
        <div class="ai-check-line">
          <Tag :color="SEVERITY_COLORS[finding.severity]" class="ai-check-sev">
            {{ SEVERITY_LABELS[finding.severity] }}
          </Tag>
          <span class="ai-check-source">{{
            finding.source === 'RULE' ? '规则' : 'AI'
          }}</span>
          <span class="ai-check-message">{{ finding.message }}</span>
        </div>
        <div v-if="finding.suggestion" class="ai-check-suggestion">
          建议：{{ finding.suggestion }}
        </div>
        <Space size="small" class="ai-check-item-actions">
          <Button
            size="small"
            type="link"
            :loading="handling === finding.id"
            @click="startHandle(finding, 'RESOLVED')"
          >
            已处理
          </Button>
          <Button
            size="small"
            type="link"
            :disabled="handling === finding.id"
            @click="startHandle(finding, 'FALSE_POSITIVE')"
          >
            误报
          </Button>
          <Button
            size="small"
            type="link"
            :disabled="handling === finding.id"
            @click="startHandle(finding, 'IGNORED')"
          >
            忽略
          </Button>
        </Space>
      </li>
    </ul>
    <div v-if="handled.length" class="ai-check-handled">
      <Button
        size="small"
        type="link"
        class="ai-check-toggle"
        @click="showHandled = !showHandled"
      >
        {{ showHandled ? '收起' : '查看' }}已处理的 {{ handled.length }} 条
      </Button>
      <ul v-if="showHandled" class="ai-check-list">
        <li
          v-for="finding in handled"
          :key="finding.id"
          class="ai-check-item is-handled"
        >
          <div class="ai-check-line">
            <Tag class="ai-check-sev">{{ STATUS_LABELS[finding.status] }}</Tag>
            <span class="ai-check-source">{{
              finding.source === 'RULE' ? '规则' : 'AI'
            }}</span>
            <span class="ai-check-message">{{ finding.message }}</span>
          </div>
          <div v-if="finding.handledReason" class="ai-check-suggestion">
            理由：{{ finding.handledReason }}
          </div>
          <Button
            size="small"
            type="link"
            :loading="handling === finding.id"
            @click="startHandle(finding, 'OPEN')"
          >
            重新打开
          </Button>
        </li>
      </ul>
    </div>
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
  padding: 10px 12px;
  margin: 8px 0;
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 6px;
}

.ai-check-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}

.ai-check-title {
  font-weight: 600;
}

.ai-check-summary {
  flex: 1 1 200px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-check-actions {
  margin-inline-start: auto;
}

.ai-check-muted {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ai-check-notice,
.ai-check-alert {
  margin-top: 6px;
}

.ai-check-list {
  padding: 0;
  margin: 6px 0 0;
  list-style: none;
}

.ai-check-item {
  padding: 6px 0;
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.ai-check-item.is-handled {
  opacity: 0.75;
}

.ai-check-line {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.ai-check-sev {
  flex: none;
  margin-inline-end: 0;
}

.ai-check-source {
  flex: none;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ai-check-message {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ai-check-suggestion {
  margin: 2px 0 0 4px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #595959);
}

.ai-check-item-actions {
  margin-top: 2px;
}

.ai-check-toggle {
  padding-inline: 0;
}
</style>
