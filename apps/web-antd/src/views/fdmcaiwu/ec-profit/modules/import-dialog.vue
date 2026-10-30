<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue/es/upload/interface';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  message,
  Modal,
  Segmented,
  Steps,
  Table,
  Tag,
  Tooltip,
  Upload,
} from 'ant-design-vue';

import {
  applyEcProfitImport,
  downloadEcProfitImportTemplate,
  previewEcProfitImport,
} from '#/api/fdmcaiwu/ec-profit';

import { formatMetric } from '../model';

/**
 * 按导入模板导入财务整理好的毛利数据：选文件 → 解析预览（按月份、逐店对比，不写库）→ 确认写入。
 * 一个文件可包含多个月份；同月同店已有的数据以文件为准，文件里没有的店铺保持不变。
 */
const props = defineProps<{ defaultMonth: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ imported: [month: string] }>();

const files = ref<UploadFile[]>([]);
const preview = ref<Api.ImportPreview>();
const previewing = ref(false);
const applying = ref(false);
const downloading = ref(false);
const monthFilter = ref('all');
let idempotencyKey = '';

const file = computed(() => files.value[0]?.originFileObj as File | undefined);
const step = computed(() => (preview.value ? 1 : 0));
const blocked = computed(() => (preview.value?.errors.length ?? 0) > 0);
const monthOptions = computed(() => [
  { label: '全部月份', value: 'all' },
  ...(preview.value?.months ?? []).map((month) => ({
    label: `${month.month}（${month.rowCount}）`,
    value: month.month,
  })),
]);
const rows = computed(() =>
  (preview.value?.rows ?? []).filter(
    (row) => monthFilter.value === 'all' || row.month === monthFilter.value,
  ),
);
const keptMonths = computed(() =>
  (preview.value?.months ?? []).filter((month) => month.keptItems.length > 0),
);

watch(open, (value) => {
  if (!value) return;
  files.value = [];
  preview.value = undefined;
});
watch(files, () => {
  preview.value = undefined;
});

async function downloadTemplate() {
  downloading.value = true;
  try {
    const blob = await downloadEcProfitImportTemplate();
    downloadFileFromBlobPart({ fileName: '电商毛利导入模板.xlsx', source: blob });
  } finally {
    downloading.value = false;
  }
}

async function runPreview() {
  if (!file.value) {
    message.warning('请先选择 Excel 文件');
    return;
  }
  previewing.value = true;
  try {
    preview.value = await previewEcProfitImport(file.value);
    monthFilter.value = 'all';
    idempotencyKey = crypto.randomUUID();
  } finally {
    previewing.value = false;
  }
}

async function apply() {
  if (!preview.value || !file.value || blocked.value) return;
  applying.value = true;
  try {
    const result = await applyEcProfitImport({
      file: file.value,
      previewToken: preview.value.previewToken,
      idempotencyKey,
    });
    message.success(
      `已导入 ${result.months.length} 个月：新增 ${result.created} 条，更新 ${result.updated} 条，无变化 ${result.unchanged} 条`,
    );
    open.value = false;
    emit(
      'imported',
      result.months.includes(props.defaultMonth)
        ? props.defaultMonth
        : (result.months.at(-1) ?? props.defaultMonth),
    );
  } finally {
    applying.value = false;
  }
}

const FIELDS: { key: keyof Api.ImportValues; label: string }[] = [
  { key: 'salesAmount', label: '销售额' },
  { key: 'newProductGiftAmount', label: '新品礼金' },
  { key: 'customerRefundAmount', label: '客户返款' },
  { key: 'purchaseCost', label: '采购(自营+周边)' },
  { key: 'ownPurchaseCost', label: '采购(自营)' },
  { key: 'accessoryPurchaseCost', label: '采购(周边)' },
  { key: 'dropshipPurchaseCost', label: '采购(代发)' },
  { key: 'freightCost', label: '快递运费' },
  { key: 'promotionCost', label: '推广费用' },
  { key: 'platformFee', label: '平台扣费' },
  { key: 'taxFee', label: '税费' },
  { key: 'grossProfit', label: '毛利润' },
];
const columns = [
  { title: '月份', dataIndex: 'month', width: 86, fixed: 'left' as const },
  { title: '店铺', key: 'shop', width: 220, fixed: 'left' as const },
  { title: '处理', key: 'action', width: 76 },
  ...FIELDS.map((field) => ({
    title: field.label,
    key: field.key,
    width: 124,
    align: 'right' as const,
  })),
];
function changed(row: Api.ImportRow, key: keyof Api.ImportValues) {
  if (!row.current) return false;
  return (
    Number(row.current[key] ?? Number.NaN) !==
    Number(row.imported[key] ?? Number.NaN)
  );
}
const ACTION = {
  NEW: { color: 'green', text: '新增' },
  UPDATE: { color: 'blue', text: '更新' },
  UNCHANGED: { color: 'default', text: '无变化' },
} as const;
</script>

