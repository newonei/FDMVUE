<script setup lang="ts">
import type { Contract } from '#/api/fdmplatform';

import { computed, ref } from 'vue';

import { Alert, Checkbox, Input, InputNumber, Modal } from 'ant-design-vue';

import { contractAction, newIdempotencyKey } from '#/api/fdmplatform';

import { errorText } from '../data';
import {
  contractConfigurationFrom,
  contractConfigurationSummary,
} from '../products/components/contract-product-configuration';

const props = defineProps<{ contract: Contract }>();
const emit = defineEmits<{ close: []; saved: [value: Contract] }>();

const dimensionFields = [
  { key: 'lengthMm', label: '长（mm）' },
  { key: 'widthMm', label: '宽（mm）' },
  { key: 'thicknessMm', label: '厚（mm）' },
] as const;
const contractId = props.contract.id;
const expectedVersion = props.contract.version;
const entries = ref(
  props.contract.items.map((item, index) => {
    const configuration = contractConfigurationFrom(item);
    const original = {
      lengthMm: configuration.lengthMm ?? undefined,
      widthMm: configuration.widthMm ?? undefined,
      thicknessMm: configuration.finishedThicknessMm ?? undefined,
    };
    return {
      item,
      index: index + 1,
      original,
      dimensions: { ...original },
      blockReason: props.contract.itemSpecCorrectionBlockReasons?.[item.id],
      selected: false,
    };
  }),
);
const reason = ref('');
const saving = ref(false);
const saveError = ref('');
const selected = computed(() =>
  entries.value.filter((entry) => entry.selected && !entry.blockReason),
);
const inputsValid = computed(() =>
  selected.value.every(
    ({ dimensions, original }) =>
      dimensionFields.every(({ key }) => {
        const value = dimensions[key];
        return typeof value === 'number' && Number.isFinite(value) && value > 0;
      }) &&
      dimensionFields.some(({ key }) => dimensions[key] !== original[key]),
  ),
);
const canSave = computed(
  () => selected.value.length > 0 && inputsValid.value && !!reason.value.trim(),
);
let attempt: undefined | { fingerprint: string; key: string };

async function save() {
  if (!canSave.value || saving.value) return;
  const payload = {
    items: selected.value.map(({ dimensions, item }) => ({
      contractItemId: item.id,
      ...dimensions,
    })),
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
      勾选尺寸有误的明细，填写正确尺寸。保存后同步关联的采购申请和采购草稿。
    </p>
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
          原尺寸 {{ entry.item.size || entry.item.specification || '未维护' }} ·
          {{ entry.item.quantity }} {{ entry.item.unit }}
        </div>
        <div class="correction-item-meta">
          {{ contractConfigurationSummary(entry.item) }}
        </div>
        <div v-if="entry.blockReason" class="correction-item-meta">
          {{ entry.blockReason }}
        </div>
        <div v-if="entry.selected" class="correction-dimensions">
          <label v-for="field in dimensionFields" :key="field.key">
            {{ field.label }}
            <InputNumber
              v-model:value="entry.dimensions[field.key]"
              :disabled="saving"
              :controls="false"
              :aria-label="`第 ${entry.index} 行${field.label}`"
            />
          </label>
        </div>
      </div>
    </div>
    <p v-if="selected.length && !inputsValid" role="status">
      请为每条选中明细填写大于零的长、宽、厚，并修改至少一项尺寸。
    </p>
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
.correction-intro {
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

.correction-dimensions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 8px 0 0 24px;
}

.correction-dimensions label,
.correction-reason {
  display: grid;
  gap: 4px;
}

.correction-dimensions :deep(.ant-input-number) {
  width: 100%;
}

.correction-reason {
  margin-bottom: 12px;
}
</style>
