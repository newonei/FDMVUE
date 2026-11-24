<script setup lang="ts">
import type { LineColumn } from '../../../components/line-table-model';
import type { EntryHeader, EntryRow } from '../entry-model';

import type {
  BusinessRecord,
  Contract,
  Directory,
  MasterRecord,
} from '#/api/fdmplatform';
import type {
  CreatedProcurementOrders,
  ProcurementProductSnapshot,
} from '#/api/fdmplatform/procurement';
import type { Product, ProductStructure } from '#/api/fdmplatform/products';

import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { GripVertical } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Textarea,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';
import { getActivePinia } from 'pinia';
import draggable from 'vuedraggable';

import { getContract, getDirectory } from '#/api/fdmplatform';
import { getContractBoard } from '#/api/fdmplatform/contract-board';
import { getMasterPage } from '#/api/fdmplatform/masters';
import {
  createProcurementOrder,
  getProcurementOrder,
  getProcurementSettings,
  getReceiveFactories,
  updateProcurementOrder,
} from '#/api/fdmplatform/procurement';
import { getProducts } from '#/api/fdmplatform/products';

import {
  clampWidth,
  defaultSetting,
  loadSetting,
  moveKey,
  saveSetting,
  storageKey,
  tableWidth,
} from '../../../components/line-table-model';
import RemoteMasterSelect from '../../../components/RemoteMasterSelect.vue';
import { errorText, money, rows as records } from '../../../data';
import { navigationRoute } from '../../../documents/navigation';
import ProductStructureDetails from '../../../products/components/ProductStructureDetails.vue';
import { productStructure } from '../../../products/structure';
import {
  contractInternalOrderNo,
  DOMESTIC_CURRENCY,
  salesChannelOf,
} from '../../../sales-channel';
import { localDate } from '../../quotes/comparison';
import {
  requestAvailableQuantity,
  transferableRequestLines,
} from '../../request-transfer';
import { entryRowsByColor } from '../entry-color-order';
import {
  copyEntry,
  emptyRow,
  entryErrors,
  entryPayload,
  entryPrice,
  entryProductFields,
  entrySuppliers,
  entryTotals,
  parsePastedLines,
  PURCHASE_CATEGORIES,
  quotedSupplier,
  setRowGift,
  setRowPrice,
  setRowPricingMode,
  setRowQuantity,
  setRowTotal,
} from '../entry-model';
import PurchaseAuxiliaryProduct from './PurchaseAuxiliaryProduct.vue';

const props = defineProps<{
  contractId?: string;
  /** 复制这张采购单：带出合同、供应商、表头和明细，另存为新单 */
  copyFrom?: { contractId: string; orderId: string };
  /** 编辑已有采购草稿。 */
  editOf?: { contractId: string; orderId: string; title?: string };
  open: boolean;
  /** 从采购申请开单时带出申请明细与可转数量。 */
  requestId?: string;
}>();
const emit = defineEmits<{
  close: [];
  /** 新建、复制先保存草稿；编辑时可以保存草稿或提交审核。 */
  saved: [value: CreatedProcurementOrders, mode?: 'draft' | 'submitted'];
}>();

const today = localDate();
const header = ref<EntryHeader>({});
const rows = ref<EntryRow[]>([]);
const detailColumns = [
  { key: 'product', title: '产品', width: 300, minWidth: 145, required: true },
  {
    key: 'supplier',
    title: '供应商',
    width: 200,
    minWidth: 115,
    hint: '（不选同表头）',
  },
  {
    key: 'specification',
    title: '规格 / 单位 / 产品资料',
    width: 280,
    minWidth: 100,
  },
  { key: 'pricingMode', title: '计价方式', width: 120, minWidth: 110 },
  { key: 'unitPrice', title: '单价', width: 128, minWidth: 75 },
  { key: 'quantity', title: '数量', width: 110, minWidth: 75, required: true },
  { key: 'total', title: '总价', width: 110, minWidth: 75, required: true },
  {
    key: 'arrivalDate',
    title: '到货日期',
    width: 150,
    minWidth: 135,
    hint: '（选填）',
  },
  { key: 'gift', title: '赠品', width: 72, minWidth: 60 },
  { key: 'remark', title: '备注', width: 100, minWidth: 60 },
] satisfies (LineColumn & {
  hint?: string;
  minWidth: number;
  required?: boolean;
})[];
type DetailColumn = (typeof detailColumns)[number];

