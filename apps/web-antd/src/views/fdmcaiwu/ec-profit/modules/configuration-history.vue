<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';
import { getEcProfitConfigurationHistory } from '#/api/fdmcaiwu/ec-profit';

const props = defineProps<{ revision: number }>();
const active = ref<string[]>([]);
const rows = ref<Api.ConfigurationHistory[]>([]);
const loading = ref(false);
const error = ref('');
const detail = ref<Api.ConfigurationHistory>();
const open = ref(false);
let sequence = 0;
const labels: Record<string, string> = {
  ASSIGNMENTS: '店铺归属变更',
  DEFAULT_GROUP_SET: '设置默认分组',
  MONTH_GROUP_SET: '按月调整分组',
  MONTH_GROUP_RESET: '恢复默认分组',
  SCOPE_SYNC: '月报范围同步',
  GROUP_CREATE: '新增分组',
  GROUP_UPDATE: '修改分组',
  GROUP_DELETE: '删除分组',
  IMPORT_APPLY: '导入 Excel',
  ITEM_CREATE: '添加明细',
  ITEM_UPDATE: '修改明细',
  ITEM_DELETE: '删除明细',
  ITEM_FILL_BLANK: '批量填写空白',
  REPORT_PURGE: '清空整月',
};
/** 明细字段的中文名，用于修改记录逐项展示 */
const FIELD_LABELS: Record<string, string> = {
  salesAmount: '销售额',
  newProductGiftAmount: '新品礼金',
  customerRefundAmount: '客户返款',
  purchaseCost: '采购成本',
  accessoryPurchaseCost: '其中周边',
  dropshipPurchaseCost: '代发采购',
  estimatedFreight: '暂估运费',
  freightAdjustment: '运费差异',
  freightCost: '快递运费',
  promotionCost: '推广费',
  platformFeeBill: '平台账单费用',
  platformFeeAdjustment: '平台费用调整',
  platformFeeAdjustmentReason: '调整原因',
  platformFee: '平台扣费',
  taxFee: '税费',
  grossProfit: '毛利润',
};
const DATA_ACTIONS = new Set(['IMPORT_APPLY', 'ITEM_CREATE', 'ITEM_UPDATE', 'ITEM_DELETE', 'ITEM_FILL_BLANK', 'REPORT_PURGE']);
function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
const columns = [
  { title: '操作时间', dataIndex: 'createTime', width: 180 },
  { title: '变更类型', key: 'action', width: 150 },
  { title: '操作人', dataIndex: 'creator', width: 110 },
  { title: '变更摘要', key: 'summary', width: 300 },
  { title: '操作', key: 'actions', width: 80 },
];
const changeColumns = [
  { title: '店铺', dataIndex: 'shopName', width: 180 },
  { title: '原值', key: 'before', width: 270 },
  { title: '新值', key: 'after', width: 270 },
];
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function label(value: unknown) {
  const data = object(value);
  if (!Object.keys(data).length) return '—';
  if ('configured' in data && !data.configured) return '未配置';
  if ('included' in data && !data.included)
    return `不纳入毛利 · ${data.reason || '未填写原因'}`;
  return [
    data.departmentName || '未分配部门',
    data.groupName || data.name || '未分组',
    data.effectiveMonth ? `${data.effectiveMonth} 起` : '',
    typeof data.enabled === 'boolean' ? (data.enabled ? '启用' : '停用') : '',
    data.reason || '',
  ]
    .filter(Boolean)
    .join(' / ');
}
const changes = computed(() => {
  const result = detail.value?.result ?? {};
  if (detail.value && DATA_ACTIONS.has(detail.value.action)) {
    const before = object(result.before);
    const after = object(result.after);
    return Object.keys(FIELD_LABELS)
      .filter((key) => key in before || key in after)
      .filter((key) => text(before[key]) !== text(after[key]))
      .map((key) => ({
        rowKey: key,
        shopName: FIELD_LABELS[key],
        before: text(before[key]),
        after: text(after[key]),
      }));
  }
  if (Array.isArray(result.changes))
    return result.changes.map((change, index) => ({
      ...object(change),
      rowKey: String(index),
    }));
  if (result.before || result.after)
    return [
      {
        rowKey: 'group',
        shopName: '分组',
        before: result.before,
        after: result.after,
      },
    ];
  return [];
});
function summary(row: Api.ConfigurationHistory) {
  const result = row.result;
  if (DATA_ACTIONS.has(row.action)) {
    const inner = object(result.result);
    switch (row.action) {
      case 'IMPORT_APPLY':
        return `${text(result.month)} · ${text(result.fileName)}：新增 ${text(inner.created)}，更新 ${text(inner.updated)}，无变化 ${text(inner.unchanged)}`;
      case 'ITEM_FILL_BLANK':
        return `${text(result.month)} · ${FIELD_LABELS[String(result.field)] ?? text(result.field)} 空白填为 ${text(result.value)}（${text(result.count)} 行）`;
      case 'REPORT_PURGE':
        return `${text(result.month)} · 清空 ${text(result.itemCount)} 行明细`;
      default:
        return `${text(result.month)} · ${text(result.shopName)}`;
    }
  }
  if (row.action === 'DEFAULT_GROUP_SET')
    return `${text(result.count)} 家店铺默认分组 → ${text(result.groupName)}`;
  if (row.action === 'MONTH_GROUP_SET')
    return `${text(result.month)} · ${text(result.count)} 家店铺本月调到 ${text(result.groupName)}${result.reason ? `（${result.reason}）` : ''}`;
  if (row.action === 'MONTH_GROUP_RESET')
    return `${text(result.month)} · ${text(result.count)} 家店铺恢复默认分组`;
  if (Array.isArray(result.changes))
    return `${result.changes.length} 项变更${result.effectiveMonth ? ` · ${result.effectiveMonth} 起` : ''}`;
  if (result.before || result.after)
    return `${label(result.before)} → ${label(result.after)}`;
  return result.month
    ? `${result.month} 月报范围`
    : `配置版本 ${result.configVersion ?? '—'}`;
}
async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const result = await getEcProfitConfigurationHistory();
    if (current === sequence) rows.value = result;
  } catch {
    if (current === sequence) error.value = '变更记录加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [active.value.length, props.revision],
  () => {
    if (active.value.length) void load();
  },
);
onBeforeUnmount(() => sequence++);
</script>

