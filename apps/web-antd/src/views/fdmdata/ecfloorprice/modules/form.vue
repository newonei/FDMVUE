<script lang="ts" setup>
import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createEcFloorPrice,
  getEcFloorPrice,
  updateEcFloorPrice,
} from '#/api/fdmdata/ecfloorprice';

import { useFormSchema } from '../data';

defineOptions({ name: 'EcFloorPriceForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const editingId = ref<number>();

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
    const data = (await formApi.getValues()) as FdmdataEcFloorPriceApi.FloorPrice;
    modalApi.lock();
    try {
      if (data.id) {
        await updateEcFloorPrice(data);
        message.success('底价已修改');
      } else {
        await createEcFloorPrice(data);
        message.success('底价已新增');
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
      editingId.value = undefined;
      await formApi.resetForm();
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData() as FdmdataEcFloorPriceApi.FloorPrice | null;
    await formApi.resetForm();
    if (!row?.id) {
      // 新增时带上左侧选中的系列
      if (row?.seriesCode) await formApi.setFieldValue('seriesCode', row.seriesCode);
      return;
    }
    editingId.value = row.id;
    modalApi.lock();
    try {
      const detail = await getEcFloorPrice(row.id);
      if (mySeq !== openSeq) return;
      await formApi.setValues(
        { ...detail, materialKey: detail.materialKey || undefined },
        false,
      );
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() => (editingId.value ? '修改底价' : '新增底价'));
</script>

<template>
  <Modal :title="title" class="w-[720px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
