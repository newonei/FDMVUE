<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Descriptions, Drawer, Tag } from 'ant-design-vue';

import { formatMetric, METRIC_GROUPS } from '../model';
import { nodeState } from '../tree-model';
import CostStructure from './cost-structure.vue';

const props = defineProps<{ editable?: boolean; node?: Api.GroupNode }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ edit: [item: Api.Item] }>();
const manual = computed(() => new Set((props.node?.item?.manualFields ?? '').split(',').filter(Boolean)));

const item = computed(() => props.node?.item);
const imported = computed(() => item.value?.dataStatus === 'IMPORTED');
const headline = computed(() =>
  (['salesAmount', 'grossProfit', 'grossMargin'] as const).map((key) => ({
    key,
    label: { salesAmount: '销售额', grossProfit: '毛利润', grossMargin: '毛利率' }[key],
    value: formatMetric(item.value?.[key], key === 'grossMargin'),
    negative: Number(item.value?.[key] ?? 0) < 0,
  })),
);
</script>

<template>
  <Drawer v-model:open="open" :width="640" :title="node?.name || '明细详情'">
    <template v-if="editable && node?.item" #extra>
      <Button type="primary" size="small" @click="emit('edit', node.item)">
        <template #icon><IconifyIcon icon="lucide:pencil" /></template>修改
      </Button>
    </template>
    <template v-if="node && item">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <Tag :color="item.lineType === 'ADJUSTMENT' ? 'purple' : 'blue'">{{
          item.lineType === 'ADJUSTMENT' ? '费用调整' : '店铺'
        }}</Tag>
        <Tag :color="imported ? 'success' : 'orange'">{{ nodeState(node) }}</Tag>
        <Tag v-if="item.platformCode">{{ item.platformCode }}</Tag>
        <span class="text-sm text-muted-foreground"
          >分组：{{ node.groupName || '未配置' }}</span
        >
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="card in headline"
          :key="card.key"
          class="rounded-lg border border-border p-3"
        >
          <div class="text-xs text-muted-foreground">{{ card.label }}</div>
          <div
            class="mt-1 text-xl font-semibold"
            :class="card.negative ? 'text-[var(--ecp-negative)]' : ''"
          >
            {{ card.value }}
          </div>
        </div>
      </div>
      <section class="mt-5">
        <h3 class="mb-2 text-sm font-medium">销售额去向</h3>
        <CostStructure v-if="imported" :summary="item" />
        <p v-else class="text-sm text-muted-foreground">该店铺本月数据尚未导入。</p>
      </section>
      <section v-for="group in METRIC_GROUPS" :key="group.title" class="mt-5">
        <h3 class="mb-2 text-sm font-medium">{{ group.title }}</h3>
        <Descriptions :column="2" size="small" bordered>
          <Descriptions.Item
            v-for="metric in group.metrics"
            :key="metric.key"
            :label="metric.label"
          >
            <span
              class="tabular-nums"
              :class="Number(item[metric.key] ?? 0) < 0 ? 'text-[var(--ecp-negative)]' : ''"
              >{{ formatMetric(item[metric.key], metric.rate) }}</span
            >
            <Tag v-if="manual.has(metric.key)" color="gold" class="!ml-1 !px-1 !text-[10px] !leading-4">手工</Tag>
            <div
              v-if="metric.key === 'platformFee' && item.platformFeeBill != null"
              class="mt-0.5 text-[11px] text-muted-foreground"
            >
              账单 {{ formatMetric(item.platformFeeBill) }}
              <template v-if="Number(item.platformFeeAdjustment ?? 0) !== 0">
                · 调整 {{ formatMetric(item.platformFeeAdjustment) }}（{{ item.platformFeeAdjustmentReason }}）
              </template>
            </div>
          </Descriptions.Item>
        </Descriptions>
      </section>
      <section class="mt-5">
        <h3 class="mb-2 text-sm font-medium">来源</h3>
        <Descriptions :column="1" size="small" bordered>
          <Descriptions.Item label="公司主体">{{ item.companyName || '—' }}</Descriptions.Item>
          <Descriptions.Item label="来源批次">{{ item.sourceBatchId ?? '—' }}</Descriptions.Item>
          <Descriptions.Item label="工作表 / 行号"
            >{{ item.sourceSheetName || '—' }} / {{ item.sourceRowNumber ?? '—' }}</Descriptions.Item
          >
          <Descriptions.Item label="备注">{{ item.remark || '—' }}</Descriptions.Item>
        </Descriptions>
      </section>
    </template>
  </Drawer>
</template>
