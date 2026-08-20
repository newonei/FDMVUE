<script lang="ts" setup>
import type { FdmWaimaoCrmBusinessApi } from '#/api/fdmwaimaocrm/business';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { updateBusinessStatus } from '#/api/fdmwaimaocrm/business';
import { $t } from '#/locales';

import { useStatusFormSchema } from '../data';

const emit = defineEmits(['success']);

const formData = ref<FdmWaimaoCrmBusinessApi.Business>();

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 120,
  },
  layout: 'horizontal',
  schema: useStatusFormSchema(formData),
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
    const data =
      (await formApi.getValues()) as FdmWaimaoCrmBusinessApi.Business;
    try {
      if (!data.status) {
        return;
      }
      await updateBusinessStatus({
        id: data.id,
        statusId: data.status > 0 ? data.status : undefined,
        endStatus: data.status < 0 ? -data.status : undefined,
      });
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
      return;
    }
    // 加载数据
    const data = modalApi.getData<FdmWaimaoCrmBusinessApi.Business>();
    if (!data || !data.id) {
      return;
    }
    data.status = data.endStatus === null ? data.statusId : -data.endStatus;
    formData.value = data;
    modalApi.lock();
    try {
      // 设置到 values
      await formApi.setValues(formData.value);
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal title="变更商机状态" class="w-2/5">
    <Form class="mx-4" />
  </Modal>
</template>
