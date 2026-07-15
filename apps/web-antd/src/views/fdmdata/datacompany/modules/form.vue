<script lang="ts" setup>
import type { FdmdataDataCompanyApi } from '#/api/fdmdata/datacompany';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createDataCompany,
  getDataCompany,
  updateDataCompany,
} from '#/api/fdmdata/datacompany';
import { $t } from '#/locales';

import { DATA_COMPANY_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'DataCompanyForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const formData = ref<FdmdataDataCompanyApi.DataCompany | undefined>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
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
        await updateDataCompany(data as FdmdataDataCompanyApi.DataCompany);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createDataCompany(data as FdmdataDataCompanyApi.DataCompany);
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
      await formApi.setValues(DATA_COMPANY_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataDataCompanyApi.DataCompany>();
    formData.value = undefined;
    await formApi.setValues(DATA_COMPANY_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getDataCompany(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('公司主体不存在或已被删除');
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
  formData.value?.id ? '修改公司主体' : '新增公司主体',
);
</script>

<template>
  <Modal :title="title" class="w-[860px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
