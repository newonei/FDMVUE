<script setup lang="ts">
import type { PrintExtras } from '../print-extras';

import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  OrderDetailColumn,
  OrderLineExtra,
  ProcurementOrderRow,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Collapse,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  copyProcurementImages,
  getProcurementOrder,
  getProcurementOrders,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { purchaseRowLabels } from '../model';
import {
  additionalLineAmount,
  boxCount,
  copyPrintExtras,
  currencyDigits,
  MAX_ADDITIONAL_LINES,
  MAX_DETAIL_COLUMNS,
  MAX_DETAIL_IMAGES,
  MAX_SHARED_COLUMNS,
  MAX_SHARED_IMAGES,
  MAX_STEP_IMAGES,
  MAX_STEPS,
  printExtrasFrom,
  printExtrasImageIds,
  printExtrasPayload,
  SHARED_COLUMN_SUGGESTIONS,
} from '../print-extras';
import OrderImages from './OrderImages.vue';

/**
 * 印到采购单上的附加资料（#88）：明细补充（产品图、客户颜色、克重、型号、装箱数）、整单共用说明列、
 * 辅料明细勾选、包装步骤。随下单资料一起保存、确认，导出 PDF / Excel 时带出。
 */
const props = defineProps<{
  disabled: boolean;
  saving?: boolean;
  view: ProcurementOrderView;
}>();
const emit = defineEmits<{
  busy: [value: boolean];
  dirty: [value: boolean];
  save: [];
}>();
const uploadCount = ref(0);
const copyOpen = ref(false);
const copying = ref(false);
let disposed = false;
const disabled = computed(
  () =>
    props.disabled || props.saving || uploadCount.value > 0 || copying.value,
);
watch(
  () => uploadCount.value > 0 || copyOpen.value || copying.value,
  (value) => emit('busy', value),
);
function imageBusy(value: boolean) {
  uploadCount.value = Math.max(0, uploadCount.value + (value ? 1 : -1));
}
onBeforeUnmount(() => {
  disposed = true;
  emit('busy', false);
});
/** 采购单明细行（表格单元格里拿到的是宽松类型）。 */
type Line = Record<string, any>;
const extras = reactive<PrintExtras>({
  detailColumns: [],
  additionalLines: [],
  lineExtras: {},
  sharedColumns: [],
  accessories: [],
  packagingSteps: [],
});
const active = ref<string[]>([]);
const contractId = computed(() => props.view.contractId);
const orderId = computed(() => props.view.id);
const lines = computed(() => (props.view.order.lines ?? []) as Line[]);
const displayLines = computed(() => [
  ...lines.value,
  ...extras.additionalLines.map((additional) => ({
    id: additional.id,
    additional,
  })),
]);
const baseline = ref('');
let loadedId: string | undefined;
const fingerprint = () => JSON.stringify(printExtrasPayload(extras));
const dirty = computed(() => baseline.value !== fingerprint());
watch(dirty, (value) => emit('dirty', value), { immediate: true });

function loadSaved() {
  Object.assign(
    extras,
    printExtrasFrom(props.view.details, props.view.accessoryCatalog),
  );
  for (const line of lines.value) extras.lineExtras[String(line.id)] ??= {};
  loadedId = `${props.view.contractId}/${props.view.id}`;
  baseline.value = fingerprint();
}

watch(
  () => [props.view.id, props.view.details.version],
  () => {
    if (loadedId === `${props.view.contractId}/${props.view.id}` && dirty.value)
      return;
    loadSaved();
    // 有内容的分组默认展开
    active.value = [
      Object.values(props.view.details.lineExtras ?? {}).length > 0 ||
      extras.additionalLines.length > 0 ||
      extras.detailColumns.length > 0
        ? 'lines'
        : '',
      props.view.details.sharedColumns?.length ? 'shared' : '',
      props.view.details.accessories?.some((row) => row.checked)
        ? 'accessories'
        : '',
      props.view.details.packagingSteps?.length ? 'steps' : '',
    ].filter(Boolean);
  },
  { immediate: true },
);

