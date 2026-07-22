<script lang="ts" setup>
import type { FdmdataExtensionConfigApi } from '#/api/fdmdata/extensionconfig';

import { computed, ref } from 'vue';
import { useVbenModal } from '@vben/common-ui';
import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createExtensionConfig,
  getExtensionConfig,
  updateExtensionConfig,
} from '#/api/fdmdata/extensionconfig';
import { $t } from '#/locales';

import { EXTENSION_CONFIG_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'ExtensionConfigForm' });

const emit = defineEmits<{ success: [] }>();
const formData = ref<FdmdataExtensionConfigApi.ExtensionConfig>();
let openSeq = 0;

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 96, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    try {
      JSON.parse(String(data.configJson));
    } catch {
      message.error('JSON 配置格式不正确');
      return;
    }
    modalApi.lock();
    try {
      if (data.id) {
        await updateExtensionConfig(data as FdmdataExtensionConfigApi.ExtensionConfig);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createExtensionConfig(data as FdmdataExtensionConfigApi.ExtensionConfig);
        message.success($t('ui.actionMessage.createSuccess'));
      }
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      modalApi.unlock();
      formData.value = undefined;
      return;
    }
    const seq = ++openSeq;
    const row = modalApi.getData<FdmdataExtensionConfigApi.ExtensionConfig>();
    await formApi.resetForm();
    await formApi.setValues(EXTENSION_CONFIG_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getExtensionConfig(row.id);
      if (seq !== openSeq) return;
      formData.value = detail;
      await formApi.setValues(detail as any, false);
    } finally {
      if (seq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() => formData.value?.id ? '修改插件云配置' : '新增插件云配置');
</script>

<template>
  <Modal :title="title" class="w-[920px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
