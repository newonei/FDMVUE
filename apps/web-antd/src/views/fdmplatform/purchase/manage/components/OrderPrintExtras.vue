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

import { errorText, money } from '../../../data';
import {
  procurementLineValue,
  procurementUnitPrice,
} from '../../../finance/procurement/model';
import { purchaseRowLabels } from '../model';
import {
  additionalLineAmount,
  boxCount,
  copyPrintExtras,
  currencyDigits,
  MAX_ADDITIONAL_LINES,
  MAX_DETAIL_COLUMNS,
  MAX_DETAIL_IMAGES,
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
 * 辅料明细勾选、包装步骤、订单备注。随下单资料一起保存、确认，导出时带出。
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
const columnsOpen = ref(false);
const expandedLines = ref<string[]>([]);
const copyOpen = ref(false);
const batchOpen = ref(false);
const copying = ref(false);
let disposed = false;
const disabled = computed(
  () =>
    props.disabled || props.saving || uploadCount.value > 0 || copying.value,
);
watch(
  () =>
    uploadCount.value > 0 ||
    copyOpen.value ||
    copying.value ||
    batchOpen.value ||
    columnsOpen.value,
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
const colorCardSlots = [
  { field: 'colorImageId', label: '正面' },
  { field: 'backColorImageId', label: '反面' },
] as const;
type LineImageField = 'imageId' | (typeof colorCardSlots)[number]['field'];
const extras = reactive<PrintExtras>({
  detailColumns: [],
  additionalLines: [],
  lineExtras: {},
  sharedColumns: [],
  accessories: [],
  packagingSteps: [],
  orderRemark: '',
});
const active = ref<string[]>([]);
const contractId = computed(() => props.view.contractId);
const orderId = computed(() => props.view.id);
const lines = computed(() => (props.view.order.lines ?? []) as Line[]);
const selectedLineIds = ref<string[]>([]);
const allSelected = computed(
  () =>
    lines.value.length > 0 &&
    selectedLineIds.value.length === lines.value.length,
);
const displayLines = computed<Line[]>(() => [
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

function fillSnapshotWeights() {
  for (const line of lines.value) {
    const weight = spec(line).weight;
    if (typeof weight === 'string' && weight.trim())
      extra(line).weight ??= weight.trim();
  }
}

function loadSaved() {
  Object.assign(
    extras,
    printExtrasFrom(props.view.details, props.view.accessoryCatalog),
  );
  fillSnapshotWeights();
  selectedLineIds.value = [];
  batchOpen.value = false;
  const nextId = `${props.view.contractId}/${props.view.id}`;
  if (loadedId !== nextId) {
    columnsOpen.value = false;
    expandedLines.value = displayLines.value
      .slice(0, 1)
      .map((line) => String(line.id));
  }
  loadedId = nextId;
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
      extras.orderRemark?.trim() ? 'remark' : '',
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
function selectLine(id: string, checked: boolean) {
  selectedLineIds.value = checked
    ? [...new Set([...selectedLineIds.value, id])]
    : selectedLineIds.value.filter((value) => value !== id);
}
function selectAllLines(checked: boolean) {
  selectedLineIds.value = checked
    ? lines.value.map((line) => String(line.id))
    : [];
}
const batchWeight = ref('');
const batchOnlyEmpty = ref(false);
function openBatch() {
  batchWeight.value = '';
  batchOnlyEmpty.value = false;
  batchOpen.value = true;
}
function applyBatch() {
  if (disabled.value || selectedLineIds.value.length === 0) return;
  const weight = batchWeight.value.trim();
  let updatedRows = 0;
  for (const id of selectedLineIds.value) {
    const current = extras.lineExtras[id]?.weight;
    if (current === weight || (batchOnlyEmpty.value && current?.trim()))
      continue;
    (extras.lineExtras[id] ??= {}).weight = weight;
    updatedRows++;
  }
  batchOpen.value = false;
  if (updatedRows > 0)
    message.success(`已更新 ${updatedRows} 条产品明细，请保存附加资料`);
  else message.warning('产品克重未变更');
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
  const id = crypto.randomUUID();
  extras.additionalLines.push({
    id,
    name: '',
    quantity: 1,
    unit: '项',
    unitPrice: 0,
    imageIds: [],
    customCells: {},
  });
  expandedLines.value.push(id);
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
  const currency = String(props.view.order.currency ?? 'CNY');
  const amount = line.additional
    ? new BigNumber(additionalLineAmount(line.additional, currency))
    : procurementLineValue(line, currency);
  return amount.isFinite()
    ? amount.toFormat(currencyDigits(currency), BigNumber.ROUND_HALF_UP)
    : '—';
}
function lineImages(line: Line, field: LineImageField = 'imageId') {
  const id = extra(line)[field];
  return id ? [id] : [];
}
function setLineImages(
  line: Line,
  ids: string[],
  field: LineImageField = 'imageId',
) {
  extra(line)[field] = ids[0];
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
      keyword: copyKeyword.value.trim() || undefined,
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
    details?.orderRemark?.trim() ||
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
    !!value.orderRemark ||
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
      '自定义列、额外费用行、共用说明列、辅料勾选、包装步骤、订单备注整份替换；产品补充按产品匹配。费用行会在保存后计入本单总额和应付款，请核对。',
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
    fillSnapshotWeights();
    expandedLines.value = displayLines.value
      .slice(0, 1)
      .map((line) => String(line.id));
    active.value = ['lines', 'shared', 'accessories', 'steps'];
    if (extras.orderRemark?.trim()) active.value.push('remark');
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
      <div>
        <h4 class="section-title">采购单附加资料</h4>
        <p class="extras-subtitle">
          补充产品规格、配图、包装要求和订单备注，保存后随采购单导出。
        </p>
      </div>
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
    <details class="extras-guide">
      <summary>填写与导出说明</summary>
      <p class="muted">
        不填的部分不出现在采购单上。填了产品图片、客户颜色等补充列时，导出改为横向；辅料明细和包装步骤分别输出（Excel
        为单独的工作表）。支持 JPG / PNG
        图片或粘贴截图；修改后请点击「保存附加资料」。
      </p>
    </details>
    <Collapse v-model:active-key="active" class="extras-collapse">
      <Collapse.Panel key="lines">
        <template #header>
          明细补充
          <span class="muted">支持新增费用行、自定义文字 / 图片列、备注及图片附件</span>
        </template>
        <div class="detail-toolbar">
          <div>
            <strong>产品补充资料</strong>
            <span class="toolbar-count">{{ lines.length }} 项产品 ·
              {{ extras.additionalLines.length }} 项费用 / 免费项目</span>
          </div>
          <Space wrap>
            <Button
              v-if="!props.disabled"
              :disabled="
                disabled ||
                extras.additionalLines.length >= MAX_ADDITIONAL_LINES
              "
              @click="addLine"
            >
              + 新增费用 / 免费项目行
            </Button>
            <Button :disabled="disabled" @click="columnsOpen = true">
              自定义列设置（{{ extras.detailColumns.length }}/{{
                MAX_DETAIL_COLUMNS
              }}）
            </Button>
          </Space>
        </div>
        <p class="muted detail-help">
          按产品展开填写，数量和单价在采购单明细中修改。图片支持 JPG /
          PNG，也可点击图片区域后粘贴截图。
        </p>
        <div v-if="!props.disabled && lines.length > 1" class="batch-toolbar">
          <Checkbox
            :checked="allSelected"
            :indeterminate="selectedLineIds.length > 0 && !allSelected"
            :disabled="disabled"
            @change="(event) => selectAllLines(event.target.checked)"
          >
            全选产品
          </Checkbox>
          <span class="muted">已选 {{ selectedLineIds.length }} 项</span>
          <Button
            :disabled="disabled || !selectedLineIds.length"
            @click="openBatch"
          >
            批量设置产品克重
          </Button>
        </div>
        <Collapse v-model:active-key="expandedLines" class="line-cards">
          <Collapse.Panel
            v-for="(record, index) in displayLines"
            :key="String(record.id)"
            :data-row="String(record.id)"
            :force-render="true"
          >
            <template #header>
              <div class="line-heading">
                <div class="line-identity">
                  <span
                    v-if="
                      !props.disabled && !record.additional && lines.length > 1
                    "
                    @click.stop
                  >
                    <Checkbox
                      :checked="selectedLineIds.includes(String(record.id))"
                      :disabled="disabled"
                      :aria-label="`选择产品 ${spec(record).skuCode ?? record.id}`"
                      @change="
                        (event) =>
                          selectLine(String(record.id), event.target.checked)
                      "
                    />
                  </span>
                  <Tag v-if="record.additional" color="blue">
                    费用 / 免费项目
                  </Tag>
                  <span v-else class="line-number">{{ index + 1 }}</span>
                  <div class="line-name">
                    <strong>{{
                      record.additional
                        ? record.additional.name || '未命名项目'
                        : spec(record).skuCode || '未命名产品'
                    }}</strong>
                    <span v-if="!record.additional" class="muted">{{
                      spec(record).skuName ?? ''
                    }}</span>
                  </div>
                </div>
                <div class="line-summary">
                  <span>{{ quantity(record) }}
                    {{
                      record.additional
                        ? record.additional.unit
                        : (spec(record).unit ?? record.unit ?? '件')
                    }}</span>
                  <span>{{ record.agreedAmount == null ? '单价' : '折算单价' }}
                    {{
                      procurementUnitPrice(
                        record.additional?.unitPrice ?? record.unitPrice,
                      )
                    }}</span>
                  <strong>{{ view.order.currency ?? 'CNY' }}
                    {{ priceAmount(record) }}</strong>
                </div>
              </div>
            </template>
            <div v-if="record.additional" class="fee-grid">
              <div class="field field-wide" data-key="product">
                <label :for="`fee-name-${record.id}`">费用 / 免费项目名称</label>
                <Input
                  :id="`fee-name-${record.id}`"
                  v-model:value="record.additional.name"
                  :disabled="disabled"
                  :maxlength="200"
                  placeholder="如加工费、免费打样"
                  aria-label="费用项目名称"
                />
              </div>
              <div class="field" data-key="quantity">
                <label :for="`fee-quantity-${record.id}`">数量</label>
                <InputNumber
                  :id="`fee-quantity-${record.id}`"
                  v-model:value="record.additional.quantity"
                  :disabled="disabled"
                  :min="0.000001"
                  :max="1000000000"
                  :precision="6"
                  aria-label="费用数量"
                />
              </div>
              <div class="field" data-key="unit">
                <label :for="`fee-unit-${record.id}`">单位</label>
                <Input
                  :id="`fee-unit-${record.id}`"
                  v-model:value="record.additional.unit"
                  :disabled="disabled"
                  :maxlength="20"
                  aria-label="费用单位"
                />
              </div>
              <div class="field" data-key="unitPrice">
                <label :for="`fee-price-${record.id}`">单价（0 表示免费）</label>
                <InputNumber
                  :id="`fee-price-${record.id}`"
                  v-model:value="record.additional.unitPrice"
                  :disabled="disabled"
                  :min="0"
                  :max="1000000000"
                  :precision="6"
                  aria-label="费用单价（可填0）"
                />
              </div>
            </div>
            <div v-else class="product-editor">
              <div class="product-fields">
                <div class="field-grid">
                  <div class="field" data-key="customerColor">
                    <div class="field-label">
                      <label :for="`color-${record.id}`">客户颜色名称</label><Button
                        v-if="!disabled && index === 0 && lines.length > 1"
                        type="link"
                        size="small"
                        title="将本项填入其他产品的空白字段"
                        @click="fillDown('customerColor')"
                      >
                        填充空白行
                      </Button>
                    </div>
                    <Input
                      :id="`color-${record.id}`"
                      v-model:value="extra(record).customerColor"
                      :disabled="disabled"
                      :maxlength="200"
                      placeholder="填写客户使用的颜色名称"
                    />
                  </div>
                  <div class="field" data-key="weight">
                    <div class="field-label">
                      <label :for="`weight-${record.id}`">产品克重</label><Button
                        v-if="!disabled && index === 0 && lines.length > 1"
                        type="link"
                        size="small"
                        title="将本项填入其他产品的空白字段"
                        @click="fillDown('weight')"
                      >
                        填充空白行
                      </Button>
                    </div>
                    <Input
                      :id="`weight-${record.id}`"
                      v-model:value="extra(record).weight"
                      :disabled="disabled"
                      :maxlength="100"
                      placeholder="如 1000g±100g"
                    />
                  </div>
                  <div class="field" data-key="packQty">
                    <div class="field-label">
                      <label :for="`pack-${record.id}`">装箱数（件 / 箱）</label><Button
                        v-if="!disabled && index === 0 && lines.length > 1"
                        type="link"
                        size="small"
                        title="将本项填入其他产品的空白字段"
                        @click="fillDown('packQty')"
                      >
                        填充空白行
                      </Button>
                    </div>
                    <InputNumber
                      :id="`pack-${record.id}`"
                      v-model:value="extra(record).packQty"
                      :disabled="disabled"
                      :min="1"
                      :max="1000000"
                      :precision="0"
                      placeholder="每箱几件"
                    />
                    <span class="field-hint">箱数：{{
                        boxCount(quantity(record), extra(record).packQty) ||
                        '待填写装箱数'
                      }}</span>
                  </div>
                  <div class="model-media-row field-full">
                    <div class="field" data-key="model">
                      <div class="field-label">
                        <label :for="`model-${record.id}`">型号 / 补充规格</label><Button
                          v-if="!disabled && index === 0 && lines.length > 1"
                          type="link"
                          size="small"
                          title="将本项填入其他产品的空白字段"
                          @click="fillDown('model')"
                        >
                          填充空白行
                        </Button>
                      </div>
                      <Textarea
                        :id="`model-${record.id}`"
                        v-model:value="extra(record).model"
                        :disabled="disabled"
                        :maxlength="500"
                        :auto-size="{ minRows: 2, maxRows: 4 }"
                        placeholder="填写型号、正反面要求等补充信息"
                      />
                    </div>
                    <div class="field" data-key="colorImage">
                      <span class="group-label">供应商实物色号图</span>
                      <div class="color-card-slots">
                        <div
                          v-for="slot in colorCardSlots"
                          :key="slot.field"
                          class="field"
                        >
                          <span class="group-label">{{ slot.label }}</span>
                          <OrderImages
                            :model-value="lineImages(record, slot.field)"
                            :contract-id="contractId"
                            :order-id="orderId"
                            :max="1"
                            :size="80"
                            :disabled="disabled"
                            :aria-label="`供应商实物色号图（${slot.label}）`"
                            @update:model-value="
                              (ids) => setLineImages(record, ids, slot.field)
                            "
                            @busy="imageBusy"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="product-media">
                <div class="field" data-key="image">
                  <span class="group-label">产品图片</span>
                  <OrderImages
                    :model-value="lineImages(record)"
                    :contract-id="contractId"
                    :order-id="orderId"
                    :max="1"
                    :size="80"
                    :disabled="disabled"
                    @update:model-value="(ids) => setLineImages(record, ids)"
                    @busy="imageBusy"
                  />
                </div>
              </div>
            </div>
            <div class="supplement-grid">
              <div
                v-for="column in extras.detailColumns"
                :key="column.id"
                class="field"
                :data-key="`custom:${column.id}`"
              >
                <label :for="`custom-${record.id}-${column.id}`">{{
                  column.title || '未命名列'
                }}</label>
                <Textarea
                  v-if="column.type === 'TEXT'"
                  :id="`custom-${record.id}-${column.id}`"
                  v-model:value="customCell(record, column.id).text"
                  :disabled="disabled"
                  :maxlength="2000"
                  :auto-size="{ minRows: 2, maxRows: 5 }"
                  :placeholder="`填写${column.title || '自定义内容'}`"
                />
                <OrderImages
                  v-else
                  v-model="customCell(record, column.id).imageIds"
                  :contract-id="contractId"
                  :order-id="orderId"
                  :max="MAX_DETAIL_IMAGES"
                  :disabled="disabled"
                  @busy="imageBusy"
                />
              </div>
              <div class="field" data-key="remark">
                <label :for="`remark-${record.id}`">备注</label>
                <Textarea
                  :id="`remark-${record.id}`"
                  v-model:value="extra(record).remark"
                  :disabled="disabled"
                  :maxlength="2000"
                  :auto-size="{ minRows: 2, maxRows: 5 }"
                  placeholder="特殊要求或备注"
                />
              </div>
              <div class="field" data-key="attachments">
                <span class="group-label">附件图片</span>
                <OrderImages
                  :model-value="attachments(record)"
                  :contract-id="contractId"
                  :order-id="orderId"
                  :max="MAX_DETAIL_IMAGES"
                  :disabled="disabled"
                  @update:model-value="(ids) => (extra(record).imageIds = ids)"
                  @busy="imageBusy"
                />
              </div>
            </div>
            <div v-if="record.additional" class="fee-footer">
              <span class="muted">费用计入采购总额和应付款；单价为 0 时作为免费项目导出。</span>
              <Button
                v-if="!props.disabled"
                type="link"
                danger
                :disabled="disabled"
                @click="
                  extras.additionalLines = extras.additionalLines.filter(
                    (row) => row.id !== record.id,
                  )
                "
              >
                删除项目
              </Button>
            </div>
          </Collapse.Panel>
        </Collapse>
        <p v-if="!displayLines.length" class="empty-hint">
          暂无产品明细，可新增费用或免费项目。
        </p>
        <div class="detail-totals">
          <span v-if="totals.boxes > 0">产品合计箱数：{{ totals.boxes
            }}{{ totals.complete ? '' : '（部分行未填装箱数）' }}</span>
          <strong>额外项目合计：{{ view.order.currency ?? 'CNY' }}
            {{ money(additionalTotal) }}（保存后更新账款）</strong>
        </div>
      </Collapse.Panel>

      <Collapse.Panel key="shared">
        <template #header>
          整单共用说明列
          <span class="muted">
            如纹路、定制：明细各行合并成一格，文字加配图（{{
              extras.sharedColumns.length
            }}
            项）
          </span>
        </template>
        <div class="shared-grid">
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
        </div>
        <Button v-if="!disabled" @click="addShared"> + 添加共用说明列 </Button>
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
      <Collapse.Panel key="remark">
        <template #header>
          订单备注
          <span class="muted">整单补充说明，保存后随采购单导出</span>
        </template>
        <Textarea
          v-model:value="extras.orderRemark"
          :disabled="disabled"
          :maxlength="2000"
          :auto-size="{ minRows: 3, maxRows: 10 }"
          show-count
          aria-label="订单备注"
          placeholder="填写需要在采购单上展示的订单备注"
        />
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
      :open="batchOpen"
      title="批量设置产品克重"
      :ok-text="batchWeight.trim() ? '应用到所选明细' : '清空所选克重'"
      :ok-button-props="{
        disabled: disabled || (batchOnlyEmpty && !batchWeight.trim()),
      }"
      :cancel-button-props="{ disabled }"
      :mask-closable="!disabled"
      @ok="applyBatch"
      @cancel="!disabled && (batchOpen = false)"
    >
      <p>
        为选中的 {{ selectedLineIds.length }} 条产品明细设置克重，留空可清空。
      </p>
      <Input
        v-model:value="batchWeight"
        :disabled="disabled"
        :maxlength="100"
        placeholder="如 1000g±100g"
        aria-label="批量产品克重"
      />
      <Checkbox
        v-model:checked="batchOnlyEmpty"
        :disabled="disabled"
        class="batch-only-empty"
      >
        仅填充所选明细中的空值
      </Checkbox>
    </Modal>
    <Modal
      v-model:open="columnsOpen"
      title="自定义列设置"
      :footer="null"
      width="640px"
    >
      <p class="muted">
        为所有产品和费用项目添加文字或图片字段，保存附加资料后会带入导出的采购单。最多
        {{ MAX_DETAIL_COLUMNS }} 列。
      </p>
      <div class="column-settings">
        <div
          v-for="(column, index) in extras.detailColumns"
          :key="column.id"
          class="column-setting"
        >
          <span class="line-number">{{ index + 1 }}</span>
          <div class="field">
            <label :for="`column-title-${column.id}`">列名称</label>
            <Input
              :id="`column-title-${column.id}`"
              v-model:value="column.title"
              :disabled="disabled"
              :maxlength="20"
              placeholder="如形状、色卡图片"
              :aria-label="`自定义列名称 ${column.id}`"
            />
          </div>
          <div class="field">
            <label :for="`column-type-${column.id}`">内容类型</label>
            <Select
              :id="`column-type-${column.id}`"
              v-model:value="column.type"
              :disabled="disabled"
              :options="[
                { label: '文字', value: 'TEXT' },
                { label: '图片', value: 'IMAGE' },
              ]"
              :aria-label="`自定义列类型 ${column.id}`"
            />
          </div>
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
        <p v-if="!extras.detailColumns.length" class="empty-hint">
          还没有自定义列，可添加文字说明或色卡等图片。
        </p>
      </div>
      <Space v-if="!props.disabled" wrap>
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
      <div class="settings-footer">
        <Button type="primary" @click="columnsOpen = false">完成设置</Button>
      </div>
    </Modal>

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
          placeholder="搜索采购主题、内部单号、合同号或供应商"
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
            { title: '采购主题', key: 'subject' },
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
            <span v-if="column.key === 'subject'">
              {{ purchaseRowLabels(record as BusinessRecord).title }}
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
  min-width: 0;
  margin-bottom: 16px;
  container-type: inline-size;
}

.extras-head,
.detail-toolbar,
.line-heading,
.line-identity,
.line-summary,
.detail-totals,
.save-bar,
.block-head,
.fee-footer,
.batch-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.extras-head {
  margin-bottom: 8px;
}

.extras-subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.extras-guide {
  margin-bottom: 16px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.extras-guide summary {
  width: fit-content;
  cursor: pointer;
}

.extras-guide p {
  margin: 8px 0 0;
  line-height: 1.7;
}

.batch-only-empty {
  margin-top: 12px;
}

.extras-head .muted,
.batch-toolbar .muted,
.fee-footer .muted {
  margin: 0;
}

.detail-toolbar {
  margin-bottom: 10px;
}

.toolbar-count {
  margin-left: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.detail-help {
  margin-bottom: 16px;
}

.batch-toolbar {
  justify-content: flex-start;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: hsl(var(--accent) / 50%);
  border-radius: 6px;
}

.line-cards {
  background: transparent;
  border: 0;
}

.line-cards :deep(.ant-collapse-item) {
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px !important;
}

.line-cards :deep(.ant-collapse-header) {
  align-items: center !important;
  padding: 14px 16px !important;
  background: hsl(var(--accent) / 35%);
}

.line-cards :deep(.ant-collapse-content-box) {
  padding: 20px !important;
}

.line-heading {
  gap: 12px 20px;
  width: 100%;
}

.line-identity {
  flex: 1;
  flex-wrap: nowrap;
  justify-content: flex-start;
  min-width: 180px;
}

.line-number {
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: 6px;
}

.line-name {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.line-name .muted {
  margin: 0 !important;
}

.line-summary {
  gap: 8px 20px;
  justify-content: flex-start;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.line-summary strong {
  font-size: 14px;
  color: hsl(var(--foreground));
}

.product-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 24px;
}

.product-fields,
.product-media {
  min-width: 0;
}

.product-media {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-left: 24px;
  border-left: 1px solid hsl(var(--border));
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field label,
.group-label {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground) / 80%);
  overflow-wrap: anywhere;
}

.field :deep(.ant-input-number),
.field :deep(.ant-select) {
  width: 100%;
  min-width: 0;
}

.field-label {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}

.field-label :deep(.ant-btn) {
  height: auto;
  padding: 0;
  font-size: 12px;
}

.field-full {
  grid-column: 1 / -1;
}

.model-media-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 20px;
}

.color-card-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.field-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.supplement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 24px;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid hsl(var(--border));
}

.fee-grid {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.fee-footer {
  margin-top: 16px;
}

.detail-totals {
  padding: 12px 16px;
  margin-top: 16px;
  font-size: 12px;
  background: hsl(var(--accent) / 50%);
  border-radius: 6px;
}

.save-bar {
  padding: 12px 16px;
  margin-top: 16px;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.muted {
  margin: 0 0 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.extras-collapse :deep(.ant-collapse-header) .muted {
  margin-left: 8px;
}

.extras-collapse :deep(.ant-collapse-content-box) {
  padding: 16px;
}

.shared-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.shared-grid .block {
  margin-bottom: 0;
}

.block-head {
  flex-wrap: nowrap;
  gap: 12px;
}

.block-head :deep(.ant-select),
.block-head :deep(.ant-input) {
  min-width: 0;
}

.column-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
}

.column-setting {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 100px auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: hsl(var(--accent) / 50%);
  border-radius: 8px;
}

.column-setting > :deep(.ant-btn) {
  align-self: end;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid hsl(var(--border));
}

.empty-hint {
  padding: 24px 12px;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.accessories {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 12px 20px;
  margin-bottom: 12px;
}

.accessory {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@container (max-width: 900px) {
  .product-editor {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }

  .product-media {
    flex-flow: row wrap;
    gap: 24px;
    padding: 16px 0 0;
    border-top: 1px solid hsl(var(--border));
    border-left: 0;
  }

  .product-media > .field {
    flex: 1;
    min-width: 180px;
  }

  .fee-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .field-wide {
    grid-column: 1 / -1;
  }
}

@container (max-width: 600px) {
  .field-grid,
  .model-media-row,
  .supplement-grid,
  .fee-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .line-cards :deep(.ant-collapse-content-box) {
    padding: 16px !important;
  }

  .toolbar-count {
    display: block;
    margin: 4px 0 0;
  }

  .line-summary {
    gap: 8px 12px;
  }

  .extras-collapse :deep(.ant-collapse-header) .muted {
    display: block;
    margin: 4px 0 0;
  }
}

@media (max-width: 600px) {
  .column-setting {
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
  }

  .column-setting > .field,
  .column-setting > :deep(.ant-btn) {
    grid-column: 2;
  }

  .column-setting > :deep(.ant-btn) {
    justify-self: end;
  }
}
</style>
