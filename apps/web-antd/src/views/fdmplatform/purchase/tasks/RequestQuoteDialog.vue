<script setup lang="ts">
import type { QuoteForm } from '../quotes/quick-order';
import type { QuoteRow } from './request-batch';

import type { AttachmentView, Contract, MasterRecord } from '#/api/fdmplatform';

import { computed, nextTick, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { contractActionWithAttachments } from '#/api/fdmplatform/submissions';

import CreationAttachments from '../../components/CreationAttachments.vue';
import RemoteMasterSelect from '../../components/RemoteMasterSelect.vue';
import { errorText } from '../../data';
import { localDate } from '../quotes/comparison';
import {
  addDays,
  newQuoteForm,
  QUOTE_CURRENCIES,
  VALIDITY_PRESETS,
} from '../quotes/quick-order';
import {
  batchQuoteErrors,
  batchQuotePayload,
  pricedQuoteRows,
  quoteRowSubtotal,
  requestQuoteRows,
} from './request-batch';

const props = defineProps<{
  /** The task the buyer clicked; its price cell gets focus. */
  assignmentId?: string;
  contractId?: string;
  open: boolean;
  requestId?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [contract: Contract, quoteIds: string[], orderNow: boolean];
}>();

const contract = ref<Contract>();
const attachments = ref<AttachmentView>();
const lines = ref<QuoteRow[]>([]);
const form = ref<QuoteForm>(newQuoteForm(undefined));
const files = ref<File[]>([]);
const validity = ref<'custom' | number>(15);
const loading = ref(false);
const saving = ref(false);
const submitted = ref(false);
const pageError = ref('');
const idempotencyKey = ref('');
const tableRef = ref<HTMLElement>();
let sequence = 0;
let pristine = '';
const today = localDate();

const request = computed(() =>
  contract.value?.requests?.find((entry) => entry.id === props.requestId),
);
const errors = computed(() =>
  submitted.value
    ? batchQuoteErrors(form.value, lines.value, files.value.length, today)
    : {
        sheet: {} as Record<string, string>,
        lines: {} as Record<string, string>,
      },
);
const pricedCount = computed(() => pricedQuoteRows(lines.value).length);
const evidenceOptions = computed(() =>
  (attachments.value?.items ?? []).map((file) => ({
    value: String(file.id),
    label: file.name,
  })),
);

function setValidity(value: 'custom' | number) {
  validity.value = value;
  if (value !== 'custom') form.value.validUntil = addDays(today, value);
}
function selectSupplier(record: MasterRecord | undefined) {
  form.value.supplierName = record?.name;
}
function toggle(key: 'freightIncluded' | 'packagingIncluded' | 'taxIncluded') {
  form.value[key] = !form.value[key];
}
function snapshot() {
  return JSON.stringify([form.value, lines.value, validity.value]);
}

async function prepare(contractId: string, requestId: string) {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const [loaded, uploaded] = await Promise.all([
      getContract(contractId),
      getAttachments(contractId).catch(() => undefined),
    ]);
    if (run !== sequence || !props.open) return;
    if (!loaded.allowedActions?.includes('CREATE_QUOTES'))
      throw new Error('当前合同状态不能登记报价，请核对合同是否已生效');
    contract.value = loaded;
    attachments.value = uploaded;
    lines.value = requestQuoteRows(loaded, requestId, today);
    if (lines.value.length === 0)
      pageError.value = '这张申请没有待报价的外采产品';
    form.value = newQuoteForm(undefined, today);
    validity.value = 15;
    pristine = snapshot();
    await nextTick();
    const index = lines.value.findIndex(
      (row) => row.assignmentId === props.assignmentId,
    );
    tableRef.value
      ?.querySelectorAll<HTMLInputElement>('.price-input input')
      ?.[Math.max(index, 0)]?.focus();
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}

async function save(orderNow: boolean) {
  const current = contract.value;
  if (!current || saving.value) return;
  submitted.value = true;
  const found = batchQuoteErrors(
    form.value,
    lines.value,
    files.value.length,
    today,
  );
  if (
    Object.keys(found.sheet).length > 0 ||
    Object.keys(found.lines).length > 0
  ) {
    pageError.value = found.sheet.lines ?? '还有内容没填好，请看标红的地方';
    return;
  }
  saving.value = true;
  pageError.value = '';
  try {
    const before = new Set((current.quotes ?? []).map((quote) => quote.id));
    const updated = await contractActionWithAttachments(
      current.id,
      'CREATE_QUOTES',
      current.version,
      idempotencyKey.value,
      batchQuotePayload(form.value, lines.value),
      files.value,
    );
    const created = (updated.quotes ?? [])
      .filter((quote) => !before.has(quote.id))
      .map((quote) => String(quote.id));
    message.success(
      `已保存 ${created.length > 0 ? created.length : pricedCount.value} 个产品的报价`,
    );
    files.value = [];
    emit('saved', updated, created, orderNow);
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

function finishClose() {
  ++sequence;
  emit('close');
}
function close() {
  if (saving.value) return;
  if (
    !contract.value ||
    (files.value.length === 0 && snapshot() === pristine)
  ) {
    finishClose();
    return;
  }
  Modal.confirm({
    title: '报价还没保存',
    content:
      files.value.length > 0
        ? `填写的内容和 ${files.value.length} 个待上传文件都会丢掉。`
        : '填写的内容会丢掉。',
    okText: '放弃并关闭',
    cancelText: '继续填写',
    autoFocusButton: 'cancel',
    onOk: finishClose,
  });
}

watch(
  () => [props.open, props.contractId, props.requestId],
  () => {
    ++sequence;
    contract.value = undefined;
    attachments.value = undefined;
    lines.value = [];
    files.value = [];
    submitted.value = false;
    pageError.value = '';
    if (!props.open || !props.contractId || !props.requestId) return;
    idempotencyKey.value = newIdempotencyKey();
    void prepare(props.contractId, props.requestId);
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    width="min(1120px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    :destroy-on-close="true"
    @cancel="close"
  >
    <template #title>
      按单录入报价<span v-if="contract" class="title-sub">
        · {{ request?.name ?? '采购申请' }} · {{ contract.code }}</span>
    </template>
    <Spin :spinning="loading">
      <Alert
        v-if="pageError"
        type="error"
        show-icon
        :message="pageError"
        class="entry-alert"
      />
      <div v-if="contract && lines.length" class="entry">
        <section class="sheet" aria-label="整单报价条件">
          <div class="field supplier">
            <label><em>*</em>供应商</label>
            <RemoteMasterSelect
              v-model:value="form.supplierId"
              type="SUPPLIER"
              placeholder="输入名称或编码搜索供应商"
              :disabled="saving"
              @selected="selectSupplier"
            />
            <span v-if="errors.sheet.supplierId" class="field-error">{{
              errors.sheet.supplierId
            }}</span>
          </div>
          <div class="field">
            <label for="batch-currency"><em>*</em>币种</label>
            <Select
              id="batch-currency"
              v-model:value="form.currency"
              :options="
                QUOTE_CURRENCIES.map((value) => ({ value, label: value }))
              "
              :disabled="saving"
            />
          </div>
          <div class="field">
            <label for="batch-promised"><em>*</em>承诺交期</label>
            <Input
              id="batch-promised"
              v-model:value="form.promisedDate"
              type="date"
              :min="today"
              :disabled="saving"
            />
            <span v-if="errors.sheet.promisedDate" class="field-error">{{
              errors.sheet.promisedDate
            }}</span>
            <span v-else class="hint">个别产品不同可在表格里改</span>
          </div>
          <div class="field">
            <label><em>*</em>价格包含</label>
            <div class="chips" role="group" aria-label="价格包含">
              <button
                v-for="option in [
                  { key: 'taxIncluded', label: '含税' },
                  { key: 'freightIncluded', label: '含运费' },
                  { key: 'packagingIncluded', label: '含包装' },
                ] as const"
                :key="option.key"
                type="button"
                class="chip"
                :class="{ on: form[option.key] }"
                :aria-pressed="form[option.key]"
                :disabled="saving"
                @click="toggle(option.key)"
              >
                {{ form[option.key] ? '✓ ' : '' }}{{ option.label }}
              </button>
            </div>
          </div>
          <div class="field">
            <label><em>*</em>报价有效期</label>
            <div class="validity">
              <div class="seg" role="radiogroup" aria-label="报价有效期">
                <button
                  v-for="days in VALIDITY_PRESETS"
                  :key="days"
                  type="button"
                  role="radio"
                  :aria-checked="validity === days"
                  :class="{ on: validity === days }"
                  :disabled="saving"
                  @click="setValidity(days)"
                >
                  {{ days }} 天
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="validity === 'custom'"
                  :class="{ on: validity === 'custom' }"
                  :disabled="saving"
                  @click="setValidity('custom')"
                >
                  自选
                </button>
              </div>
              <Input
                v-if="validity === 'custom'"
                v-model:value="form.validUntil"
                type="date"
                :min="today"
                :disabled="saving"
                aria-label="有效截止日期"
                class="validity-date"
              />
            </div>
            <span v-if="errors.sheet.validUntil" class="field-error">{{
              errors.sheet.validUntil
            }}</span>
          </div>
        </section>

        <div ref="tableRef" class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th>产品</th>
                <th class="num">待采数量</th>
                <th>需求交期</th>
                <th>现有最低报价</th>
                <th class="price">单价（{{ form.currency }}）</th>
                <th class="date">交期（可选）</th>
                <th class="num">小计</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in lines"
                :key="row.assignmentId"
                :class="{
                  invalid: errors.lines[row.assignmentId],
                  current: row.assignmentId === assignmentId,
                }"
              >
                <td>
                  <b>{{ row.title }}</b>
                  <span v-if="row.specification" class="hint">{{
                    row.specification
                  }}</span>
                  <span
                    v-if="errors.lines[row.assignmentId]"
                    class="field-error"
                    >{{ errors.lines[row.assignmentId] }}</span>
                </td>
                <td class="num">{{ row.quantity }} {{ row.unit }}</td>
                <td>{{ row.requiredDate ?? '—' }}</td>
                <td>
                  <template v-if="row.best">
                    {{ row.best.currency }} {{ row.best.unitPrice }}
                    <span class="hint">{{ row.best.supplierName }}</span>
                  </template>
                  <span v-else class="hint">暂无</span>
                </td>
                <td>
                  <InputNumber
                    v-model:value="row.unitPrice"
                    string-mode
                    :min="0"
                    :controls="false"
                    :disabled="saving"
                    class="price-input"
                    :aria-label="`${row.title} 单价`"
                    placeholder="不报留空"
                    style="width: 100%"
                  />
                </td>
                <td>
                  <Input
                    v-model:value="row.promisedDate"
                    type="date"
                    :min="today"
                    :disabled="saving"
                    :aria-label="`${row.title} 交期`"
                  />
                </td>
                <td class="num">{{ quoteRowSubtotal(row) ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section class="evidence">
          <CreationAttachments
            v-model:files="files"
            :disabled="saving"
            title="报价单 / 聊天截图（整单共用）"
          />
          <div v-if="evidenceOptions.length" class="field">
            <label for="batch-evidence">或选择合同里已上传的文件</label>
            <Select
              id="batch-evidence"
              v-model:value="form.evidenceIds"
              mode="multiple"
              :options="evidenceOptions"
              :disabled="saving"
              placeholder="可不选"
              option-filter-prop="label"
            />
          </div>
          <span v-if="errors.sheet.evidence" class="field-error">{{
            errors.sheet.evidence
          }}</span>
        </section>
      </div>
    </Spin>
    <template #footer>
      <span v-if="contract && lines.length" class="footer-count">已填 {{ pricedCount }} / {{ lines.length }} 个产品</span>
      <Button :disabled="saving" @click="close">取消</Button>
      <Button
        :loading="saving"
        :disabled="!contract || lines.length === 0"
        @click="save(false)"
      >
        保存报价
      </Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="
          !contract ||
          lines.length === 0 ||
          !contract.allowedActions?.includes('ORDER_FROM_QUOTE')
        "
        @click="save(true)"
      >
        保存并下单
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.title-sub {
  font-size: 13px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.entry-alert {
  margin-bottom: 12px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sheet {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1fr);
  gap: 12px;
}

.sheet .supplier {
  grid-column: span 1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field > label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.field > label em {
  margin-right: 2px;
  font-style: normal;
  color: hsl(var(--destructive));
}

.field-error {
  display: block;
  font-size: 12px;
  color: hsl(var(--destructive));
}

.hint {
  display: block;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  cursor: pointer;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
}

.chip.on {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-color: hsl(var(--primary));
}

.chip:focus-visible,
.seg button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.validity {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.seg button {
  padding: 4px 10px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  cursor: pointer;
  background: hsl(var(--background));
  border: 0;
  border-left: 1px solid hsl(var(--border));
}

.seg button:first-child {
  border-left: 0;
}

.seg button.on {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.validity-date {
  width: 150px;
}

.table-wrap {
  max-height: 50vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.grid {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: left;
  white-space: nowrap;
  background: hsl(var(--accent));
}

.grid td {
  padding: 6px 8px;
  vertical-align: top;
  border-top: 1px solid hsl(var(--border));
}

.grid tr.current td {
  background: hsl(var(--primary) / 5%);
}

.grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

.grid .num {
  text-align: right;
  white-space: nowrap;
}

.grid .price {
  width: 132px;
}

.grid .date {
  width: 150px;
}

.evidence {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-count {
  margin-right: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 760px) {
  .sheet {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
