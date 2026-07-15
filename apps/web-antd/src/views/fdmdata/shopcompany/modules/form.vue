<script lang="ts" setup>
import type { FdmdataShopCompanyApi } from '#/api/fdmdata/shopcompany';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createShopCompany,
  getShopCompany,
  updateShopCompany,
} from '#/api/fdmdata/shopcompany';
import { $t } from '#/locales';

import { getPlatformName, SHOP_COMPANY_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'ShopCompanyForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const formData = ref<FdmdataShopCompanyApi.ShopCompany | undefined>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 110, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = (await formApi.getValues()) as FdmdataShopCompanyApi.ShopCompany;
    data.platformName = getPlatformName(data.platformCode);
    modalApi.lock();
    try {
      if (data.id) {
        await updateShopCompany(data);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createShopCompany(data);
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
      await formApi.setValues(SHOP_COMPANY_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataShopCompanyApi.ShopCompany>();
    formData.value = undefined;
    await formApi.setValues(SHOP_COMPANY_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getShopCompany(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('店铺主体关联不存在或已被删除');
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
  formData.value?.id ? '修改店铺主体关联' : '新增店铺主体关联',
);
</script>

<template>
  <Modal :title="title" class="w-[760px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
