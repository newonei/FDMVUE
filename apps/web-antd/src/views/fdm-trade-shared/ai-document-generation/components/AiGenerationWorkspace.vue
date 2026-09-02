<script lang="ts" setup>
import type { AiFieldStateMap, AiValidationIssue } from '../types';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { useMediaQuery } from '@vueuse/core';
import { Button, Tabs, Tag } from 'ant-design-vue';

import AiGenerationReviewPanel from './AiGenerationReviewPanel.vue';

defineOptions({ name: 'FdmAiGenerationWorkspace' });

const props = withDefaults(
  defineProps<{
    confirming?: boolean;
    confirmLabel?: string;
    editorTabLabel?: string;
    fields?: AiFieldStateMap;
    issues?: readonly AiValidationIssue[];
    reviewPosition?: 'CENTER' | 'RIGHT';
    reviewTabLabel?: string;
    saveLabel?: string;
    saving?: boolean;
    securityNotice?: string;
    showConfirm?: boolean;
    showSave?: boolean;
    sourceSubtitle?: string;
    sourceTabLabel?: string;
    sourceTitle?: string;
    title?: string;
  }>(),
  {
    confirmLabel: '确认计划',
    confirming: false,
    editorTabLabel: '计划内容',
    fields: () => ({}),
    issues: () => [],
    reviewPosition: 'RIGHT',
    reviewTabLabel: '规则与来源',
    saveLabel: '保存草稿',
    saving: false,
    securityNotice: 'AI 仅生成建议；保存与确认均以服务端规则校验为准',
    showConfirm: false,
    showSave: true,
    sourceSubtitle: '所有源数据均由服务端实时读取',
    sourceTabLabel: '来源合同',
    sourceTitle: '来源合同',
    title: 'AI 需求计划工作台',
  },
);

const emit = defineEmits<{
  adopt: [fieldKey: string, alternativeId: string];
  cancel: [];
  confirm: [];
  locate: [fieldKey: string];
  restore: [fieldKey: string];
  save: [];
}>();

const activePane = ref('editor');
const mobile = useMediaQuery('(max-width: 1100px)');
const busy = computed(() => props.saving || props.confirming);
</script>

