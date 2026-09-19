<script setup lang="ts">
import type { WorkboardGroup, WorkboardLaunch } from './contract-workboard';

import type { Contract } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import { Button, Card, Tag } from 'ant-design-vue';

import { nativeMoney } from '../documents/migration-display';
import { contractDeliveryStatus } from './contract-progress';
import { contractWorkboard } from './contract-workboard';
import { amountText } from './finance-progress';

const props = defineProps<{
  contract: Contract;
  disabled?: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{ launch: [value: WorkboardLaunch] }>();
const expanded = ref<string>();
const showAll = ref(false);
const groups = computed(() => contractWorkboard(props.contract));
const visible = computed(() =>
  showAll.value ? groups.value : groups.value.slice(0, 4),
);
const metrics = computed(() => [
  {
    title: '订单金额',
    value: nativeMoney(props.contract.amount, props.contract.currency),
  },
  {
    title: '已回款',
    value: amountText(
      props.contract.financeSummary,
      'confirmedReceipts',
      props.contract.currency,
      nativeMoney,
    ),
  },
  {
    title: '未回款',
    value: amountText(
      props.contract.financeSummary,
      'unpaidAmount',
      props.contract.currency,
      nativeMoney,
    ),
  },
  { title: '交付状态', value: contractDeliveryStatus(props.contract) },
]);
function choose(group: WorkboardGroup) {
  if (props.disabled || props.loading) return;
  if (group.records.length === 1) emit('launch', group.records[0]!.launch);
  else expanded.value = expanded.value === group.key ? undefined : group.key;
}
watch(
  () => props.contract.id,
  () => {
    expanded.value = undefined;
    showAll.value = false;
  },
);
</script>
<template>
  <div class="workboard-metrics" aria-label="订单办理概况">
    <div v-for="metric in metrics" :key="metric.title" class="workboard-metric">
      <span>{{ metric.title }}</span><strong>{{ loading ? '正在读取…' : metric.value }}</strong>
    </div>
  </div>
  <Card title="接下来可办理" size="small" class="workboard">
    <p class="workboard-note">
      按当前订单资料整理；采购、交付和收款可分别推进。点击后在当前页面办理。
    </p>
    <p v-if="loading" role="status">正在刷新办理事项…</p>
    <p v-else-if="!groups.length" class="workboard-note">
      {{
        ['CLOSED', 'CANCELLED'].includes(contract.status)
          ? '订单已结束，可查看历史关联单据。'
          : contract.blockReasons?.length
            ? '请先补齐上方提示的办理资料。'
            : contract.status === 'DRAFT'
              ? '先完善订单并在上方办理生效；回款等可用操作见下方快捷入口。'
              : '当前已读取的资料中没有待推进的匹配单据，可通过下方快捷入口新建或查看全部关联单据。'
      }}
    </p>
    <template v-else>
      <div v-for="group in visible" :key="group.key" class="workboard-group">
        <div class="workboard-row">
          <div>
            <strong>{{ group.title }}</strong><Tag>{{ group.records.length }} 项</Tag>
            <p class="workboard-note">{{ group.description }}</p>
          </div>
          <Button :disabled="disabled || loading" @click="choose(group)">
            {{
              group.records.length === 1
                ? group.button
                : expanded === group.key
                  ? '收起单据'
                  : '选择单据办理'
            }}
          </Button>
        </div>
        <ul v-if="expanded === group.key" class="workboard-records">
          <li v-for="(record, index) in group.records" :key="record.id">
            <span>{{ index + 1 }}. {{ record.title }}</span>
            <Button
              type="link"
              :disabled="disabled || loading"
              @click="emit('launch', record.launch)"
            >
              {{ group.button }}
            </Button>
          </li>
        </ul>
      </div>
      <Button
        v-if="groups.length > 4"
        type="link"
        :disabled="disabled"
        @click="showAll = !showAll"
      >
        {{ showAll ? '收起其他事项' : `查看全部 ${groups.length} 类办理事项` }}
      </Button>
    </template>
  </Card>
</template>
<style scoped>
.workboard-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.workboard-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--ant-color-border-secondary, #e5e7eb);
  border-radius: 8px;
}

.workboard-metric > span,
.workboard-note {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #64748b);
}

.workboard-metric strong {
  font-size: 16px;
  overflow-wrap: anywhere;
}

.workboard {
  margin-bottom: 16px;
}

.workboard-group + .workboard-group {
  border-top: 1px solid var(--ant-color-border-secondary, #e5e7eb);
}

.workboard-row,
.workboard-records li {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.workboard-row strong {
  margin-right: 8px;
}

.workboard-row > button {
  flex-shrink: 0;
}

.workboard-note {
  margin: 4px 0 0;
}

.workboard-records {
  max-height: 260px;
  padding: 0 12px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
  background: var(--ant-color-fill-alter, #f8fafc);
  border-radius: 6px;
}

.workboard-records li {
  padding: 5px 0;
}

@media (max-width: 640px) {
  .workboard-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workboard-row {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
}
</style>
