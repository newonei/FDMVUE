<script setup lang="ts">
import type { ActionDefinition, Field } from '../data';

import { computed, nextTick, ref, toRaw, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Textarea,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';

import {
  fieldVisible,
  formDraftSignature,
  initialFormValues,
  settleSources,
} from '../documents/formDefaults';
import { availableOptions } from '../documents/model';
import ReceiptFxPreview from '../finance/exchange-rates/ReceiptFxPreview.vue';
import RemoteMasterSelect from './RemoteMasterSelect.vue';
import RemoteStockSelect from './RemoteStockSelect.vue';

type Value = (number | string)[] | boolean | number | string | undefined;
type FormValues = Record<string, Value>;
const props = defineProps<{
  definition?: ActionDefinition;
  error?: string;
  evidenceReady?: boolean;
  open: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [hasChanges: boolean];
  submit: [payload: Record<string, unknown>, idempotencyKey: string];
}>();
const automatic = new WeakMap<FormValues, FormValues>();
const values = ref<FormValues>({});
const lines = ref<FormValues[]>([]);
const rowKeys = new WeakMap<FormValues, string>();
let rowSequence = 0;
const lineErrors = ref<Record<string, Record<string, string>>>({});
const fieldErrors = ref<Record<string, string>>({});
const validated = ref(false);
const initialDraft = ref('');
const actionBody = ref<HTMLElement>();
const hasChanges = computed(
  () => formDraftSignature(values.value, lines.value) !== initialDraft.value,
);
const lineTable = ref<HTMLElement>();
const visibleLineFields = computed(() =>
  (props.definition?.lineFields ?? []).filter(
    (item) =>
      !item.hidden &&
      (lines.value.length === 0 ||
        lines.value.some((line) =>
          fieldVisible(item, { ...values.value, ...line }),
        )),
  ),
);
const lineTableWidth = computed(
  () =>
    140 +
    visibleLineFields.value.reduce((sum, item) => sum + fieldWidth(item), 0),
);
const validation = ref('');
const idempotencyKey = ref('');
const fxPreviewReady = ref(false);
const conversionRequiredMessage =
  '请填写回款日期、币种和金额，并等待人民币折算完成';
function setFxReady(value: boolean) {
  fxPreviewReady.value = value;
  if (value && validation.value === conversionRequiredMessage)
    validation.value = '';
}
watch(
  () => [
    props.open,
    values.value.receivedAt,
    values.value.currency,
    values.value.amount,
  ],
  () => {
    fxPreviewReady.value = false;
  },
  { flush: 'sync' },
);

function selectionValue(value: Value) {
  return typeof value === 'boolean' ? undefined : value;
}
function scalarValue(value: Value) {
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}
function textValue(value: Value) {
  return typeof value === 'string' ? value : undefined;
}

function selectMode(item: Field) {
  if (item.type === 'references') return 'tags';
  if (item.type === 'multiselect') return 'multiple';
  return undefined;
}
function makeValues(fields: Field[], initial: Record<string, unknown> = {}) {
  const prepared = initialFormValues(fields, initial);
  automatic.set(prepared.values, prepared.auto);
  return prepared.values;
}
function rowKey(line: FormValues) {
  const raw = toRaw(line);
  let key = rowKeys.get(raw);
  if (!key) {
    key = `line-${++rowSequence}`;
    rowKeys.set(raw, key);
  }
  return key;
}
function fieldWidth(item: Field) {
  if (item.type === 'select') return 300;
  if (['multiselect', 'references', 'textarea'].includes(item.type ?? ''))
    return 240;
  if (item.type === 'date') return 180;
  if (item.type === 'number' || item.type === 'decimal') return 150;
  if (item.type === 'boolean') return 100;
  return 220;
}
function removeLine(index: number) {
  if (props.saving) return;
  const line = lines.value[index];
  if (line) Reflect.deleteProperty(lineErrors.value, rowKey(line));
  lines.value.splice(index, 1);
  if (validated.value) collectErrors();
}
function settle(target: FormValues, fields: Field[]) {
  let auto = automatic.get(toRaw(target));
  if (!auto) {
    auto = {};
    automatic.set(toRaw(target), auto);
  }
  settleSources(fields, target, values.value, auto);
}
function addLine() {
  if (props.saving) return;
  const value = makeValues(props.definition?.lineFields ?? []);
  lines.value.push(value);
  settle(lines.value.at(-1)!, props.definition?.lineFields ?? []);
  if (validated.value) collectErrors();
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    values.value = makeValues(
      props.definition?.fields ?? [],
      props.definition?.initialValues,
    );
    lines.value = [];
    lineErrors.value = {};
    fieldErrors.value = {};
    validated.value = false;
    validation.value = '';
    idempotencyKey.value = newIdempotencyKey();
    if (props.definition?.fields.some((field) => field.key === 'sourceKey'))
      values.value.sourceKey = idempotencyKey.value;
    const initial = props.definition?.initialValues;
    if (initial) {
      for (const item of props.definition?.fields ?? [])
        if (initial[item.key] !== undefined)
          values.value[item.key] = initial[item.key] as Value;
      if (
        props.definition?.lineKey &&
        Array.isArray(initial[props.definition.lineKey])
      )
        lines.value = (initial[props.definition.lineKey] as FormValues[]).map(
          (line) => makeValues(props.definition?.lineFields ?? [], line),
        );
    }
    settle(values.value, props.definition?.fields ?? []);
    for (const line of lines.value)
      settle(line, props.definition?.lineFields ?? []);
    if (
      props.definition?.lineFields &&
      !props.definition.optionalLines &&
      lines.value.length === 0
    )
      addLine();
    initialDraft.value = formDraftSignature(values.value, lines.value);
  },
  { immediate: true },
);
function uploadedEvidence(item: Field) {
  return (
    props.evidenceReady &&
    ['attachmentIds', 'evidenceIds', 'evidenceRef'].includes(item.key)
  );
}
function fieldError(item: Field, data: FormValues): string {
  if (!fieldVisible(item, { ...values.value, ...data })) return '';
  const value = data[item.key];
  if (
    item.required &&
    !uploadedEvidence(item) &&
    (value === undefined || value === null || String(value).trim() === '')
  )
    return `请填写${item.label}`;
  if (
    value !== undefined &&
    value !== '' &&
    (item.type === 'number' || item.type === 'decimal')
  ) {
    if (!Number.isFinite(Number(value))) return `${item.label}需填写有效数字`;
    if (item.min !== undefined && Number(value) < item.min)
      return `${item.label}不能小于 ${item.min}`;
    if (item.type === 'number' && !Number.isInteger(Number(value)))
      return `${item.label}需为整数`;
  }
  return '';
}
function collectErrors() {
  const definition = props.definition;
  fieldErrors.value = {};
  lineErrors.value = {};
  const messages: string[] = [];
  for (const item of definition?.fields ?? []) {
    const error = fieldError(item, values.value);
    if (error) {
      fieldErrors.value[item.key] = error;
      messages.push(error);
    }
  }
  if (definition?.lineFields) {
    if (lines.value.length === 0 && !definition.optionalLines)
      messages.push('请至少添加一条明细');
    for (const [index, line] of lines.value.entries()) {
      const errors: Record<string, string> = {};
      for (const item of definition.lineFields) {
        const error = fieldError(item, line);
        if (error) {
          errors[item.key] = error;
          messages.push(`第 ${index + 1} 行：${error}`);
        }
      }
      if (Object.keys(errors).length > 0)
        lineErrors.value[rowKey(line)] = errors;
    }
  }
  validation.value =
    messages.length > 1
      ? `还有 ${messages.length} 项需要检查：${messages[0]}；其余请查看标红位置。`
      : (messages[0] ?? '');
  return messages.length === 0;
}
function focusFirstError() {
  void nextTick(() => {
    const first =
      actionBody.value?.querySelector<HTMLElement>(
        '.action-field-error, .line-cell-error',
      ) ?? lineTable.value;
    first?.scrollIntoView?.({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
    first
      ?.querySelector<HTMLElement>(
        'input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      )
      ?.focus({ preventScroll: true });
  });
}
watch(
  () => props.evidenceReady,
  () => {
    if (validated.value) collectErrors();
  },
);
function requestClose() {
  if (!props.saving) emit('close', hasChanges.value);
}
function clean(data: FormValues) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
}
function submit() {
  const definition = props.definition;
  if (!definition) return;
  if (props.saving) return;
  validated.value = true;
  if (!collectErrors()) {
    focusFirstError();
    return;
  }
  if (definition.action === 'CREATE_RECEIPT' && !fxPreviewReady.value) {
    validation.value = conversionRequiredMessage;
    return;
  }
  const payload: Record<string, unknown> = clean(values.value);
  if (definition.lineKey && lines.value.length > 0)
    payload[definition.lineKey] = lines.value.map(clean);
  emit('submit', payload, idempotencyKey.value);
}
function setValue(target: FormValues, key: string, value: unknown) {
  if (props.saving) return;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    target[key] = value;
  else if (Array.isArray(value))
    target[key] = value.filter(
      (entry) => typeof entry === 'string' || typeof entry === 'number',
    );
  else target[key] = undefined;
  const fields =
    target === values.value
      ? props.definition?.fields
      : props.definition?.lineFields;
  const auto = automatic.get(toRaw(target));
  if (auto) auto[key] = undefined;
  settle(target, fields ?? []);
  if (target === values.value)
    for (const line of lines.value)
      settle(line, props.definition?.lineFields ?? []);
  if (validated.value) collectErrors();
}
</script>

<template>
  <Modal
    :open="open"
    :title="definition?.title"
    :width="definition?.lineFields ? 'min(1320px, calc(100vw - 40px))' : 920"
    :confirm-loading="saving"
    :ok-text="definition?.submitLabel || '提交'"
    cancel-text="取消"
    :mask-closable="!saving"
    :closable="!saving"
    :keyboard="!saving"
    :cancel-button-props="{ disabled: saving }"
    :body-style="{ maxHeight: 'calc(100dvh - 200px)', overflowY: 'auto' }"
    :style="{ top: 'min(8vh, 64px)' }"
    @cancel="requestClose"
    @ok="submit"
  >
    <div v-if="definition" ref="actionBody" class="action-dialog">
      <Alert :message="definition.description" type="info" show-icon />
      <slot name="context"></slot>
      <Alert
        v-if="validation || error"
        :message="validation || error"
        type="error"
        show-icon
      />
      <Form layout="vertical" class="field-grid">
        <Form.Item
          v-for="item in definition.fields.filter(
            (entry) => !entry.hidden && fieldVisible(entry, values),
          )"
          :key="item.key"
          :label="item.label"
          :required="item.required && !uploadedEvidence(item)"
          :class="{
            wide: item.type === 'textarea',
            'action-field-error': fieldErrors[item.key],
          }"
          :help="fieldErrors[item.key]"
          :validate-status="fieldErrors[item.key] ? 'error' : undefined"
          :extra="
            uploadedEvidence(item)
              ? '已选择待上传附件，保存时自动关联；也可保留现有凭据选择。'
              : item.hint
          "
        >
          <RemoteMasterSelect
            v-if="item.masterType"
            :value="textValue(values[item.key])"
            :type="item.masterType"
            :disabled="item.disabled || saving"
            :placeholder="`搜索${item.label}`"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <RemoteStockSelect
            v-else-if="item.stockSource"
            :value="textValue(values[item.key])"
            :sku-id="textValue(values[item.stockSource.skuKey])"
            :spec-version="textValue(values[item.stockSource.specKey])"
            :warehouse-id="textValue(values[item.stockSource.warehouseKey])"
            :disabled="item.disabled || saving"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Select
            :disabled="item.disabled || saving"
            v-else-if="
              item.type === 'select' ||
              item.type === 'multiselect' ||
              item.type === 'references'
            "
            :mode="selectMode(item)"
            :value="selectionValue(values[item.key])"
            :options="availableOptions(item, values)"
            show-search
            option-filter-prop="label"
            allow-clear
            :placeholder="`请选择${item.label}`"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <AutoComplete
            :disabled="item.disabled || saving"
            v-else-if="item.type === 'reference'"
            :value="textValue(values[item.key])"
            :options="item.options"
            allow-clear
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Switch
            :disabled="item.disabled || saving"
            v-else-if="item.type === 'boolean'"
            :checked="Boolean(values[item.key])"
            @update:checked="(value) => setValue(values, item.key, value)"
          />
          <InputNumber
            :disabled="item.disabled || saving"
            v-else-if="item.type === 'number' || item.type === 'decimal'"
            :value="scalarValue(values[item.key])"
            :string-mode="item.type === 'decimal'"
            :precision="item.type === 'number' ? 0 : undefined"
            :min="item.min"
            style="width: 100%"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Textarea
            :disabled="item.disabled || saving"
            v-else-if="item.type === 'textarea'"
            :value="textValue(values[item.key])"
            :rows="3"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Input
            :disabled="item.disabled || saving"
            v-else
            :type="item.type === 'date' ? 'date' : 'text'"
            :value="textValue(values[item.key])"
            @update:value="(value) => setValue(values, item.key, value)"
          />
        </Form.Item>
      </Form>
      <ReceiptFxPreview
        v-if="definition.action === 'CREATE_RECEIPT'"
        :open="open"
        :date="textValue(values.receivedAt)"
        :currency="textValue(values.currency)"
        :amount="scalarValue(values.amount)"
        @ready="setFxReady"
      />
      <template v-if="definition.lineFields">
        <div class="line-header">
          <Space wrap>
            <strong>业务明细</strong>
            <span class="muted">共 {{ lines.length }} 条</span>
            <span v-if="definition.optionalLines" class="muted">可留空，按完整剩余范围执行</span>
          </Space>
          <Button :disabled="saving" @click="addLine">添加明细</Button>
        </div>
        <Form layout="vertical" class="line-form">
          <div ref="lineTable" class="line-table-scroll">
            <table
              class="line-table"
              aria-label="业务明细"
              :style="{ minWidth: `${lineTableWidth}px` }"
            >
              <colgroup>
                <col style="width: 56px" />
                <col
                  v-for="item in visibleLineFields"
                  :key="item.key"
                  :style="{ width: `${fieldWidth(item)}px` }"
                />
                <col style="width: 84px" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" class="line-number">序号</th>
                  <th
                    v-for="item in visibleLineFields"
                    :key="item.key"
                    scope="col"
                  >
                    <span
                      v-if="item.required"
                      class="required-mark"
                      aria-hidden="true"
                      >*</span>
                    {{ item.label }}
                  </th>
                  <th scope="col" class="line-operation">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, index) in lines" :key="rowKey(line)">
                  <th scope="row" class="line-number">{{ index + 1 }}</th>
                  <td
                    v-for="item in visibleLineFields"
                    :key="item.key"
                    :class="{
                      'line-cell-error': lineErrors[rowKey(line)]?.[item.key],
                    }"
                  >
                    <Form.Item
                      v-if="fieldVisible(item, { ...values, ...line })"
                      :help="lineErrors[rowKey(line)]?.[item.key] || item.hint"
                      :validate-status="
                        lineErrors[rowKey(line)]?.[item.key]
                          ? 'error'
                          : undefined
                      "
                    >
                      <RemoteMasterSelect
                        v-if="item.masterType"
                        :value="textValue(line[item.key])"
                        :type="item.masterType"
                        :disabled="item.disabled || saving"
                        :placeholder="`搜索${item.label}`"
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <Select
                        v-else-if="
                          item.type === 'select' ||
                          item.type === 'multiselect' ||
                          item.type === 'references'
                        "
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :mode="selectMode(item)"
                        :value="selectionValue(line[item.key])"
                        :options="availableOptions(item, line, values)"
                        :placeholder="`请选择${item.label}`"
                        show-search
                        option-filter-prop="label"
                        allow-clear
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <AutoComplete
                        v-else-if="item.type === 'reference'"
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :value="textValue(line[item.key])"
                        :options="item.options"
                        allow-clear
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <Switch
                        v-else-if="item.type === 'boolean'"
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :checked="Boolean(line[item.key])"
                        @update:checked="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <InputNumber
                        v-else-if="
                          item.type === 'number' || item.type === 'decimal'
                        "
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :value="scalarValue(line[item.key])"
                        :string-mode="item.type === 'decimal'"
                        :precision="item.type === 'number' ? 0 : undefined"
                        :min="item.min"
                        style="width: 100%"
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <Textarea
                        v-else-if="item.type === 'textarea'"
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :value="textValue(line[item.key])"
                        :auto-size="{ minRows: 1, maxRows: 3 }"
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                      <Input
                        v-else
                        :disabled="item.disabled || saving"
                        :aria-label="`第 ${index + 1} 行 ${item.label}`"
                        :type="item.type === 'date' ? 'date' : 'text'"
                        :value="textValue(line[item.key])"
                        @update:value="
                          (value) => setValue(line, item.key, value)
                        "
                      />
                    </Form.Item>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="line-operation">
                    <Button
                      :disabled="saving"
                      :aria-label="`删除第 ${index + 1} 行`"
                      size="small"
                      type="link"
                      danger
                      @click="removeLine(index)"
                    >
                      删除
                    </Button>
                  </td>
                </tr>
                <tr v-if="lines.length === 0">
                  <td
                    :colspan="visibleLineFields.length + 2"
                    class="line-empty"
                  >
                    {{
                      definition.optionalLines
                        ? '尚未指定明细，可添加明细或按完整剩余范围执行。'
                        : '暂无明细，请点击“添加明细”。'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Form>
      </template>
      <slot name="attachments"></slot>
      <p class="muted">
        提交成功后自动刷新当前单据；提交失败时保留已填写内容，方便检查后重试。
      </p>
    </div>
  </Modal>
</template>

<style scoped>
.action-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.wide {
  grid-column: 1 / -1;
}

.line-table-scroll {
  max-height: min(480px, 55vh);
  overflow: auto;
  border: 1px solid var(--ant-color-border, #e2e8f0);
  border-radius: 8px;
}

.line-table {
  width: 100%;
  table-layout: fixed;
  border-spacing: 0;
  border-collapse: separate;
}

.line-table th,
.line-table td {
  padding: 12px 10px;
  vertical-align: top;
  text-align: left;
  background: var(--ant-color-bg-container, #fff);
  border-bottom: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.line-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  font-weight: 600;
  background: var(--ant-color-fill-alter, #fafafa);
}

.line-table tbody tr:last-child > * {
  border-bottom: 0;
}

.line-table .line-number,
.line-table .line-operation {
  position: sticky;
  z-index: 1;
  text-align: center;
}

.line-table .line-number {
  left: 0;
  font-weight: 400;
}

.line-table .line-operation {
  right: 0;
  border-left: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.line-table thead .line-number,
.line-table thead .line-operation {
  z-index: 3;
}

.line-table .line-empty {
  padding: 24px;
  color: var(--ant-color-text-secondary, #64748b);
  text-align: center;
}

.line-form :deep(.ant-form-item) {
  margin-bottom: 0;
}

.line-form :deep(.ant-select),
.line-form :deep(.ant-input-number) {
  width: 100%;
}

.required-mark {
  margin-right: 4px;
  color: var(--ant-color-error, #ff4d4f);
}

.line-header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.muted {
  margin-bottom: 0;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 620px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