<template>
  <section class="ai-generation-workspace">
    <header class="ai-generation-workspace__header">
      <div>
        <span class="ai-generation-workspace__eyebrow">
          <IconifyIcon icon="lucide:sparkles" aria-hidden="true" />
          AI 单据生成
        </span>
        <h2>{{ title }}</h2>
      </div>
      <Tag color="blue">可审阅 · 可修改 · 可追溯</Tag>
    </header>

    <div
      v-if="!mobile"
      class="ai-generation-workspace__desktop"
      :class="{
        'ai-generation-workspace__desktop--review-center':
          reviewPosition === 'CENTER',
      }"
    >
      <aside class="ai-generation-workspace__source">
        <div class="ai-generation-workspace__pane-title">
          <span>
            <IconifyIcon icon="lucide:file-input" aria-hidden="true" />
          </span>
          <div>
            <strong>{{ sourceTitle }}</strong>
            <small>{{ sourceSubtitle }}</small>
          </div>
        </div>
        <slot name="source"></slot>
      </aside>

      <main class="ai-generation-workspace__editor">
        <slot name="editor"></slot>
      </main>

      <aside class="ai-generation-workspace__review">
        <AiGenerationReviewPanel
          :fields="fields"
          :issues="issues"
          @adopt="
            (fieldKey, alternativeId) => emit('adopt', fieldKey, alternativeId)
          "
          @locate="emit('locate', $event)"
          @restore="emit('restore', $event)"
        />
      </aside>
    </div>

    <Tabs
      v-else
      v-model:active-key="activePane"
      class="ai-generation-workspace__mobile"
    >
      <Tabs.TabPane key="source" :tab="sourceTabLabel">
        <slot name="source"></slot>
      </Tabs.TabPane>
      <Tabs.TabPane key="review" :tab="`${reviewTabLabel} ${issues.length}`">
        <AiGenerationReviewPanel
          :fields="fields"
          :issues="issues"
          @adopt="
            (fieldKey, alternativeId) => emit('adopt', fieldKey, alternativeId)
          "
          @locate="emit('locate', $event)"
          @restore="emit('restore', $event)"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="editor" :tab="editorTabLabel">
        <slot name="editor"></slot>
      </Tabs.TabPane>
    </Tabs>

    <footer class="ai-generation-workspace__footer">
      <div>
        <IconifyIcon icon="lucide:shield-check" aria-hidden="true" />
        {{ securityNotice }}
      </div>
      <div>
        <Button :disabled="busy" @click="emit('cancel')">返回</Button>
        <Button
          v-if="showSave"
          :loading="saving"
          :disabled="confirming"
          type="primary"
          @click="emit('save')"
        >
          {{ saveLabel }}
        </Button>
        <Button
          v-if="showConfirm"
          :loading="confirming"
          :disabled="saving"
          type="primary"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </Button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.ai-generation-workspace {
  min-height: calc(100vh - 168px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgb(15 23 42 / 6%);
}

.ai-generation-workspace__header,
.ai-generation-workspace__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.ai-generation-workspace__header {
  background:
    radial-gradient(circle at 90% 10%, rgb(37 99 235 / 8%), transparent 32%),
    linear-gradient(135deg, #fff, #f8fbff);
  border-bottom: 1px solid #e5eaf1;
}

.ai-generation-workspace__header h2 {
  margin: 4px 0 0;
  font-size: 19px;
  color: #172033;
}

.ai-generation-workspace__eyebrow {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
}

.ai-generation-workspace__desktop {
  display: grid;
  grid-template-columns: minmax(230px, 0.8fr) minmax(500px, 1.8fr) minmax(
      280px,
      1fr
    );
  min-height: calc(100vh - 300px);
}

.ai-generation-workspace__desktop--review-center {
  grid-template-columns: minmax(230px, 0.8fr) minmax(280px, 1fr) minmax(
      500px,
      1.8fr
    );
}

.ai-generation-workspace__desktop--review-center
  .ai-generation-workspace__source {
  grid-column: 1;
}

.ai-generation-workspace__desktop--review-center
  .ai-generation-workspace__review {
  grid-row: 1;
  grid-column: 2;
  border-right: 1px solid #e5eaf1;
  border-left: 0;
}

.ai-generation-workspace__desktop--review-center
  .ai-generation-workspace__editor {
  grid-row: 1;
  grid-column: 3;
}

.ai-generation-workspace__source,
.ai-generation-workspace__editor,
.ai-generation-workspace__review {
  min-width: 0;
  padding: 18px;
}

.ai-generation-workspace__source {
  background: #fbfcfe;
  border-right: 1px solid #e5eaf1;
}

.ai-generation-workspace__review {
  background: #fbfcfe;
  border-left: 1px solid #e5eaf1;
}

.ai-generation-workspace__pane-title {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.ai-generation-workspace__pane-title > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 8px;
}

.ai-generation-workspace__pane-title > div {
  display: grid;
  gap: 2px;
}

.ai-generation-workspace__pane-title small,
.ai-generation-workspace__footer > div:first-child {
  font-size: 12px;
  color: #64748b;
}

.ai-generation-workspace__footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  gap: 16px;
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid #e5eaf1;
  backdrop-filter: blur(8px);
}

.ai-generation-workspace__footer > div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-generation-workspace__mobile {
  display: none;
  padding: 0 16px;
}

@media (max-width: 1100px) {
  .ai-generation-workspace__desktop {
    display: none;
  }

  .ai-generation-workspace__mobile {
    display: block;
    min-height: calc(100vh - 300px);
  }
}

@media (max-width: 640px) {
  .ai-generation-workspace__header,
  .ai-generation-workspace__footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .ai-generation-workspace__footer > div:last-child {
    justify-content: flex-end;
    width: 100%;
  }
}
</style>
