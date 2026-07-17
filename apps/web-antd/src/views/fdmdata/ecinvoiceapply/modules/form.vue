<script lang="ts" setup>
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createEcInvoiceApply,
  getEcInvoiceApply,
  updateEcInvoiceApply,
} from '#/api/fdmdata/ecinvoiceapply';
import { $t } from '#/locales';

import { EC_INVOICE_APPLY_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'EcInvoiceApplyForm' });

const emit = defineEmits<{ success: [] }>();

let openSeq = 0;
const formData = ref<FdmdataEcInvoiceApplyApi.EcInvoiceApply | undefined>();

function calculateUnitPrice(amount: unknown, quantity: unknown) {
  const normalizedAmount = Number(amount);
  const normalizedQuantity = Number(quantity);
  if (
    !Number.isFinite(normalizedAmount) ||
    !Number.isFinite(normalizedQuantity) ||
    normalizedAmount <= 0 ||
    normalizedQuantity <= 0
  ) {
    return undefined;
  }
  return (
    Math.round((normalizedAmount / normalizedQuantity + Number.EPSILON) * 100) /
    100
  );
}

async function syncUnitPrice(values: Record<string, unknown>) {
  const unitPrice = calculateUnitPrice(values.amount, values.quantity);
  if (values.unitPrice === unitPrice) return;
  await formApi.setFieldValue('unitPrice', unitPrice, false);
}

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 90, colon: true },
  async handleValuesChange(values, changedFields) {
    if (
      !changedFields.includes('amount') &&
      !changedFields.includes('quantity')
    ) {
      return;
    }
    await syncUnitPrice(values);
  },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    await syncUnitPrice(await formApi.getValues());
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      if (data.id) {
        await updateEcInvoiceApply(
          data as FdmdataEcInvoiceApplyApi.EcInvoiceApply,
        );
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createEcInvoiceApply(
          data as FdmdataEcInvoiceApplyApi.EcInvoiceApply,
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
      await formApi.resetForm();
      await formApi.setValues(EC_INVOICE_APPLY_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcInvoiceApplyApi.EcInvoiceApply>();
    formData.value = undefined;
    await formApi.resetForm();
    await formApi.setValues(EC_INVOICE_APPLY_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getEcInvoiceApply(row.id);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('电商发票申请不存在或已被删除');
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
  formData.value?.id ? '修改电商发票申请' : '新增电商发票申请',
);
</script>

<template>
  <Modal :title="title" class="w-[760px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
