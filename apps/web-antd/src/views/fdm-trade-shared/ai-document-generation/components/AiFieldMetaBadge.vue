<script lang="ts" setup>
import type { AiFieldState } from '../types';

import { computed } from 'vue';

import { Button, Divider, Empty, Popover, Tag } from 'ant-design-vue';

import {
  displayAiFieldValue,
  isAiFieldDraftChanged,
} from '../value-comparison';

defineOptions({ name: 'FdmAiFieldMetaBadge' });

const props = defineProps<{
  field?: AiFieldState;
}>();

const emit = defineEmits<{
  adopt: [fieldKey: string, alternativeId: string];
  restore: [fieldKey: string];
}>();

const origin = computed(() => {
  const labels = {
    AI_INFERRED: ['AI 推断', 'purple'],
    CONFLICT: ['来源冲突', 'red'],
    HUMAN_EDIT: ['人工修改', 'orange'],
    MASTER_DATA: ['主数据', 'cyan'],
    MISSING: ['缺失', 'red'],
    RULE_DEFAULT: ['规则默认', 'default'],
    SOURCE_DOCUMENT: ['前置单据', 'blue'],
  } as const;
  return props.field ? labels[props.field.origin] : labels.MISSING;
});

const confidence = computed(() => {
  if (!props.field?.confidence) return undefined;
  return {
    HIGH: ['高置信度', 'green'],
    LOW: ['低置信度', 'red'],
    MEDIUM: ['中置信度', 'orange'],
  }[props.field.confidence] as [string, string];
});
const draftChanged = computed(() => isAiFieldDraftChanged(props.field));
</script>

<template>
  <Popover placement="bottomRight" trigger="click">
    <template #content>
      <div class="ai-field-meta">
        <header>
          <div>
            <strong>{{ field?.label || '字段来源' }}</strong>
            <span>{{ field?.fieldKey }}</span>
          </div>
          <div>
            <Tag :color="origin[1]">{{ origin[0] }}</Tag>
            <Tag v-if="confidence" :color="confidence[1]">
              {{ confidence[0] }}
            </Tag>
            <Tag v-if="draftChanged" color="orange">草稿已修改</Tag>
          </div>
        </header>

        <div class="ai-field-meta__comparison">
          <section data-value-kind="source">
            <span>前置 / 来源值</span>
            <strong>{{ displayAiFieldValue(field?.sourceValue) }}</strong>
          </section>
          <section data-value-kind="proposed">
            <span>AI / 系统原建议</span>
            <strong>{{ displayAiFieldValue(field?.proposedValue) }}</strong>
          </section>
          <section :data-changed="draftChanged" data-value-kind="current">
            <span>当前人工草稿</span>
            <strong>{{ displayAiFieldValue(field?.currentValue) }}</strong>
          </section>
        </div>
        <Button
          v-if="field?.origin === 'HUMAN_EDIT'"
          block
          size="small"
          @click="emit('restore', field.fieldKey)"
        >
          恢复 AI / 系统建议
        </Button>

        <Divider>分析证据</Divider>
        <div v-if="field?.evidence?.length" class="ai-field-meta__evidence">
          <article v-for="evidence in field.evidence" :key="evidence.id">
            <strong>{{ evidence.label }}</strong>
            <span>{{ displayAiFieldValue(evidence.value) }}</span>
            <small v-if="evidence.detail">{{ evidence.detail }}</small>
            <small v-if="evidence.documentNo">
              {{ evidence.documentType }} · {{ evidence.documentNo }}
            </small>
          </article>
        </div>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="没有可展示的权威证据"
        />

        <template v-if="field?.alternatives?.length">
          <Divider>备选方案</Divider>
          <div class="ai-field-meta__alternatives">
            <article
              v-for="alternative in field.alternatives"
              :key="alternative.id"
            >
              <div>
                <strong>{{ alternative.label }}</strong>
                <Tag v-if="alternative.confidence">
                  {{ alternative.confidence }}
                </Tag>
              </div>
              <span>{{ displayAiFieldValue(alternative.value) }}</span>
              <small v-if="alternative.reason">{{ alternative.reason }}</small>
              <small v-if="alternative.impact">影响：{{ alternative.impact }}</small>
              <Button
                block
                size="small"
                type="link"
                @click="emit('adopt', field.fieldKey, alternative.id)"
              >
                采用此方案
              </Button>
            </article>
          </div>
        </template>
      </div>
    </template>

    <Button
      :aria-label="`查看${field?.label || '字段'}来源`"
      class="ai-field-meta-trigger"
      size="small"
      type="text"
    >
      <span :data-origin="field?.origin || 'MISSING'"></span>
      {{ origin[0] }}
    </Button>
  </Popover>
</template>

<style scoped>
.ai-field-meta-trigger {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 22px;
  padding-inline: 4px;
  font-size: 11px;
  color: #64748b;
}

.ai-field-meta-trigger > span {
  width: 7px;
  height: 7px;
  background: #94a3b8;
  border-radius: 50%;
}

.ai-field-meta-trigger > span[data-origin='AI_INFERRED'] {
  background: #722ed1;
}

.ai-field-meta-trigger > span[data-origin='CONFLICT'],
.ai-field-meta-trigger > span[data-origin='MISSING'] {
  background: #cf1322;
}

.ai-field-meta-trigger > span[data-origin='HUMAN_EDIT'] {
  background: #d46b08;
}

.ai-field-meta-trigger > span[data-origin='MASTER_DATA'] {
  background: #08979c;
}

.ai-field-meta-trigger > span[data-origin='SOURCE_DOCUMENT'] {
  background: #1677ff;
}

.ai-field-meta {
  display: grid;
  gap: 10px;
  width: min(390px, 78vw);
  max-height: 62vh;
  overflow-y: auto;
}

.ai-field-meta header,
.ai-field-meta header > div,
.ai-field-meta__alternatives article > div {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}

.ai-field-meta header > div:first-child {
  flex-direction: column;
  align-items: flex-start;
}

.ai-field-meta header span,
.ai-field-meta__comparison span,
.ai-field-meta article small {
  font-size: 12px;
  color: #64748b;
}

.ai-field-meta__comparison {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.ai-field-meta__comparison section {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
}

.ai-field-meta__comparison section[data-changed='true'] {
  background: #fff7e6;
  border-color: #ffd591;
}

.ai-field-meta__comparison strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .ai-field-meta__comparison {
    grid-template-columns: 1fr;
  }
}

.ai-field-meta__evidence,
.ai-field-meta__alternatives {
  display: grid;
  gap: 8px;
}

.ai-field-meta article {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
}
</style>