<template>
  <Modal
    v-model:open="open"
    title="导入电商毛利数据"
    :width="preview ? 1200 : 640"
    :mask-closable="false"
  >
    <Steps
      :current="step"
      size="small"
      class="mb-5 mt-2"
      :items="[
        { title: '按模板填写并选择文件' },
        { title: '核对预览' },
        { title: '确认导入' },
      ]"
    />

    <template v-if="!preview">
      <div
        class="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
      >
        <div class="text-sm">
          <div class="font-medium">第一步：下载导入模板</div>
          <div class="text-xs text-muted-foreground">
            一行一个月份、一家店铺；店铺可从下拉框选择，内附店铺列表和填写说明
          </div>
        </div>
        <Button :loading="downloading" @click="downloadTemplate">
          <IconifyIcon icon="lucide:download" class="mr-1 inline-block" />
          下载模板
        </Button>
      </div>
      <Upload.Dragger
        v-model:file-list="files"
        :before-upload="() => false"
        :max-count="1"
        accept=".xlsx,.xls"
      >
        <p class="mb-2 mt-2 text-3xl text-muted-foreground">
          <IconifyIcon icon="lucide:file-spreadsheet" class="inline-block" />
        </p>
        <p class="mb-1 text-sm">点击或拖拽填好的 Excel 到此处</p>
        <p class="text-xs text-muted-foreground">
          月份、店铺、销售额、新品礼金、客户返款、采购成本(自营+周边/自营/周边/代发)、运输成本(快递)、推广费用、平台扣费、税费
        </p>
      </Upload.Dragger>
      <p class="mb-0 mt-3 text-xs leading-5 text-muted-foreground">
        毛利润、毛利率和各项占比由系统计算。同一月份、同一店铺已有的数据以文件为准（网页改过的也会覆盖）；文件里没有的店铺和费用行保持不变。
      </p>
    </template>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Tag color="green">新增 {{ preview.newCount }}</Tag>
        <Tag color="blue">更新 {{ preview.updateCount }}</Tag>
        <Tag>无变化 {{ preview.unchangedCount }}</Tag>
        <span class="text-muted-foreground">
          {{ preview.fileName }} · 共 {{ preview.months.length }} 个月
        </span>
      </div>
      <Alert v-if="preview.errors.length" type="error" show-icon class="mb-3" message="无法导入，请修改 Excel 后重新选择">
        <template #description>
          <div class="max-h-40 overflow-auto">
            <div v-for="error in preview.errors" :key="error">{{ error }}</div>
          </div>
        </template>
      </Alert>
      <Alert v-if="preview.warnings.length" type="warning" show-icon class="mb-3" message="请留意">
        <template #description>
          <div v-for="warning in preview.warnings" :key="warning">{{ warning }}</div>
        </template>
      </Alert>
      <div v-if="preview.months.length" class="mb-3 flex flex-wrap gap-2">
        <div
          v-for="month in preview.months"
          :key="month.month"
          class="rounded-lg border border-border px-3 py-2 text-xs"
        >
          <div class="font-medium">
            {{ month.month }}
            <span class="font-normal text-muted-foreground">
              {{ month.reportId ? '更新已有月报' : '新建月报' }}
            </span>
          </div>
          <div class="tabular-nums text-muted-foreground">
            {{ month.rowCount }} 家 · 销售额 {{ formatMetric(month.salesAmount) }} ·
            毛利 {{ formatMetric(month.grossProfit) }}
          </div>
        </div>
      </div>
      <Segmented
        v-if="preview.months.length > 1"
        v-model:value="monthFilter"
        :options="monthOptions"
        size="small"
        class="mb-2"
      />
      <Table
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        :scroll="{ x: 1900, y: 360 }"
        :row-key="(row: Api.ImportRow) => `${row.month}-${row.rowNumber}`"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'shop'">
            <div class="truncate" :title="record.directoryShopName || record.shopName">
              {{ record.directoryShopName || record.shopName }}
            </div>
            <div class="text-[11px] text-muted-foreground">
              第 {{ record.rowNumber }} 行<template v-if="record.shopId"> · {{ record.shopId }}</template>
              <Tooltip v-if="!record.shopId" title="店铺不在店铺目录中，按填写的名称导入，分组显示为「未配置」">
                <Tag color="orange" class="!ml-1 !px-1 !text-[10px] !leading-4">目录外</Tag>
              </Tooltip>
            </div>
          </template>
          <Tag v-else-if="column.key === 'action'" :color="ACTION[record.action as keyof typeof ACTION].color">
            {{ ACTION[record.action as keyof typeof ACTION].text }}
          </Tag>
          <div v-else-if="column.key" class="tabular-nums leading-tight">
            <span
              :class="[
                changed(record as Api.ImportRow, column.key as keyof Api.ImportValues) ? 'font-medium text-primary' : '',
                column.key === 'grossProfit' ? 'font-medium' : '',
              ]"
            >
              {{ formatMetric(record.imported[column.key as keyof Api.ImportValues]) }}
            </span>
            <div
              v-if="changed(record as Api.ImportRow, column.key as keyof Api.ImportValues)"
              class="text-[11px] text-muted-foreground line-through"
            >
              {{ formatMetric(record.current?.[column.key as keyof Api.ImportValues]) }}
            </div>
          </div>
        </template>
      </Table>
      <div class="mt-3 space-y-1 text-xs text-muted-foreground">
        <div v-for="month in keptMonths" :key="month.month">
          {{ month.month }} 文件里没有、保持不变的明细：{{ month.keptItems.map((item) => item.shopName).join('、') }}
        </div>
        <div>蓝色为与现有数据不同的新值，划线为原值。</div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button v-if="preview" :disabled="applying" @click="preview = undefined">重新选择</Button>
        <Button @click="open = false">取消</Button>
        <Button v-if="!preview" type="primary" :loading="previewing" :disabled="!file" @click="runPreview">
          解析预览
        </Button>
        <Button v-else type="primary" :loading="applying" :disabled="blocked" @click="apply">
          确认导入 {{ preview.rows.length }} 条
        </Button>
      </div>
    </template>
  </Modal>
</template>
