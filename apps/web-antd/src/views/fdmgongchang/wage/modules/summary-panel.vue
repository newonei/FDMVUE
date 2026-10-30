<script setup lang="ts">
import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { downloadFileFromBlobPart, formatDateTime } from '@vben/utils';

import { Alert, Button, message, Modal, Spin, Table } from 'ant-design-vue';

import {
  exportWageDetail,
  exportWageSummary,
  getWageSummary,
  reopenWageMonth,
  settleWageMonth,
} from '#/api/fdmgongchang/wage';

import { formatMoney, toNum } from '../../shared/wage';

/** 月度汇总：按人汇总计件、计时、杂活、补助；全部确认后结算锁定，导出给财务。 */
const props = defineProps<{ month: string; refreshKey: number }>();
const emit = defineEmits<{ changed: [] }>();

const { hasAccessByCodes } = useAccess();
const canSettle = computed(() => hasAccessByCodes(['fdmgongchang:wage:settle']));

const summary = ref<Api.Summary>();
const loading = ref(false);
const busy = ref(false);

async function load() {
  loading.value = true;
  try {
    summary.value = await getWageSummary(props.month);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => [props.month, props.refreshKey], load);

async function download(kind: 'detail' | 'summary') {
  const data = kind === 'summary' ? await exportWageSummary(props.month) : await exportWageDetail(props.month);
  downloadFileFromBlobPart({
    fileName: `计件工资${kind === 'summary' ? '汇总' : '明细'}-${props.month}.xlsx`,
    source: data,
  });
}

function settle() {
  Modal.confirm({
    content: `结算后 ${props.month} 的报工不能再登记、修改和删除；需要改时可以取消结算。`,
    okText: '确认结算',
    onOk: async () => {
      busy.value = true;
      try {
        await settleWageMonth(props.month);
        message.success(`${props.month} 已结算`);
        await load();
        emit('changed');
      } finally {
        busy.value = false;
      }
    },
    title: `结算 ${props.month}？`,
  });
}

async function reopen() {
  busy.value = true;
  try {
    await reopenWageMonth(props.month);
    message.success(`${props.month} 已取消结算，可以继续修改`);
    await load();
    emit('changed');
  } finally {
    busy.value = false;
  }
}

const columns = [
  { dataIndex: 'userName', key: 'userName', title: '姓名' },
  { dataIndex: 'team', key: 'team', title: '班组' },
  { align: 'right' as const, key: 'processAmount', title: '工序计件' },
  { align: 'right' as const, key: 'timeAmount', title: '计时' },
  { align: 'right' as const, key: 'miscAmount', title: '杂活' },
  { align: 'right' as const, key: 'allowanceAmount', title: '补助' },
  { align: 'right' as const, key: 'totalAmount', title: '合计（元）' },
  { align: 'right' as const, key: 'pendingCount', title: '待确认' },
];
const moneyKeys = new Set(['allowanceAmount', 'miscAmount', 'processAmount', 'timeAmount', 'totalAmount']);
</script>

<template>
  <Spin :spinning="loading">
    <div v-if="summary" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>合计 <b class="text-lg tabular-nums">{{ formatMoney(summary.totalAmount) }}</b> 元</span>
          <span class="text-muted-foreground">{{ summary.people.length }} 人 · {{ summary.recordCount }} 条报工</span>
          <span v-if="summary.pendingCount > 0" class="text-warning">{{ summary.pendingCount }} 条待确认</span>
          <span v-if="summary.settled" class="text-success">
            已结算 · {{ summary.settledBy }} · {{ formatDateTime(summary.settledAt ?? undefined) }}
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="small" @click="download('summary')">导出汇总</Button>
          <Button size="small" @click="download('detail')">导出明细</Button>
          <template v-if="canSettle">
            <Button v-if="summary.settled" :loading="busy" size="small" @click="reopen">取消结算</Button>
            <Button
              v-else
              :disabled="summary.pendingCount > 0 || summary.recordCount === 0"
              :loading="busy"
              size="small"
              type="primary"
              @click="settle"
            >
              结算本月
            </Button>
          </template>
        </div>
      </div>
      <Alert
        v-if="!summary.settled && summary.pendingCount > 0"
        :message="`还有 ${summary.pendingCount} 条报工待确认，班组长在「报工登记」里确认后才能结算。`"
        show-icon
        type="info"
      />
      <Table :columns="columns" :data-source="summary.people" :pagination="false" :scroll="{ x: 'max-content' }" row-key="userId" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="moneyKeys.has(String(column.key))">
            <component :is="column.key === 'totalAmount' ? 'b' : 'span'" class="tabular-nums">
              {{ toNum(record[column.key as string]) ? formatMoney(record[column.key as string]) : '—' }}
            </component>
            <div v-if="column.key === 'timeAmount' && toNum(record.hours)" class="text-xs text-muted-foreground">
              {{ formatMoney(record.hours) }} 小时
            </div>
          </template>
          <template v-else-if="column.key === 'pendingCount'">
            <span :class="record.pendingCount > 0 ? 'text-warning' : 'text-muted-foreground'">{{ record.pendingCount || '—' }}</span>
          </template>
        </template>
        <template #emptyText>
          <span class="text-muted-foreground">{{ month }} 还没有报工</span>
        </template>
      </Table>
    </div>
  </Spin>
</template>
