<script setup lang="ts">
import type { PrintExtras } from '../print-extras';

import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  OrderLineExtra,
  ProcurementOrderRow,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, reactive, ref, watch } from 'vue';

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
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  copyProcurementImages,
  getProcurementOrder,
  getProcurementOrders,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { purchaseRowLabels } from '../model';
import {
  boxCount,
  copyPrintExtras,
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
 * 辅料明细勾选、包装步骤。随下单资料一起保存、确认，导出 PDF / Word / Excel 时带出。
 */
const props = defineProps<{ disabled: boolean; view: ProcurementOrderView }>();
/** 采购单明细行（表格单元格里拿到的是宽松类型）。 */
type Line = Record<string, any>;
const extras = reactive<PrintExtras>({
  lineExtras: {},
  sharedColumns: [],
  accessories: [],
  packagingSteps: [],
});
const active = ref<string[]>([]);
const contractId = computed(() => props.view.contractId);
const orderId = computed(() => props.view.id);
const lines = computed(() => (props.view.order.lines ?? []) as Line[]);

watch(
  () => [props.view.id, props.view.details.version],
  () => {
    Object.assign(
      extras,
      printExtrasFrom(props.view.details, props.view.accessoryCatalog),
    );
    for (const line of lines.value) extras.lineExtras[String(line.id)] ??= {};
    // 有内容的分组默认展开
    active.value = [
      Object.values(props.view.details.lineExtras ?? {}).length > 0
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
  return Number(line.quantity ?? 0) - Number(line.cancelledQuantity ?? 0);
}
function extra(line: Line): OrderLineExtra {
  return (extras.lineExtras[String(line.id)] ??= {});
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
const copyOpen = ref(false);
const copyRows = ref<ProcurementOrderRow[]>([]);
const copyKeyword = ref('');
const copyPage = ref(1);
const copyTotal = ref(0);
const copyLoading = ref(false);
const copying = ref(false);
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
    details?.sharedColumns?.length ||
    details?.accessories?.some((entry) => entry.checked) ||
    Object.keys(details?.lineExtras ?? {}).length > 0
  );
}
function hasContent() {
  const value = printExtrasPayload(extras);
  return (
    value.sharedColumns.length > 0 ||
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
      '共用说明列、辅料勾选、包装步骤整份替换；明细补充按产品对上的行替换，对不上的行保留。保存草稿后才生效。',
    okText: '替换',
    cancelText: '取消',
    onOk: () => copyFrom(target),
  });
}
async function copyFrom(target: { contractId: string; orderId: string }) {
  copying.value = true;
  copyError.value = '';
  try {
    const sourceView = await getProcurementOrder(
      target.contractId,
      target.orderId,
    );
    const sourceExtras = printExtrasFrom(sourceView.details);
    const ids = printExtrasImageIds(sourceExtras);
    const images =
      ids.length > 0
        ? await copyProcurementImages(contractId.value, orderId.value, {
            sourceContractId: target.contractId,
            sourceOrderId: target.orderId,
            imageIds: ids,
          })
        : {};
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
      `已带入附加资料，明细按产品对上 ${result.matched} 行；确认无误后请保存草稿`,
    );
  } catch (error) {
    copyError.value = errorText(error);
  } finally {
    copying.value = false;
  }
}

defineExpose({ payload: () => printExtrasPayload(extras) });
</script>
<template>
  <div class="print-extras">
    <div class="extras-head">
      <h4 class="section-title">采购单附加资料（印在导出的采购单上）</h4>
      <Button v-if="!disabled" size="small" @click="openCopy">
        从历史采购单复制
      </Button>
    </div>
    <p class="muted">
      不填的部分不出现在采购单上。填了产品图片、客户颜色等补充列时，导出改为横向；辅料明细和包装步骤分别输出（Excel
      为单独的工作表）。
    </p>
    <Collapse v-model:active-key="active" class="extras-collapse">
      <Collapse.Panel key="lines">
        <template #header>
          明细补充
          <span class="muted">产品图片、客户颜色名称、克重、型号、装箱数</span>
        </template>
        <Table
          :data-source="lines"
          :pagination="false"
          size="small"
          :row-key="(line: Line) => String(line.id)"
          :scroll="{ x: 980 }"
          :columns="[
            { title: '产品', key: 'product', width: 180, fixed: 'left' },
            { title: '产品图片', key: 'image', width: 90 },
            { title: '客户颜色名称', key: 'customerColor', width: 140 },
            { title: '产品克重', key: 'weight', width: 120 },
            { title: '型号（如正反面颜色）', key: 'model', width: 180 },
            { title: '数量', key: 'quantity', width: 70, align: 'right' },
            { title: '装箱数', key: 'packQty', width: 110 },
            { title: '箱数', key: 'boxes', width: 70, align: 'right' },
          ]"
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
              <div>{{ spec(record).skuCode ?? '' }}</div>
              <div class="muted">{{ spec(record).skuName ?? '' }}</div>
            </template>
            <OrderImages
              v-else-if="column.key === 'image'"
              :model-value="lineImages(record)"
              :contract-id="contractId"
              :order-id="orderId"
              :max="1"
              :size="56"
              :disabled="disabled"
              @update:model-value="(ids) => setLineImages(record, ids)"
            />
            <Input
              v-else-if="column.key === 'customerColor'"
              v-model:value="extra(record).customerColor"
              :disabled="disabled"
              :maxlength="200"
            />
            <Input
              v-else-if="column.key === 'weight'"
              v-model:value="extra(record).weight"
              :disabled="disabled"
              :maxlength="100"
              placeholder="如 1000g±100g"
            />
            <Textarea
              v-else-if="column.key === 'model'"
              v-model:value="extra(record).model"
              :disabled="disabled"
              :maxlength="500"
              :auto-size="{ minRows: 1, maxRows: 4 }"
            />
            <span v-else-if="column.key === 'quantity'">
              {{ quantity(record) }}
            </span>
            <InputNumber
              v-else-if="column.key === 'packQty'"
              v-model:value="extra(record).packQty"
              :disabled="disabled"
              :min="1"
              :max="1000000"
              :precision="0"
              placeholder="每箱几件"
              style="width: 100%"
            />
            <span v-else-if="column.key === 'boxes'">
              {{ boxCount(quantity(record), extra(record).packQty) || '—' }}
            </span>
          </template>
          <template #summary>
            <Table.Summary.Row v-if="totals.boxes > 0">
              <Table.Summary.Cell :index="0" :col-span="7" align="right">
                合计箱数{{ totals.complete ? '' : '（部分行未填装箱数）' }}
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="7" align="right">
                {{ totals.boxes }}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </template>
        </Table>
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

    <Modal
      :open="copyOpen"
      title="从历史采购单复制附加资料"
      :footer="null"
      width="900px"
      @cancel="copyOpen = false"
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
  gap: 12px;
  align-items: center;
  justify-content: space-between;
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
