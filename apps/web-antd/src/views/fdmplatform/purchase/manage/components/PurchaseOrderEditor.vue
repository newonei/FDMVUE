<script setup lang="ts">
import type { EntryHeader, EntryRow } from '../entry-model';

import type { Contract, Directory, MasterRecord } from '#/api/fdmplatform';
import type { CreatedProcurementOrders } from '#/api/fdmplatform/procurement';
import type { Product } from '#/api/fdmplatform/products';

import { computed, defineAsyncComponent, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Textarea,
} from 'ant-design-vue';

import { getContract, getDirectory } from '#/api/fdmplatform';
import { getContractBoard } from '#/api/fdmplatform/contract-board';
import { getMasterPage } from '#/api/fdmplatform/masters';
import {
  createProcurementOrder,
  getProcurementOrder,
  getProcurementSettings,
  getReceiveFactories,
} from '#/api/fdmplatform/procurement';
import { getProducts } from '#/api/fdmplatform/products';

import RemoteMasterSelect from '../../../components/RemoteMasterSelect.vue';
import { errorText } from '../../../data';
import { localDate } from '../../quotes/comparison';
import {
  copyEntry,
  emptyRow,
  entryErrors,
  entryPayload,
  entrySuppliers,
  entryTotals,
  parsePastedLines,
  PURCHASE_CATEGORIES,
  quotedSupplier,
  setRowGift,
  setRowPrice,
  setRowQuantity,
  setRowTotal,
} from '../entry-model';

const props = defineProps<{
  contractId?: string;
  /** 复制这张采购单：带出合同、供应商、表头和明细，另存为新单 */
  copyFrom?: { contractId: string; orderId: string };
  open: boolean;
  /** 从采购申请开单：带出申请里的合同产品与数量 */
  requestId?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [value: CreatedProcurementOrders];
}>();

const today = localDate();
const header = ref<EntryHeader>({});
const rows = ref<EntryRow[]>([]);
const directory = ref<Directory>();
const contract = ref<Contract>();
const contracts = ref<{ label: string; value: string }[]>([]);
const productOptions = ref<
  {
    category?: string;
    code?: string;
    label: string;
    name: string;
    specification?: string;
    unit?: string;
    value: string;
  }[]
>([]);
const categories = ref<string[]>([...PURCHASE_CATEGORIES]);
/** 收货工厂：原料、辅料送到工厂，由工厂在「到货入库」确认收货。 */
const factories = ref<{ label: string; value: number }[]>([]);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
let sequence = 0;

const errors = computed(() => entryErrors(rows.value, header.value));
const totals = computed(() => entryTotals(rows.value, header.value));
/** 供应商名称：下拉选中或报价带出时记下，用来提示拆单结果。 */
const supplierNames = ref<Record<string, string>>({});
function rememberSupplier(record: MasterRecord | undefined) {
  if (record?.id && record.name)
    supplierNames.value = { ...supplierNames.value, [record.id]: record.name };
}
/** 明细行共用一份供应商候选（搜索一次全表可用），已选但不在本次搜索结果里的按记下的名称补上。 */
const supplierResults = ref<string[]>([]);
const rowSupplierOptions = computed(() => {
  const selected = rows.value
    .map((row) => row.supplierId)
    .filter((id): id is string => !!id && !supplierResults.value.includes(id));
  return [...new Set([...selected, ...supplierResults.value])].map((id) => ({
    value: id,
    label: supplierNames.value[id] ?? id,
  }));
});
let supplierSearch = 0;
async function searchSuppliers(keyword = '') {
  const run = ++supplierSearch;
  try {
    const page = await getMasterPage({
      type: 'SUPPLIER',
      keyword: keyword.trim() || undefined,
      active: true,
      pageNo: 1,
      pageSize: 30,
    });
    if (run !== supplierSearch) return;
    page.list.forEach((record) => rememberSupplier(record));
    supplierResults.value = page.list.map((record) => record.id);
  } catch (error_) {
    if (run === supplierSearch) error.value = errorText(error_);
  }
}
/** 明细分属多个供应商时，保存会按供应商拆成多张采购单。 */
const splits = computed(() => entrySuppliers(rows.value, header.value));
const companyOptions = computed(() =>
  (directory.value?.companies ?? []).map((entry) => ({
    value: entry.companyId,
    label: entry.companyName,
  })),
);
const contractItems = computed(() =>
  (contract.value?.items ?? []).map((item) => ({
    value: `item:${item.id}`,
    label: `【合同产品】${item.skuName} ${item.specification ?? ''}`.trim(),
  })),
);

