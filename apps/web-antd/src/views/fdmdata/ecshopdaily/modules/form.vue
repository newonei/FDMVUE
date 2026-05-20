<script lang="ts" setup>
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenForm } from '#/adapter/form';
import {
  createEcShopDaily,
  getEcShopDaily,
  updateEcShopDaily,
} from '#/api/fdmdata/ecshopdaily';
import { $t } from '#/locales';

import { EC_SHOP_DAILY_CREATE_DEFAULTS, useFormSchema } from '../data';

const emit = defineEmits(['success']);
const formData = ref<FdmdataEcShopDailyApi.EcShopDaily>();

const getTitle = computed(() => {
  return formData.value?.id
    ? $t('ui.actionTitle.edit', ['店铺日汇总'])
    : $t('ui.actionTitle.create', ['店铺日汇总']);
});

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    // 纵向布局：标签在上、控件在下，避免双列 + horizontal 时标签宽度不足叠字
    wrapperClass: 'grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 sm:gap-y-3',
    formItemClass: 'col-span-1 mb-2 min-w-0 sm:mb-3',
  },
  layout: 'vertical',
  schema: useFormSchema(),
  showDefaultActions: false,
});

function normalizeSubmitPayload(
  raw: Record<string, any>,
): FdmdataEcShopDailyApi.EcShopDaily {
  const statDate = raw.statDate;
  let statDateStr: string | undefined;
  if (statDate === undefined || statDate === null || statDate === '') {
    statDateStr = undefined;
  } else if (typeof statDate === 'string') {
    statDateStr = statDate;
  } else {
    const d = dayjs(statDate);
    statDateStr = d.isValid() ? d.format('YYYY-MM-DD') : undefined;
  }

  return {
    ...raw,
    statDate: statDateStr as any,
    shopId: raw.shopId == null ? '' : String(raw.shopId).trim(),
    platformCode:
      raw.platformCode == null ? '' : String(raw.platformCode).trim(),
    currency: raw.currency == null ? 'CNY' : String(raw.currency),
  } as FdmdataEcShopDailyApi.EcShopDaily;
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    const raw = await formApi.getValues();
    const data = normalizeSubmitPayload(raw);
    try {
      await (formData.value?.id
        ? updateEcShopDaily(data)
        : createEcShopDaily(data));
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
    const row = modalApi.getData<FdmdataEcShopDailyApi.EcShopDaily>();
    if (!row?.id) {
      formData.value = undefined;
      await formApi.setValues(EC_SHOP_DAILY_CREATE_DEFAULTS as any, false);
      return;
    }
    modalApi.lock();
    try {
      formData.value = await getEcShopDaily(row.id);
      await formApi.setValues(formData.value as any, false);
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal :title="getTitle" :width="880" class="ec-shop-daily-modal">
    <Form class="ec-shop-daily-form px-2 py-3" />
  </Modal>
</template>

<style scoped>
/* 纵向表单在弹窗内：标签允许换行，避免窄屏叠字 */
.ec-shop-daily-form :deep(.ant-form-item-label > label) {
  line-height: 1.45;
  white-space: normal;
}
</style>
