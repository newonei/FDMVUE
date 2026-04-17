<script lang="ts" setup>
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createDataJustPattern,
  getDataJustPattern,
  updateDataJustPattern,
} from '#/api/fdmdata/datajustpattern';
import { createDataJustSku, getDataJustSku, updateDataJustSku } from '#/api/fdmdata/datajustsku';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emit = defineEmits(['success']);

/** 弹窗入参：直接传行，或 { row, listTab } */
type FormOpenPayload =
  | FdmdataDataJustSkuApi.DataJustSku
  | {
      row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern;
      listTab: string;
    };

const formData = ref<FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern>();
const listTab = ref<string>('blank');

const getTitle = computed(() => {
  const isPattern = listTab.value === 'pattern';
  const subject = isPattern ? 'fdm-data 图案商品' : 'fdm-data 聚水潭 SKU 主数据';
  return formData.value?.id
    ? $t('ui.actionTitle.edit', [subject])
    : $t('ui.actionTitle.create', [subject]);
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
    try {
      if (listTab.value === 'pattern') {
        const data = (await formApi.getValues()) as FdmdataDataJustPatternApi.PatternSaveReq;
        await (formData.value?.id
          ? updateDataJustPattern(data)
          : createDataJustPattern(data));
      } else {
        const data = (await formApi.getValues()) as FdmdataDataJustSkuApi.DataJustSku;
        await (formData.value?.id ? updateDataJustSku(data) : createDataJustSku(data));
      }
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
      listTab.value = 'blank';
      return;
    }
    const raw = modalApi.getData<FormOpenPayload>();
    const tab =
      raw && typeof raw === 'object' && 'listTab' in raw ? raw.listTab : 'blank';
    listTab.value = tab ?? 'blank';
    const row =
      raw && typeof raw === 'object' && 'row' in raw ? raw.row : (raw as FdmdataDataJustSkuApi.DataJustSku);
    if (!row || !row.id) {
      formData.value = undefined;
      await formApi.resetForm();
      await formApi.setValues({ status: 1 });
      return;
    }
    modalApi.lock();
    try {
      if (listTab.value === 'pattern') {
        formData.value = await getDataJustPattern(row.id);
      } else {
        formData.value = await getDataJustSku(row.id);
      }
      await formApi.setValues(formData.value as any);
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