<template>
  <Collapse v-model:active-key="active" class="mt-4"
    ><Collapse.Panel key="history" header="最近变更记录（分组配置、导入、手工修改；最多 50 条）"
      ><Alert v-if="error" type="error" :message="error" class="mb-3" />
      <div class="mb-3 flex justify-end">
        <Button size="small" :loading="loading" @click="load">刷新记录</Button>
      </div>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
        :scroll="{ x: 820 }"
        row-key="id"
        size="small"
        ><template #bodyCell="{ column, record }"
          ><Tag v-if="column.key === 'action'">{{
            labels[record.action] || record.action
          }}</Tag
          ><template v-else-if="column.key === 'summary'">{{
            summary(record as Api.ConfigurationHistory)
          }}</template
          ><Button
            v-else-if="column.key === 'actions'"
            size="small"
            type="link"
            @click="
              detail = record as Api.ConfigurationHistory;
              open = true;
            "
            >详情</Button
          ></template
        ></Table
      ></Collapse.Panel
    ></Collapse
  >
  <Modal v-model:open="open" title="配置变更详情" :width="880" :footer="null"
    ><template v-if="detail"
      ><Descriptions class="my-4" :column="2" size="small"
        ><Descriptions.Item label="类型">{{
          labels[detail.action] || detail.action
        }}</Descriptions.Item
        ><Descriptions.Item label="操作人">{{
          detail.creator
        }}</Descriptions.Item
        ><Descriptions.Item label="时间">{{
          detail.createTime
        }}</Descriptions.Item
        ><Descriptions.Item label="配置版本">{{
          detail.result.configVersion ?? '—'
        }}</Descriptions.Item></Descriptions
      ><Table
        :columns="changeColumns"
        :data-source="changes"
        :pagination="false"
        :scroll="{ x: 720, y: 400 }"
        row-key="rowKey"
        size="small"
        ><template #bodyCell="{ column, record }"
          ><template v-if="column.key === 'before'">{{
            typeof record.before === 'string' ? record.before : label(record.before)
          }}</template
          ><template v-else-if="column.key === 'after'">{{
            typeof record.after === 'string' ? record.after : label(record.after)
          }}</template></template
        ><template #emptyText
          >本次记录未包含逐项前后值，请查看变更摘要。</template
        ></Table
      >
      <p class="mt-3 text-xs text-muted-foreground">
        {{ summary(detail) }}
      </p></template
    ></Modal
  >
</template>
