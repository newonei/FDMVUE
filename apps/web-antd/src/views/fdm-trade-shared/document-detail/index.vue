<script setup lang="ts">
import type { TradeAiSelectedDocument } from '../ai-assistant';
import type { PrototypeDocumentType } from '../document-routing';
import type { ReceivableSummary } from '../domain/types';
import type { TradePageKey } from '../page-config';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Card, message, Result, Space } from 'ant-design-vue';

import { MetricCard, StatusTag } from '../components';
import DocumentDetailContent from '../components/DocumentDetailContent.vue';
import TradeAiAssistant from '../components/TradeAiAssistant.vue';
import { documentListPath, documentPageLocation } from '../document-routing';
import { useTradePrototypeStore } from '../domain/store';
import { findPageRow, moneyText } from '../page-adapter';
import { TRADE_PAGE_CONFIGS } from '../page-config';
import { statusTone } from '../status';

import '../page-styles.css';

defineOptions({ name: 'FdmTradePrototypeDocumentDetail' });

const route = useRoute();
const router = useRouter();
const store = useTradePrototypeStore();
const receivableSummary = ref<ReceivableSummary>();
const aiOpen = ref(false);

const pageKey = computed(() => route.meta.prototypePageKey as TradePageKey);
const config = computed(() => TRADE_PAGE_CONFIGS[pageKey.value]);
const id = computed(() => String(route.params.id ?? ''));
const row = computed(() => findPageRow(store.state, pageKey.value, id.value));
const aiSelectedDocument = computed<TradeAiSelectedDocument | undefined>(() =>
  row.value
    ? {
        id: row.value.id,
        label: row.value.primary,
        type: row.value.rawType as TradeAiSelectedDocument['type'],
      }
    : undefined,
);

const detailMetrics = computed(() => {
  if (!row.value) return [];
  return [
    {
      key: 'document',
      label: '业务单据',
      value: row.value.primary,
      icon: 'lucide:file-text',
    },
    {
      key: 'amount',
      label: row.value.currency ? '业务金额' : '关联对象',
      value: row.value.currency
        ? moneyText(row.value.currency, row.value.amount)
        : (row.value.partner ?? row.value.source ?? '—'),
      icon: 'lucide:badge-dollar-sign',
    },
    {
      key: 'status',
      label: '当前状态',
      value: row.value.statusLabel,
      icon: 'lucide:circle-dot-dashed',
    },
    {
      key: 'department',
      label: '责任部门',
      value: config.value.department,
      icon: 'lucide:building-2',
    },
  ];
});

async function loadDetail() {
  receivableSummary.value = undefined;
  if (row.value?.rawType === 'ORDER') {
    receivableSummary.value = await store.getReceivableSummary(row.value.id);
  }
}

async function backToList() {
  await router.push(documentListPath(pageDocumentType()));
}

function pageDocumentType(): PrototypeDocumentType {
  if (row.value?.rawType === 'WRITE_OFF_ITEM') return 'WRITE_OFF_ITEM';
  return (row.value?.rawType ?? 'ORDER') as PrototypeDocumentType;
}

async function navigateDocument(
  type: PrototypeDocumentType,
  documentId: string,
) {
  await router.push(documentPageLocation(type, documentId));
}

watch([id, pageKey], () => void loadDetail());

onMounted(async () => {
  try {
    if (!store.initialized) await store.initialize();
    await loadDetail();
  } catch (error) {
    message.warning(
      `单据详情读取失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
});
</script>

<template>
  <Page
    :description="`${config.department} · 独立详情页；列表筛选仍保留在原页面。`"
    :title="config.detailTitle"
  >
    <template #extra>
      <Space>
        <StatusTag
          v-if="row"
          :text="row.statusLabel"
          :tone="statusTone(row.status)"
        />
        <Button ghost type="primary" @click="aiOpen = true">
          <template #icon><IconifyIcon icon="lucide:bot" /></template>
          AI 分析当前单据
        </Button>
        <Button @click="backToList">
          <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
          返回列表
        </Button>
      </Space>
    </template>

    <Result
      v-if="!row"
      status="404"
      sub-title="该模拟单据不存在，可能已在另一个会话中重置。"
      title="未找到单据"
    >
      <template #extra>
        <Button type="primary" @click="backToList">返回权威列表</Button>
      </template>
    </Result>

    <div v-else class="fdm-trade-document-page">
      <Alert
        message="此页面与列表宽 Drawer 使用同一份会话状态；首版不显示或模拟审批操作。"
        show-icon
        type="info"
      />
      <section class="fdm-trade-document-page__metrics">
        <MetricCard
          v-for="metric in detailMetrics"
          :key="metric.key"
          :icon="metric.icon"
          :label="metric.label"
          :value="metric.value"
        />
      </section>
      <Card :bordered="false" class="fdm-trade-document-page__content">
        <DocumentDetailContent
          :page-key="pageKey"
          :receivable-summary="receivableSummary"
          :row="row"
          :state="store.state"
          @navigate-document="navigateDocument"
        />
      </Card>
    </div>
  </Page>

  <TradeAiAssistant
    v-model:open="aiOpen"
    :page-key="pageKey"
    :selected-document="aiSelectedDocument"
  />
</template>

<style scoped>
.fdm-trade-document-page {
  display: grid;
  gap: 12px;
}

.fdm-trade-document-page__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.fdm-trade-document-page__content {
  border: 1px solid var(--ant-color-border-secondary);
}

@media (max-width: 980px) {
  .fdm-trade-document-page__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
