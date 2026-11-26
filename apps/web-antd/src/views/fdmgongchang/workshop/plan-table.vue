<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { WorkshopPlanRow } from './plan-model';

import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Button, Input, Modal, Pagination, Select, Table } from 'ant-design-vue';

import TaskMaterials from '../schedule/modules/task-materials.vue';
import { formatQty, sumQty, toNumber } from '../stage-stock/model';
import { buildWorkshopPlanRows } from './plan-model';
import RelatedOrderTable from './related-order-table.vue';

const props = defineProps<{
  options?: StockApi.Options;
  process: string;
  tasks: Api.Task[];
}>();
const emit = defineEmits<{ openOrder: [id: number] }>();

const keyword = ref('');
const date = ref<string>();
const status = ref<WorkshopPlanRow['progress']['group']>();
const page = ref(1);
const pageSize = ref(20);
const detailId = ref<number>();

const rows = computed(() => buildWorkshopPlanRows(props.tasks, props.options));
const dateOptions = computed(() => [...new Set(rows.value.map((row) => row.date))]
  .map((value) => ({ label: value || '未定日期', value })));
const statusOptions = [
  { label: '待跟进', value: 'pending' },
  { label: '已达标', value: 'completed' },
  { label: '差额已处理', value: 'handled' },
  { label: '已关闭', value: 'closed' },
];

const visibleRows = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase();
  return rows.value.filter((row) => {
    if (date.value !== undefined && row.date !== date.value) return false;
    if (status.value && row.progress.group !== status.value) return false;
    return !query || [row.order, row.customer, row.product, row.size, `#${row.task.id}`,
      ...row.colors.map((color) => color.value)]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
});
const pageRows = computed(() => visibleRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const dateSpans = computed(() => {
  const spans = new Map<number, number>();
  let first: undefined | WorkshopPlanRow;
  for (const row of pageRows.value) {
    if (first?.date === row.date) {
      spans.set(first.task.id, (spans.get(first.task.id) ?? 1) + 1);
      spans.set(row.task.id, 0);
    } else {
      first = row;
      spans.set(row.task.id, 1);
    }
  }
  return spans;
});
const pendingCount = computed(() => visibleRows.value.filter((row) => row.progress.group === 'pending').length);
const detail = computed(() => rows.value.find((row) => row.task.id === detailId.value));

watch([keyword, date, status, pageSize], () => { page.value = 1; });
watch(() => visibleRows.value.length, (total) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(total / pageSize.value)));
});

const materialTitles: Record<string, string> = {
  MIX: '产出版材',
  SLICE: '计划用板 / 可开片',
};
const requirementTitles: Record<string, string> = {
  EMBOSS: '正反纹路',
  ENGRAVE: '雕刻图案',
  FOLD: '折叠要求',
  MIX: '密炼 / 模具',
  PACK: '包装要求',
  SLICE: '单双色',
};
const columns = computed<TableColumnsType<WorkshopPlanRow>>(() => {
  const requirement = requirementTitles[props.process];
  return [
    {
      key: 'date', title: '生产日期', width: 106, fixed: 'left',
      customCell: (row) => ({ rowSpan: dateSpans.value.get(row.task.id), class: 'plan-date-cell' }),
    },
    { key: 'order', title: '订单 / 客户', width: 166, fixed: 'left' },
    { key: 'size', title: '成品规格', width: 132 },
    { key: 'colors', title: '颜色 / 正反', width: 136 },
    { key: 'orderQuantity', title: '订单数量', width: 94, align: 'right' },
    { key: 'materials', title: materialTitles[props.process] ?? '计划用料', width: 152 },
    ...(requirement ? [{ key: 'requirements', title: requirement, width: 168 }] : []),
    { key: 'planned', title: '任务计划', width: 94, align: 'right' },
    { key: 'good', title: '累计良品', width: 93, align: 'right', className: 'plan-good-cell' },
    { key: 'defect', title: '累计残次', width: 92, align: 'right', className: 'plan-defect-cell' },
    { key: 'achievement', title: '良品达成率', width: 126, className: 'plan-achievement-cell' },
    { key: 'notes', title: '备注', width: 136 },
    { key: 'actions', title: '操作', width: 72 },
  ];
});
const tableWidth = computed(() => columns.value.reduce((sum, column) => sum + Number(column.width), 0));
const mixSummaryLabels = new Set(['克重', '密炼锅数', '模具']);
function summaryRequirements(fields: WorkshopPlanRow['requirements']) {
  if (props.process !== 'MIX') return fields;
  const summary = fields.filter((field) => mixSummaryLabels.has(field.label));
  return summary.length > 0 ? summary : fields.slice(0, 3);
}
const qty = (value: Api.Decimal | null | undefined, unit: Api.Task['unit']) =>
  value === null || value === undefined
    ? '—'
    : `${formatQty(value)}${unit ? ` ${unit}` : ''}`;
const percent = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2, style: 'percent' });
</script>

