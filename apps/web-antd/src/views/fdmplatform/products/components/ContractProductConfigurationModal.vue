<script setup lang="ts">
import type { ContractConfigurationField } from './contract-product-configuration';

import type { ContractItem } from '#/api/fdmplatform';
import type {
  ProductAttributeOptions,
  ProductConfiguration,
  ProductConfigurationItem,
  ProductConfigurationResult,
  TaxBasis,
} from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getProduct,
  getProductAttributeOptions,
  previewProductConfigurations,
  resolveProductConfigurations,
  resolveProducts,
} from '#/api/fdmplatform/products';

import {
  contractConfigurationFields,
  contractConfigurationFrom,
  contractConfigurationItems,
} from './contract-product-configuration';

const props = defineProps<{
  bulk?: boolean;
  companyId: number;
  currency: string;
  items: ContractItem[];
  open: boolean;
  taxBasis: TaxBasis;
}>();
const emit = defineEmits<{
  close: [];
  resolved: [items: Array<{ lineId: string; snapshot: ContractItem }>];
}>();
const draft = ref<ProductConfiguration>({ name: '' });
const fields = ref<ContractConfigurationField[]>([]);
const onlyEmpty = ref(false);
const options = ref<ProductAttributeOptions>();
const preview = ref<ProductConfigurationResult>();
const previewItems = ref<ProductConfigurationItem[]>();
const key = ref('');
const busy = ref(false);
const optionsLoading = ref(false);
const sourceReady = ref(false);
const sourceItems = ref<ContractItem[]>([]);
const errorMessage = ref('');
let version = 0;
const canResolve = computed(() => {
  const rows = preview.value?.items ?? [];
  const expected = new Set(props.items.map((item) => item.id));
  return (
    rows.length > 0 &&
    rows.length === expected.size &&
    new Set(rows.map((row) => row.lineId)).size === expected.size &&
    rows.every(
      (row) =>
        expected.has(row.lineId) &&
        row.outcome !== 'INVALID' &&
        row.errors.length === 0,
    )
  );
});
function text(error: unknown) {
  return (
    (error as { message?: string; msg?: string })?.msg ||
    (error as Error)?.message ||
    '请求失败，请重试'
  );
}
function invalidate() {
  preview.value = undefined;
  previewItems.value = undefined;
  key.value = '';
  errorMessage.value = '';
}
async function load() {
  const current = ++version;
  if (!props.open) return;
  sourceReady.value = false;
  sourceItems.value = props.items.map((item) => ({ ...item }));
  draft.value = props.items[0]
    ? contractConfigurationFrom(props.items[0])
    : { name: '' };
  fields.value = props.bulk
    ? []
    : contractConfigurationFields.map((field) => field.key);
  onlyEmpty.value = false;
  invalidate();
  optionsLoading.value = true;
  try {
    const missing = [
      ...new Set(
        props.items
          .filter((item) => !item.configurationName)
          .map((item) => item.skuId),
      ),
    ];
    const [result, products] = await Promise.all([
      getProductAttributeOptions(),
      Promise.all(missing.map((id) => getProduct(id, props.companyId))),
    ]);
    if (current !== version) return;
    options.value = result;
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    sourceItems.value = props.items.map((item) => ({
      ...item,
      configurationName: item.configurationName || names.get(item.skuId),
    }));
    draft.value = sourceItems.value[0]
      ? contractConfigurationFrom(sourceItems.value[0])
      : { name: '' };
    sourceReady.value = true;
  } catch (error) {
    if (current === version) errorMessage.value = text(error);
  } finally {
    if (current === version) optionsLoading.value = false;
  }
}
watch(() => props.open, load, { immediate: true });
onBeforeUnmount(() => {
  ++version;
});
function set(field: ContractConfigurationField, value: unknown) {
  Object.assign(draft.value, {
    [field]: value ?? (field.endsWith('Mm') ? null : ''),
  });
  if (
    (field === 'colorMode' || field === 'frontColor') &&
    draft.value.colorMode === 'SINGLE'
  )
    draft.value.backColor = draft.value.frontColor;
  if (field === 'patternMode' && draft.value.patternMode === 'NONE') {
    draft.value.patternCode = '';
    draft.value.patternVersion = '';
  }
  invalidate();
}
function numberValue(field: ContractConfigurationField) {
  return (draft.value[field] ?? undefined) as number | undefined;
}
function stringValue(field: ContractConfigurationField) {
  return draft.value[field] as string | undefined;
}
function choices(field: ContractConfigurationField) {
  if (field === 'colorMode')
    return [
      { value: 'UNKNOWN', label: '待确认' },
      { value: 'SINGLE', label: '单色' },
      { value: 'DUAL', label: '双色' },
    ];
  if (field === 'patternMode')
    return [
      { value: 'UNKNOWN', label: '待确认' },
      { value: 'NONE', label: '不雕刻' },
      { value: 'LASER', label: '激光雕刻' },
    ];
  let available = options.value?.colors ?? [];
  if (field === 'patternCode') available = options.value?.patterns ?? [];
  else if (field.startsWith('texture'))
    available = options.value?.textures ?? [];
  const value = draft.value[field];
  const current = props.items[0];
  const labels: Partial<Record<ContractConfigurationField, null | string>> = {
    frontColor: current?.frontColorLabel,
    backColor: current?.backColorLabel,
    textureFront: current?.textureFrontLabel,
    textureBack: current?.textureBackLabel,
  };
  const label = labels[field];
  return typeof value === 'string' &&
    value &&
    !available.some((option) => option.value === value)
    ? [...available, { value, label: label || value }]
    : available;
}
async function loadPreview() {
  if (busy.value || !sourceReady.value || fields.value.length === 0) return;
  const current = version;
  busy.value = true;
  errorMessage.value = '';
  preview.value = undefined;
  const items = contractConfigurationItems(
    sourceItems.value,
    draft.value,
    fields.value,
    props.bulk && onlyEmpty.value,
  );
  try {
    const result = await previewProductConfigurations({
      companyId: props.companyId,
      items,
    });
    if (current !== version) return;
    preview.value = result;
    previewItems.value = items;
    key.value = newIdempotencyKey();
  } catch (error) {
    if (current === version) errorMessage.value = text(error);
  } finally {
    busy.value = false;
  }
}
async function adopt() {
  if (busy.value || !canResolve.value || !previewItems.value) return;
  const current = version;
  busy.value = true;
  errorMessage.value = '';
  let readingSnapshots = false;
  try {
    const result = await resolveProductConfigurations({
      companyId: props.companyId,
      idempotencyKey: key.value,
      items: previewItems.value,
    });
    const expected = new Set(props.items.map((item) => item.id));
    if (
      result.items.length !== expected.size ||
      new Set(result.items.map((row) => row.lineId)).size !== expected.size ||
      result.items.some(
        (row) =>
          !expected.has(row.lineId) ||
          !row.product ||
          row.outcome === 'INVALID',
      )
    )
      throw new Error('SKU 识别结果不完整，请重新预览');
    const products = result.items.map((row) => row.product!);
    const unique = [
      ...new Map(products.map((product) => [product.id, product])).values(),
    ];
    readingSnapshots = true;
    const snapshots = await resolveProducts({
      companyId: props.companyId,
      currency: props.currency,
      taxBasis: props.taxBasis,
      items: unique.map((product) => ({
        productId: product.id,
        productVersion: product.version,
      })),
    });
    const mapped = result.items.map((row) => {
      const snapshot = snapshots.find((item) => item.skuId === row.product!.id);
      if (!snapshot) throw new Error('产品快照读取不完整，请重试采用 SKU');
      return { lineId: row.lineId, snapshot };
    });
    if (current === version && props.open) emit('resolved', mapped);
  } catch (error) {
    if (current === version) {
      const message = text(error);
      if (readingSnapshots && /变化|更新|版本/.test(message)) {
        invalidate();
        errorMessage.value = `${message}；产品档案已变化，请重新预览 SKU 后采用。`;
      } else errorMessage.value = message;
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="bulk ? `批量设置本单产品配置 · ${items.length} 行` : '本单产品配置'"
    :width="1000"
    :footer="null"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="false"
    @cancel="!busy && emit('close')"
  >
    <Spin :spinning="optionsLoading">
      <p class="text-sm text-muted-foreground">
        名称、长宽厚、单双色、两面颜色和两面纹路共同识别底垫；雕刻图案及版本识别成品。先预览复用或新增结果，再采用对应
        SKU。
      </p>
      <p v-if="bulk" class="text-sm text-muted-foreground">
        仅应用勾选字段，其他字段保留各行原值；单色反面随正面同色，不雕刻时清空图案和版本。
      </p>
      <fieldset
        :disabled="busy || optionsLoading"
        :inert="busy || optionsLoading || undefined"
        class="m-0 min-w-0 border-0 p-0"
      >
        <div class="configuration-fields">
          <div
            v-for="field in contractConfigurationFields"
            :key="field.key"
            class="flex min-w-0 flex-col gap-1"
          >
            <Checkbox
              v-if="bulk"
              :checked="fields.includes(field.key)"
              :aria-label="`批量设置${field.label}`"
              @update:checked="
                (checked) => {
                  fields = checked
                    ? [...fields, field.key]
                    : fields.filter((key) => key !== field.key);
                  invalidate();
                }
              "
            >
              {{ field.label }}
            </Checkbox>
            <label v-else :for="`contract-config-${field.key}`">{{
              field.label
            }}</label>
            <InputNumber
              v-if="field.type === 'number'"
              :id="`contract-config-${field.key}`"
              :value="numberValue(field.key)"
              :min="0"
              :precision="3"
              :disabled="bulk && !fields.includes(field.key)"
              @update:value="(value) => set(field.key, value)"
            />
            <Select
              v-else-if="field.type === 'select'"
              :id="`contract-config-${field.key}`"
              :value="draft[field.key] || undefined"
              :options="choices(field.key)"
              :disabled="
                (bulk && !fields.includes(field.key)) ||
                (!bulk &&
                  field.key === 'backColor' &&
                  draft.colorMode === 'SINGLE') ||
                (!bulk &&
                  field.key === 'patternCode' &&
                  draft.patternMode !== 'LASER')
              "
              allow-clear
              show-search
              option-filter-prop="label"
              placeholder="待确认 / 请选择"
              @update:value="(value) => set(field.key, value)"
            />
            <Input
              v-else
              :id="`contract-config-${field.key}`"
              :value="stringValue(field.key)"
              :disabled="
                (bulk && !fields.includes(field.key)) ||
                (!bulk &&
                  field.key === 'patternVersion' &&
                  draft.patternMode !== 'LASER')
              "
              :maxlength="field.key === 'name' ? 200 : 100"
              :placeholder="
                field.key === 'patternVersion'
                  ? '填写实际图稿版本，不自动补值'
                  : undefined
              "
              @update:value="(value) => set(field.key, value)"
            />
          </div>
        </div>
        <Checkbox
          v-if="bulk"
          class="mt-3"
          :checked="onlyEmpty"
          @update:checked="
            (checked) => {
              onlyEmpty = checked;
              invalidate();
            }
          "
        >
          只填空项（已确认不压纹、不雕刻不属于空项）
        </Checkbox>
      </fieldset>
    </Spin>
    <Alert
      v-if="errorMessage"
      class="mt-3"
      type="error"
      show-icon
      :message="errorMessage"
    />
    <Button v-if="!sourceReady && !optionsLoading" class="mt-2" @click="load">
      重新加载配置
    </Button>
    <div
      v-if="preview"
      class="mt-4 flex flex-col gap-2"
      aria-label="SKU 识别预览"
    >
      <div
        v-for="row in preview.items"
        :key="row.lineId"
        class="rounded border p-3"
      >
        <div class="flex flex-wrap gap-2">
          <b>{{ items.find((item) => item.id === row.lineId)?.skuName }}</b><Tag
            :color="
              row.outcome === 'INVALID'
                ? 'red'
                : row.outcome === 'CREATE'
                  ? 'blue'
                  : 'green'
            "
          >
            {{
              row.outcome === 'INVALID'
                ? '配置无效'
                : row.outcome === 'CREATE'
                  ? '新增成品 SKU'
                  : '复用成品 SKU'
            }}
</Tag><span v-if="row.product?.code">{{ row.product.code }}</span>
        </div>
        <p
          v-if="row.configuration"
          class="mb-0 mt-1 text-xs text-muted-foreground"
        >
          {{ row.configuration.name }} · {{ row.configuration.lengthMm }} ×
          {{ row.configuration.widthMm }} ×
          {{ row.configuration.finishedThicknessMm }} mm ·
          {{
            row.configuration.patternMode === 'LASER'
              ? `${row.configuration.patternCode} / ${row.configuration.patternVersion}`
              : row.configuration.patternMode === 'NONE'
                ? '不雕刻'
                : '雕刻待确认'
          }}
        </p>
        <p v-if="row.errors.length" class="mb-0 mt-1 text-sm text-destructive">
          {{ row.errors.join('；') }}
        </p>
      </div>
    </div>
    <p class="mt-3 text-xs text-muted-foreground">
      采用 SKU
      会保留本行数量、成交单价、交期、备注及合同图稿，清除旧参考价来源；请核对成交价。合同内容仍需保存后生效。
    </p>
    <div class="mt-4 flex justify-end gap-2 border-t pt-3">
      <Button :disabled="busy" @click="emit('close')">取消</Button>
      <Button
        :loading="busy && !preview"
        :disabled="busy || optionsLoading || !sourceReady || !fields.length"
        @click="loadPreview"
      >
        预览 SKU
      </Button>
      <Button
        type="primary"
        :loading="busy && !!preview"
        :disabled="busy || !canResolve"
        @click="adopt"
      >
        确认采用 SKU
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.configuration-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.configuration-fields :deep(.ant-input-number) {
  width: 100%;
}

@media (max-width: 650px) {
  .configuration-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