/** 产品中心弹窗：不带行时勾选多个产品追加明细，带行时替换该行产品。首次使用时才加载。 */
const ProductPicker = defineAsyncComponent(
  () => import('../../../products/components/ProductPicker.vue'),
);
const pickerMounted = ref(false);
const pickerOpen = ref(false);
const pickerRow = ref<EntryRow>();
function openPicker(row?: EntryRow) {
  pickerRow.value = row;
  pickerMounted.value = true;
  pickerOpen.value = true;
}
function productOption(product: Product) {
  return {
    category: product.category ?? undefined,
    value: product.id,
    name: product.name,
    code: product.code,
    specification: product.specification,
    unit: product.unit,
    label: `${product.code} · ${product.name}${product.specification ? ` · ${product.specification.replaceAll('\n', ' ')}` : ''}`,
  };
}
function pickProducts(products: Product[]) {
  pickerOpen.value = false;
  const options = products.map((product) => productOption(product));
  // 让行内下拉能显示刚选中的产品名称
  productOptions.value = [
    ...options.filter(
      (option) =>
        !productOptions.value.some((entry) => entry.value === option.value),
    ),
    ...productOptions.value,
  ];
  // pickerRow 保留到下次打开，关闭动画期间弹窗保持原来的单选 / 多选
  const target = pickerRow.value;
  if (target) {
    if (options[0]) chooseProduct(target, options[0].value);
    return;
  }
  rows.value = [
    ...rows.value.filter((row) => row.productId || row.contractItemId),
    ...options.map((option) => productRow(option)),
  ];
}

