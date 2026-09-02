<script lang="ts" setup>
import type {
  RelationChainDocument,
  RelationChainMetric,
  TradeStatusTone,
} from './types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Progress } from 'ant-design-vue';

import StatusTag from './StatusTag.vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeRelationChainCard' });

const props = withDefaults(
  defineProps<{
    description?: string;
    disabled?: boolean;
    documents?: readonly RelationChainDocument[];
    emptyDocumentText?: string;
    icon: string;
    metrics?: readonly RelationChainMetric[];
    openLabel?: string;
    primaryActionLabel?: string;
    progress?: number;
    progressLabel?: string;
    status: string;
    statusTone?: TradeStatusTone;
    title: string;
  }>(),
  {
    description: undefined,
    disabled: false,
    documents: () => [],
    emptyDocumentText: '暂无关联单据',
    metrics: () => [],
    openLabel: '查看链路',
    primaryActionLabel: undefined,
    progress: undefined,
    progressLabel: '完成度',
    statusTone: 'default',
  },
);

const emit = defineEmits<{
  document: [document: RelationChainDocument];
  open: [];
  primaryAction: [];
}>();

const normalizedProgress = computed(() => {
  if (props.progress === undefined) return undefined;
  return Math.min(100, Math.max(0, Math.round(props.progress)));
});

function openDocument(document: RelationChainDocument) {
  if (!document.disabled) emit('document', document);
}
</script>

<template>
  <Card
    :bordered="false"
    class="fdm-trade-relation-card"
    :class="{ 'fdm-trade-relation-card--disabled': disabled }"
    size="small"
  >
    <header class="fdm-trade-relation-card__header">
      <div class="fdm-trade-relation-card__identity">
        <span class="fdm-trade-relation-card__icon">
          <IconifyIcon :icon="icon" aria-hidden="true" />
        </span>
        <div>
          <h3>{{ title }}</h3>
          <p v-if="description">{{ description }}</p>
        </div>
      </div>
      <div class="fdm-trade-relation-card__header-side">
        <StatusTag :text="status" :tone="statusTone" />
        <Button
          v-if="!disabled"
          class="fdm-trade-relation-card__open"
          size="small"
          type="link"
          @click="emit('open')"
        >
          {{ openLabel }}
          <IconifyIcon icon="lucide:chevron-right" aria-hidden="true" />
        </Button>
      </div>
    </header>

    <section
      v-if="normalizedProgress !== undefined"
      :aria-label="`${progressLabel} ${normalizedProgress}%`"
      class="fdm-trade-relation-card__progress"
    >
      <div>
        <span>{{ progressLabel }}</span>
        <strong>{{ normalizedProgress }}%</strong>
      </div>
      <Progress
        :percent="normalizedProgress"
        :show-info="false"
        size="small"
        stroke-color="var(--fdm-trade-primary)"
      />
    </section>

    <dl v-if="metrics.length" class="fdm-trade-relation-card__metrics">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="fdm-trade-relation-card__metric"
        :data-tone="metric.tone || 'default'"
      >
        <dt>{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
        <small v-if="metric.note">{{ metric.note }}</small>
      </div>
    </dl>

    <section class="fdm-trade-relation-card__documents">
      <div class="fdm-trade-relation-card__documents-heading">
        <h4>关联单据</h4>
        <span>{{ documents.length }} 项</span>
      </div>

      <div
        v-if="documents.length"
        class="fdm-trade-relation-card__document-list"
      >
        <button
          v-for="document in documents"
          :key="document.key"
          :aria-label="`打开关联单据 ${document.title}`"
          class="fdm-trade-relation-card__document"
          :disabled="document.disabled"
          type="button"
          @click="openDocument(document)"
        >
          <span class="fdm-trade-relation-card__document-copy">
            <strong>{{ document.title }}</strong>
            <small v-if="document.subtitle">{{ document.subtitle }}</small>
          </span>
          <StatusTag
            v-if="document.status"
            :text="document.status"
            :tone="document.statusTone || 'default'"
          />
          <IconifyIcon icon="lucide:arrow-up-right" aria-hidden="true" />
        </button>
      </div>
      <p v-else class="fdm-trade-relation-card__empty">
        {{ emptyDocumentText }}
      </p>
    </section>

    <footer v-if="primaryActionLabel" class="fdm-trade-relation-card__footer">
      <Button
        :disabled="disabled"
        size="small"
        type="link"
        @click="emit('primaryAction')"
      >
        {{ primaryActionLabel }}
        <IconifyIcon icon="lucide:arrow-right" aria-hidden="true" />
      </Button>
    </footer>
  </Card>
</template>
