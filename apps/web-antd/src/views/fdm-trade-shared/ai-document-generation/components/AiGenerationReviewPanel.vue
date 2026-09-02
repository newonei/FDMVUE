<script lang="ts" setup>
import type { AiFieldStateMap, AiValidationIssue } from '../types';

import { computed } from 'vue';

import { Alert, Button, Empty, Tabs, Tag } from 'ant-design-vue';

import { aiFieldStateSummary } from '../field-state';
import {
  displayAiFieldValue,
  isAiFieldDraftChanged,
} from '../value-comparison';
import AiFieldMetaBadge from './AiFieldMetaBadge.vue';

defineOptions({ name: 'FdmAiGenerationReviewPanel' });

const props = withDefaults(
  defineProps<{
    fields?: AiFieldStateMap;
    issues?: readonly AiValidationIssue[];
  }>(),
  {
    fields: () => ({}),
    issues: () => [],
  },
);

const emit = defineEmits<{
  adopt: [fieldKey: string, alternativeId: string];
  locate: [fieldKey: string];
  restore: [fieldKey: string];
}>();

const summary = computed(() => aiFieldStateSummary(props.fields));
const fieldList = computed(() => Object.values(props.fields));
const differences = computed(() =>
  fieldList.value.filter(
    (field) =>
      ['CONFLICT', 'HUMAN_EDIT', 'MISSING'].includes(field.origin) ||
      (field.origin === 'AI_INFERRED' && field.confidence === 'LOW'),
  ),
);
const blockers = computed(
  () => props.issues.filter((item) => item.severity === 'BLOCKER').length,
);

function severityType(severity: AiValidationIssue['severity']) {
  if (severity === 'BLOCKER') return 'error';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}
</script>

<template>
  <section class="ai-review-panel">
    <header>
      <div>
        <strong>AI 审阅</strong>
        <small>{{ summary.total }} 个可追溯字段</small>
      </div>
      <Tag :color="blockers ? 'red' : 'green'">
        {{ blockers ? `${blockers} 项阻断` : '无规则阻断' }}
      </Tag>
    </header>

    <div class="ai-review-panel__metrics">
      <div>
        <strong>{{ summary.human }}</strong><span>人工修改</span>
      </div>
      <div>
        <strong>{{ summary.lowConfidence }}</strong><span>低置信度</span>
      </div>
      <div>
        <strong>{{ summary.missing }}</strong><span>缺失</span>
      </div>
      <div>
        <strong>{{ summary.conflict }}</strong><span>冲突</span>
      </div>
    </div>

    <Tabs size="small">
      <Tabs.TabPane key="issues" :tab="`规则 ${issues.length}`">
        <div v-if="issues.length" class="ai-review-panel__list">
          <Alert
            v-for="issue in issues"
            :key="`${issue.code}-${issue.fieldKey || ''}`"
            :message="issue.message"
            show-icon
            :type="severityType(issue.severity)"
          >
            <template v-if="issue.fieldKey" #action>
              <Button
                size="small"
                type="link"
                @click="emit('locate', issue.fieldKey)"
              >
                定位
              </Button>
            </template>
          </Alert>
        </div>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="当前没有规则问题"
        />
      </Tabs.TabPane>

      <Tabs.TabPane key="diff" :tab="`差异 ${differences.length}`">
        <div v-if="differences.length" class="ai-review-panel__field-list">
          <article v-for="field in differences" :key="field.fieldKey">
            <div class="ai-review-panel__field-header">
              <div>
                <strong>{{ field.label }}</strong>
                <small>{{ field.fieldKey }}</small>
              </div>
              <div>
                <Tag v-if="isAiFieldDraftChanged(field)" color="orange">
                  已修改
                </Tag>
                <AiFieldMetaBadge
                  :field="field"
                  @adopt="
                    (fieldKey, alternativeId) =>
                      emit('adopt', fieldKey, alternativeId)
                  "
                  @restore="emit('restore', $event)"
                />
              </div>
            </div>
            <div class="ai-review-panel__comparison">
              <section data-value-kind="source">
                <span>前置 / 来源值</span>
                <strong>{{ displayAiFieldValue(field.sourceValue) }}</strong>
              </section>
              <section data-value-kind="proposed">
                <span>AI / 系统原建议</span>
                <strong>{{ displayAiFieldValue(field.proposedValue) }}</strong>
              </section>
              <section
                :data-changed="isAiFieldDraftChanged(field)"
                data-value-kind="current"
              >
                <span>当前人工草稿</span>
                <strong>{{ displayAiFieldValue(field.currentValue) }}</strong>
              </section>
            </div>
          </article>
        </div>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="没有需要人工关注的差异"
        />
      </Tabs.TabPane>

      <Tabs.TabPane key="sources" :tab="`来源 ${fieldList.length}`">
        <div class="ai-review-panel__field-list">
          <article v-for="field in fieldList" :key="field.fieldKey">
            <div>
              <strong>{{ field.label }}</strong>
              <small>{{ field.fieldKey }}</small>
            </div>
            <AiFieldMetaBadge
              :field="field"
              @adopt="
                (fieldKey, alternativeId) =>
                  emit('adopt', fieldKey, alternativeId)
              "
              @restore="emit('restore', $event)"
            />
          </article>
        </div>
      </Tabs.TabPane>
    </Tabs>
  </section>
</template>

<style scoped>
.ai-review-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ai-review-panel > header,
.ai-review-panel > header > div,
.ai-review-panel__field-header,
.ai-review-panel__field-header > div {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.ai-review-panel > header > div {
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}

.ai-review-panel header small,
.ai-review-panel__field-list small {
  font-size: 11px;
  color: #64748b;
}

.ai-review-panel__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 12px 0;
}

.ai-review-panel__metrics > div {
  display: grid;
  gap: 2px;
  place-items: center;
  padding: 7px 3px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
}

.ai-review-panel__metrics span {
  font-size: 10px;
  color: #64748b;
}

.ai-review-panel__list,
.ai-review-panel__field-list {
  display: grid;
  gap: 8px;
  max-height: 58vh;
  overflow-y: auto;
}

.ai-review-panel__field-list article {
  display: grid;
  gap: 8px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
}

.ai-review-panel__field-header > div:first-child,
.ai-review-panel__field-list article > div:first-child {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ai-review-panel__comparison {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.ai-review-panel__comparison section {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 6px 7px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
}

.ai-review-panel__comparison section[data-changed='true'] {
  background: #fff7e6;
  border-color: #ffd591;
}

.ai-review-panel__comparison span {
  font-size: 10px;
  color: #64748b;
}

.ai-review-panel__comparison strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .ai-review-panel__comparison {
    grid-template-columns: 1fr;
  }
}
</style>
