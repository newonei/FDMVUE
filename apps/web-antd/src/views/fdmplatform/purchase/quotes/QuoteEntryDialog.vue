<script setup lang="ts">
import type { QuoteForm, TaskContext } from './quick-order';

import type { AttachmentView, Contract, MasterRecord } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Collapse,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Textarea,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getAttachments,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { contractActionWithAttachments } from '#/api/fdmplatform/submissions';

import CreationAttachments from '../../components/CreationAttachments.vue';
import RemoteMasterSelect from '../../components/RemoteMasterSelect.vue';
import { errorText } from '../../data';
import ContractPicker from '../../documents/ContractPicker.vue';
import { latestTaskQuotes, localDate } from './comparison';
import {
  addDays,
  daysBetween,
  newQuoteForm,
  quotableTasks,
  QUOTE_CURRENCIES,
  quoteFormErrors,
  quotePayload,
  taskContext,
  VALIDITY_PRESETS,
} from './quick-order';

const props = defineProps<{
  assignmentId?: string;
  contractId?: string;
  open: boolean;
}>();
const emit = defineEmits<{
  close: [];
  saved: [contract: Contract, quoteId: string | undefined, orderNow: boolean];
}>();

const pickerOpen = ref(false);
const contract = ref<Contract>();
const attachments = ref<AttachmentView>();
const taskId = ref<string>();
const form = ref<QuoteForm>(newQuoteForm(undefined));
const files = ref<File[]>([]);
const validity = ref<'custom' | number>(15);
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const submitted = ref(false);
const moreOpen = ref<string[]>([]);
const idempotencyKey = ref('');
let sequence = 0;
const today = localDate();

const tasks = computed(() =>
  contract.value ? quotableTasks(contract.value) : [],
);
const context = computed<TaskContext | undefined>(() =>
  contract.value && taskId.value
    ? taskContext(contract.value, taskId.value)
    : undefined,
);
const errors = computed(() =>
  submitted.value ? quoteFormErrors(form.value, files.value.length, today) : {},
);
const existingQuotes = computed(() =>
  contract.value && taskId.value
    ? latestTaskQuotes(contract.value, taskId.value)
    : [],
);
const evidenceOptions = computed(() =>
  (attachments.value?.items ?? []).map((file) => ({
    value: String(file.id),
    label: file.name,
  })),
);
const revisionOptions = computed(() =>
  existingQuotes.value.map((quote) => ({
    value: String(quote.id),
    label: `${quote.supplierName ?? '供应商'} · ${quote.currency ?? ''} ${quote.unitPrice ?? ''} · 版本 ${quote.version ?? 1}`,
  })),
);
const subtotal = computed(() => {
  const price = new BigNumber(form.value.unitPrice ?? Number.NaN);
  const quantity = new BigNumber(context.value?.plannable ?? Number.NaN);
  return price.isFinite() && quantity.isFinite()
    ? price.multipliedBy(quantity).toFormat(2)
    : undefined;
});
const promisedIn = computed(() =>
  form.value.promisedDate
    ? daysBetween(today, form.value.promisedDate)
    : undefined,
);
const lateBy = computed(() => {
  if (!form.value.promisedDate || !context.value?.requiredDate)
    return undefined;
  const days = daysBetween(context.value.requiredDate, form.value.promisedDate);
  return days !== undefined && days > 0 ? days : undefined;
});
/** Other suppliers' current quotes in the same price terms, cheapest first. */
const others = computed(() =>
  existingQuotes.value
    .filter(
      (quote) =>
        quote.supplierId !== form.value.supplierId &&
        quote.confirmed === true &&
        typeof quote.validUntil === 'string' &&
        quote.validUntil >= today,
    )
    .toSorted(
      (a, b) =>
        new BigNumber(String(a.unitPrice ?? 0)).comparedTo(
          new BigNumber(String(b.unitPrice ?? 0)),
        ) ?? 0,
    ),
);
const comparison = computed(() => {
  const best = others.value.find(
    (quote) =>
      quote.currency === form.value.currency &&
      quote.taxIncluded === form.value.taxIncluded &&
      quote.packagingIncluded === form.value.packagingIncluded &&
      quote.freightIncluded === form.value.freightIncluded,
  );
  const price = new BigNumber(form.value.unitPrice ?? Number.NaN);
  if (!best || !price.isFinite()) return undefined;
  const diff = price.minus(String(best.unitPrice ?? 0));
  return {
    best,
    lowest: diff.isLessThanOrEqualTo(0),
    diff: diff.abs().toFormat(),
  };
});

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
function chooseTask(id: string | undefined) {
  taskId.value = id;
  const unit =
    id && contract.value ? taskContext(contract.value, id)?.unit : undefined;
  form.value = { ...form.value, unit: unit ?? '' };
}