function spec(line: Line) {
  return (line.specificationSnapshot ?? {}) as Line;
}
function quantity(line: Line) {
  if (line.additional) return line.additional.quantity;
  return Number(line.quantity ?? 0) - Number(line.cancelledQuantity ?? 0);
}
function extra(line: Line): OrderLineExtra {
  if (line.additional) return line.additional;
  return (extras.lineExtras[String(line.id)] ??= {});
}
function customCell(line: Line, id: string) {
  const row = extra(line);
  row.customCells ??= {};
  return (row.customCells[id] ??= { imageIds: [] });
}
function attachments(line: Line) {
  return extra(line).imageIds ?? [];
}
function addLine() {
  extras.additionalLines.push({
    id: crypto.randomUUID(),
    name: '',
    quantity: 1,
    unit: '项',
    unitPrice: 0,
    imageIds: [],
    customCells: {},
  });
}
function addColumn(type: OrderDetailColumn['type']) {
  extras.detailColumns.push({
    id: crypto.randomUUID(),
    title: type === 'IMAGE' ? '色卡图片' : '',
    type,
  });
}
function deleteColumn(id: string) {
  Modal.confirm({
    title: '删除自定义列？',
    content: '这一列在所有明细中的文字和图片引用将一起移除，保存后生效。',
    okText: '删除',
    cancelText: '取消',
    onOk: () => {
      extras.detailColumns = extras.detailColumns.filter(
        (column) => column.id !== id,
      );
      for (const row of [
        ...Object.values(extras.lineExtras),
        ...extras.additionalLines,
      ])
        delete row.customCells?.[id];
    },
  });
}
const columns = computed(() => [
  {
    title: '产品 / 费用项目',
    key: 'product',
    width: 180,
    fixed: 'left' as const,
  },
  { title: '产品图片', key: 'image', width: 90 },
  { title: '客户颜色名称', key: 'customerColor', width: 140 },
  { title: '产品克重', key: 'weight', width: 120 },
  { title: '型号（如正反面颜色）', key: 'model', width: 180 },
  ...extras.detailColumns.map((column) => ({
    title: column.title || '未命名列',
    key: `custom:${column.id}`,
    width: 180,
  })),
  { title: '数量', key: 'quantity', width: 100, align: 'right' as const },
  { title: '单位', key: 'unit', width: 90 },
  { title: '单价', key: 'unitPrice', width: 110, align: 'right' as const },
  { title: '金额', key: 'amount', width: 110, align: 'right' as const },
  { title: '装箱数', key: 'packQty', width: 110 },
  { title: '箱数', key: 'boxes', width: 70, align: 'right' as const },
  { title: '备注', key: 'remark', width: 200 },
  { title: '附件图片', key: 'attachments', width: 180 },
  { title: '操作', key: 'action', width: 70 },
]);
const additionalTotal = computed(() => {
  let total = new BigNumber(0);
  for (const row of extras.additionalLines)
    total = total.plus(
      additionalLineAmount(row, String(props.view.order.currency ?? 'CNY')),
    );
  return total.toFixed(
    currencyDigits(String(props.view.order.currency ?? 'CNY')),
  );
});
function priceAmount(line: Line) {
  return additionalLineAmount(
    { quantity: quantity(line), unitPrice: Number(line.unitPrice ?? 0) },
    String(props.view.order.currency ?? 'CNY'),
  );
}
function columnByKey(key: unknown) {
  return extras.detailColumns.find((column) => `custom:${column.id}` === key);
}
function lineImages(line: Line) {
  const id = extra(line).imageId;
  return id ? [id] : [];
}
function setLineImages(line: Line, ids: string[]) {
  extra(line).imageId = ids[0];
}
/** 把第一行的值填到下面空着的行（同一批货常常克重、装箱数一样）。 */
function fillDown(key: 'customerColor' | 'model' | 'packQty' | 'weight') {
  const first = extra(lines.value[0]!)[key];
  if (first === undefined || first === '') return;
  for (const line of lines.value.slice(1)) {
    const row = extra(line);
    if (row[key] === undefined || row[key] === '')
      (row as Record<string, unknown>)[key] = first;
  }
}
const totals = computed(() => {
  let boxes = 0;
  let complete = true;
  for (const line of lines.value) {
    const value = boxCount(quantity(line), extra(line).packQty);
    if (value) boxes += Number(value);
    else complete = false;
  }
  return { boxes, complete };
});

