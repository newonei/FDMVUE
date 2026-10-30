<script lang="ts" setup>
import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { productionSendFdmNeixiaoPatternDesignItem } from '#/api/fdmneixiao/pattern/design-item';

import { EXPRESS_NO_RULE } from '../data';

defineOptions({ name: 'FdmNeixiaoPatternDesignItemProductionSendForm' });

const emit = defineEmits<{ success: [] }>();

const row = ref<FdmNeixiaoPatternDesignItemApi.PatternDesignItem>();

const [Form, formApi] = useVbenForm({
  schema: [
    {
      fieldName: 'expressNo',
      label: '快递单号',
      component: 'Input',
      help: '整单共用；已填写的单号会被覆盖，并在群里补发一条通知',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '请输入快递单号',
      },
      rules: EXPRESS_NO_RULE.refine(
        (value) => value.trim().length > 0,
        '请填写快递单号',
      ),
    },
  ],
  showDefaultActions: false,
  layout: 'horizontal',
  commonConfig: { labelWidth: 90, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid || !row.value?.id) return;
    const { expressNo } = await formApi.getValues();
    modalApi.lock();
    try {
      await productionSendFdmNeixiaoPatternDesignItem(
        row.value.id,
        String(expressNo).trim(),
      );
      message.success('已填写快递单号并发送制作发出通知');
      await modalApi.close();
      emit('success');
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      row.value = undefined;
      return;
    }
    row.value =
      modalApi.getData() as FdmNeixiaoPatternDesignItemApi.PatternDesignItem;
    await formApi.setValues({ expressNo: row.value?.expressNo ?? '' });
  },
});
</script>

<template>
  <Modal :title="`发货 · ${row?.orderNo ?? ''}`" class="w-[480px]">
    <Form class="mx-4" />
  </Modal>
</template>