<template>
  <section aria-label="车间日计划" class="min-w-0 rounded-lg border border-border bg-background">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <h2 class="m-0 text-base font-semibold">车间日计划</h2>
        <span class="text-muted-foreground">共 {{ visibleRows.length }} 项 · 待跟进 {{ pendingCount }} 项</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <Input
          v-model:value="keyword"
          allow-clear
          aria-label="搜索日计划"
          class="!w-52 max-w-full"
          placeholder="搜索订单、产品、颜色或任务"
          size="small"
        />
        <Select
          v-model:value="date"
          :options="dateOptions"
          allow-clear
          aria-label="筛选生产日期"
          class="w-32"
          placeholder="全部生产日期"
          size="small"
        />
        <Select
          v-model:value="status"
          :options="statusOptions"
          allow-clear
          aria-label="筛选生产状态"
          class="w-28"
          placeholder="全部状态"
          size="small"
        />
      </div>
    </div>

    <Table
      :columns="columns"
      :custom-row="(row: WorkshopPlanRow) => ({
        class: { 'plan-day-start': (dateSpans.get(row.task.id) ?? 0) > 0 },
        'data-task-id': row.task.id,
      })"
      :data-source="pageRows"
      :locale="{ emptyText: rows.length ? '没有符合条件的任务' : '本车间暂无已下发任务' }"
      :pagination="false"
      :row-key="(row: WorkshopPlanRow) => row.task.id"
      :scroll="{ x: tableWidth, y: 'max(320px, calc(100dvh - 320px))' }"
      bordered
      class="workshop-plan-table"
      size="small"
    >
      <template #headerCell="{ column }">
        <span v-if="column.key === 'achievement'" title="累计良品含已计入本任务的补派良品，除以当前任务计划量">良品达成率</span>
      </template>
      <template #bodyCell="{ column, record: row }">
        <template v-if="column.key === 'date'">
          <span class="whitespace-nowrap font-semibold tabular-nums">{{ row.date || '未定日期' }}</span>
        </template>
        <template v-else-if="column.key === 'order'">
          <div class="truncate font-semibold" :title="row.order">{{ row.order }}</div>
          <div v-if="row.customer" class="truncate text-xs text-muted-foreground" :title="row.customer">{{ row.customer }}</div>
          <div v-if="row.due" class="truncate text-xs text-muted-foreground" :title="`交期 ${row.due}`">交期 {{ row.due }}</div>
          <div class="text-xs text-muted-foreground">
            #{{ row.task.id }}<span v-if="process === 'MIX' && row.task.undated && row.task.sequence != null"> · 顺序 {{ row.task.sequence }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'size'">
          <div class="truncate" :title="row.size">{{ row.size || '—' }}</div>
          <div v-if="row.product" class="truncate text-xs text-muted-foreground" :title="row.product">{{ row.product }}</div>
        </template>
        <template v-else-if="column.key === 'orderQuantity'">{{ row.orderQuantity || '—' }}</template>
        <template v-else-if="column.key === 'colors'">
          <div v-if="row.colors.length" class="flex flex-col items-start gap-0.5">
            <span
              v-for="field in row.colors"
              :key="field.label"
              :data-side="field.side"
              :title="field.value"
              class="plan-color max-w-full truncate"
            ><span v-if="field.label !== '颜色'">{{ field.label.replace('颜色', '') }} · </span>{{ field.value }}</span>
          </div>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'materials'">
          <div
            v-for="(field, index) in row.materials.slice(0, 3)"
            :key="index"
            :title="`${field.label} ${field.value}`"
            class="truncate"
          >
            <span v-if="process !== 'MIX'" class="mr-1 text-xs text-muted-foreground">{{ field.label }}</span>{{ field.value }}
          </div>
          <span v-if="row.materials.length > 3" class="text-xs text-muted-foreground">另 {{ row.materials.length - 3 }} 项</span>
          <span v-if="!row.materials.length">—</span>
        </template>
        <template v-else-if="column.key === 'requirements'">
          <div
            v-for="(field, index) in summaryRequirements(row.requirements)"
            :key="index"
            :title="`${field.label} ${field.value}`"
            class="truncate"
          >
            <span v-if="field.label !== column.title" class="mr-1 text-xs text-muted-foreground">{{ field.label }}</span>{{ field.value }}
          </div>
          <span v-if="!row.requirements.length">—</span>
        </template>
        <template v-else-if="column.key === 'planned'">
          <div class="font-semibold tabular-nums">{{ qty(row.task.quantity, row.task.unit) }}</div>
          <div v-if="row.task.plannedQuantity != null && toNumber(row.task.plannedQuantity) !== toNumber(row.task.quantity)" class="text-xs text-muted-foreground">
            原排单 {{ qty(row.task.plannedQuantity, row.task.unit) }}
          </div>
        </template>
        <template v-else-if="column.key === 'good'">
          <template v-if="(toNumber(row.task.supplementGoodQuantity) ?? 0) > 0">
            <div class="font-semibold tabular-nums">{{ qty(sumQty([row.task.actualQuantity, row.task.supplementGoodQuantity]), row.task.unit) }}</div>
            <div class="text-xs text-muted-foreground">其中补派 {{ qty(row.task.supplementGoodQuantity, row.task.unit) }}</div>
          </template>
          <div v-else class="font-semibold tabular-nums">{{ qty(row.task.actualQuantity, row.task.unit) }}</div>
          <div v-if="row.task.laminationActuals" class="text-xs text-muted-foreground">
            <div>正面 {{ row.task.laminationActuals.goodQuantityLowerBound ? '≥' : '' }}{{ qty(row.task.laminationActuals.frontGoodQuantity, row.task.unit) }}</div>
            <div>反面 {{ row.task.laminationActuals.goodQuantityLowerBound ? '≥' : '' }}{{ qty(row.task.laminationActuals.backGoodQuantity, row.task.unit) }}</div>
          </div>
        </template>
        <template v-else-if="column.key === 'defect'">
          <div class="tabular-nums">{{ qty(row.task.defectQuantity, row.task.unit) }}</div>
          <div v-if="row.task.laminationActuals" class="text-xs text-muted-foreground">
            <div>正面 {{ qty(row.task.laminationActuals.frontDefectQuantity, row.task.unit) }}</div>
            <div>反面 {{ qty(row.task.laminationActuals.backDefectQuantity, row.task.unit) }}</div>
          </div>
        </template>
        <template v-else-if="column.key === 'achievement'">
          <div class="font-semibold tabular-nums" :class="{ 'text-success': (row.achievement ?? 0) >= 1 }">
            {{ row.achievement == null ? '—' : percent.format(row.achievement) }}
          </div>
          <div class="text-xs" :class="row.progress.color === 'gold' ? 'text-warning' : 'text-muted-foreground'">
            {{ row.progress.targetLabel || row.progress.label }}
          </div>
          <div v-if="row.completed" class="whitespace-nowrap text-xs text-muted-foreground">结束 {{ row.completed }}</div>
        </template>
        <template v-else-if="column.key === 'notes'">
          <div v-if="row.notes.length" class="line-clamp-2 break-words text-xs" :title="row.notes.join('；')">{{ row.notes.join('；') }}</div>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button
            :aria-label="`查看任务 ${row.task.id} 详情`"
            class="!px-0"
            size="small"
            type="link"
            @click="detailId = row.task.id"
          >