function addShared() {
  const used = new Set(extras.sharedColumns.map((row) => row.title));
  extras.sharedColumns.push({
    title: SHARED_COLUMN_SUGGESTIONS.find((name) => !used.has(name)) ?? '',
    text: '',
    imageIds: [],
  });
}
function addStep() {
  extras.packagingSteps.push({
    title: `${extras.packagingSteps.length + 1}.`,
    text: '',
    imageIds: [],
  });
}
function move<T>(list: T[], index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= list.length) return;
  const [row] = list.splice(index, 1);
  list.splice(target, 0, row!);
}
const checkedCount = computed(
  () => extras.accessories.filter((row) => row.checked).length,
);

// ========== 从历史采购单复制 ==========
const copyRows = ref<ProcurementOrderRow[]>([]);
const copyKeyword = ref('');
const copyPage = ref(1);
const copyTotal = ref(0);
const copyLoading = ref(false);
const copyError = ref('');
let copySequence = 0;
async function loadCopyRows(reset = false) {
  if (reset) copyPage.value = 1;
  const run = ++copySequence;
  copyLoading.value = true;
  copyError.value = '';
  try {
    const result = await getProcurementOrders({
      keyword: copyKeyword.value || undefined,
      pageNo: copyPage.value,
      pageSize: 10,
    });
    if (run !== copySequence) return;
    copyRows.value = result.list;
    copyTotal.value = result.total;
  } catch (error) {
    if (run === copySequence) copyError.value = errorText(error);
  } finally {
    if (run === copySequence) copyLoading.value = false;
  }
}
function openCopy() {
  if (disabled.value) return;
  copyOpen.value = true;
  void loadCopyRows(true);
}
/** 列表行对应的采购单；金智迁入的独立历史单没有下单资料。 */
function source(row: ProcurementOrderRow) {
  if (row.standaloneId)
    return row.nativeStandalone
      ? { contractId: 'standalone', orderId: row.standaloneId }
      : undefined;
  return { contractId: row.contractId, orderId: row.id };
}
function hasExtras(row: ProcurementOrderRow) {
  const details = row.details;
  return !!(
    details?.packagingSteps?.length ||
    details?.additionalLines?.length ||
    details?.detailColumns?.length ||
    details?.sharedColumns?.length ||
    details?.accessories?.some((entry) => entry.checked) ||
    Object.keys(details?.lineExtras ?? {}).length > 0
  );
}
function hasContent() {
  const value = printExtrasPayload(extras);
  return (
    value.sharedColumns.length > 0 ||
    value.additionalLines.length > 0 ||
    value.detailColumns.length > 0 ||
    value.packagingSteps.length > 0 ||
    value.accessories.length > 0 ||
    Object.keys(value.lineExtras).length > 0
  );
}
function pick(row: ProcurementOrderRow) {
  const target = source(row);
  if (!target) return;
  if (!hasContent()) {
    void copyFrom(target);
    return;
  }
  Modal.confirm({
    title: '用这张采购单的附加资料替换当前内容？',
    content:
      '自定义列、额外费用行、共用说明列、辅料勾选、包装步骤整份替换；产品补充按产品匹配。费用行会在保存后计入本单总额和应付款，请核对。',
    okText: '替换',
    cancelText: '取消',
    onOk: () => copyFrom(target),
  });
}
async function copyFrom(target: { contractId: string; orderId: string }) {
  if (copying.value || disposed) return;
  const destination = { contractId: contractId.value, orderId: orderId.value };
  const stillHere = () =>
    !disposed &&
    destination.contractId === contractId.value &&
    destination.orderId === orderId.value;
  copying.value = true;
  copyError.value = '';
  try {
    const sourceView = await getProcurementOrder(
      target.contractId,
      target.orderId,
    );
    if (!stillHere()) return;
    const sourceExtras = printExtrasFrom(sourceView.details);
    const ids = printExtrasImageIds(sourceExtras);
    const images =
      ids.length > 0
        ? await copyProcurementImages(
            destination.contractId,
            destination.orderId,
            {
              sourceContractId: target.contractId,
              sourceOrderId: target.orderId,
              imageIds: ids,
            },
          )
        : {};
    if (!stillHere()) return;
    const result = copyPrintExtras(
      extras,
      sourceExtras,
      (sourceView.order.lines ?? []) as unknown as BusinessRecord[],
      lines.value as BusinessRecord[],
      images,
      props.view.accessoryCatalog,
    );
    Object.assign(extras, result.value);
    for (const line of lines.value) extras.lineExtras[String(line.id)] ??= {};
    active.value = ['lines', 'shared', 'accessories', 'steps'];
    copyOpen.value = false;
    message.success(
      `已带入附加资料，明细按产品对上 ${result.matched} 行；请核对费用后点击「保存附加资料」`,
    );
  } catch (error) {
    if (stillHere()) copyError.value = errorText(error);
  } finally {
    copying.value = false;
  }
}

