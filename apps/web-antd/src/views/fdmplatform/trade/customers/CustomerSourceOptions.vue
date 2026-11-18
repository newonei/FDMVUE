<script setup lang="ts">
import type { CustomerOptions } from '#/api/fdmplatform/customers';

import { computed, ref, watch } from 'vue';

import { Alert, Input, message, Modal } from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getCustomerOptions,
  saveCustomerIndustries,
  saveCustomerSources,
  saveCustomerTypes,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import { defaultCustomerTypes } from './model';

const props = withDefaults(
  defineProps<{ kind?: 'industry' | 'source' | 'type'; open: boolean }>(),
  { kind: 'source' },
);
const emit = defineEmits<{ close: []; saved: [options: CustomerOptions] }>();
const configuration = computed(() => {
  if (props.kind === 'type')
    return {
      title: '客户类型',
      noun: '类型',
      values: (options: CustomerOptions) =>
        options.customerTypes ?? defaultCustomerTypes,
      version: (options: CustomerOptions) => options.typeVersion ?? 0,
      save: saveCustomerTypes,
      minimum: 1,
    };
  if (props.kind === 'industry')
    return {
      title: '所在行业',
      noun: '行业',
      values: (options: CustomerOptions) => options.industries ?? [],
      version: (options: CustomerOptions) => options.industryVersion ?? 0,
      save: saveCustomerIndustries,
      minimum: 0,
    };
  return {
    title: '客户来源',
    noun: '来源',
    values: (options: CustomerOptions) => options.customerSources,
    version: (options: CustomerOptions) => options.sourceVersion,
    save: saveCustomerSources,
    minimum: 1,
  };
});
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
      values.value = configuration.value.values(options).join('\n');
      version.value = configuration.value.version(options);
      loaded.value = true;
    } catch (error) {
      if (run === sequence) loadError.value = errorText(error);
    } finally {
      if (run === sequence) loading.value = false;
    }
  },
  { immediate: true },
);
async function save() {
  if (saving.value || loading.value || !loaded.value) return;
  const entries = values.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    entries.length < configuration.value.minimum ||
    entries.length > 100 ||
    new Set(entries).size !== entries.length ||
    entries.some((value) => value.length > 200)
  ) {
    loadError.value = `请填写${configuration.value.minimum}至100个不重复的${configuration.value.noun}，每行一个，每项不超过200字。`;
    return;
  }
  saving.value = true;
  try {
    const options = await configuration.value.save({
      values: entries,
      expectedVersion: version.value,
      idempotencyKey: requestKey.value,
    });
    emit('saved', options);
    emit('close');
    message.success(`${configuration.value.title}选项已更新`);
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
    :title="`维护${configuration.title}选项`"
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
      :message="`每行一个${configuration.noun}，按填写顺序显示。移除选项不会更改历史客户的${configuration.title}；原值仍可保留。`"
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
      :aria-label="`${configuration.title}选项，每行一个`"
      :rows="10"
      :disabled="loading || saving"
    />
  </Modal>
</template>
