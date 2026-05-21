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

import {
  buildEcShopDailySubmitPayload,
  EC_SHOP_DAILY_CREATE_DEFAULTS,
  useFormSchema,
} from '../data';

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
    // 左标签 + 右控件；固定标签宽，避免与 grid 混用导致标签列被压成竖排
    labelWidth: 132,
    formItemClass: 'mb-3 min-w-0',
  },
  layout: 'horizontal',
  schema: useFormSchema(),
  showDefaultActions: false,
});

function normalizeStatDate(raw: Record<string, any>): string | undefined {
  const statDate = raw.statDate;
  if (statDate === undefined || statDate === null || statDate === '') {
    return undefined;
  }
  if (typeof statDate === 'string') {
    return statDate;
  }
  const d = dayjs(statDate);
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    const raw = await formApi.getValues();
    const data = buildEcShopDailySubmitPayload({
      ...raw,
      statDate: normalizeStatDate(raw),
    });
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
  <Modal :title="getTitle" :width="920" class="ec-shop-daily-modal">
    <div
      class="ec-shop-daily-form-scroll max-h-[min(72vh,720px)] overflow-y-auto px-4 py-3"
    >
      <Form class="ec-shop-daily-form" />
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-form :deep(.ant-form-item) {
  margin-bottom: 0;
}

.ec-shop-daily-form :deep(.ant-form-item-row) {
  flex-wrap: nowrap;
}

.ec-shop-daily-form :deep(.ant-form-item-label) {
  flex: 0 0 132px;
  max-width: 132px;
  padding-right: 8px;
  overflow: visible;
  text-align: right;
}

.ec-shop-daily-form :deep(.ant-form-item-label > label) {
  height: auto;
  line-height: 1.5;
  word-break: keep-all;
  white-space: normal;
}

.ec-shop-daily-form :deep(.ant-form-item-control) {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}
</style>