async function prepare(id: string) {
  const run = ++sequence;
  pickerOpen.value = false;
  loading.value = true;
  pageError.value = '';
  try {
    const [loaded, uploaded] = await Promise.all([
      getContract(id),
      getAttachments(id).catch(() => undefined),
    ]);
    if (run !== sequence || !props.open) return;
    if (!loaded.allowedActions?.includes('CREATE_QUOTE'))
      throw new Error('当前合同状态不能登记报价，请核对合同是否已生效');
    contract.value = loaded;
    attachments.value = uploaded;
    const first =
      props.assignmentId ??
      (quotableTasks(loaded).length === 1
        ? String(quotableTasks(loaded)[0]!.assignment.id)
        : undefined);
    taskId.value = first;
    form.value = newQuoteForm(
      first ? taskContext(loaded, first) : undefined,
      today,
    );
    validity.value = 15;
    pristine = snapshotForm();
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
  if (!taskId.value) {
    pageError.value = '请选择要报价的采购任务';
    return;
  }
  if (
    Object.keys(quoteFormErrors(form.value, files.value.length, today)).length >
    0
  ) {
    pageError.value = '还有内容没填好，请看标红的地方';
    return;
  }
  saving.value = true;
  pageError.value = '';
  try {
    const before = new Set((current.quotes ?? []).map((quote) => quote.id));
    const updated = await contractActionWithAttachments(
      current.id,
      'CREATE_QUOTE',
      current.version,
      idempotencyKey.value,
      quotePayload(taskId.value, form.value),
      files.value,
    );
    const created = (updated.quotes ?? []).find(
      (quote) => !before.has(quote.id) && quote.assignmentId === taskId.value,
    );
    message.success('报价已保存');
    files.value = [];
    emit('saved', updated, created ? String(created.id) : undefined, orderNow);
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
/** The form as first loaded, to ask before throwing away typed-in work. */
let pristine = '';
function snapshotForm() {
  return JSON.stringify([taskId.value, form.value, validity.value]);
}
function finishClose() {
  ++sequence;
  emit('close');
}
function close() {
  if (saving.value) return;
  const dirty =
    !!contract.value && (files.value.length > 0 || snapshotForm() !== pristine);
  if (!dirty) {
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
  () => [props.open, props.contractId, props.assignmentId],
  () => {
    ++sequence;
    contract.value = undefined;
    attachments.value = undefined;
    files.value = [];
    submitted.value = false;
    moreOpen.value = [];
    pageError.value = '';
    if (!props.open) {
      pickerOpen.value = false;
      return;
    }
    idempotencyKey.value = newIdempotencyKey();
    if (props.contractId) void prepare(props.contractId);
    else pickerOpen.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <ContractPicker
    :open="open && pickerOpen"
    action="CREATE_QUOTE"
    @close="close"
    @select="(selected) => prepare(selected.id)"
  />
  <Modal
    :open="open && !pickerOpen"
    width="min(980px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    :destroy-on-close="true"
    @cancel="close"
  >
    <template #title>
      录入报价<span v-if="context" class="title-sub">
        · {{ context.title }} · {{ contract?.code }}</span>
    </template>
    <Spin :spinning="loading">
      <Alert
        v-if="pageError"
        type="error"
        show-icon
        :message="pageError"
        class="entry-alert"
      />
      <div v-if="contract" class="entry">
        <div class="entry-form">
          <div v-if="!assignmentId" class="field">
            <label for="quote-task"><em>*</em>采购任务</label>
            <Select
              id="quote-task"
              :value="taskId"
              :options="
                tasks.map((task) => ({
                  value: String(task.assignment.id),
                  label: `${task.title}${task.specification ? ` · ${task.specification}` : ''} · ${task.quantity} ${task.unit}`,
                }))
              "
              placeholder="选择要报价的产品"
              :disabled="saving"
              @change="(value) => chooseTask(value as string | undefined)"
            />
          </div>

          <section class="group">
            <h5>价格</h5>
            <div class="field">
              <label><em>*</em>供应商</label>
              <RemoteMasterSelect
                v-model:value="form.supplierId"
                type="SUPPLIER"
                placeholder="输入名称或编码搜索供应商"
                :disabled="saving"
                @selected="selectSupplier"
              />
              <span v-if="errors.supplierId" class="field-error">{{
                errors.supplierId
              }}</span>
            </div>
            <div class="row">
              <div class="field">
                <label for="quote-price"><em>*</em>单价</label>
                <div class="price">
                  <Select
                    v-model:value="form.currency"
                    :options="
                      QUOTE_CURRENCIES.map((value) => ({ value, label: value }))
                    "
                    :disabled="saving"
                    aria-label="币种"
                    class="price-currency"
                  />
                  <InputNumber
                    id="quote-price"
                    v-model:value="form.unitPrice"
                    string-mode
                    :min="0"
                    :controls="false"
                    :disabled="saving"
                    placeholder="0.00"
                    class="price-value"
                  />
                </div>
                <span v-if="errors.unitPrice" class="field-error">{{
                  errors.unitPrice
                }}</span>
              </div>
              <div class="field">
                <label>计价单位</label>
                <div class="unit">
                  <b>{{ form.unit || '—' }}</b>
                  <span class="hint">与采购需求一致，下单时按此单位</span>
                </div>
                <span v-if="errors.unit" class="field-error">{{
                  errors.unit
                }}</span>
              </div>
            </div>
          </section>

          <section class="group">
            <h5>条件</h5>
            <div class="row">
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
                <span class="hint">没点亮的表示报价不含这一项</span>
              </div>
              <div class="field">
                <label for="quote-promised"><em>*</em>承诺交期</label>
                <Input
                  id="quote-promised"
                  v-model:value="form.promisedDate"
                  type="date"
                  :min="today"
                  :disabled="saving"
                />
                <span v-if="errors.promisedDate" class="field-error">{{
                  errors.promisedDate
                }}</span>
                <span v-else-if="promisedIn !== undefined" class="hint">{{
                  promisedIn >= 0 ? `${promisedIn} 天后` : `${-promisedIn} 天前`
                }}</span>
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
                    自选日期
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
                <span v-else class="hint">至 {{ form.validUntil }}</span>
              </div>
              <span v-if="errors.validUntil" class="field-error">{{
                errors.validUntil
              }}</span>
            </div>
          </section>

          <section class="group">
            <h5>凭证</h5>
            <CreationAttachments
              v-model:files="files"
              :disabled="saving"
              title="报价单 / 聊天截图"
            />
            <div v-if="evidenceOptions.length" class="field">
              <label for="quote-evidence">或选择合同里已上传的文件</label>
              <Select
                id="quote-evidence"
                v-model:value="form.evidenceIds"
                mode="multiple"
                :options="evidenceOptions"
                :disabled="saving"
                placeholder="可不选"
                option-filter-prop="label"
              />
            </div>
            <span v-if="errors.evidence" class="field-error">{{
              errors.evidence
            }}</span>
          </section>

          <Collapse v-model:active-key="moreOpen" ghost class="more">
            <Collapse.Panel
              key="more"
              header="更多：适用数量范围 · 修订原报价 · 核对说明"
            >
              <div class="row">
                <div class="field">
                  <label for="quote-min">最低数量</label>
                  <InputNumber
                    id="quote-min"
                    v-model:value="form.minQuantity"
                    string-mode
                    :min="0"
                    :controls="false"
                    :disabled="saving"
                    style="width: 100%"
                  />
                  <span v-if="errors.minQuantity" class="field-error">{{
                    errors.minQuantity
                  }}</span>
                </div>
                <div class="field">
                  <label for="quote-max">最高适用数量</label>
                  <InputNumber
                    id="quote-max"
                    v-model:value="form.maxQuantity"
                    string-mode
                    :min="0"
                    :controls="false"
                    :disabled="saving"
                    style="width: 100%"
                  />
                  <span v-if="errors.maxQuantity" class="field-error">{{
                    errors.maxQuantity
                  }}</span>
                </div>
              </div>
              <div v-if="revisionOptions.length" class="field">
                <label for="quote-previous">这是哪份报价的新版本</label>
                <Select
                  id="quote-previous"
                  v-model:value="form.previousQuoteId"
                  allow-clear
                  :options="revisionOptions"
                  :disabled="saving"
                  placeholder="新报价不用选"
                />
              </div>
              <div class="field">
                <label for="quote-remark">核对说明</label>
                <Textarea
                  id="quote-remark"
                  v-model:value="form.remark"
                  :rows="2"
                  :maxlength="500"
                  :disabled="saving"
                />
              </div>
            </Collapse.Panel>
          </Collapse>
        </div>

        <aside class="entry-summary" aria-label="报价汇总">
          <span class="hint">
            需求
            <template v-if="context">{{ context.plannable }} {{ context.unit }}</template>
            <template v-else>请先选任务</template>
            <template v-if="context?.requiredDate">
              · 需求交期 {{ context.requiredDate }}</template>
          </span>
          <b class="big">{{ form.currency }} {{ form.unitPrice || '—' }}</b>
          <span v-if="subtotal" class="hint">× {{ context?.plannable }} {{ context?.unit }} =
            {{ form.currency }} {{ subtotal }}</span>
          <dl>
            <dt>其他报价</dt>
            <dd>
              <template v-if="others.length">
                {{ others[0]!.supplierName }} {{ others[0]!.currency }}
                {{ others[0]!.unitPrice
                }}<span v-if="others.length > 1">
                  等 {{ others.length }} 份</span>
              </template>
              <template v-else>暂无有效报价</template>
            </dd>
            <dt>比价</dt>
            <dd>
              <span v-if="!comparison" class="hint">同口径报价不足，无法比较</span>
              <span v-else-if="comparison.lowest" class="pill ok">当前最低</span>
              <span v-else class="pill warn">比 {{ comparison.best.supplierName }} 高
                {{ comparison.diff }}</span>
            </dd>
            <dt>交期</dt>
            <dd>
              <span v-if="lateBy" class="pill bad">晚于需求交期 {{ lateBy }} 天</span>
              <span v-else-if="form.promisedDate" class="pill ok">满足需求交期</span>
              <span v-else class="hint">待填写</span>
            </dd>
          </dl>
        </aside>
      </div>
    </Spin>
    <template #footer>
      <Button :disabled="saving" @click="close">取消</Button>
      <Button :loading="saving" :disabled="!contract" @click="save(false)">
        保存报价
      </Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="
          !contract || !contract.allowedActions?.includes('ORDER_FROM_QUOTE')
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
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.entry-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group + .group {
  padding-top: 12px;
  border-top: 1px dashed hsl(var(--border));
}

.group h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.04em;
}

.row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
  font-size: 12px;
  color: hsl(var(--destructive));
}

.hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.price {
  display: flex;
}

.price-currency {
  flex: none;
  width: 92px;
}

.price-value {
  flex: 1;
  min-width: 0;
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
}

.price-currency :deep(.ant-select-selector) {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

.unit {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 32px;
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
  padding: 4px 12px;
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
  width: 160px;
}

.more :deep(.ant-collapse-header) {
  padding-inline: 0 !important;
  color: hsl(var(--primary));
}

.more :deep(.ant-collapse-content-box) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-inline: 0 !important;
}

.entry-summary {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: hsl(var(--accent));
  border-radius: 10px;
}

.entry-summary .big {
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.entry-summary dl {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  padding-top: 8px;
  margin: 0;
  border-top: 1px dashed hsl(var(--border));
}

.entry-summary dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.entry-summary dd {
  min-width: 0;
  margin: 0;
  font-size: 13px;
}

.pill {
  padding: 1px 8px;
  font-size: 12px;
  border-radius: 999px;
}

.pill.ok {
  color: hsl(var(--success));
  background: hsl(var(--success) / 12%);
}

.pill.warn {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 12%);
}

.pill.bad {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 12%);
}

@media (max-width: 760px) {
  .entry,
  .row {
    grid-template-columns: minmax(0, 1fr);
  }

  .entry-summary {
    position: static;
  }
}
</style>
