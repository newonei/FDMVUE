<script setup lang="ts">
import type { CustomerOptions } from '#/api/fdmplatform/customers';

import { ref, watch } from 'vue';

import { Alert, Input, message, Modal } from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getCustomerOptions,
  saveCustomerSources,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [options: CustomerOptions] }>();
const values = ref('');
const version = ref(-1);
const loading = ref(false);
const loaded = ref(false);
const saving = ref(false);
const loadError = ref('');
const requestKey = ref('');
let sequence = 0;
watch(
  () => props.open,
  async (open) => {
    const run = ++sequence;
    if (!open) return;
    loading.value = true;
    loaded.value = false;
    values.value = '';
    loadError.value = '';
    requestKey.value = newIdempotencyKey();
    try {
      const options = await getCustomerOptions();
      if (!props.open || run !== sequence) return;
      values.value = options.customerSources.join('\n');
      version.value = options.sourceVersion;
      loaded.value = true;
    } catch (error) {
      if (run === sequence) loadError.value = errorText(error);
    } finally {
      if (run === sequence) loading.value = false;
    }
  },
);
async function save() {
  if (saving.value || loading.value || !loaded.value) return;
  const entries = values.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    entries.length === 0 ||
    entries.length > 100 ||
    new Set(entries).size !== entries.length ||
    entries.some((value) => value.length > 200)
  ) {
    loadError.value = '请填写1至100个不重复的来源，每行一个，每项不超过200字。';
    return;
  }
  saving.value = true;
  try {
    const options = await saveCustomerSources({
      values: entries,
      expectedVersion: version.value,
      idempotencyKey: requestKey.value,
    });
    emit('saved', options);
    emit('close');
    message.success('客户来源选项已更新');
  } catch (error) {
    loadError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="维护客户来源选项"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: loading || !loaded }"
    :closable="!saving"
    :mask-closable="false"
    @cancel="!saving && emit('close')"
    @ok="save"
  >
    <Alert
      type="info"
      show-icon
      message="每行一个来源，按填写顺序显示。移除选项不会更改历史客户的来源；原值仍可保留。"
      style="margin-bottom: 12px"
    />
    <Alert
      v-if="loadError"
      type="error"
      show-icon
      :message="loadError"
      style="margin-bottom: 12px"
    />
    <Input.TextArea
      v-model:value="values"
      aria-label="客户来源选项，每行一个"
      :rows="10"
      :disabled="loading || saving"
    />
  </Modal>
</template>
