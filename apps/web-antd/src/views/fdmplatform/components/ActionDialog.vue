<script setup lang="ts">
import type { ActionDefinition, Field } from '../data';

import { ref, watch } from 'vue';

import {
  Alert,
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

type Value = (number | string)[] | boolean | number | string | undefined;
type FormValues = Record<string, Value>;
const props = defineProps<{
  definition?: ActionDefinition;
  error?: string;
  open: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [];
  submit: [payload: Record<string, unknown>, idempotencyKey: string];
}>();
const values = ref<FormValues>({});
const lines = ref<FormValues[]>([]);
const validation = ref('');
const idempotencyKey = ref('');

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

function defaults(fields: Field[]) {
  return Object.fromEntries(
    fields.map((item) => [
      item.key,
      item.default ?? (item.type === 'boolean' ? false : undefined),
    ]),
  );
}
function addLine() {
  lines.value.push(defaults(props.definition?.lineFields ?? []));
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    values.value = defaults(props.definition?.fields ?? []);
    lines.value = [];
    validation.value = '';
    idempotencyKey.value = newIdempotencyKey();
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
          (line) => ({ ...line }),
        );
    }
    if (
      props.definition?.lineFields &&
      !props.definition.optionalLines &&
      lines.value.length === 0
    )
      addLine();
  },
);
function validate(fields: Field[], data: FormValues, prefix = ''): string {
  for (const item of fields) {
    const value = data[item.key];
    if (
      item.required &&
      (value === undefined || value === null || String(value).trim() === '')
    )
      return `${prefix}请填写${item.label}`;
    if (
      value !== undefined &&
      value !== '' &&
      (item.type === 'number' || item.type === 'decimal')
    ) {
      if (!Number.isFinite(Number(value)))
        return `${prefix}${item.label}需填写有效数字`;
      if (item.min !== undefined && Number(value) < item.min)
        return `${prefix}${item.label}不能小于 ${item.min}`;
      if (item.type === 'number' && !Number.isInteger(Number(value)))
        return `${prefix}${item.label}需为整数`;
    }
  }
  return '';
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
  validation.value = validate(definition.fields, values.value);
  if (validation.value) return;
  if (definition.lineFields) {
    if (lines.value.length === 0 && !definition.optionalLines) {
      validation.value = '请至少添加一条明细';
      return;
    }
    for (const [index, line] of lines.value.entries()) {
      validation.value = validate(
        definition.lineFields,
        line,
        `第 ${index + 1} 行：`,
      );
      if (validation.value) return;
    }
  }
  const payload: Record<string, unknown> = clean(values.value);
  if (definition.lineKey && lines.value.length > 0)
    payload[definition.lineKey] = lines.value.map(clean);
  emit('submit', payload, idempotencyKey.value);
}
function setValue(target: FormValues, key: string, value: unknown) {
  target[key] =
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? value
      : Array.isArray(value)
        ? value.filter(
            (entry) => typeof entry === 'string' || typeof entry === 'number',
          )
        : undefined;
  const fields =
    target === values.value
      ? props.definition?.fields
      : props.definition?.lineFields;
  const selected = fields
    ?.find((item) => item.key === key)
    ?.options?.find((option) => option.value === value);
  if (selected?.fill) Object.assign(target, selected.fill);
}
</script>

<template>
  <Modal
    :open="open"
    :title="definition?.title"
    :width="920"
    :confirm-loading="saving"
    :ok-text="definition?.submitLabel || '提交'"
    cancel-text="取消"
    :mask-closable="!saving"
    :closable="!saving"
    :keyboard="!saving"
    :cancel-button-props="{ disabled: saving }"
    @cancel="emit('close')"
    @ok="submit"
  >
    <div v-if="definition" class="action-dialog">
      <Alert :message="definition.description" type="info" show-icon />
      <Alert
        v-if="validation || error"
        :message="validation || error"
        type="error"
        show-icon
      />
      <Form layout="vertical" class="field-grid">
        <Form.Item
          v-for="item in definition.fields"
          :key="item.key"
          :label="item.label"
          :required="item.required"
          :class="{ wide: item.type === 'textarea' }"
          :extra="item.hint"
        >
          <Select
            v-if="item.type === 'select' || item.type === 'multiselect'"
            :mode="item.type === 'multiselect' ? 'multiple' : undefined"
            :value="selectionValue(values[item.key])"
            :options="item.options"
            show-search
            option-filter-prop="label"
            allow-clear
            :placeholder="`请选择${item.label}`"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Switch
            v-else-if="item.type === 'boolean'"
            :checked="Boolean(values[item.key])"
            @update:checked="(value) => setValue(values, item.key, value)"
          />
          <InputNumber
            v-else-if="item.type === 'number' || item.type === 'decimal'"
            :value="scalarValue(values[item.key])"
            :string-mode="item.type === 'decimal'"
            :precision="item.type === 'number' ? 0 : undefined"
            :min="item.min"
            style="width: 100%"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Textarea
            v-else-if="item.type === 'textarea'"
            :value="textValue(values[item.key])"
            :rows="3"
            @update:value="(value) => setValue(values, item.key, value)"
          />
          <Input
            v-else
            :type="item.type === 'date' ? 'date' : 'text'"
            :value="textValue(values[item.key])"
            @update:value="(value) => setValue(values, item.key, value)"
          />
        </Form.Item>
      </Form>
      <template v-if="definition.lineFields">
        <Space class="line-header">
          <strong>业务明细</strong><Button size="small" @click="addLine">添加明细</Button><span v-if="definition.optionalLines" class="muted">可留空，按完整剩余范围执行</span>
        </Space>
        <div v-for="(line, index) in lines" :key="index" class="line-card">
          <div class="line-header">
            <strong>明细 {{ index + 1 }}</strong><Button
              size="small"
              type="text"
              danger
              @click="lines.splice(index, 1)"
            >
              移除
            </Button>
          </div>
          <Form layout="vertical" class="field-grid">
            <Form.Item
              v-for="item in definition.lineFields"
              :key="item.key"
              :label="item.label"
              :required="item.required"
            >
              <Select
                v-if="item.type === 'select'"
                :value="scalarValue(line[item.key])"
                :options="item.options"
                show-search
                option-filter-prop="label"
                allow-clear
                @update:value="(value) => setValue(line, item.key, value)"
              />
              <InputNumber
                v-else-if="item.type === 'number' || item.type === 'decimal'"
                :value="scalarValue(line[item.key])"
                :string-mode="item.type === 'decimal'"
                :precision="item.type === 'number' ? 0 : undefined"
                :min="item.min"
                style="width: 100%"
                @update:value="(value) => setValue(line, item.key, value)"
              />
              <Input
                v-else
                :type="item.type === 'date' ? 'date' : 'text'"
                :value="textValue(line[item.key])"
                @update:value="(value) => setValue(line, item.key, value)"
              />
            </Form.Item>
          </Form>
        </div>
      </template>
      <p class="muted">
        重复点击及网络重试沿用本次请求标识。版本已变化时，请关闭窗口，刷新单据后重新操作。
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

.line-card {
  padding: 12px 16px 0;
  border: 1px solid var(--ant-color-border, #e2e8f0);
  border-radius: 10px;
}

.line-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
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