const pinia = getActivePinia();
const access = pinia ? useAccessStore(pinia) : undefined;
const user = pinia ? useUserStore(pinia) : undefined;
const columnStorageKey = computed(() =>
  storageKey(
    'purchase-order-editor',
    `${access?.tenantId ?? ''}:${user?.userInfo?.id ?? user?.userInfo?.userId ?? 'anonymous'}`,
  ),
);
const columnSetting = ref(defaultSetting(detailColumns));
const columnDrag = ref<string>();
const columnDrop = ref<string>();
const draggedColumnIndex = computed(() =>
  columnSetting.value.keys.indexOf(columnDrag.value ?? ''),
);
const columnResize = ref<{
  key: string;
  pointerId: number;
  startWidth: number;
  startX: number;
  width: number;
}>();
const columnDefinitions = new Map(
  detailColumns.map((column) => [column.key, column]),
);
const columns = computed(() =>
  columnSetting.value.keys.map((key) => {
    const column = columnDefinitions.get(key)!;
    const width =
      columnResize.value?.key === key
        ? columnResize.value.width
        : (columnSetting.value.widths[key] ?? column.width);
    return { ...column, width: Math.max(column.minWidth, width) };
  }),
);
const rowNumberWidth = 58;
const actionsWidth = 64;
const gridWidth = computed(
  () => rowNumberWidth + tableWidth(columns.value) + actionsWidth,
);
const stickyProduct = computed(
  () => columns.value[0]?.key === 'product' && columns.value[0].width <= 360,
);

watch(
  [() => props.open, columnStorageKey],
  ([open, key]) => {
    clearColumnDrag();
    columnResize.value = undefined;
    if (!open) return;
    const saved = loadSetting(detailColumns, key);
    const savedKeys = [...saved.keys];
    const unitPriceIndex = savedKeys.indexOf('unitPrice');
    if (unitPriceIndex !== -1 && !savedKeys.includes('pricingMode'))
      savedKeys.splice(unitPriceIndex, 0, 'pricingMode');
    columnSetting.value = {
      ...saved,
      keys: [
        ...new Set([
          ...savedKeys,
          ...detailColumns.map((column) => column.key),
        ]),
      ],
    };
  },
  { immediate: true },
);

function focusAfterReorder(event: KeyboardEvent) {
  const handle = event.currentTarget as HTMLButtonElement;
  void nextTick(() => handle.focus());
}

function moveColumn(key: string, target: number, event?: KeyboardEvent) {
  const keys = columnSetting.value.keys;
  const next = moveKey(keys, keys.indexOf(key), target, 0);
  if (next === keys) return;
  columnSetting.value = { ...columnSetting.value, keys: next };
  saveSetting(columnStorageKey.value, columnSetting.value);
  if (event) focusAfterReorder(event);
}

function startColumnDrag(event: DragEvent, key: string) {
  columnDrag.value = key;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  }
}

function overColumn(event: DragEvent, key: string) {
  if (!columnDrag.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  columnDrop.value = key;
}

function leaveColumn(event: DragEvent, key: string) {
  const cell = event.currentTarget as HTMLElement;
  const target = event.relatedTarget;
  if (
    columnDrop.value === key &&
    !(target instanceof Node && cell.contains(target))
  )
    columnDrop.value = undefined;
}

function dropColumn(event: DragEvent, target: number) {
  if (!columnDrag.value) return;
  event.preventDefault();
  moveColumn(columnDrag.value, target);
  clearColumnDrag();
}

function clearColumnDrag() {
  columnDrag.value = undefined;
  columnDrop.value = undefined;
}

function saveColumnWidth(key: string, width: number) {
  columnSetting.value = {
    ...columnSetting.value,
    widths: { ...columnSetting.value.widths, [key]: width },
  };
  saveSetting(columnStorageKey.value, columnSetting.value);
}

function startColumnResize(event: PointerEvent, column: DetailColumn) {
  if (event.button !== 0 || columnResize.value) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  columnResize.value = {
    key: column.key,
    pointerId: event.pointerId,
    startWidth: column.width,
    startX: event.clientX,
    width: column.width,
  };
}

function resizeColumn(event: PointerEvent, column: DetailColumn) {
  const resize = columnResize.value;
  if (resize?.pointerId !== event.pointerId) return;
  resize.width = Math.max(
    column.minWidth,
    clampWidth(resize.startWidth + event.clientX - resize.startX),
  );
}

function finishColumnResize(event: PointerEvent) {
  const resize = columnResize.value;
  if (resize?.pointerId !== event.pointerId) return;
  if (event.type === 'pointerup' && resize.width !== resize.startWidth)
    saveColumnWidth(resize.key, resize.width);
  columnResize.value = undefined;
}

function resizeColumnBy(column: DetailColumn, offset: number) {
  const width = Math.max(column.minWidth, clampWidth(column.width + offset));
  if (width !== column.width) saveColumnWidth(column.key, width);
}

const rowsByColor = computed(() => entryRowsByColor(rows.value));
const canGroupColors = computed(() =>
  rowsByColor.value.some((row, index) => row !== rows.value[index]),
);
function moveRow(index: number, offset: number, event: KeyboardEvent) {
  const target = index + offset;
  if (saving.value || target < 0 || target >= rows.value.length) return;
  const next = [...rows.value];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row!);
  rows.value = next;
  focusAfterReorder(event);
}

