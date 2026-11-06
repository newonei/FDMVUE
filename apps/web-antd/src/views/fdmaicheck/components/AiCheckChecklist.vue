<script setup lang="ts">
import type { Checklist } from './checklist';

import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, ref } from 'vue';

import { Button, Popover } from 'ant-design-vue';

import { RESULT_META } from './checklist';
import { SEVERITY_LABELS, STATUS_LABELS } from './risk';

/**
 * 展开后的检查清单：不通过、提醒逐条列出（可处理）；通过、不适用缩成小标签，点标签看判断依据。
 * 单据详情和配置页试跑共用。
 */
const props = defineProps<{
  /** 显示已处理/误报/忽略按钮 */
  actions?: boolean;
  handling?: number;
  list: Checklist;
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
const chips = computed(() => [...props.list.passed, ...props.list.others]);

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

    <template v-if="chips.length">
      <div class="ck-group">
        通过 {{ list.passed.length
        }}<template v-if="list.others.length">
          · 不适用或资料不足 {{ list.others.length }}
        </template>
        <span class="ck-hint">点标签看依据</span>
      </div>
      <div class="ck-chips">
        <Popover
          v-for="row in chips"
          :key="row.key"
          trigger="click"
          placement="bottomLeft"
          :overlay-style="{ maxWidth: '360px' }"
        >
          <template #content>
            <div class="ck-pop">
              <b>{{ row.name }}</b>
              <span>{{ RESULT_META[row.result].label }} ·
                {{ row.source === 'RULE' ? '系统规则' : 'AI 判断' }}</span>
              <p>{{ row.basis || '系统规则没有发现问题' }}</p>
            </div>
          </template>
          <button type="button" class="ck-pchip">
            <span
              class="ck-mark sm"
              :class="`is-${RESULT_META[row.result].tone}`"
            >
              {{ RESULT_META[row.result].mark }}
            </span>
            {{ row.name }}
            <span v-if="row.source === 'RULE'" class="ck-src">规则</span>
          </button>
        </Popover>
      </div>
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
</style>
