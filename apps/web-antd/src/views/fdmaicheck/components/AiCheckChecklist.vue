<script setup lang="ts">
import type { Checklist, CheckRow } from './checklist';

import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, ref } from 'vue';

import { Button, Table } from 'ant-design-vue';

import { RESULT_META, rowBasis, rowSummary, tableRows } from './checklist';
import { SEVERITY_LABELS, STATUS_LABELS } from './risk';

/**
 * 检查清单表格：一个检查点一行，默认收起，只看结论、名称、来源和一句摘要；
 * 点一行展开看检查内容、依据和逐条问题，问题在展开里处理（已处理/误报/忽略/重新打开）。
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

const columns = [
  { title: '结论', key: 'result', width: 112 },
  { title: '检查点', key: 'name', width: 200 },
  { title: '来源', key: 'source', width: 64 },
  { title: '说明', key: 'summary', ellipsis: true },
  { title: '问题', key: 'issues', width: 96, align: 'right' as const },
];

const rows = computed(() => tableRows(props.list));
const expandedKeys = ref<string[]>([]);
const allExpanded = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every((r) => expandedKeys.value.includes(r.key)),
);

function toggleAll() {
  expandedKeys.value = allExpanded.value ? [] : rows.value.map((r) => r.key);
}

function asRow(record: unknown) {
  return record as CheckRow;
}

function handledLabel(findings: FdmAiCheckApi.Finding[]) {
  const labels = new Set(findings.map((f) => STATUS_LABELS[f.status]));
  return labels.size === 1 ? [...labels][0] : '已处理';
}

function rowClass(record: unknown) {
  const row = asRow(record);
  if (row.findings.length > 0 && row.open.length === 0) return 'is-handled';
  if (row.result === 'PENDING' || row.result === 'NOT_APPLICABLE')
    return 'is-muted';
  return '';
}
</script>

<template>
  <div class="ck">
    <div class="ck-toolbar">
      <span class="ck-hint">
        共 {{ rows.length }} 项，点一行查看详情<template
          v-if="list.pending.length && pendingHint"
          >；{{ list.pending.length }} 项未检查：{{ pendingHint }}</template>
      </span>
      <Button size="small" type="link" class="ck-toggle" @click="toggleAll">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </Button>
    </div>
    <Table
      v-model:expanded-row-keys="expandedKeys"
      size="small"
      row-key="key"
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      :row-class-name="rowClass"
      :scroll="{ x: 640 }"
      expand-row-by-click
    >
      <template #bodyCell="{ column, record }">
        <span
          v-if="column.key === 'result'"
          class="ck-result"
          :class="`is-${RESULT_META[asRow(record).result].tone}-text`"
        >
          <span
            class="ck-mark sm"
            :class="`is-${RESULT_META[asRow(record).result].tone}`"
          >
            {{ RESULT_META[asRow(record).result].mark }}
          </span>
          {{ RESULT_META[asRow(record).result].label }}
        </span>
        <span v-else-if="column.key === 'name'" class="ck-name-cell">
          <span class="ck-name">{{ asRow(record).name }}</span>
          <span v-if="asRow(record).group" class="ck-src">
            {{ asRow(record).group }}
          </span>
        </span>
        <span v-else-if="column.key === 'source'" class="ck-src">
          {{ asRow(record).source === 'RULE' ? '规则' : 'AI' }}
        </span>
        <span
          v-else-if="column.key === 'summary'"
          class="ck-summary"
          :title="rowSummary(asRow(record))"
        >
          {{ rowSummary(asRow(record)) }}
        </span>
        <template v-else-if="column.key === 'issues'">
          <span v-if="asRow(record).open.length" class="ck-open">
            {{ asRow(record).open.length }} 条待处理
          </span>
          <span v-else-if="asRow(record).findings.length" class="ck-src">
            {{ handledLabel(asRow(record).findings) }}
          </span>
          <span v-else class="ck-src">—</span>
        </template>
      </template>

      <template #expandedRowRender="{ record }">
        <div class="ck-detail">
          <div v-if="asRow(record).description" class="ck-field">
            <span class="ck-label">检查内容</span>
            <span>{{ asRow(record).description }}</span>
          </div>
          <div v-if="rowBasis(asRow(record))" class="ck-field">
            <span class="ck-label">
              {{ asRow(record).result === 'NOT_APPLICABLE' ? '原因' : '依据' }}
            </span>
            <span>{{ rowBasis(asRow(record)) }}</span>
          </div>
          <div v-else-if="asRow(record).findings.length === 0" class="ck-field">
            <span class="ck-label">
              {{ asRow(record).result === 'PENDING' ? '状态' : '依据' }}
            </span>
            <span v-if="asRow(record).result === 'PENDING'">
              {{ pendingHint || '还没有检查这一项' }}
            </span>
            <span v-else>{{ rowSummary(asRow(record)) }}</span>
          </div>

          <ul v-if="asRow(record).findings.length" class="ck-findings">
            <li
              v-for="f in asRow(record).findings"
              :key="f.id"
              class="ck-finding"
              :class="{ 'is-handled': f.status !== 'OPEN' }"
            >
              <p class="ck-msg">
                <span class="ck-sev" :class="`sev-${f.severity}`">
                  {{ SEVERITY_LABELS[f.severity] }}
                </span>
                {{ f.message }}
              </p>
              <div class="ck-sub">
                <span v-if="f.suggestion">建议：{{ f.suggestion }}</span>
                <span v-if="f.status !== 'OPEN'">
                  {{ STATUS_LABELS[f.status]
                  }}{{ f.handledReason ? `：${f.handledReason}` : '' }}
                </span>
                <span v-if="actions" class="ck-actions">
                  <template v-if="f.status === 'OPEN'">
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
                  </template>
                  <Button
                    v-else
                    size="small"
                    type="link"
                    :loading="handling === f.id"
                    @click="emit('handle', f, 'OPEN')"
                  >
                    重新打开
                  </Button>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.ck {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ck-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ck-toggle {
  height: 20px;
  padding: 0 2px;
  font-size: 12px;
}

.ck :deep(.ant-table) {
  background: transparent;
}

.ck :deep(.ant-table-tbody > tr.ant-table-row) {
  cursor: pointer;
}

.ck :deep(.ant-table-tbody > tr.is-handled > td) {
  opacity: 0.65;
}

.ck :deep(.ant-table-tbody > tr.is-muted .ck-name) {
  font-weight: 400;
  color: var(--ant-color-text-secondary, #595959);
}

.ck :deep(.ant-table-expanded-row > td) {
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
}

.ck-result {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.ck-name-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ck-name {
  font-weight: 500;
}

.ck-summary {
  color: var(--ant-color-text-secondary, #595959);
}

.ck-open {
  font-size: 12px;
  color: var(--ant-color-error, #ff4d4f);
  white-space: nowrap;
}

.ck-src,
.ck-hint {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ck-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 0;
}

.ck-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.ck-label {
  font-size: 12px;
  line-height: 20px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.ck-findings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.ck-finding {
  padding: 6px 10px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 4px;
}

.ck-finding.is-handled {
  opacity: 0.65;
}

.ck-msg {
  margin: 0;
  overflow-wrap: anywhere;
}

.ck-sev {
  margin-inline-end: 4px;
  font-size: 12px;
  color: var(--ant-color-warning-text, #d48806);
}

.ck-sev.sev-HIGH {
  color: var(--ant-color-error, #ff4d4f);
}

.ck-sev.sev-INFO {
  color: var(--ant-color-primary, #1677ff);
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

.ck-mark {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  border-radius: 50%;
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

.is-pending {
  color: var(--ant-color-text-quaternary, #bfbfbf);
  background: var(--ant-color-bg-container, #fff);
  box-shadow: inset 0 0 0 1px var(--ant-color-border, #d9d9d9);
}

.is-fail-text {
  color: var(--ant-color-error, #ff4d4f);
}

.is-warn-text {
  color: var(--ant-color-warning-text, #d48806);
}

.is-unknown-text {
  color: var(--ant-geekblue-6, #2f54eb);
}

.is-pass-text {
  color: var(--ant-color-success, #52c41a);
}

.is-na-text,
.is-pending-text {
  color: var(--ant-color-text-tertiary, #8c8c8c);
}
</style>