const directory = ref<Directory>();
const contract = ref<Contract>();
const contracts = ref<{ label: string; value: string }[]>([]);
const router = useRouter();
const contractReviewOpen = ref(false);
const contractReviewHref = computed(() => {
  const source = contract.value;
  if (!props.requestId || !source) return undefined;
  const location = navigationRoute(
    { type: 'contract', contractId: source.id },
    salesChannelOf(source.businessType) === 'DOMESTIC'
      ? '/neixiao/'
      : undefined,
  );
  const resolved = router.resolve(location);
  return resolved.matched.some((record) => record.path === location.path)
    ? resolved.href
    : undefined;
});
const contractReviewColumns = [
  { dataIndex: 'skuCode', title: '产品编号' },
  { dataIndex: 'skuName', title: '产品名称' },
  { dataIndex: 'specification', title: '规格' },
  { dataIndex: 'quantity', title: '合同数量' },
  { dataIndex: 'unit', title: '单位' },
  { dataIndex: 'requiredDate', title: '交期' },
  { dataIndex: 'remark', title: '备注' },
];
const productOptions = ref<
  {
    category?: string;
    code?: string;
    label: string;
    name: string;
    specification?: string;
    structure?: ProductStructure;
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
const sourceRequestId = ref<string>();
const draftRequestProducts = ref<
  {
    availableQuantity: string;
    contractItemId: string;
    label: string;
    product: ReturnType<typeof entryProductFields>;
    requestItemId: string;
    value: string;
  }[]
>([]);
let idempotencyKey = '';
let sequence = 0;

const errors = computed(() => entryErrors(rows.value, header.value));
const totals = computed(() => entryTotals(rows.value, header.value));
const currencyMark = computed(() =>
  !header.value.currency || header.value.currency === 'CNY'
    ? '¥'
    : `${header.value.currency} `,
);
const pricingOptions = [
  { label: '按单价计价', value: 'UNIT' },
  { label: '按总价计价', value: 'TOTAL' },
];
const missingRequestPrices = computed(() => {
  if (
    !props.requestId ||
    salesChannelOf(contract.value?.businessType) !== 'DOMESTIC'
  )
    return 0;
  return rows.value.filter(
    (row) =>
      row.requestItemId &&
      (row.pricingMode === 'TOTAL' ? !row.total : !row.unitPrice),
  ).length;
});
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
const auxiliaryOpen = ref(false);
function openPicker(row?: EntryRow) {
  if (row?.requestItemId && !props.editOf) return;
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
    structure: productStructure(product),
    unit: product.unit,
    label: `${product.code} · ${product.name}${product.specification ? ` · ${product.specification.replaceAll('\n', ' ')}` : ''}`,
  };
}
function addProductOptions(products: Product[]) {
  const options = products.map((product) => productOption(product));
  // 让行内下拉能显示刚选中的产品名称
  productOptions.value = [
    ...options,
    ...productOptions.value.filter(
      (entry) => !options.some((option) => option.value === entry.value),
    ),
  ];
  return options;
}
function pickProducts(products: Product[]) {
  pickerOpen.value = false;
  const options = addProductOptions(products);
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
function addAuxiliaryProduct(product: Product) {
  auxiliaryOpen.value = false;
  const option = addProductOptions([product])[0]!;
  const empty = rows.value.find((row) => !row.productId && !row.contractItemId);
  if (empty) chooseProduct(empty, option.value);
  else rows.value = [...rows.value, productRow(option)];
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
    structure: product.structure,
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
function rowProductValue(row: EntryRow) {
  if (props.editOf && row.requestItemId) return `request:${row.requestItemId}`;
  return row.contractItemId ? `item:${row.contractItemId}` : row.productId;
}
function chooseProduct(row: EntryRow, value: unknown) {
  if (typeof value !== 'string' || value === rowProductValue(row)) return;
  if (row.requestItemId && !props.editOf) return;
  const requested = draftRequestProducts.value.find(
    (entry) => entry.value === value,
  );
  if (requested) {
    Object.assign(row, {
      ...requested.product,
      productId: undefined,
      contractItemId: requested.contractItemId,
      requestItemId: requested.requestItemId,
      availableQuantity: requested.availableQuantity,
      assignmentId: undefined,
      lineId: undefined,
      sourceLineId: undefined,
    });
    return;
  }
  if (value.startsWith('item:')) {
    if (sourceRequestId.value) return;
    const item = contract.value?.items.find(
      (entry) => entry.id === value.slice(5),
    );
    if (!item) return;
    Object.assign(row, {
      ...entryProductFields(item),
      lineId: undefined,
      sourceLineId: undefined,
      contractItemId: item.id,
      productId: undefined,
    });
    return;
  }
  const product = productOptions.value.find((entry) => entry.value === value);
  if (!product) return;
  Object.assign(row, {
    category: product.category,
    productId: product.value,
    contractItemId: undefined,
    requestItemId: undefined,
    assignmentId: undefined,
    availableQuantity: undefined,
    lineId: undefined,
    sourceLineId: undefined,
    name: product.name,
    code: product.code,
    specification: product.specification,
    structure: product.structure,
    unit: product.unit,
  });
}
/** 关联合同后一键带出合同产品（数量按合同数量预填，可改可删）。 */
function addContractItems() {
  if (sourceRequestId.value) return;
  const items = contract.value?.items ?? [];
  const existing = new Set(rows.value.map((row) => row.contractItemId));
  rows.value = [
    ...rows.value.filter((row) => row.productId || row.contractItemId),
    ...items
      .filter((item) => !existing.has(item.id))
      .map((item) => ({
        ...emptyRow(key()),
        ...entryProductFields(item),
        contractItemId: item.id,
        quantity:
          item.quantity === null || item.quantity === undefined
            ? undefined
            : String(item.quantity),
      })),
  ];
}
/** 只带出当前可转的申请明细，保留独立来源身份；完整申请保留在详情里。 */
function fillFromRequest(requestId: string) {
  const source = contract.value;
  if (!source) return;
  // 传进来的可能是申请 id，也可能是采购任务（分派）id，后者顺着任务找到申请
  const requests = source.requests ?? [];
  const assignment = (source.assignments ?? []).find(
    (entry) => entry.id === requestId,
  );
  const request =
    requests.find((entry) => entry.id === requestId) ??
    requests.find((entry) => entry.id === assignment?.requestId);
  sourceRequestId.value = request ? String(request.id) : requestId;
  const channel = salesChannelOf(source.businessType);
  header.value.subject ??= contractInternalOrderNo(source, channel)?.slice(
    0,
    200,
  );
  const domestic = channel === 'DOMESTIC';
  const items = new Map(source.items.map((item) => [item.id, item]));
  rows.value = transferableRequestLines(source, requestId).flatMap(
    ({ line, assignmentId, remaining }) => {
      const item = items.get(String(line.contractItemId));
      if (!item) return [];
      const row: EntryRow = {
        ...emptyRow(key()),
        ...entryProductFields(
          (line.specificationSnapshot ?? item) as ProcurementProductSnapshot,
        ),
        contractItemId: item.id,
        requestItemId: String(line.id),
        assignmentId,
        availableQuantity: remaining,
        quantity: remaining,
      };
      // 已登记供应商报价的明细直接带出供应商和单价；不同供应商保存时自动拆单
      const quoted = quotedSupplier(source, String(line.id), row.unit, today, {
        assignmentId,
        currency: domestic ? DOMESTIC_CURRENCY : undefined,
      });
      if (quoted) {
        row.supplierId = quoted.supplierId;
        if (quoted.supplierName)
          supplierNames.value = {
            ...supplierNames.value,
            [quoted.supplierId]: quoted.supplierName,
          };
      }
      // 内贸申请的预计采购价以人民币记录。有效报价优先。
      const price =
        quoted?.unitPrice ??
        (domestic ? entryPrice(line.unitPrice) : undefined);
      if (price !== undefined) setRowPrice(row, price);
      return [row];
    },
  );
  if (rows.value.length === 0)
    error.value =
      '当前没有可转采购明细，请刷新申请或查看已生成的采购单及占用情况。';
}
/** 复制采购单：先关联原合同（合同产品行要用），再带出表头和明细；edit 时是修改这张草稿。 */
async function copyOrder(
  source: { contractId: string; orderId: string },
  searching: Promise<void>,
  edit = false,
) {
  const view = await getProcurementOrder(source.contractId, source.orderId);
  const copied = copyEntry(view, key, today, edit);
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
      structure: row.structure,
      unit: row.unit,
      label: `${row.code ?? ''} · ${row.name}`,
    }));
  productOptions.value = [
    ...productOptions.value,
    ...copiedOptions.filter(
      (option) =>
        !productOptions.value.some((entry) => entry.value === option.value),
    ),
  ];
  rows.value = copied.rows.length > 0 ? copied.rows : [emptyRow(key())];
  if (edit && typeof view.order.requestId === 'string')
    sourceRequestId.value = view.order.requestId;
  const currentContract = contract.value;
  if (edit && currentContract && sourceRequestId.value) {
    const request = currentContract.requests?.find(
      (entry) => entry.id === sourceRequestId.value,
    );
    const requestLines = records(request?.items);
    const reserved = new Map<string, BigNumber>();
    for (const row of rows.value) {
      if (!row.requestItemId) continue;
      reserved.set(
        row.requestItemId,
        (reserved.get(row.requestItemId) ?? new BigNumber(0)).plus(
          row.quantity ?? 0,
        ),
      );
    }
    if (request?.status !== 'CANCELLED') {
      draftRequestProducts.value = requestLines.flatMap((line) => {
        const item = currentContract.items.find(
          (entry) => entry.id === line.contractItemId,
        );
        if (!line.id || !item || line.reconciliationRequired) return [];
        const available = new BigNumber(requestAvailableQuantity(line)).plus(
          reserved.get(line.id) ?? 0,
        );
        if (!available.gt(0)) return [];
        const product = entryProductFields(
          (line.specificationSnapshot ?? item) as ProcurementProductSnapshot,
        );
        return [
          {
            availableQuantity: available.toFixed(0),
            contractItemId: item.id,
            label: `【申请明细】${product.code ?? ''} ${product.name}`.trim(),
            product,
            requestItemId: line.id,
            value: `request:${line.id}`,
          },
        ];
      });
    }
    for (const row of rows.value) {
      if (!row.requestItemId) continue;
      const line = requestLines.find((entry) => entry.id === row.requestItemId);
      const source = row.assignmentId
        ? currentContract.assignments?.find(
            (entry) => entry.id === row.assignmentId,
          )
        : line;
      let restoredQuantity = new BigNumber(0);
      for (const entry of rows.value) {
        if (
          entry.requestItemId === row.requestItemId &&
          entry.assignmentId === row.assignmentId
        ) {
          restoredQuantity = restoredQuantity.plus(entry.quantity ?? 0);
        }
      }
      row.availableQuantity = new BigNumber(
        source ? requestAvailableQuantity(source as BusinessRecord) : '0',
      )
        .plus(restoredQuantity)
        .toFixed(0);
    }
  }
}
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    idempotencyKey = crypto.randomUUID();
    submitted.value = false;
    error.value = '';
    contract.value = undefined;
    contractReviewOpen.value = false;
    auxiliaryOpen.value = false;
    sourceRequestId.value = undefined;
    draftRequestProducts.value = [];
    header.value = {
      category: PURCHASE_CATEGORIES[0],
      contractId: props.contractId,
      purchaseDate: today,
    };
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
      if (props.editOf || props.copyFrom) {
        await copyOrder(
          (props.editOf ?? props.copyFrom)!,
          searching,
          !!props.editOf,
        );
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

function close() {
  if (!saving.value) emit('close');
}
/** 新建先保存草稿；编辑草稿时可以提交审核。 */
async function save(submit = false) {
  if (saving.value) return;
  submitted.value = true;
  if (errors.value.sheet || Object.keys(errors.value.lines).length > 0) return;
  if (props.editOf && splits.value.length > 1) {
    error.value =
      '修改采购单不能拆成多张，明细须是同一个供应商；别的供应商请另开采购单';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const payload = entryPayload(rows.value, header.value, idempotencyKey);
    if (props.editOf) {
      const saved = await updateProcurementOrder(
        props.editOf.contractId,
        props.editOf.orderId,
        payload,
        submit,
      );
      // 同一次打开里再保存是新的一次操作
      idempotencyKey = crypto.randomUUID();
      emit('saved', saved, submit ? 'submitted' : 'draft');
      return;
    }
    emit(
      'saved',
      await createProcurementOrder({
        ...payload,
        requestId: sourceRequestId.value,
        submit: false,
      }),
      'draft',
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
    :title="
      editOf
        ? editOf.title
          ? `修改采购单「${editOf.title}」`
          : '修改采购单'
        : copyFrom
          ? '复制采购单'
          : '新建采购单'
    "
    width="min(1320px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    :keyboard="!saving"
    @cancel="close"
  >
    <div class="entry">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Alert
        v-if="!editOf"
        type="info"
        message="先保存采购草稿，再确认下单资料、上传附件和提交审核。"
        show-icon
      />
      <section class="entry-head" aria-label="基本信息">
        <label class="field wide">
          <span>采购主题</span>
          <Input
            v-model:value="header.subject"
            :maxlength="200"
            show-count
            placeholder="自行填写采购主题，例如：11月瑜伽垫备货"
          />
        </label>
        <div class="field">
          <div class="contract-field-label">
            <label for="purchase-order-entry-contract">关联合同（选填）</label>
            <a
              v-if="contractReviewHref"
              :href="contractReviewHref"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看合同订单
            </a>
            <button
              v-else-if="requestId && contract"
              type="button"
              @click="contractReviewOpen = true"
            >
              查看合同订单
            </button>
          </div>
          <Select
            id="purchase-order-entry-contract"
            :value="header.contractId"
            show-search
            allow-clear
            :filter-option="false"
            :options="contracts"
            :disabled="!!contractId || !!editOf"
            placeholder="搜索内部单号或合同号；不选则为独立采购单"
            @search="searchContracts"
            @update:value="chooseContract"
          />
        </div>
        <div class="field">
          <span>
            <em v-if="rows.some((row) => !row.supplierId)">*</em>供应商
          </span>
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
          <span><em>*</em>采购日期</span>
          <Input
            v-model:value="header.purchaseDate"
            aria-required="true"
            type="date"
            :max="today"
          />
        </label>
        <label class="field">
          <span>交付日期（选填）</span>
          <Input v-model:value="header.deliveryDate" type="date" />
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
            id="purchase-order-entry-company"
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
        <Button
          :disabled="saving || !canGroupColors"
          size="small"
          title="将相同色号的产品明细排在一起"
          @click="rows = rowsByColor"
        >
          按色号排列
        </Button>
        <Button size="small" type="primary" ghost @click="openPicker()">
          从产品中心选择
        </Button>
        <Button size="small" @click="auxiliaryOpen = true">新建辅料</Button>
        <Button size="small" @click="addRow">添加一行</Button>
        <Button size="small" @click="openBulk">粘贴导入</Button>
        <Button
          v-if="contract && !sourceRequestId"
          size="small"
          @click="addContractItems"
        >
          带出合同产品
        </Button>
      </div>
      <p v-if="missingRequestPrices" class="muted" role="status">
        {{ missingRequestPrices }} 行采购单价待核对填写
      </p>
      <div class="table-wrap">
        <table
          class="entry-grid"
          :style="{
            width: `${gridWidth}px`,
            '--row-number-width': `${rowNumberWidth}px`,
          }"
        >
          <colgroup>
            <col data-column="no" :style="{ width: `${rowNumberWidth}px` }" />
            <col
              v-for="column in columns"
              :key="column.key"
              :data-column="column.key"
              :style="{ width: `${column.width}px` }"
            />
            <col data-column="ops" :style="{ width: `${actionsWidth}px` }" />
          </colgroup>
          <thead>
            <tr>
              <th class="no" data-column="no" scope="col">#</th>
              <th
                v-for="(column, index) in columns"
                :key="column.key"
                class="detail-column"
                :class="{
                  'sticky-product': column.key === 'product' && stickyProduct,
                  'drop-before':
                    columnDrop === column.key && draggedColumnIndex > index,
                  'drop-after':
                    columnDrop === column.key && draggedColumnIndex < index,
                  resizing: columnResize?.key === column.key,
                }"
                :data-column="column.key"
                scope="col"
                @dragleave="leaveColumn($event, column.key)"
                @dragover="overColumn($event, column.key)"
                @drop="dropColumn($event, index)"
              >
                <button
                  class="column-drag-handle"
                  type="button"
                  draggable="true"
                  :aria-label="`移动${column.title}列`"
                  :title="`${column.title}${column.hint ?? ''} · 拖动调整列顺序`"
                  @dragend="clearColumnDrag"
                  @dragstart="startColumnDrag($event, column.key)"
                  @keydown.left.prevent="
                    moveColumn(column.key, index - 1, $event)
                  "
                  @keydown.right.prevent="
                    moveColumn(column.key, index + 1, $event)
                  "
                >
                  <GripVertical :size="12" aria-hidden="true" />
                  <span>
                    <em v-if="column.required">*</em>{{ column.title
                    }}{{ column.hint }}
                  </span>
                </button>
                <button
                  class="column-resize-handle"
                  type="button"
                  :aria-label="`调整${column.title}列宽`"
                  title="拖动调整列宽"
                  @keydown.left.prevent="resizeColumnBy(column, -16)"
                  @keydown.right.prevent="resizeColumnBy(column, 16)"
                  @lostpointercapture="finishColumnResize"
                  @pointercancel="finishColumnResize"
                  @pointerdown="startColumnResize($event, column)"
                  @pointermove="resizeColumn($event, column)"
                  @pointerup="finishColumnResize"
                ></button>
              </th>
              <th class="ops" data-column="ops" scope="col"></th>
            </tr>
          </thead>
          <draggable
            v-model="rows"
            :disabled="saving || rows.length < 2"
            direction="vertical"
            ghost-class="row-drag-ghost"
            handle=".row-drag-handle"
            item-key="key"
            tag="tbody"
          >
            <template #item="{ element: row, index }">
              <tr :class="{ invalid: submitted && errors.lines[row.key] }">
                <td class="no" data-column="no">
                  <div class="row-position">
                    <button
                      class="row-drag-handle"
                      type="button"
                      :aria-label="`移动第${index + 1}行`"
                      :disabled="saving || rows.length < 2"
                      title="拖动调整明细行顺序"
                      @keydown.down.prevent="moveRow(index, 1, $event)"
                      @keydown.up.prevent="moveRow(index, -1, $event)"
                    >
                      <GripVertical :size="14" aria-hidden="true" />
                    </button>
                    <span>{{ index + 1 }}</span>
                  </div>
                </td>
                <td
                  v-for="column in columns"
                  :key="column.key"
                  :class="{
                    gift: column.key === 'gift',
                    'sticky-product': column.key === 'product' && stickyProduct,
                  }"
                  :data-column="column.key"
                >
                  <template v-if="column.key === 'product'">
                    <div class="product-pick">
                      <Select
                        :value="rowProductValue(row)"
                        show-search
                        :filter-option="false"
                        :options="
                          sourceRequestId && (editOf || !row.requestItemId)
                            ? [...draftRequestProducts, ...productOptions]
                            : [...contractItems, ...productOptions]
                        "
                        :disabled="!!row.requestItemId && !editOf"
                        :placeholder="row.name || '搜索产品编号、名称'"
                        :dropdown-match-select-width="460"
                        style="width: 100%"
                        @search="searchProducts"
                        @update:value="(value) => chooseProduct(row, value)"
                      />
                      <Button
                        v-if="!row.requestItemId || editOf"
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
                    >
                      {{ row.code }} {{ row.name }}
                    </span>
                    <span v-if="row.requestItemId" class="hint">
                      申请明细 · 本次最多可转
                      {{ row.availableQuantity ?? row.quantity }}
                      {{ row.unit }}
                    </span>
                    <span
                      v-if="submitted && errors.lines[row.key]"
                      class="field-error"
                    >
                      {{ errors.lines[row.key] }}
                    </span>
                  </template>
                  <Select
                    v-else-if="column.key === 'supplier'"
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
                  <template v-else-if="column.key === 'specification'">
                    <span class="spec clamp" :title="row.specification">{{
                      row.specification || '—'
                    }}</span>
                    <span class="hint">{{ row.unit }}</span>
                    <ProductStructureDetails
                      v-if="row.productId || row.contractItemId"
                      :value="row.structure ?? {}"
                    />
                  </template>
                  <Select
                    v-else-if="column.key === 'pricingMode'"
                    :value="row.pricingMode ?? 'UNIT'"
                    :options="pricingOptions"
                    :disabled="row.gift"
                    style="width: 100%"
                    :aria-label="`第${index + 1}行计价方式`"
                    @update:value="
                      (value) =>
                        setRowPricingMode(
                          row,
                          value === 'TOTAL' ? 'TOTAL' : 'UNIT',
                        )
                    "
                  />
                  <template v-else-if="column.key === 'unitPrice'">
                    <InputNumber
                      :value="row.unitPrice"
                      string-mode
                      :min="0"
                      :controls="false"
                      :disabled="row.gift || row.pricingMode === 'TOTAL'"
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
                    <span v-if="row.pricingMode === 'TOTAL'" class="hint">折算单价</span>
                  </template>
                  <InputNumber
                    v-else-if="column.key === 'quantity'"
                    :value="row.quantity"
                    string-mode
                    :min="0"
                    :max="row.availableQuantity"
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
                  <InputNumber
                    v-else-if="column.key === 'total'"
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
                  <Input
                    v-else-if="column.key === 'arrivalDate'"
                    v-model:value="row.arrivalDate"
                    type="date"
                  />
                  <Checkbox
                    v-else-if="column.key === 'gift'"
                    :checked="row.gift"
                    @update:checked="(value) => setRowGift(row, !!value)"
                  />
                  <Input
                    v-else-if="column.key === 'remark'"
                    v-model:value="row.remark"
                  />
                </td>
                <td class="ops" data-column="ops">
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
            </template>
          </draggable>
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
          <span>
            总数量 <b>{{ totals.quantity }}</b>
          </span>
          <span>
            总金额 <b>{{ currencyMark }}{{ totals.total }}</b> = 产品明细
            {{ currencyMark }}{{ totals.lines }}
            <template v-if="totals.discountAdjustment !== undefined">
              − 整单折扣 {{ currencyMark }}{{ totals.discountAdjustment }}
            </template>
            <template v-else>
              × 整单折扣 {{ header.discountRate || 100 }}%
            </template>
            − 优惠抹零 {{ currencyMark }}{{ header.roundOff || 0 }} + 附加费用
            {{ currencyMark }}{{ money(header.additionalAmount || 0) }}
          </span>
        </p>
      </section>
    </div>
    <template #footer>
      <Button :disabled="saving" @click="close">取消</Button>
      <template v-if="editOf">
        <Button :loading="saving" @click="save(false)">保存草稿</Button>
        <Button type="primary" :loading="saving" @click="save(true)">
          提交审核
        </Button>
      </template>
      <Button v-else type="primary" :loading="saving" @click="save()">
        保存草稿并完善资料
      </Button>
    </template>
  </Modal>
  <Modal
    v-if="contract && contractReviewOpen"
    :open="open"
    :title="`合同订单 ${contract.code}`"
    width="min(1080px, 92vw)"
    :footer="null"
    @cancel="contractReviewOpen = false"
  >
    <p>
      {{ [contract.name, contract.customerName].filter(Boolean).join(' · ') }}
    </p>
    <Table
      :columns="contractReviewColumns"
      :data-source="contract.items"
      :pagination="false"
      :scroll="{ x: 740, y: '55vh' }"
      row-key="id"
      size="small"
    />
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
  <PurchaseAuxiliaryProduct
    v-if="open && auxiliaryOpen"
    @close="auxiliaryOpen = false"
    @saved="addAuxiliaryProduct"
  />
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

.contract-field-label {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  justify-content: space-between;
  color: hsl(var(--muted-foreground));
}

.contract-field-label :is(a, button) {
  padding: 0;
  color: hsl(var(--primary));
  cursor: pointer;
}

.contract-field-label :is(a, button):hover {
  text-decoration: underline;
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
  flex-wrap: wrap;
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

.entry-grid th.detail-column {
  padding: 0 9px 0 4px;
  border-right: 1px solid hsl(var(--border));
}

.column-drag-handle,
.row-drag-handle {
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 0;
  color: inherit;
  cursor: grab;
}

.column-drag-handle {
  width: 100%;
  padding: 8px 1px;
  text-align: left;
}

.column-drag-handle svg {
  flex-shrink: 0;
}

.column-drag-handle span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-position {
  display: flex;
  gap: 3px;
  align-items: center;
}

.row-drag-handle {
  flex-shrink: 0;
  justify-content: center;
  width: 18px;
  height: 24px;
  touch-action: none;
}

.row-drag-handle:disabled {
  cursor: default;
  opacity: 0.4;
}

.column-drag-handle:hover,
.row-drag-handle:not(:disabled):hover {
  color: hsl(var(--primary));
}

.column-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 9px;
  height: 100%;
  padding: 0;
  touch-action: none;
  cursor: col-resize;
}

.column-resize-handle::after {
  position: absolute;
  inset: 0 0 0 auto;
  width: 2px;
  content: '';
}

.column-resize-handle:hover::after,
.column-resize-handle:focus-visible::after,
.entry-grid th.resizing .column-resize-handle::after {
  background: hsl(var(--primary));
}

.entry-grid th.drop-before {
  box-shadow: inset 3px 0 hsl(var(--primary));
}

.entry-grid th.drop-after {
  box-shadow: inset -3px 0 hsl(var(--primary));
}

.row-drag-ghost {
  opacity: 0.45;
}

.entry-grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

/* 序号和操作固定，产品列位于表首且宽度适中时一同冻结。 */
.entry-grid .no,
.entry-grid .sticky-product,
.entry-grid .ops {
  position: sticky;
  z-index: 1;
}

.entry-grid td.no,
.entry-grid td.sticky-product,
.entry-grid td.ops {
  background: var(--ant-color-bg-elevated, #fff);
}

.entry-grid tr.invalid td.no,
.entry-grid tr.invalid td.sticky-product,
.entry-grid tr.invalid td.ops {
  background:
    linear-gradient(hsl(var(--destructive) / 5%), hsl(var(--destructive) / 5%)),
    var(--ant-color-bg-elevated, #fff);
}

.entry-grid th.no,
.entry-grid th.sticky-product,
.entry-grid th.ops {
  z-index: 3;
}

.entry-grid .no {
  left: 0;
  color: hsl(var(--muted-foreground));
}

.entry-grid .sticky-product {
  left: var(--row-number-width);
  border-right: 1px solid hsl(var(--border));
}

.splits {
  padding: 0;
  margin: 0;
  list-style: none;
}

.entry-grid .gift {
  text-align: center;
}

.entry-grid .ops {
  right: 0;
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
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  gap: 4px 16px;
  align-items: baseline;
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

@media (max-width: 760px) {
  .entry-grid .sticky-product {
    left: auto;
  }
}
</style>
