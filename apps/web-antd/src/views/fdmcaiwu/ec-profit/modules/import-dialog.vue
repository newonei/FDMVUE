<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue/es/upload/interface';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  message,
  Modal,
  Steps,
  Table,
  Tag,
  Tooltip,
  Upload,
} from 'ant-design-vue';

import {
  applyEcProfitImport,
  previewEcProfitImport,
} from '#/api/fdmcaiwu/ec-profit';

import { formatMetric } from '../model';

/**
 * 导入聚水潭「经营利润明细表」：选月份和文件 → 解析预览（逐店对比，不写库）→ 确认写入。
 * 只写入销售额、采购成本、快递运费、推广费、平台账单费用；网页手工改过的值默认保留。
 */
const props = defineProps<{ defaultMonth: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ imported: [month: string] }>();

const month = ref(props.defaultMonth);
const files = ref<UploadFile[]>([]);
const preview = ref<Api.ImportPreview>();
const previewing = ref(false);
const applying = ref(false);
const overwriteManual = ref(false);
let idempotencyKey = '';

const file = computed(() => files.value[0]?.originFileObj as File | undefined);
const step = computed(() => (preview.value ? 1 : 0));
const keptManualCount = computed(
  () => preview.value?.rows.filter((row) => row.keptManualFields.length > 0).length ?? 0,
);
const blocked = computed(() => (preview.value?.errors.length ?? 0) > 0);

watch(open, (value) => {
  if (!value) return;
  month.value = props.defaultMonth;
  files.value = [];
  preview.value = undefined;
  overwriteManual.value = false;
});
watch([month, files], () => {
  preview.value = undefined;
});

async function runPreview() {
  if (!file.value) {
    message.warning('请先选择 Excel 文件');
    return;
  }
  previewing.value = true;
  try {
    preview.value = await previewEcProfitImport(month.value, file.value);
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
      month: month.value,
      previewToken: preview.value.previewToken,
      idempotencyKey,
      overwriteManual: overwriteManual.value,
    });
    message.success(
      `导入完成：新增 ${result.created} 家，更新 ${result.updated} 家，无变化 ${result.unchanged} 家`,
    );
    open.value = false;
    emit('imported', month.value);
  } finally {
    applying.value = false;
  }
}

