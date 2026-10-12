<script setup lang="ts">
import type { EntryHeader, EntryRow } from '../entry-model';

import type { Contract, Directory } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

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
import {
  createProcurementOrder,
  getProcurementSettings,
} from '#/api/fdmplatform/procurement';
import { getProducts } from '#/api/fdmplatform/products';

import RemoteMasterSelect from '../../../components/RemoteMasterSelect.vue';
import { errorText } from '../../../data';
import { localDate } from '../../quotes/comparison';
import {
  emptyRow,
  entryErrors,
  entryPayload,
  entryTotals,
  parsePastedLines,
  PURCHASE_CATEGORIES,
  setRowGift,
  setRowPrice,
  setRowQuantity,
  setRowTotal,
} from '../entry-model';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  /** 从采购申请开单：带出申请里的合同产品与数量 */
  requestId?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [value: { code: string; contractId: string; orderId: string }];
}>();

const today = localDate();
const header = ref<EntryHeader>({});
const rows = ref<EntryRow[]>([]);
const directory = ref<Directory>();
const contract = ref<Contract>();
const contracts = ref<{ label: string; value: string }[]>([]);
const productOptions = ref<
  {
    code?: string;
    label: string;
    name: string;
    specification?: string;
    unit?: string;
    value: string;
  }[]
>([]);
const categories = ref<string[]>([...PURCHASE_CATEGORIES]);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
let sequence = 0;

const errors = computed(() => entryErrors(rows.value, header.value));
const totals = computed(() => entryTotals(rows.value, header.value));
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

/** 批量添加：多选产品，或粘贴 Excel 的「产品编号、数量、单价、到货日期、备注」行。 */
const bulkOpen = ref(false);
const bulkProducts = ref<string[]>([]);
const bulkText = ref('');
const bulkIssues = ref<string[]>([]);
const bulkBusy = ref(false);
function openBulk() {
  bulkProducts.value = [];
  bulkText.value = '';
  bulkIssues.value = [];
  bulkOpen.value = true;
}
function productRow(product: (typeof productOptions.value)[number]): EntryRow {
  return {
    ...emptyRow(key()),
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
  const added: EntryRow[] = bulkProducts.value
    .map((id) => productOptions.value.find((entry) => entry.value === id))
    .filter((entry) => !!entry)
    .map((entry) => productRow(entry!));
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
      const row = productRow({
        value: product.id,
        name: product.name,
        code: product.code,
        specification: product.specification,
        unit: product.unit,
        label: product.name,
      });
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
  productOptions.value = page.list.map((product) => ({
    value: product.id,
    name: product.name,
    code: product.code,
    specification: product.specification,
    unit: product.unit,
    label: `${product.code} · ${product.name}${product.specification ? ` · ${product.specification.replaceAll('\n', ' ')}` : ''}`,
  }));
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
    (request?.items ?? []) as { contractItemId?: string; quantity?: unknown }[]
  )
    .map((line) => ({ line, item: items.get(String(line.contractItemId)) }))
    .filter((entry) => entry.item);
  if (lines.length === 0) return;
  header.value.subject = `${contract.value?.code ?? ''} 采购单`;
  rows.value = lines.map(({ line, item }) => ({
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
  }));
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
    void searchProducts();
    try {
      const [loaded, maintained] = await Promise.all([
        getDirectory(0),
        getProcurementSettings('categories', { active: true }).catch(() => []),
      ]);
      directory.value = loaded;
      // 采购设置里维护了分类就用维护的，否则用内置的常用分类
      if (maintained.length > 0) {
        categories.value = maintained.map((entry) => entry.name);
        header.value.category = categories.value.includes(
          PURCHASE_CATEGORIES[0]!,
        )
          ? PURCHASE_CATEGORIES[0]
          : categories.value[0];
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
    title="新建采购单"
    width="1180px"
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
            placeholder="输入名称或编码搜索"
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
        <Button size="small" @click="addRow">添加一行</Button>
        <Button size="small" @click="openBulk">批量添加 / 粘贴导入</Button>
        <Button v-if="contract" size="small" @click="addContractItems">
          带出合同产品
        </Button>
      </div>
      <div class="table-wrap">
        <table class="entry-grid">
          <thead>
            <tr>
              <th class="no">#</th>
              <th class="product"><em>*</em>产品</th>
              <th>规格 / 单位</th>
              <th class="money"><em>*</em>单价</th>
              <th class="money"><em>*</em>数量</th>
              <th class="money"><em>*</em>总价</th>
              <th class="date">到货日期</th>
              <th class="gift">赠品</th>
              <th>备注</th>
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
              <td>
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
                  style="width: 100%"
                  @search="searchProducts"
                  @update:value="(value) => chooseProduct(row, value)"
                />
                <span v-if="row.name" class="hint">{{ row.code }} {{ row.name }}</span>
                <span
                  v-if="submitted && errors.lines[row.key]"
                  class="field-error"
                  >{{ errors.lines[row.key] }}</span>
              </td>
              <td>
                <span class="spec">{{ row.specification || '—' }}</span>
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
      <label class="field">
        <span>多选产品</span>
        <Select
          v-model:value="bulkProducts"
          mode="multiple"
          show-search
          :filter-option="false"
          :options="productOptions"
          placeholder="搜索产品编号、名称，可多选"
          @search="searchProducts"
        />
      </label>
      <label class="field">
        <span>或从 Excel 粘贴（每行：产品编号、数量、单价、到货日期、备注）</span>
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
</template>

<style scoped>
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

.table-wrap {
  max-height: 46vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.entry-grid {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
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

.entry-grid td {
  padding: 6px;
  vertical-align: top;
  border-top: 1px solid hsl(var(--border));
}

.entry-grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

.entry-grid .no {
  width: 36px;
  color: hsl(var(--muted-foreground));
}

.entry-grid .product {
  width: 280px;
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
  width: 60px;
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
