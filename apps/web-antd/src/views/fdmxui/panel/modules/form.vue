<script lang="ts" setup>
import type { FdmxuiPanelApi } from '#/api/fdmxui/panel';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createFdmxuiPanel,
  getFdmxuiPanel,
  updateFdmxuiPanel,
} from '#/api/fdmxui/panel';
import { $t } from '#/locales';

import { FDMXUI_PANEL_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'FdmxuiPanelForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const formData = ref<FdmxuiPanelApi.Panel | undefined>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 120, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      if (data.id) {
        await updateFdmxuiPanel(data as FdmxuiPanelApi.Panel);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createFdmxuiPanel(data as FdmxuiPanelApi.Panel);
        message.success($t('ui.actionMessage.createSuccess'));
      }
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      formData.value = undefined;
      await formApi.setValues(FDMXUI_PANEL_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmxuiPanelApi.Panel>();
    formData.value = undefined;
    await formApi.setValues(FDMXUI_PANEL_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getFdmxuiPanel(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('3XUI面板不存在或已被删除');
        await modalApi.close();
        return;
      }
      formData.value = detail;
      await formApi.setValues({ ...detail, apiToken: '' } as any, false);
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '修改3XUI面板' : '新增3XUI面板',
);
</script>

<template>
  <Modal :title="title" class="w-[860px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
