<script lang="ts" setup>
import type { FdmdataExpressFeeTemplateApi } from '#/api/fdmdata/expressfeetemplate';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createExpressFeeTemplate,
  getExpressFeeTemplate,
  updateExpressFeeTemplate,
} from '#/api/fdmdata/expressfeetemplate';
import { $t } from '#/locales';

import { EXPRESS_FEE_TEMPLATE_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'ExpressFeeTemplateForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const formData = ref<
  FdmdataExpressFeeTemplateApi.ExpressFeeTemplate | undefined
>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  labelWidth: 100,
  commonConfig: { labelWidth: 100, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      if (data.id) {
        await updateExpressFeeTemplate(
          data as FdmdataExpressFeeTemplateApi.ExpressFeeTemplate,
        );
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createExpressFeeTemplate(
          data as FdmdataExpressFeeTemplateApi.ExpressFeeTemplate,
        );
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
      await formApi.setValues(EXPRESS_FEE_TEMPLATE_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row =
      modalApi.getData<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>();
    formData.value = undefined;
    await formApi.setValues(EXPRESS_FEE_TEMPLATE_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getExpressFeeTemplate(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('计费模板不存在或已被删除');
        await modalApi.close();
        return;
      }
      formData.value = detail;
      await formApi.setValues(detail as any, false);
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '修改计费模板' : '新增计费模板',
);
</script>

<template>
  <Modal :title="title" class="w-[760px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
