<script setup lang="ts">
import type { Checklist } from './checklist';

import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, ref } from 'vue';

import { Button, Popover } from 'ant-design-vue';

import { RESULT_META } from './checklist';
import { SEVERITY_LABELS, STATUS_LABELS } from './risk';

/**
 * 展开后的检查清单：每个检查点一行，前面打标记：✕ 不通过、! 有疑问（逐条列出，可处理），
 * ? 缺资料、✓ 通过（写出依据），— 不适用（缩成标签，点开看原因）。
 * 单据详情和配置页试跑共用。
 */
const props = defineProps<{
  /** 显示已处理/误报/忽略按钮 */
  actions?: boolean;
  handling?: number;
  list: Checklist;
  /** 未检查那组的说明 */
  pendingHint?: string;
}>();
const emit = defineEmits<{
  handle: [finding: FdmAiCheckApi.Finding, status: FdmAiCheckApi.FindingStatus];
}>();

const showHandled = ref(false);
const openIssues = computed(() =>
  props.list.issues.filter((r) => r.open.length > 0),
);
const handledIssues = computed(() =>
  props.list.issues.filter((r) => r.open.length === 0),
);
const sections = computed(() =>
  [
    { result: 'UNKNOWN' as const, rows: props.list.unknown },
    { result: 'PASS' as const, rows: props.list.passed },
  ].filter((s) => s.rows.length > 0),
);

function handledLabel(findings: FdmAiCheckApi.Finding[]) {
  const labels = new Set(findings.map((f) => STATUS_LABELS[f.status]));
  return labels.size === 1 ? [...labels][0] : '已处理';
}
</script>

