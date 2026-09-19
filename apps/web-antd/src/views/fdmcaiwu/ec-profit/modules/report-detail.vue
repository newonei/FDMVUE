<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Empty, Modal, Spin, Table, Tag } from 'ant-design-vue';

import { getEcProfit } from '#/api/fdmcaiwu/ec-profit';

import { formatMetric, METRIC_GROUPS } from '../model';

const props = defineProps<{ open: boolean; reportId?: number }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const report = ref<FdmcaiwuEcProfitApi.Report>();
const loading = ref(false);
const error = ref('');
let requestSequence = 0;

const columns: TableColumnsType<FdmcaiwuEcProfitApi.Item> = [
  {
    title: '店铺 / 费用项目',
    dataIndex: 'shopName',
    key: 'shopName',
    fixed: 'left',
    width: 190,
  },
  { title: '平台', dataIndex: 'platformCode', width: 100 },
  { title: '所属部门', dataIndex: 'departmentName', width: 110 },
  { title: '小组', dataIndex: 'groupName', width: 100 },
  { title: '公司主体', dataIndex: 'companyName', width: 180 },
  ...METRIC_GROUPS.map((group) => ({
    title: group.title,
    children: group.metrics.map((metric) => ({
      title: metric.label,
      dataIndex: metric.key,
      key: metric.key,
      align: 'right' as const,
      width: metric.rate ? 115 : 145,
      customRender: ({ record }: { record: FdmcaiwuEcProfitApi.Item }) =>
        formatMetric(record[metric.key], metric.rate),
    })),
  })),
];

const summaryCards = computed(() => [
  { label: '销售额', value: formatMetric(report.value?.summary?.salesAmount) },
  {
    label: '采购成本（自营+周边）',
    value: formatMetric(report.value?.summary?.purchaseCost),
  },
  {
    label: '快递运费',
    value: formatMetric(report.value?.summary?.freightCost),
  },
  { label: '毛利润', value: formatMetric(report.value?.summary?.grossProfit) },
  {
    label: '毛利率',
    value: formatMetric(report.value?.summary?.grossMargin, true),
  },
]);

async function loadReport() {
  const sequence = ++requestSequence;
  report.value = undefined;
  error.value = '';
  if (!props.open || props.reportId === undefined) return;
  loading.value = true;
  try {
    const result = await getEcProfit(props.reportId);
    if (sequence === requestSequence) report.value = result;
  } catch {
    if (sequence === requestSequence)
      error.value = '月报详情加载失败，请重试。';
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

watch(
  () => [props.open, props.reportId],
  () => void loadReport(),
);
</script>

<template>
  <Modal
    :open="open"
    :title="report ? `${report.month} 电商毛利月报` : '月报详情'"
    :width="1440"
    :footer="null"
    class="ec-profit-detail"
    @cancel="emit('update:open', false)"
  >
    <Spin :spinning="loading">
      <div class="min-h-48 space-y-4 pt-3">
        <Alert v-if="error" :message="error" type="error" show-icon>
          <template #action
            ><Button size="small" @click="loadReport">重试</Button></template
          >
        </Alert>
        <template v-if="report">
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
          >
            <span>{{ report.reportNo }}</span>
            <Tag :color="report.status === 'READY' ? 'success' : 'orange'">
              {{ report.status === 'READY' ? '已就绪' : '待导入' }}
            </Tag>
            <span
              >店铺 {{ report.importedShopCount }} /
              {{ report.shopCount }} 已导入</span
            >
            <span>人民币 · 金额单位：元</span>
          </div>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div
              v-for="card in summaryCards"
              :key="card.label"
              class="rounded-lg border border-border bg-muted/30 px-4 py-3"
            >
              <div class="text-xs text-muted-foreground">{{ card.label }}</div>
              <div class="mt-2 text-xl font-semibold tabular-nums">
                {{ card.value }}
              </div>
            </div>
          </div>
          <p
            v-if="report.status === 'WAITING_IMPORT'"
            class="mb-0 text-xs text-muted-foreground"
          >
            月报已建档，金额待导入；店铺 Excel 导入与计算将在后续接入。
          </p>
          <Table
            :columns="columns"
            :data-source="report.items ?? []"
            :pagination="false"
            :scroll="{ x: 3375, y: 420 }"
            bordered
            size="small"
            row-key="id"
          >
            <template #bodyCell="{ column, record, text }">
              <div v-if="column.key === 'shopName'">
                <div class="font-medium">
                  {{ record.shopName || record.remark || '辅助费用' }}
                </div>
                <Tag v-if="record.lineType === 'ADJUSTMENT'" class="mt-1"
                  >费用调整</Tag
                >
                <div
                  class="mt-1 text-xs"
                  :class="
                    record.dataStatus === 'IMPORTED'
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                  "
                >
                  {{ record.dataStatus === 'IMPORTED' ? '已导入' : '待导入' }}
                </div>
              </div>
              <template
                v-else-if="
                  [
                    'platformCode',
                    'departmentName',
                    'groupName',
                    'companyName',
                  ].includes(String(column.dataIndex))
                "
              >
                {{ text || '—' }}
              </template>
            </template>
            <template #emptyText
              ><Empty
                description="暂无店铺明细"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
            /></template>
          </Table>
          <p
            v-if="report.remark"
            class="mb-0 whitespace-pre-wrap text-sm text-muted-foreground"
          >
            备注：{{ report.remark }}
          </p>
          <div class="text-xs text-muted-foreground">
            更新时间：{{ report.updateTime || '—' }}
          </div>
        </template>
      </div>
    </Spin>
  </Modal>
</template>