const FIELDS: { key: keyof Api.ImportValues; label: string }[] = [
  { key: 'salesAmount', label: '销售额' },
  { key: 'purchaseCost', label: '采购成本' },
  { key: 'freightCost', label: '快递运费' },
  { key: 'promotionCost', label: '推广费' },
  { key: 'platformFeeBill', label: '平台账单费用' },
];
const FIELD_LABEL = Object.fromEntries(FIELDS.map((field) => [field.key, field.label]));
const columns = [
  { title: '店铺', key: 'shop', width: 220, fixed: 'left' as const },
  { title: '处理', key: 'action', width: 80 },
  ...FIELDS.map((field) => ({ title: field.label, key: field.key, width: 130, align: 'right' as const })),
  { title: '导入后毛利润', key: 'grossProfitAfter', width: 130, align: 'right' as const },
];
function changed(row: Api.ImportRow, key: keyof Api.ImportValues) {
  if (!row.current) return false;
  return Number(row.current[key] ?? Number.NaN) !== Number(row.imported[key] ?? Number.NaN);
}
function kept(row: Api.ImportRow, key: string) {
  return !overwriteManual.value && row.keptManualFields.includes(key);
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
    title="导入聚水潭「经营利润明细表」"
    :width="preview ? 1100 : 640"
    :mask-closable="false"
  >
    <Steps
      :current="step"
      size="small"
      class="mb-5 mt-2"
      :items="[
        { title: '选择月份和文件' },
        { title: '核对预览' },
        { title: '确认导入' },
      ]"
    />

    <template v-if="!preview">
      <div class="mb-3 flex items-center gap-3">
        <span class="w-16 shrink-0 text-sm text-muted-foreground">导入月份</span>
        <DatePicker
          v-model:value="month"
          picker="month"
          value-format="YYYY-MM"
          format="YYYY 年 MM 月"
          :allow-clear="false"
          class="w-48"
        />
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
        <p class="mb-1 text-sm">点击或拖拽「经营利润明细表」到此处</p>
        <p class="text-xs text-muted-foreground">
          聚水潭导出条件：订单发货日期为整月、拆分组合装=是、费用取值方案=财务、退货取值口径=实退数量
        </p>
      </Upload.Dragger>
      <p class="mb-0 mt-3 text-xs leading-5 text-muted-foreground">
        会写入：销售额、采购成本（自营+周边）、快递运费、推广费、平台账单费用。周边、代发、税费等不在表中的项目导入后在网页补填；
        文件里没有的店铺（手工录入的）保持不变。
      </p>
    </template>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Tag color="green">新增 {{ preview.newCount }}</Tag>
        <Tag color="blue">更新 {{ preview.updateCount }}</Tag>
        <Tag>无变化 {{ preview.unchangedCount }}</Tag>
        <Tag v-if="keptManualCount" color="gold">{{ keptManualCount }} 家有手工修改</Tag>
        <span class="text-muted-foreground">
          {{ preview.fileName }} · 订单发货日期
          {{ preview.shipDateFrom ?? '?' }} 至 {{ preview.shipDateTo ?? '?' }}
          · {{ preview.reportId ? '当月已有月报，将更新' : '当月还没有月报，将自动建立' }}
        </span>
      </div>
      <Alert v-if="preview.errors.length" type="error" show-icon class="mb-3" message="无法导入">
        <template #description>
          <div v-for="error in preview.errors" :key="error">{{ error }}</div>
        </template>
      </Alert>
      <Alert v-if="preview.warnings.length" type="warning" show-icon class="mb-3" message="请留意">
        <template #description>
          <div v-for="warning in preview.warnings" :key="warning">{{ warning }}</div>
        </template>
      </Alert>
      <Table
        :columns="columns"
        :data-source="preview.rows"
        :pagination="false"
        :scroll="{ x: 1080, y: 380 }"
        row-key="shopId"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'shop'">
            <div class="truncate" :title="record.directoryShopName || record.shopName">
              {{ record.directoryShopName || record.shopName }}
            </div>
            <div class="text-[11px] text-muted-foreground">
              {{ record.shopId }}
              <Tooltip v-if="!record.directoryShopName" title="店铺编码不在店铺目录中，分组会显示为「未配置」">
                <Tag color="orange" class="!ml-1 !px-1 !text-[10px] !leading-4">目录外</Tag>
              </Tooltip>
            </div>
          </template>
          <Tag v-else-if="column.key === 'action'" :color="ACTION[record.action as keyof typeof ACTION].color">
            {{ ACTION[record.action as keyof typeof ACTION].text }}
          </Tag>
          <span v-else-if="column.key === 'grossProfitAfter'" class="tabular-nums">
            <Tooltip v-if="record.grossProfitAfter == null" title="代发、税费等未填，毛利润待补齐后计算">
              <span class="text-muted-foreground">待补齐</span>
            </Tooltip>
            <template v-else>{{ formatMetric(record.grossProfitAfter) }}</template>
          </span>
          <div v-else class="tabular-nums leading-tight">
            <template v-if="kept(record as Api.ImportRow, String(column.key))">
              <Tooltip :title="`网页手工改过，保留 ${formatMetric(record.current?.[column.key as keyof Api.ImportValues])}`">
                <span>{{ formatMetric(record.current?.[column.key as keyof Api.ImportValues]) }}</span>
                <Tag color="gold" class="!ml-1 !mr-0 !px-1 !text-[10px] !leading-4">手工</Tag>
              </Tooltip>
              <div class="text-[11px] text-muted-foreground line-through">
                {{ formatMetric(record.imported[column.key as keyof Api.ImportValues]) }}
              </div>
            </template>
            <template v-else>
              <span :class="changed(record as Api.ImportRow, column.key as keyof Api.ImportValues) ? 'font-medium text-primary' : ''">
                {{ formatMetric(record.imported[column.key as keyof Api.ImportValues]) }}
              </span>
              <div
                v-if="changed(record as Api.ImportRow, column.key as keyof Api.ImportValues)"
                class="text-[11px] text-muted-foreground line-through"
              >
                {{ formatMetric(record.current?.[column.key as keyof Api.ImportValues]) }}
              </div>
            </template>
          </div>
        </template>
      </Table>
      <div class="mt-3 space-y-1 text-xs text-muted-foreground">
        <div v-if="preview.keptItems.length">
          文件里没有、保持不变的明细：{{ preview.keptItems.map((item) => item.shopName).join('、') }}
        </div>
        <div>蓝色为与现有数据不同的新值，划线为原值。</div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <Checkbox v-if="preview && keptManualCount" v-model:checked="overwriteManual">
          用文件覆盖手工修改过的
          {{ [...new Set(preview.rows.flatMap((row) => row.keptManualFields))].map((key) => FIELD_LABEL[key]).join('、') }}
        </Checkbox>
        <span v-else></span>
        <div class="flex gap-2">
          <Button v-if="preview" :disabled="applying" @click="preview = undefined">重新选择</Button>
          <Button @click="open = false">取消</Button>
          <Button v-if="!preview" type="primary" :loading="previewing" :disabled="!file" @click="runPreview">
            解析预览
          </Button>
          <Button v-else type="primary" :loading="applying" :disabled="blocked" @click="apply">
            确认导入 {{ preview.rows.length }} 家
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>