<template>
  <div class="ck">
    <ul v-if="openIssues.length" class="ck-issues">
      <li v-for="row in openIssues" :key="row.key" class="ck-issue">
        <span class="ck-mark" :class="`is-${RESULT_META[row.result].tone}`">
          {{ RESULT_META[row.result].mark }}
        </span>
        <div class="ck-body">
          <div class="ck-line">
            <span class="ck-name">{{ row.name }}</span>
            <span class="ck-chip" :class="`is-${RESULT_META[row.result].tone}`">
              {{ RESULT_META[row.result].label }}
            </span>
            <span class="ck-src">{{
              row.source === 'RULE' ? '规则' : 'AI'
            }}</span>
          </div>
          <div v-for="f in row.open" :key="f.id" class="ck-finding">
            <p class="ck-msg">
              <span
                v-if="row.open.length > 1 || f.severity === 'HIGH'"
                class="ck-sev"
              >
                {{ SEVERITY_LABELS[f.severity] }}
              </span>
              {{ f.message }}
            </p>
            <div class="ck-sub">
              <span v-if="f.suggestion">建议：{{ f.suggestion }}</span>
              <span v-if="actions" class="ck-actions">
                <Button
                  size="small"
                  type="link"
                  :loading="handling === f.id"
                  @click="emit('handle', f, 'RESOLVED')"
                >
                  已处理
                </Button>
                <Button
                  size="small"
                  type="link"
                  :disabled="handling === f.id"
                  @click="emit('handle', f, 'FALSE_POSITIVE')"
                >
                  误报
                </Button>
                <Button
                  size="small"
                  type="link"
                  :disabled="handling === f.id"
                  @click="emit('handle', f, 'IGNORED')"
                >
                  忽略
                </Button>
              </span>
            </div>
          </div>
          <p
            v-if="row.basis && row.basis !== row.open[0]?.message"
            class="ck-basis"
          >
            依据：{{ row.basis }}
          </p>
        </div>
      </li>
    </ul>

    <!-- 缺资料、通过逐条列出依据，一眼看到每个点查了什么；不适用缩成标签 -->
    <template v-for="sec in sections" :key="sec.result">
      <div class="ck-group">
        <span class="ck-mark sm" :class="`is-${RESULT_META[sec.result].tone}`">
          {{ RESULT_META[sec.result].mark }}
        </span>
        {{ RESULT_META[sec.result].label }} {{ sec.rows.length }}
        <span v-if="sec.result === 'UNKNOWN'" class="ck-hint">
          资料不全，AI 没法判断，补上资料后重新检查
        </span>
      </div>
      <ul class="ck-rows">
        <li v-for="row in sec.rows" :key="row.key" class="ck-row">
          <span
            class="ck-mark sm"
            :class="`is-${RESULT_META[row.result].tone}`"
          >
            {{ RESULT_META[row.result].mark }}
          </span>
          <span class="ck-body">
            <span class="ck-line">
              <span class="ck-name">{{ row.name }}</span>
              <span v-if="row.source === 'RULE'" class="ck-src">规则</span>
            </span>
            <span v-if="row.basis || row.source === 'RULE'" class="ck-basis">
              {{ row.basis || '系统规则没有发现问题' }}
            </span>
          </span>
        </li>
      </ul>
    </template>

    <template v-if="list.notApplicable.length">
      <div class="ck-group">
        <span class="ck-mark sm is-na">—</span>
        不适用 {{ list.notApplicable.length }}
        <span class="ck-hint">点标签看原因</span>
      </div>
      <div class="ck-chips">
        <Popover
          v-for="row in list.notApplicable"
          :key="row.key"
          trigger="click"
          placement="bottomLeft"
          :overlay-style="{ maxWidth: '360px' }"
        >
          <template #content>
            <div class="ck-pop">
              <b>{{ row.name }}</b>
              <span>不适用 ·
                {{ row.source === 'RULE' ? '系统规则' : 'AI 判断' }}</span>
              <p>{{ row.basis || '没有写原因' }}</p>
            </div>
          </template>
          <button type="button" class="ck-pchip">{{ row.name }}</button>
        </Popover>
      </div>
    </template>

    <!-- 配置了但还没有结论的检查点：没检查过的单据也能看到会查哪些点 -->
    <template v-if="list.pending.length">
      <div class="ck-group">
        <span class="ck-mark sm is-pending">○</span>
        未检查 {{ list.pending.length }}
        <span class="ck-hint">{{ pendingHint }}</span>
      </div>
      <ul class="ck-rows">
        <li v-for="row in list.pending" :key="row.key" class="ck-row">
          <span class="ck-mark sm is-pending">○</span>
          <span class="ck-body">
            <span class="ck-line">
              <span class="ck-name is-muted">{{ row.name }}</span>
              <span class="ck-src">{{
                row.source === 'RULE' ? '规则' : 'AI'
              }}</span>
              <span v-if="row.group" class="ck-src">· {{ row.group }}</span>
            </span>
            <span v-if="row.description" class="ck-basis">
              {{ row.description }}
            </span>
          </span>
        </li>
      </ul>
    </template>

    <div v-if="handledIssues.length" class="ck-handled">
      <Button
        size="small"
        type="link"
        class="ck-toggle"
        @click="showHandled = !showHandled"
      >
        {{ showHandled ? '收起' : '查看' }}已处理的
        {{ handledIssues.length }} 项
      </Button>
      <ul v-if="showHandled" class="ck-issues">
        <li
          v-for="row in handledIssues"
          :key="row.key"
          class="ck-issue is-handled"
        >
          <span class="ck-mark" :class="`is-${RESULT_META[row.result].tone}`">
            {{ RESULT_META[row.result].mark }}
          </span>
          <div class="ck-body">
            <div class="ck-line">
              <span class="ck-name">{{ row.name }}</span>
              <span class="ck-chip">
                {{ RESULT_META[row.result].label }} ·
                {{ handledLabel(row.findings) }}
              </span>
            </div>
            <div v-for="f in row.findings" :key="f.id" class="ck-finding">
              <p class="ck-msg">{{ f.message }}</p>
              <div class="ck-sub">
                <span v-if="f.handledReason">理由：{{ f.handledReason }}</span>
                <Button
                  v-if="actions"
                  size="small"
                  type="link"
                  :loading="handling === f.id"
                  @click="emit('handle', f, 'OPEN')"
                >
                  重新打开
                </Button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.ck {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ck-issues {
  padding: 0;
  margin: 0;
  list-style: none;
}

.ck-issue {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 2px 10px;
  padding: 7px 0;
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.ck-issue:first-child {
  border-top: 0;
}

.ck-issue.is-handled {
  opacity: 0.65;
}

.ck-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ck-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
}

.ck-name {
  font-weight: 500;
}

.ck-mark {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  border-radius: 50%;
}

.ck-mark.sm {
  width: 16px;
  height: 16px;
  font-size: 10px;
}

.is-pass {
  color: var(--ant-color-success, #52c41a);
  background: var(--ant-color-success-bg, #f6ffed);
}

.is-fail {
  color: var(--ant-color-error, #ff4d4f);
  background: var(--ant-color-error-bg, #fff2f0);
}

.is-warn {
  color: var(--ant-color-warning, #faad14);
  background: var(--ant-color-warning-bg, #fffbe6);
}

.is-unknown {
  color: var(--ant-geekblue-6, #2f54eb);
  background: var(--ant-geekblue-1, #f0f5ff);
}

.is-na {
  color: var(--ant-color-text-tertiary, #8c8c8c);
  background: var(--ant-color-fill-secondary, rgb(0 0 0 / 6%));
}

.ck-chip {
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  white-space: nowrap;
  background: var(--ant-color-fill-tertiary, rgb(0 0 0 / 4%));
  border-radius: 4px;
}

.ck-src,
.ck-hint {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ck-finding {
  min-width: 0;
}

.ck-msg {
  margin: 0;
  overflow-wrap: anywhere;
}

.ck-sev {
  margin-inline-end: 4px;
  font-size: 12px;
  color: var(--ant-color-error, #ff4d4f);
}

.ck-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
  align-items: center;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #595959);
}

.ck-actions :deep(.ant-btn) {
  height: 20px;
  padding: 0 4px;
  font-size: 12px;
}

.ck-basis {
  margin: 0;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  overflow-wrap: anywhere;
}

.ck-group {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #595959);
}

.ck-group::after {
  flex: 1;
  height: 1px;
  content: '';
  background: var(--ant-color-border-secondary, #f0f0f0);
}

.ck-rows {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
  list-style: none;
}

.ck-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 0 10px;
  align-items: start;
  padding: 4px 0;
  font-size: 13px;
}

.ck-row .ck-mark {
  margin: 1px 1px 0;
}

.ck-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ck-pchip {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 1px 8px 1px 3px;
  font: inherit;
  font-size: 12px;
  color: var(--ant-color-text, rgb(0 0 0 / 88%));
  cursor: pointer;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 12px;
}

.ck-pchip:hover,
.ck-pchip:focus-visible {
  outline: none;
  border-color: var(--ant-color-primary, #1677ff);
}

.ck-pop {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ck-pop span {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ck-pop p {
  margin: 4px 0 0;
}

.ck-toggle {
  padding-inline: 0;
}

.ck-name.is-muted {
  font-weight: 400;
  color: var(--ant-color-text-secondary, #595959);
}

.is-pending {
  color: var(--ant-color-text-quaternary, #bfbfbf);
  background: var(--ant-color-bg-container, #fff);
  box-shadow: inset 0 0 0 1px var(--ant-color-border, #d9d9d9);
}
</style>
