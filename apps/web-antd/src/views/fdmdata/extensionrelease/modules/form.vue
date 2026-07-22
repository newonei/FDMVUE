<script lang="ts" setup>
import type { FdmdataExtensionReleaseApi } from '#/api/fdmdata/extensionrelease';

import { computed, ref } from 'vue';
import { useVbenModal } from '@vben/common-ui';
import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createExtensionRelease,
  getExtensionRelease,
  updateExtensionRelease,
} from '#/api/fdmdata/extensionrelease';
import { $t } from '#/locales';

import { EXTENSION_RELEASE_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'ExtensionReleaseForm' });

const emit = defineEmits<{ success: [] }>();
const formData = ref<FdmdataExtensionReleaseApi.ExtensionRelease>();
let openSeq = 0;

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 112, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      if (data.id) {
        await updateExtensionRelease(data as FdmdataExtensionReleaseApi.ExtensionRelease);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createExtensionRelease(data as FdmdataExtensionReleaseApi.ExtensionRelease);
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
    const row = modalApi.getData<FdmdataExtensionReleaseApi.ExtensionRelease>();
    await formApi.resetForm();
    await formApi.setValues(EXTENSION_RELEASE_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getExtensionRelease(row.id);
      if (seq !== openSeq) return;
      formData.value = detail;
      await formApi.setValues(detail as any, false);
    } finally {
      if (seq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() => formData.value?.id ? '修改插件版本' : '新增插件版本');
</script>

<template>
  <Modal :title="title" class="w-[920px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
