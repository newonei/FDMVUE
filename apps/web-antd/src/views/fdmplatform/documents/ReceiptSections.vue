<script setup lang="ts">
import type { BusinessRecord, Contract, Directory } from '#/api/fdmplatform';

import { computed, ref } from 'vue';

import { Descriptions, Switch, Table } from 'ant-design-vue';

import { attachmentTime } from '../components/attachment-preview';
import { label, money } from '../data';
import { personLabel } from '../directory';
import { rateText } from '../finance/exchange-rates/model';
import { receiptSettlement } from './model';

/** 回款详情分组字段（金智式）：默认只显示有值的字段，可切换显示空字段 */
const props = defineProps<{
  contract: Contract;
  directory?: Directory;
  display: (key: string) => string;
  record: BusinessRecord;
}>();

const showEmpty = ref(false);
const groups = [
  {
    title: '基本信息',
    fields: [
      'receivedAt|到账日期',
      'currency|币种',
      'amount|回款金额',
      'paymentMethod|到款方式',
      'accountRef|收款账户',
      'evidenceRef|历史凭证',
      'remark|说明',
      'reason|原因',
    ],
  },
  {
    title: '人民币折算',
    fields: [
      'rmbAmount|折人民币',
      'exchangeRateToCny|兑人民币汇率',
      'exchangeRateDate|汇率日期',
      'exchangeRateFallback|汇率日期匹配',
      'exchangeRateSource|汇率来源',
      'exchangeRateFetchedAt|汇率抓取时间',
    ],
  },
  {
    title: '登记与确认',
    fields: [
      'status|确认状态',
      'actorId|登记人',
      'createdAt|登记时间',
      'confirmedBy|确认人',
      'confirmedAt|确认时间',
    ],
  },
];
const sections = computed(() =>
  groups
    .map((group) => ({
      title: group.title,
      items: group.fields
        .map((pair) => {
          const [key, title] = pair.split('|') as [string, string];
          const empty =
            props.record[key] === undefined ||
            props.record[key] === null ||
            props.record[key] === '';
          const value = props.display(key);
          return {
            key,
            title,
            empty,
            value:
              key === 'exchangeRateToCny' && !empty ? rateText(value) : value,
          };
        })
        // 汇率字段缺失时显示“待补齐”，属于需要处理的信息，不当作空字段隐藏
        .filter((item) => showEmpty.value || !item.empty || item.value !== '—'),
    }))
    .filter((group) => group.items.length),
);
const hiddenCount = computed(
  () =>
    groups.flatMap((group) => group.fields).length -
    sections.value.reduce((sum, group) => sum + group.items.length, 0),
);

const currency = computed(() =>
  String(props.record.currency ?? props.contract.currency ?? ''),
);
const settlement = computed(() =>
  receiptSettlement(props.contract, props.record),
);
const allocationRows = computed(() =>
  settlement.value.allocations.map((entry) => {
    const original = entry.originalAllocationId
      ? settlement.value.allocations.find(
          (row) => row.id === entry.originalAllocationId,
        )
      : undefined;
    const invoiceId = entry.invoiceId ?? original?.invoiceId;
    return {
      id: entry.id,
      kind: entry.originalAllocationId ? '撤销核销' : '核销',
      invoice:
        props.contract.finance?.invoices?.find((item) => item.id === invoiceId)
          ?.invoiceNumber ?? '—',
      amount: money(entry.amount, currency.value),
      reason: label(entry.reason),
      actor: personLabel(props.directory, entry.actorId),
      time: attachmentTime(entry.createdAt as string | undefined),
    };
  }),
);
const refundRows = computed(() =>
  settlement.value.refunds.map((entry) => ({
    id: entry.id,
    kind: label(entry.kind),
    amount: money(entry.amount, String(entry.currency ?? currency.value)),
    status: label(entry.status),
    reason: label(entry.reason),
    time: attachmentTime(entry.createdAt as string | undefined),
  })),
);
</script>

<template>
  <section class="receipt-sections">
    <div class="receipt-sections__bar">
      <span class="text-muted-foreground text-sm">
        单据ID：{{ record.id }}
      </span>
      <label class="receipt-sections__toggle">
        显示空字段
        <span v-if="!showEmpty && hiddenCount" class="text-muted-foreground">
          （{{ hiddenCount }}）
        </span>
        <Switch v-model:checked="showEmpty" size="small" />
      </label>
    </div>
    <div v-for="group in sections" :key="group.title">
      <h4 class="receipt-sections__title">{{ group.title }}</h4>
      <Descriptions
        size="small"
        :colon="false"
        :column="{ xs: 1, sm: 2 }"
        class="receipt-sections__fields"
      >
        <Descriptions.Item
          v-for="item in group.items"
          :key="item.key"
          :label="item.title"
        >
          <span :class="{ 'text-muted-foreground': item.value === '—' }">
            {{ item.value }}
          </span>
        </Descriptions.Item>
      </Descriptions>
    </div>
    <div v-if="allocationRows.length">
      <h4 class="receipt-sections__title">
        发票核销（{{ allocationRows.length }}）
      </h4>
      <Table
        :data-source="allocationRows"
        row-key="id"
        size="small"
        :pagination="false"
        :scroll="{ x: 640 }"
        :columns="[
          { title: '类型', dataIndex: 'kind', width: 90 },
          { title: '发票号', dataIndex: 'invoice', ellipsis: true },
          {
            title: '核销金额',
            dataIndex: 'amount',
            width: 140,
            align: 'right',
          },
          { title: '操作人', dataIndex: 'actor', width: 120 },
          { title: '时间', dataIndex: 'time', width: 140 },
        ]"
      />
    </div>
    <div v-if="refundRows.length">
      <h4 class="receipt-sections__title">
        退款与冲销（{{ refundRows.length }}）
      </h4>
      <Table
        :data-source="refundRows"
        row-key="id"
        size="small"
        :pagination="false"
        :scroll="{ x: 640 }"
        :columns="[
          { title: '类型', dataIndex: 'kind', width: 90 },
          { title: '金额', dataIndex: 'amount', width: 140, align: 'right' },
          { title: '状态', dataIndex: 'status', width: 90 },
          { title: '原因', dataIndex: 'reason', ellipsis: true },
          { title: '时间', dataIndex: 'time', width: 140 },
        ]"
      />
    </div>
  </section>
</template>

<style scoped>
.receipt-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.receipt-sections__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.receipt-sections__toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
}

.receipt-sections__title {
  padding-left: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  border-left: 3px solid hsl(var(--primary));
}

.receipt-sections__fields :deep(.ant-descriptions-item-label) {
  flex: none;
  width: 104px;
  color: hsl(var(--muted-foreground));
}
</style>
