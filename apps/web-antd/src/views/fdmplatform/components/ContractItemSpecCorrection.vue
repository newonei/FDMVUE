<script setup lang="ts">
import type { ContractConfigurationField } from '../products/components/contract-product-configuration';

import type { Contract, ContractItem } from '#/api/fdmplatform';
import type {
  ProductAttributeOptions,
  ProductConfiguration,
} from '#/api/fdmplatform/products';

import { computed, onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';

import { contractAction, newIdempotencyKey } from '#/api/fdmplatform';
import { getProductAttributeOptions } from '#/api/fdmplatform/products';

import { errorText } from '../data';
import {
  contractConfigurationChoices,
  contractConfigurationFields,
  contractConfigurationFrom,
  contractConfigurationSummary,
} from '../products/components/contract-product-configuration';

const props = defineProps<{ contract: Contract }>();
const emit = defineEmits<{ close: []; saved: [value: Contract] }>();

const fields = contractConfigurationFields.filter(({ key }) => key !== 'name');
const contractId = props.contract.id;
const expectedVersion = props.contract.version;
const entries = ref(
  props.contract.items.map((item, index) => ({
    item,
    index: index + 1,
    draft: correctionConfigurationFrom(item),
    blockReason: props.contract.itemSpecCorrectionBlockReasons?.[item.id],
    selected: false,
  })),
);
const reason = ref('');
const saving = ref(false);
const saveError = ref('');
const options = ref<ProductAttributeOptions>();
const optionsLoading = ref(false);
const optionsError = ref('');

const selected = computed(() =>
  entries.value.filter((entry) => entry.selected && !entry.blockReason),
);
const canSave = computed(
  () =>
    selected.value.length > 0 &&
    selected.value.every(({ item, draft }) => !inputError(item, draft)) &&
    !!reason.value.trim(),
);
let attempt: undefined | { fingerprint: string; key: string };

async function loadOptions() {
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    options.value = await getProductAttributeOptions(props.contract.companyId);
  } catch (error) {
    optionsError.value = errorText(error);
  } finally {
    optionsLoading.value = false;
  }
}
onMounted(loadOptions);

function correctionConfigurationFrom(item: ContractItem): ProductConfiguration {
  const configuration = contractConfigurationFrom(item);
  if (configuration.colorMode !== 'SINGLE') {
    configuration.frontColor = item.frontColor ?? '';
    configuration.backColor = item.backColor ?? '';
  }
  return configuration;
}

function linePayload(contractItemId: string, draft: ProductConfiguration) {
  const frontColor = draft.frontColor?.trim() ?? '';
  const noPattern = draft.patternMode === 'NONE';
  return {
    contractItemId,
    lengthMm: draft.lengthMm ?? null,
    widthMm: draft.widthMm ?? null,
    thicknessMm: draft.finishedThicknessMm ?? null,
    colorMode: draft.colorMode || 'UNKNOWN',
    frontColor,
    backColor:
      draft.colorMode === 'SINGLE'
        ? frontColor
        : (draft.backColor?.trim() ?? ''),
    textureFront: draft.textureFront?.trim() ?? '',
    textureBack: draft.textureBack?.trim() ?? '',
    patternMode: draft.patternMode || 'UNKNOWN',
    patternCode: noPattern ? '' : (draft.patternCode?.trim() ?? ''),
    patternVersion: noPattern ? '' : (draft.patternVersion?.trim() ?? ''),
  };
}

function inputError(item: ContractItem, draft: ProductConfiguration) {
  const payload = linePayload(item.id, draft);
  if (
    [payload.lengthMm, payload.widthMm, payload.thicknessMm].some(
      (value) =>
        value === null ||
        !Number.isFinite(value) ||
        value < 0.001 ||
        value > 10_000_000,
    )
  )
    return '请填写大于零的长、宽、厚';
  if (
    payload.colorMode === 'DUAL' &&
    payload.frontColor &&
    payload.backColor &&
    payload.frontColor.toUpperCase() === payload.backColor.toUpperCase()
  )
    return '双色的正反面颜色必须不同';
  const original = linePayload(item.id, {
    ...correctionConfigurationFrom(item),
    lengthMm: item.lengthMm,
    widthMm: item.widthMm,
    finishedThicknessMm: item.finishedThicknessMm,
  });
  return JSON.stringify(payload) === JSON.stringify(original)
    ? '请至少更正一项规格'
    : '';
}

function updateField(
  draft: ProductConfiguration,
  field: ContractConfigurationField,
  value: unknown,
) {
  Object.assign(draft, {
    [field]: value ?? (field.endsWith('Mm') ? null : ''),
  });
  if (draft.colorMode === 'SINGLE') draft.backColor = draft.frontColor;
  if (draft.patternMode === 'NONE') {
    draft.patternCode = '';
    draft.patternVersion = '';
  }
  saveError.value = '';
}

function choices(
  field: ContractConfigurationField,
  item: ContractItem,
  draft: ProductConfiguration,
) {
  return contractConfigurationChoices(
    field,
    draft[field],
    options.value,
    item,
  ).filter(({ value }) => value !== 'UNKNOWN');
}

