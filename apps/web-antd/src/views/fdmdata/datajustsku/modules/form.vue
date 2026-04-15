<script lang="ts" setup>
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createDataJustSku, getDataJustSku, updateDataJustSku } from '#/api/fdmdata/datajustsku';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emit = defineEmits(['success']);
const formData = ref<FdmdataDataJustSkuApi.DataJustSku>();
const getTitle = computed(() => {
  return formData.value?.id
    ? $t('ui.actionTitle.edit', ['fdm-data 聚水潭 SKU 主数据'])
    : $t('ui.actionTitle.create', ['fdm-data 聚水潭 SKU 主数据']);
});

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 80,
  },
  layout: 'horizontal',
  schema: useFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    // 提交表单
    const data = (await formApi.getValues()) as FdmdataDataJustSkuApi.DataJustSku;
    try {
      await (formData.value?.id ? updateDataJustSku(data) : createDataJustSku(data));
      // 关闭并提示
      await modalApi.close();
      emit('success');
      message.success($t('ui.actionMessage.operationSuccess'));
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      formData.value = undefined;
      return;
    }
    // 加载数据
    const data = modalApi.getData<FdmdataDataJustSkuApi.DataJustSku>();
    if (!data || !data.id) {
      formData.value = undefined;
      await formApi.resetForm();
      await formApi.setValues({ status: 1 });
      return;
    }
    modalApi.lock();
    try {
      formData.value = await getDataJustSku(data.id);
      // 设置到 values
      await formApi.setValues(formData.value);
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal :title="getTitle">
    <Form class="mx-4" />
  </Modal>
</template>