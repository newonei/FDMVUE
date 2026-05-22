<script lang="ts" setup>
import type { FdmdataEcShopDailyBrushApi } from '#/api/fdmdata/ecshopdailybrush';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createEcShopDailyBrush,
  getEcShopDailyBrush,
  updateEcShopDailyBrush,
} from '#/api/fdmdata/ecshopdailybrush';
import { $t } from '#/locales';

import { EC_SHOP_DAILY_BRUSH_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'EcShopDailyBrushForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;

const formData = ref<FdmdataEcShopDailyBrushApi.EcShopDailyBrush | undefined>();

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
        await updateEcShopDailyBrush(data as FdmdataEcShopDailyBrushApi.EcShopDailyBrush);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createEcShopDailyBrush(data as FdmdataEcShopDailyBrushApi.EcShopDailyBrush);
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
      void formApi.setValues(EC_SHOP_DAILY_BRUSH_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>();
    formData.value = undefined;
    await formApi.setValues(EC_SHOP_DAILY_BRUSH_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getEcShopDailyBrush(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('记录不存在或已被删除');
        await modalApi.close();
        return;
      }
      formData.value = detail;
      await formApi.setValues(detail as any, false);
    } catch (error) {
      if (mySeq === openSeq) {
        console.error('Load ecShopDailyBrush detail failed', error);
        message.error('加载详情失败，请稍后再试');
        await modalApi.close();
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '修改刷单记录' : '新增刷单记录',
);
</script>

<template>
  <Modal :title="title" class="w-[640px]">
    <Form />
  </Modal>
</template>