defineExpose({
  payload: () => printExtrasPayload(extras),
  isDirty: () => dirty.value,
  markSaved: loadSaved,
});
</script>
<template>
  <div class="print-extras">
    <div class="extras-head">
      <h4 class="section-title">采购单附加资料（印在导出的采购单上）</h4>
      <Space wrap>
        <Tag v-if="dirty" color="warning">有未保存的修改</Tag>
        <span v-else class="muted">已保存</span>
        <Button
          v-if="!props.disabled"
          size="small"
          :disabled="disabled"
          @click="openCopy"
        >
          从历史采购单复制
        </Button>
        <Button
          v-if="!props.disabled"
          type="primary"
          :loading="saving"
          :disabled="disabled || !dirty"
          @click="emit('save')"
        >
          保存附加资料
        </Button>
      </Space>
    </div>
    <p class="muted">
      不填的部分不出现在采购单上。填了产品图片、客户颜色等补充列时，导出改为横向；辅料明细和包装步骤分别输出（Excel
      为单独的工作表）。支持 JPG / PNG
      图片或粘贴截图；修改后请点击「保存附加资料」。
    </p>
    <Collapse v-model:active-key="active" class="extras-collapse">
      <Collapse.Panel key="lines">
        <template #header>
          明细补充
          <span class="muted">支持新增费用行、自定义文字 / 图片列、备注及图片附件</span>
        </template>
        <Space v-if="!props.disabled" wrap class="detail-toolbar">
          <Button
            :disabled="
              disabled || extras.additionalLines.length >= MAX_ADDITIONAL_LINES
            "
            @click="addLine"
          >
            + 新增费用 / 免费项目行
          </Button>
          <Button
            :disabled="
              disabled || extras.detailColumns.length >= MAX_DETAIL_COLUMNS
            "
            @click="addColumn('TEXT')"
          >
            + 新增文字列
          </Button>
          <Button
            :disabled="
              disabled || extras.detailColumns.length >= MAX_DETAIL_COLUMNS
            "
            @click="addColumn('IMAGE')"
          >
            + 新增图片列（色卡等）
          </Button>
        </Space>
        <div v-if="extras.detailColumns.length" class="column-settings">
          <div
            v-for="column in extras.detailColumns"
            :key="column.id"
            class="column-setting"
          >
            <Tag>{{ column.type === 'IMAGE' ? '图片列' : '文字列' }}</Tag>
            <Input
              v-model:value="column.title"
              :disabled="disabled"
              :maxlength="20"
              placeholder="填写列名"
              :aria-label="`自定义列名称 ${column.id}`"
            />
            <Select
              v-model:value="column.type"
              :disabled="disabled"
              :options="[
                { label: '文字', value: 'TEXT' },
                { label: '图片', value: 'IMAGE' },
              ]"
              style="width: 90px"
            />
            <Button
              v-if="!props.disabled"
              :disabled="disabled"
              type="link"
              danger
              @click="deleteColumn(column.id)"
            >
              删除列
            </Button>
          </div>
        </div>
        <p class="muted">
          额外费用行会计入采购总额和应付款；单价可填 0
          表示免费。产品数量和价格请在采购单明细中修改。最多
          {{ MAX_ADDITIONAL_LINES }} 行额外项目、{{ MAX_DETAIL_COLUMNS }}
          个自定义列。
        </p>
        <Table
          :data-source="displayLines"
          :pagination="false"
          size="small"
          :row-key="(line: Line) => String(line.id)"
          :scroll="{ x: 1950 + extras.detailColumns.length * 180 }"
          :columns="columns"
        >
          <template #headerCell="{ column }">
            <span>{{ column.title }}</span>
            <Button
              v-if="
                !disabled &&
                lines.length > 1 &&
                ['customerColor', 'weight', 'model', 'packQty'].includes(
                  String(column.key),
                )
              "
              type="link"
              size="small"
              title="把第一行的值填到下面空着的行"
              @click="
                fillDown(
                  column.key as
                    'customerColor' | 'model' | 'packQty' | 'weight',
                )
              "
            >
              向下填充
            </Button>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'product'">
              <template v-if="record.additional">
                <Tag color="blue">额外项目</Tag>
                <Input
                  v-model:value="record.additional.name"
                  :disabled="disabled"
                  :maxlength="200"
                  placeholder="如加工费、免费打样"
                  aria-label="费用项目名称"
                />
              </template>
              <template v-else>
                <div>{{ spec(record).skuCode ?? '' }}</div>
                <div class="muted">{{ spec(record).skuName ?? '' }}</div>
              </template>
            </template>
            <OrderImages
              v-else-if="column.key === 'image' && !record.additional"
              :model-value="lineImages(record)"
              :contract-id="contractId"
              :order-id="orderId"
              :max="1"
              :size="56"
              :disabled="disabled"
              @update:model-value="(ids) => setLineImages(record, ids)"
              @busy="imageBusy"
            />
            <Input
              v-else-if="column.key === 'customerColor' && !record.additional"
              v-model:value="extra(record).customerColor"
              :disabled="disabled"
              :maxlength="200"
            />
            <Input
              v-else-if="column.key === 'weight' && !record.additional"
              v-model:value="extra(record).weight"
              :disabled="disabled"
              :maxlength="100"
              placeholder="如 1000g±100g"
            />
            <Textarea
              v-else-if="column.key === 'model' && !record.additional"
              v-model:value="extra(record).model"
              :disabled="disabled"
              :maxlength="500"
              :auto-size="{ minRows: 1, maxRows: 4 }"
            />
            <InputNumber
              v-else-if="column.key === 'quantity' && record.additional"
              v-model:value="record.additional.quantity"
              :disabled="disabled"
              :min="0.000001"
              :max="1000000000"
              :precision="6"
              aria-label="费用数量"
              style="width: 100%"
            />
            <span v-else-if="column.key === 'quantity'">
              {{ quantity(record) }}
            </span>
            <template v-else-if="column.key === 'unit'">
              <Input
                v-if="record.additional"
                v-model:value="record.additional.unit"
                :disabled="disabled"
                :maxlength="20"
                aria-label="费用单位"
              />
              <span v-else>{{ spec(record).unit ?? record.unit ?? '—' }}</span>
            </template>
            <template v-else-if="column.key === 'unitPrice'">
              <InputNumber
                v-if="record.additional"
                v-model:value="record.additional.unitPrice"
                :disabled="disabled"
                :min="0"
                :max="1000000000"
                :precision="6"
                aria-label="费用单价（可填0）"
                style="width: 100%"
              />
              <span v-else>{{ record.unitPrice ?? '—' }}</span>
            </template>
            <span v-else-if="column.key === 'amount'">{{
              record.additional
                ? additionalLineAmount(
                    record.additional,
                    String(view.order.currency ?? 'CNY'),
                  )
                : priceAmount(record)
            }}</span>
            <InputNumber
              v-else-if="column.key === 'packQty' && !record.additional"
              v-model:value="extra(record).packQty"
              :disabled="disabled"
              :min="1"
              :max="1000000"
              :precision="0"
              placeholder="每箱几件"
              style="width: 100%"
            />
            <span v-else-if="column.key === 'boxes' && !record.additional">
              {{ boxCount(quantity(record), extra(record).packQty) || '—' }}
            </span>
            <Textarea
              v-else-if="column.key === 'remark'"
              v-model:value="extra(record).remark"
              :disabled="disabled"
              :maxlength="2000"
              :auto-size="{ minRows: 1, maxRows: 5 }"
              placeholder="特殊要求或备注"
            />
            <OrderImages
              v-else-if="column.key === 'attachments'"
              :model-value="attachments(record)"
              :contract-id="contractId"
              :order-id="orderId"
              :max="MAX_DETAIL_IMAGES"
              :disabled="disabled"
              @update:model-value="(ids) => (extra(record).imageIds = ids)"
              @busy="imageBusy"
            />
            <template v-else-if="columnByKey(column.key)">
              <Textarea
                v-if="columnByKey(column.key)!.type === 'TEXT'"
                v-model:value="
                  customCell(record, columnByKey(column.key)!.id).text
                "
                :disabled="disabled"
                :maxlength="2000"
                :auto-size="{ minRows: 1, maxRows: 5 }"
              />
              <OrderImages
                v-else
                v-model="
                  customCell(record, columnByKey(column.key)!.id).imageIds
                "
                :contract-id="contractId"
                :order-id="orderId"
                :max="MAX_DETAIL_IMAGES"
                :disabled="disabled"
                @busy="imageBusy"
              />
            </template>
            <Button
              v-else-if="
                column.key === 'action' && record.additional && !props.disabled
              "
              type="link"
              danger
              :disabled="disabled"
              @click="
                extras.additionalLines = extras.additionalLines.filter(
                  (row) => row.id !== record.id,
                )
              "
            >
              删除
            </Button>
          </template>
        </Table>
        <div class="detail-totals">
          <span v-if="totals.boxes > 0">产品合计箱数：{{ totals.boxes
            }}{{ totals.complete ? '' : '（部分行未填装箱数）' }}</span>
          <strong>额外项目合计：{{ view.order.currency ?? 'CNY' }}
            {{ additionalTotal }}（保存后更新账款）</strong>
        </div>
      </Collapse.Panel>

      <Collapse.Panel key="shared">
        <template #header>
          整单共用说明列
          <span class="muted">
            如纹路、定制：明细各行合并成一格，文字加配图（{{
              extras.sharedColumns.length
            }}/{{ MAX_SHARED_COLUMNS }}）
          </span>
        </template>
        <div
          v-for="(column, index) in extras.sharedColumns"
          :key="index"
          class="block"
        >
          <div class="block-head">
            <AutoComplete
              v-model:value="column.title"
              :options="SHARED_COLUMN_SUGGESTIONS.map((value) => ({ value }))"
              :disabled="disabled"
              :maxlength="20"
              placeholder="列名，如纹路、定制"
              style="width: 200px"
            />
            <Button
              v-if="!disabled"
              type="link"
              danger
              @click="extras.sharedColumns.splice(index, 1)"
            >
              删除
            </Button>
          </div>
          <Textarea
            v-model:value="column.text"
            :disabled="disabled"
            :maxlength="4000"
            :auto-size="{ minRows: 2, maxRows: 8 }"
            placeholder="说明文字，如：正面贝壳纹，纹路需跟打色样品深度一致"
          />
          <OrderImages
            v-model="column.imageIds"
            :contract-id="contractId"
            :order-id="orderId"
            :max="MAX_SHARED_IMAGES"
            :disabled="disabled"
            @busy="imageBusy"
          />
        </div>
        <Button
          v-if="!disabled && extras.sharedColumns.length < MAX_SHARED_COLUMNS"
          @click="addShared"
        >
          + 添加共用说明列
        </Button>
        <span v-else-if="extras.sharedColumns.length === 0" class="muted">
          未填写
        </span>
      </Collapse.Panel>

      <Collapse.Panel key="accessories">
        <template #header>
          辅料明细表
          <span class="muted">勾选本次订单需要的辅料（已选 {{ checkedCount }} 项）</span>
        </template>
        <div class="accessories">
          <div
            v-for="row in extras.accessories"
            :key="row.name"
            class="accessory"
          >
            <Checkbox v-model:checked="row.checked" :disabled="disabled">
              {{ row.name }}
            </Checkbox>
            <Input
              v-if="row.checked"
              v-model:value="row.remark"
              size="small"
              :disabled="disabled"
              :maxlength="500"
              placeholder="规格 / 数量 / 谁提供（可选）"
            />
          </div>
        </div>
        <p class="muted">
          常用辅料清单在「采购设置 →
          常用辅料」维护；勾了任一项，采购单上列出整份清单并在需要的项打 √。
        </p>
      </Collapse.Panel>

      <Collapse.Panel key="steps">
        <template #header>
          包装步骤
          <span class="muted">
            每步标题、说明和配图，导出时另起一页（{{
              extras.packagingSteps.length
            }}/{{ MAX_STEPS }}）
          </span>
        </template>
        <div
          v-for="(step, index) in extras.packagingSteps"
          :key="index"
          class="block"
        >
          <div class="block-head">
            <Input
              v-model:value="step.title"
              :disabled="disabled"
              :maxlength="100"
              placeholder="步骤标题，如 1.包卡纸+OPP膜"
              style="max-width: 320px"
            />
            <Space v-if="!disabled" :size="0">
              <Button
                type="link"
                :disabled="index === 0"
                @click="move(extras.packagingSteps, index, -1)"
              >
                上移
              </Button>
              <Button
                type="link"
                :disabled="index === extras.packagingSteps.length - 1"
                @click="move(extras.packagingSteps, index, 1)"
              >
                下移
              </Button>
              <Button
                type="link"
                danger
                @click="extras.packagingSteps.splice(index, 1)"
              >
                删除
              </Button>
            </Space>
          </div>
          <Textarea
            v-model:value="step.text"
            :disabled="disabled"
            :maxlength="4000"
            :auto-size="{ minRows: 2, maxRows: 8 }"
            placeholder="这一步怎么做、用什么规格的材料；不同尺寸的差别也写在这里"
          />
          <OrderImages
            v-model="step.imageIds"
            :contract-id="contractId"
            :order-id="orderId"
            :max="MAX_STEP_IMAGES"
            :disabled="disabled"
            @busy="imageBusy"
          />
        </div>
        <Button
          v-if="!disabled && extras.packagingSteps.length < MAX_STEPS"
          @click="addStep"
        >
          + 添加包装步骤
        </Button>
        <span v-else-if="extras.packagingSteps.length === 0" class="muted">
          未填写
        </span>
      </Collapse.Panel>
    </Collapse>
    <div v-if="!props.disabled" class="save-bar">
      <span class="muted">{{
        uploadCount > 0
          ? '图片上传中，请稍候再保存或关闭'
          : dirty
            ? '修改尚未保存，保存后重新打开可继续查看'
            : '附加资料已保存'
      }}</span>
      <Button
        type="primary"
        :loading="saving"
        :disabled="disabled || !dirty"
        @click="emit('save')"
      >
        保存附加资料
      </Button>
    </div>

    <Modal
      :open="copyOpen"
      title="从历史采购单复制附加资料"
      :footer="null"
      width="900px"
      :closable="!copying"
      :mask-closable="!copying"
      :keyboard="!copying"
      @cancel="!copying && (copyOpen = false)"
    >
      <Space direction="vertical" style="width: 100%">
        <Input.Search
          v-model:value="copyKeyword"
          placeholder="搜索采购单号、供应商或合同"
          @search="loadCopyRows(true)"
        />
        <Alert v-if="copyError" type="error" :message="copyError" />
        <Table
          :data-source="copyRows"
          :loading="copyLoading || copying"
          size="small"
          :row-key="(row: ProcurementOrderRow) => row.standaloneId ?? row.id"
          :pagination="{ current: copyPage, pageSize: 10, total: copyTotal }"
          :columns="[
            { title: '采购单', key: 'code' },
            { title: '供应商', key: 'supplier' },
            { title: '附加资料', key: 'extras', width: 110 },
            { title: '', key: 'action', width: 80 },
          ]"
          @change="
            (value) => {
              copyPage = value.current ?? 1;
              loadCopyRows();
            }
          "
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'code'">
              {{ purchaseRowLabels(record as BusinessRecord).order }}
            </span>
            <span v-else-if="column.key === 'supplier'">
              {{ purchaseRowLabels(record as BusinessRecord).supplier }}
            </span>
            <Tag
              v-else-if="column.key === 'extras'"
              :color="
                hasExtras(record as ProcurementOrderRow) ? 'blue' : 'default'
              "
            >
              {{ hasExtras(record as ProcurementOrderRow) ? '有' : '无' }}
            </Tag>
            <Button
              v-else-if="column.key === 'action'"
              type="link"
              :disabled="
                copying ||
                !source(record as ProcurementOrderRow) ||
                (record as ProcurementOrderRow).id === orderId ||
                (record as ProcurementOrderRow).standaloneId === orderId
              "
              @click="pick(record as ProcurementOrderRow)"
            >
              复制
            </Button>
          </template>
        </Table>
      </Space>
    </Modal>
  </div>
</template>
<style scoped>
.print-extras {
  margin-bottom: 16px;
}

.extras-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.detail-toolbar,
.column-settings {
  margin-bottom: 12px;
}

.column-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.column-setting {
  display: flex;
  gap: 6px;
  align-items: center;
  max-width: 420px;
}

.column-setting > .ant-input {
  width: 150px;
}

.detail-totals,
.save-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.save-bar {
  padding: 10px 12px;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.section-title {
  margin: 4px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.muted {
  margin: 0 0 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.extras-collapse :deep(.ant-collapse-header) .muted {
  margin-left: 8px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.block-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.accessories {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px 16px;
  margin-bottom: 8px;
}

.accessory {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