/** 批量添加：粘贴 Excel 的「产品编号、数量、单价、到货日期、备注」行；多选产品走产品中心弹窗。 */
const bulkOpen = ref(false);
const bulkText = ref('');
const bulkIssues = ref<string[]>([]);
const bulkBusy = ref(false);
function openBulk() {
  bulkText.value = '';
  bulkIssues.value = [];
  bulkOpen.value = true;
}
function productRow(product: (typeof productOptions.value)[number]): EntryRow {
  return {
    ...emptyRow(key()),
    category: product.category,
    productId: product.value,
    name: product.name,
    code: product.code,
    specification: product.specification,
    unit: product.unit,
  };
}
async function applyBulk() {
  bulkBusy.value = true;
  bulkIssues.value = [];
  const added: EntryRow[] = [];
  try {
    for (const line of parsePastedLines(bulkText.value)) {
      if (line.error) {
        bulkIssues.value.push(`第 ${line.lineNo} 行：${line.error}`);
        continue;
      }
      const page = await getProducts({
        companyId: 0,
        pageNo: 1,
        pageSize: 20,
        keyword: line.code,
        active: true,
      });
      const product = page.list.find((entry) => entry.code === line.code);
      if (!product) {
        bulkIssues.value.push(
          `第 ${line.lineNo} 行：找不到产品编号 ${line.code}`,
        );
        continue;
      }
      const row = productRow(productOption(product));
      row.arrivalDate = line.arrivalDate;
      row.remark = line.remark;
      setRowQuantity(row, line.quantity);
      if (line.unitPrice) setRowPrice(row, line.unitPrice);
      added.push(row);
    }
  } catch (error_) {
    bulkIssues.value.push(errorText(error_));
  } finally {
    bulkBusy.value = false;
  }
  if (added.length > 0)
    rows.value = [
      ...rows.value.filter((row) => row.productId || row.contractItemId),
      ...added,
    ];
  if (bulkIssues.value.length === 0) bulkOpen.value = false;
}
function key() {
  sequence += 1;
  return `row-${sequence}`;
}
function addRow() {
  rows.value = [...rows.value, emptyRow(key())];
}
function removeRow(target: EntryRow) {
  rows.value = rows.value.filter((row) => row !== target);
}
async function searchContracts(keyword = '') {
  const page = await getContractBoard({
    pageNo: 1,
    pageSize: 30,
    tab: 'ACTIVE',
    keyword: keyword || undefined,
  });
  contracts.value = page.list.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.customerName ?? ''}`,
  }));
}
async function searchProducts(keyword = '') {
  const page = await getProducts({
    companyId: 0,
    pageNo: 1,
    pageSize: 30,
    keyword: keyword || undefined,
    active: true,
  });
  productOptions.value = page.list.map((product) => productOption(product));
}
async function chooseContract(value: unknown) {
  header.value.contractId = typeof value === 'string' ? value : undefined;
  contract.value = undefined;
  rows.value = rows.value.filter((row) => !row.contractItemId);
  if (!header.value.contractId) return;
  try {
    contract.value = await getContract(header.value.contractId);
    header.value.companyId ??= contract.value.companyId;
    const current = contract.value;
    if (!contracts.value.some((entry) => entry.value === current.id))
      contracts.value = [
        {
          value: current.id,
          label: `${current.code} · ${current.customerName ?? ''}`,
        },
        ...contracts.value,
      ];
  } catch (error_) {
    error.value = errorText(error_);
  }
}
function chooseProduct(row: EntryRow, value: unknown) {
  if (typeof value !== 'string') return;
  if (value.startsWith('item:')) {
    const item = contract.value?.items.find(
      (entry) => entry.id === value.slice(5),
    );
    if (!item) return;
    Object.assign(row, {
      contractItemId: item.id,
      productId: undefined,
      name: item.skuName || '合同产品',
      code: item.skuCode,
      specification: item.specification,
      unit: item.unit,
    });
    return;
  }
  const product = productOptions.value.find((entry) => entry.value === value);
  if (!product) return;
  Object.assign(row, {
    category: product.category,
    productId: product.value,
    contractItemId: undefined,
    name: product.name,
    code: product.code,
    specification: product.specification,
    unit: product.unit,
  });
}
/** 关联合同后一键带出合同产品（数量按合同数量预填，可改可删）。 */
function addContractItems() {
  const items = contract.value?.items ?? [];
  const existing = new Set(rows.value.map((row) => row.contractItemId));
  rows.value = [
    ...rows.value.filter((row) => row.productId || row.contractItemId),
    ...items
      .filter((item) => !existing.has(item.id))
      .map((item) => ({
        ...emptyRow(key()),
        contractItemId: item.id,
        name: item.skuName || '合同产品',
        code: item.skuCode,
        specification: item.specification,
        unit: item.unit,
        quantity:
          item.quantity === null || item.quantity === undefined
            ? undefined
            : String(item.quantity),
      })),
  ];
}
/** 申请里的每个合同产品一行，数量按申请数量预填（可改可删，可再加外箱等非合同产品）。 */
function fillFromRequest(requestId: string) {
  // 传进来的可能是申请 id，也可能是采购任务（分派）id，后者顺着任务找到申请
  const requests = contract.value?.requests ?? [];
  const assignment = (contract.value?.assignments ?? []).find(
    (entry) => entry.id === requestId,
  );
  const request =
    requests.find((entry) => entry.id === requestId) ??
    requests.find((entry) => entry.id === assignment?.requestId);
  const items = new Map(
    (contract.value?.items ?? []).map((item) => [item.id, item]),
  );
  const lines = (
    (request?.items ?? []) as {
      contractItemId?: string;
      id?: string;
      quantity?: unknown;
    }[]
  )
    .map((line) => ({ line, item: items.get(String(line.contractItemId)) }))
    .filter((entry) => entry.item);
  if (lines.length === 0) return;
  // 采购主题留空：后端按「合同号 供应商 采购单」生成，拆单时每张带各自的供应商
  rows.value = lines.map(({ line, item }) => {
    const row: EntryRow = {
      ...emptyRow(key()),
      contractItemId: item!.id,
      name: item!.skuName || '合同产品',
      code: item!.skuCode,
      specification: item!.specification,
      unit: item!.unit,
      quantity:
        line.quantity === null || line.quantity === undefined
          ? undefined
          : String(line.quantity),
    };
    // 已登记供应商报价的明细直接带出供应商和单价；不同供应商保存时自动拆单
    const quoted = line.id
      ? quotedSupplier(contract.value!, String(line.id), item!.unit, today)
      : undefined;
    if (quoted) {
      row.supplierId = quoted.supplierId;
      if (quoted.supplierName)
        supplierNames.value = {
          ...supplierNames.value,
          [quoted.supplierId]: quoted.supplierName,
        };
      if (quoted.unitPrice) setRowPrice(row, quoted.unitPrice);
    }
    return row;
  });
}
/** 复制采购单：先关联原合同（合同产品行要用），再带出表头和明细。 */
async function copyOrder(
  source: { contractId: string; orderId: string },
  searching: Promise<void>,
) {
  const view = await getProcurementOrder(source.contractId, source.orderId);
  const copied = copyEntry(view, key, today);
  await (copied.header.contractId
    ? chooseContract(copied.header.contractId)
    : searchContracts());
  header.value = {
    ...header.value,
    ...copied.header,
    category: copied.header.category ?? header.value.category,
  };
  // 等首次产品搜索回来再补上复制行的产品，免得下拉框只显示产品 id
  await searching;
  const copiedOptions = copied.rows
    .filter((row) => row.productId)
    .map((row) => ({
      value: row.productId!,
      name: row.name,
      code: row.code,
      category: row.category,
      specification: row.specification,
      unit: row.unit,
      label: `${row.code ?? ''} · ${row.name}`,
    }));
  productOptions.value = [
    ...copiedOptions,
    ...productOptions.value.filter(
      (entry) => !copiedOptions.some((option) => option.value === entry.value),
    ),
  ];
  rows.value = copied.rows.length > 0 ? copied.rows : [emptyRow(key())];
}
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    idempotencyKey = crypto.randomUUID();
    submitted.value = false;
    error.value = '';
    contract.value = undefined;
    header.value = { purchaseDate: today, category: PURCHASE_CATEGORIES[0] };
    rows.value = [emptyRow(key())];
    supplierNames.value = {};
    supplierResults.value = [];
    void searchSuppliers();
    const searching = searchProducts().catch(() => undefined);
    try {
      const [loaded, maintained, receiveFactories] = await Promise.all([
        getDirectory(0),
        getProcurementSettings('categories', { active: true }).catch(() => []),
        getReceiveFactories().catch(() => []),
      ]);
      directory.value = loaded;
      factories.value = receiveFactories.map((entry) => ({
        label: entry.name,
        value: entry.id,
      }));
      // 采购设置里维护了分类就用维护的，否则用内置的常用分类
      if (maintained.length > 0) {
        categories.value = maintained.map((entry) => entry.name);
        header.value.category = categories.value.includes(
          PURCHASE_CATEGORIES[0]!,
        )
          ? PURCHASE_CATEGORIES[0]
          : categories.value[0];
      }
      if (props.copyFrom) {
        await copyOrder(props.copyFrom, searching);
        return;
      }
      await (props.contractId
        ? chooseContract(props.contractId)
        : searchContracts());
      if (props.requestId) fillFromRequest(props.requestId);
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);

async function save() {
  submitted.value = true;
  if (errors.value.sheet || Object.keys(errors.value.lines).length > 0) return;
  saving.value = true;
  error.value = '';
  try {
    emit(
      'saved',
      await createProcurementOrder({
        ...entryPayload(rows.value, header.value, idempotencyKey),
        requestId: props.requestId,
      }),
    );
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="copyFrom ? '复制采购单' : '新建采购单'"
    width="min(1320px, 96vw)"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="entry">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <section class="entry-head" aria-label="基本信息">
        <label class="field">
          <span>关联合同（选填）</span>
          <Select
            :value="header.contractId"
            show-search
            allow-clear
            :filter-option="false"
            :options="contracts"
            :disabled="!!contractId"
            placeholder="不关联则为独立采购单，如原材料"
            @search="searchContracts"
            @update:value="chooseContract"
          />
        </label>
        <label class="field">
          <span>采购主题</span>
          <Input
            v-model:value="header.subject"
            placeholder="不填按「合同号 供应商 采购单」生成"
          />
        </label>
        <div class="field">
          <span><em>*</em>供应商</span>
          <RemoteMasterSelect
            v-model:value="header.supplierId"
            type="SUPPLIER"
            placeholder="明细没单独选供应商的都用这家"
            @selected="rememberSupplier"
          />
        </div>
        <label class="field">
          <span>采购分类</span>
          <Select
            v-model:value="header.category"
            :options="categories.map((value) => ({ value, label: value }))"
          />
        </label>
        <label class="field">
          <span>采购日期</span>
          <Input v-model:value="header.purchaseDate" type="date" :max="today" />
        </label>
        <label class="field">
          <span>收货工厂（原料、辅料）</span>
          <Select
            v-model:value="header.receiveFactoryId"
            allow-clear
            :options="factories"
            :disabled="factories.length === 0"
            placeholder="不选进采购仓库；选了由工厂确认收货"
          />
        </label>
        <label class="field">
          <span><em v-if="!header.contractId">*</em>所属公司</span>
          <Select
            v-model:value="header.companyId"
            show-search
            option-filter-prop="label"
            :options="companyOptions"
            placeholder="关联合同时默认合同公司"
          />
        </label>
      </section>
      <p v-if="submitted && errors.sheet" class="field-error">
        {{ errors.sheet }}
      </p>

      <div class="entry-lines-head">
        <b>产品明细</b>
        <span class="muted">共 {{ totals.count }} 行</span>
        <span class="grow"></span>
        <Button size="small" type="primary" ghost @click="openPicker()">
          从产品中心选择
        </Button>
        <Button size="small" @click="addRow">添加一行</Button>
        <Button size="small" @click="openBulk">粘贴导入</Button>
        <Button v-if="contract" size="small" @click="addContractItems">
          带出合同产品
        </Button>
      </div>
      <!-- 固定列宽：长产品名在列内换行，列放不下时横向滚动，序号/产品/删除列冻结 -->
      <div class="table-wrap">
        <table class="entry-grid">
          <thead>
            <tr>
              <th class="no">#</th>
              <th class="product"><em>*</em>产品</th>
              <th class="supplier-col">供应商（不选同表头）</th>
              <th class="spec-col">规格 / 单位</th>
              <th class="money"><em>*</em>单价</th>
              <th class="money"><em>*</em>数量</th>
              <th class="money"><em>*</em>总价</th>
              <th class="date">到货日期</th>
              <th class="gift">赠品</th>
              <th class="remark">备注</th>
              <th class="ops"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.key"
              :class="{ invalid: submitted && errors.lines[row.key] }"
            >
              <td class="no">{{ index + 1 }}</td>
              <td class="product">
                <div class="product-pick">
                  <Select
                    :value="
                      row.contractItemId
                        ? `item:${row.contractItemId}`
                        : row.productId
                    "
                    show-search
                    :filter-option="false"
                    :options="[...contractItems, ...productOptions]"
                    :placeholder="row.name || '搜索产品编号、名称'"
                    :dropdown-match-select-width="460"
                    style="width: 100%"
                    @search="searchProducts"
                    @update:value="(value) => chooseProduct(row, value)"
                  />
                  <Button
                    size="small"
                    type="link"
                    title="从产品中心按分类选择"
                    @click="openPicker(row)"
                  >
                    选择
                  </Button>
                </div>
                <span
                  v-if="row.name"
                  class="hint clamp"
                  :title="`${row.code ?? ''} ${row.name}`"
                  >{{ row.code }} {{ row.name }}</span>
                <span
                  v-if="submitted && errors.lines[row.key]"
                  class="field-error"
                  >{{ errors.lines[row.key] }}</span>
              </td>
              <td>
                <Select
                  v-model:value="row.supplierId"
                  show-search
                  allow-clear
                  :filter-option="false"
                  :options="rowSupplierOptions"
                  placeholder="同表头"
                  :dropdown-match-select-width="300"
                  style="width: 100%"
                  :aria-label="`第${index + 1}行供应商`"
                  @search="searchSuppliers"
                />
              </td>
              <td>
                <span class="spec clamp" :title="row.specification">{{
                  row.specification || '—'
                }}</span>
                <span class="hint">{{ row.unit }}</span>
              </td>
              <td>
                <InputNumber
                  :value="row.unitPrice"
                  string-mode
                  :min="0"
                  :controls="false"
                  :disabled="row.gift"
                  style="width: 100%"
                  :aria-label="`第${index + 1}行单价`"
                  @update:value="
                    (value) =>
                      setRowPrice(
                        row,
                        value == null ? undefined : String(value),
                      )
                  "
                />
              </td>
              <td>
                <InputNumber
                  :value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  style="width: 100%"
                  :aria-label="`第${index + 1}行数量`"
                  @update:value="
                    (value) =>
                      setRowQuantity(
                        row,
                        value == null ? undefined : String(value),
                      )
                  "
                />
              </td>
              <td>
                <InputNumber
                  :value="row.total"
                  string-mode
                  :min="0"
                  :controls="false"
                  :disabled="row.gift"
                  style="width: 100%"
                  :aria-label="`第${index + 1}行总价`"
                  @update:value="
                    (value) =>
                      setRowTotal(
                        row,
                        value == null ? undefined : String(value),
                      )
                  "
                />
              </td>
              <td>
                <Input v-model:value="row.arrivalDate" type="date" />
              </td>
              <td class="gift">
                <Checkbox
                  :checked="row.gift"
                  @update:checked="(value) => setRowGift(row, !!value)"
                />
              </td>
              <td><Input v-model:value="row.remark" /></td>
              <td class="ops">
                <Button
                  type="link"
                  size="small"
                  danger
                  :disabled="rows.length === 1"
                  @click="removeRow(row)"
                >
                  删除
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Alert
        v-if="splits.length > 1"
        type="info"
        show-icon
        :message="`明细分属 ${splits.length} 个供应商，保存后按供应商拆成 ${splits.length} 张采购单`"
      >
        <template #description>
          <ul class="splits">
            <li v-for="(split, index) in splits" :key="split.supplierId">
              {{ index + 1 }}.
              {{
                supplierNames[split.supplierId] ||
                (split.supplierId === header.supplierId
                  ? '表头供应商'
                  : '所选供应商')
              }}：第
              {{ split.rows.map((row) => rows.indexOf(row) + 1).join('、') }}
              行，¥{{ split.total }}
            </li>
          </ul>
        </template>
      </Alert>

      <section class="entry-foot">
        <label class="field">
          <span>附加费用分类</span>
          <Input
            v-model:value="header.additionalCategory"
            placeholder="如运费、模具费"
          />
        </label>
        <label class="field">
          <span>附加费用金额</span>
          <InputNumber
            v-model:value="header.additionalAmount"
            string-mode
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </label>
        <label class="field">
          <span>整单折扣 %</span>
          <InputNumber
            v-model:value="header.discountRate"
            string-mode
            :min="0"
            :max="100"
            :controls="false"
            placeholder="100 为不打折"
            style="width: 100%"
          />
        </label>
        <label class="field">
          <span>优惠抹零</span>
          <InputNumber
            v-model:value="header.roundOff"
            string-mode
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </label>
        <label class="field wide">
          <span>采购概要 / 备注</span>
          <Input v-model:value="header.remark" />
        </label>
        <p class="formula">
          总金额 <b>¥{{ totals.total }}</b> = 产品明细 ¥{{ totals.lines }} ×
          整单折扣 {{ header.discountRate || 100 }}% − 优惠抹零 ¥{{
            header.roundOff || 0
          }}
          + 附加费用 ¥{{ header.additionalAmount || 0 }}
        </p>
      </section>
    </div>
    <template #footer>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">保存</Button>
    </template>
  </Modal>
  <Modal
    :open="bulkOpen"
    title="批量添加产品"
    width="720px"
    :confirm-loading="bulkBusy"
    ok-text="添加到明细"
    @ok="applyBulk"
    @cancel="bulkOpen = false"
  >
    <div class="bulk">
      <p class="muted">
        需要按分类勾选多个产品时，用明细上方的「从产品中心选择」。
      </p>
      <label class="field">
        <span>从 Excel 粘贴（每行：产品编号、数量、单价、到货日期、备注）</span>
        <Textarea
          v-model:value="bulkText"
          :auto-size="{ minRows: 5, maxRows: 12 }"
          placeholder="FL2401267&#9;100&#9;0.245&#9;2026-10-20&#9;黄石付款"
        />
      </label>
      <Alert
        v-if="bulkIssues.length > 0"
        type="warning"
        show-icon
        message="以下行没有加入，请修改后再粘贴这几行"
        :description="bulkIssues.join('；')"
      />
    </div>
  </Modal>
  <ProductPicker
    v-if="pickerMounted"
    allow-incomplete
    :single="Boolean(pickerRow)"
    :company-id="0"
    :open="pickerOpen"
    :title="pickerRow ? '选择产品（替换本行）' : '从产品中心选择采购产品'"
    @close="pickerOpen = false"
    @selected="pickProducts"
  />
</template>

<style scoped>
.product-pick {
  display: flex;
  gap: 2px;
  align-items: center;
}

.product-pick > :first-child {
  flex: 1;
  min-width: 0;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-head,
.entry-foot {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
}

.field > span:first-child {
  color: hsl(var(--muted-foreground));
}

.field.wide {
  grid-column: 1 / -1;
}

em {
  margin-right: 2px;
  font-style: normal;
  color: hsl(var(--destructive));
}

.entry-lines-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.grow {
  flex: 1;
}

.muted,
.hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.hint {
  display: block;
}

.spec {
  display: block;
  font-size: 12px;
  white-space: pre-line;
}

/* 长名称、长规格在列内换行，最多三行，悬停看全文 */
.clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
}

.table-wrap {
  max-height: 46vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.entry-grid {
  width: 100%;
  min-width: 1460px;
  font-size: 13px;
  table-layout: fixed;
  border-spacing: 0;
  border-collapse: separate;
}

.entry-grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 6px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: left;
  white-space: nowrap;
  background: hsl(var(--accent));
}

.entry-grid th,
.entry-grid td {
  box-sizing: border-box;
}

.entry-grid td {
  padding: 6px;
  vertical-align: top;
  border-top: 1px solid hsl(var(--border));
}

.entry-grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

/* 冻结列：横向滚动时序号、产品、删除始终可见 */
.entry-grid .no,
.entry-grid .product,
.entry-grid .ops {
  position: sticky;
  z-index: 1;
}

.entry-grid td.no,
.entry-grid td.product,
.entry-grid td.ops {
  background: var(--ant-color-bg-elevated, #fff);
}

.entry-grid tr.invalid td.no,
.entry-grid tr.invalid td.product,
.entry-grid tr.invalid td.ops {
  background:
    linear-gradient(hsl(var(--destructive) / 5%), hsl(var(--destructive) / 5%)),
    var(--ant-color-bg-elevated, #fff);
}

.entry-grid th.no,
.entry-grid th.product,
.entry-grid th.ops {
  z-index: 3;
}

.entry-grid .no {
  left: 0;
  width: 40px;
  color: hsl(var(--muted-foreground));
}

.entry-grid .product {
  left: 40px;
  width: 300px;
  border-right: 1px solid hsl(var(--border));
}

.entry-grid .supplier-col {
  width: 200px;
}

.entry-grid .spec-col {
  width: 180px;
}

.splits {
  padding: 0;
  margin: 0;
  list-style: none;
}

.entry-grid .money {
  width: 110px;
}

.entry-grid .date {
  width: 140px;
}

.entry-grid .gift {
  width: 52px;
  text-align: center;
}

.entry-grid .ops {
  right: 0;
  width: 64px;
  border-left: 1px solid hsl(var(--border));
}

.field-error {
  display: block;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--destructive));
}

.bulk {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.formula {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.formula b {
  font-size: 16px;
  color: hsl(var(--foreground));
}

@media (max-width: 900px) {
  .entry-head,
  .entry-foot {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