详情
</Button>
        </template>
      </template>
    </Table>

    <div v-if="visibleRows.length" class="flex justify-end px-3 py-2">
      <Pagination
        v-model:current="page"
        v-model:page-size="pageSize"
        :page-size-options="['10', '20', '50', '100']"
        :total="visibleRows.length"
        show-size-changer
        size="small"
      />
    </div>

    <Modal
      :open="!!detail"
      :title="`任务 #${detail?.task.id ?? ''}`"
      width="min(920px, 96vw)"
      @cancel="detailId = undefined"
    >
      <div v-if="detail" class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <strong>{{ detail.order || '备货任务' }}</strong>
          <span>{{ detail.date || '未定日期' }}</span>
          <span>{{ detail.progress.label }}</span>
          <span v-if="detail.task.workerNames">负责人 {{ detail.task.workerNames }}</span>
        </div>
        <TaskMaterials :task="detail.task" />
        <dl v-if="detail.requirements.length" class="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 rounded border border-border p-2">
          <template v-for="(field, index) in detail.requirements" :key="index">
            <dt class="text-muted-foreground">{{ field.label }}</dt>
            <dd class="m-0 break-words">{{ field.value }}</dd>
          </template>
        </dl>
        <ul v-if="detail.notes.length" class="my-0 list-disc pl-5">
          <li v-for="note in detail.notes" :key="note" class="break-words">{{ note }}</li>
        </ul>
        <RelatedOrderTable
          v-if="detail.task.relatedOrderItems?.length"
          :items="detail.task.relatedOrderItems"
          :options="options"
        />
      </div>
      <template #footer>
        <Button @click="detailId = undefined">关闭</Button>
        <Button v-if="detail" type="primary" @click="emit('openOrder', detail.task.id)">转到订单任务</Button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.workshop-plan-table :deep(.ant-table) {
  font-size: 13px;
}

.workshop-plan-table :deep(.ant-table-tbody > tr > td) {
  line-height: 1.45;
  vertical-align: top;
}

.workshop-plan-table :deep(.ant-table-thead > tr > th) {
  white-space: nowrap;
}

.workshop-plan-table :deep(.plan-day-start > td) {
  border-top: 1px solid hsl(var(--border));
}

.workshop-plan-table :deep(.plan-date-cell),
.workshop-plan-table :deep(.plan-good-cell) {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--background)));
}

.workshop-plan-table :deep(.plan-defect-cell),
.workshop-plan-table :deep(.plan-achievement-cell) {
  background: color-mix(in srgb, hsl(var(--warning)) 12%, hsl(var(--background)));
}

.plan-color {
  padding-inline: 4px;
  border-radius: 4px;
}

.plan-color[data-side='FRONT'] {
  background: color-mix(in srgb, #0e9d94 16%, hsl(var(--background)));
}

.plan-color[data-side='BACK'] {
  background: color-mix(in srgb, #e1698f 17%, hsl(var(--background)));
}
</style>