async function save() {
  if (!canSave.value || saving.value) return;
  const payload = {
    items: selected.value.map(({ draft, item }) => linePayload(item.id, draft)),
    reason: reason.value.trim(),
  };
  const fingerprint = JSON.stringify(payload);
  if (attempt?.fingerprint !== fingerprint) {
    attempt = { fingerprint, key: newIdempotencyKey() };
  }
  saving.value = true;
  saveError.value = '';
  try {
    const result = await contractAction(
      contractId,
      'CORRECT_CONTRACT_ITEM_SPEC',
      expectedVersion,
      attempt.key,
      payload,
    );
    emit('saved', result);
  } catch (error) {
    saveError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    open
    title="更正合同明细规格"
    width="min(760px, 94vw)"
    ok-text="保存更正"
    :ok-button-props="{ disabled: !canSave }"
    :cancel-button-props="{ disabled: saving }"
    :confirm-loading="saving"
    :closable="!saving"
    :keyboard="!saving"
    :mask-closable="false"
    :z-index="2100"
    @cancel="!saving && emit('close')"
    @ok="save"
  >
    <p class="correction-intro">
      勾选需要更正的明细。颜色、纹路和雕刻可留空，保存后同步关联的采购申请和采购草稿。
    </p>
    <Alert
      v-if="optionsError"
      :message="optionsError"
      class="correction-options"
      type="error"
      show-icon
    >
      <template #action>
        <Button size="small" @click="loadOptions">重新加载规格选项</Button>
      </template>
    </Alert>
    <div class="correction-items" aria-label="合同明细">
      <div
        v-for="entry in entries"
        :key="entry.item.id"
        class="correction-item"
      >
        <Checkbox
          v-model:checked="entry.selected"
          :disabled="saving || !!entry.blockReason"
        >
          {{ entry.index }}. {{ entry.item.skuName }}
          <span v-if="entry.item.skuCode">（{{ entry.item.skuCode }}）</span>
        </Checkbox>
        <div class="correction-item-meta">
          原规格 {{ entry.item.size || entry.item.specification || '未维护' }} ·
          {{ entry.item.quantity }} {{ entry.item.unit }}
        </div>
        <div class="correction-item-meta">
          {{ contractConfigurationSummary(entry.item) }}
        </div>
        <div v-if="entry.blockReason" class="correction-item-meta">
          {{ entry.blockReason }}
        </div>
        <template v-if="entry.selected">
          <div class="correction-fields">
            <label
              v-for="field in fields"
              v-show="
                (field.key !== 'patternCode' &&
                  field.key !== 'patternVersion') ||
                entry.draft.patternMode === 'LASER'
              "
              :key="field.key"
              :for="`correction-${entry.index}-${field.key}`"
            >
              {{ field.label }}
              <InputNumber
                v-if="field.type === 'number'"
                :id="`correction-${entry.index}-${field.key}`"
                :value="entry.draft[field.key] ?? undefined"
                :disabled="saving"
                :min="0.001"
                :max="10_000_000"
                :precision="3"
                :controls="false"
                :aria-label="`第 ${entry.index} 行${field.label}`"
                @update:value="
                  (value) => updateField(entry.draft, field.key, value)
                "
              />
              <Select
                v-else-if="field.type === 'select'"
                :id="`correction-${entry.index}-${field.key}`"
                :value="
                  entry.draft[field.key] === 'UNKNOWN'
                    ? undefined
                    : entry.draft[field.key] || undefined
                "
                :options="choices(field.key, entry.item, entry.draft)"
                :disabled="
                  saving ||
                  !options ||
                  (field.key === 'backColor' &&
                    entry.draft.colorMode === 'SINGLE')
                "
                :loading="optionsLoading"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="选填"
                :aria-label="`第 ${entry.index} 行${field.label}`"
                @update:value="
                  (value) => updateField(entry.draft, field.key, value)
                "
              />
              <Input
                v-else
                :id="`correction-${entry.index}-${field.key}`"
                :value="entry.draft[field.key] ?? undefined"
                :disabled="saving"
                :maxlength="100"
                placeholder="选填"
                :aria-label="`第 ${entry.index} 行${field.label}`"
                @update:value="
                  (value) => updateField(entry.draft, field.key, value)
                "
              />
            </label>
          </div>
          <p
            v-if="inputError(entry.item, entry.draft)"
            class="correction-item-meta"
          >
            {{ inputError(entry.item, entry.draft) }}
          </p>
        </template>
      </div>
    </div>
    <label class="correction-reason">
      更正原因（必填）
      <Input.TextArea
        v-model:value="reason"
        :disabled="saving"
        :maxlength="1000"
        :rows="3"
        aria-label="更正原因"
      />
    </label>
    <Alert v-if="saveError" :message="saveError" type="error" show-icon />
  </Modal>
</template>

<style scoped>
.correction-intro,
.correction-options {
  margin-bottom: 12px;
}

.correction-items {
  max-height: 47vh;
  margin-bottom: 12px;
  overflow-y: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.correction-item {
  padding: 10px 12px;
}

.correction-item + .correction-item {
  border-top: 1px solid hsl(var(--border));
}

.correction-item-meta {
  margin: 3px 0 0 24px;
  color: hsl(var(--muted-foreground));
}

.correction-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 8px 0 0 24px;
}

.correction-fields label,
.correction-reason {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.correction-fields :deep(.ant-input-number) {
  width: 100%;
}

.correction-reason {
  margin-bottom: 12px;
}

@media (max-width: 600px) {
  .correction-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
