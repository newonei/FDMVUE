<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';
import type { FdmdataEcShopDailyBrushApi } from '#/api/fdmdata/ecshopdailybrush';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createEcShopDailyBrush,
  getEcShopDailyBrushPage,
  updateEcShopDailyBrush,
} from '#/api/fdmdata/ecshopdailybrush';

import { normalizeStatDateForForm } from '../data';

defineOptions({ name: 'EcShopDailyBrushForm' });

const emit = defineEmits<{ success: [] }>();

// openSeq 用于防止多次快速切换时旧请求覆盖新请求
let openSeq = 0;

const formData = ref<FdmdataEcShopDailyBrushApi.EcShopDailyBrush | undefined>();

function requiredInt(fieldName: string, label: string): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: 'selectRequired',
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision: 0,
      placeholder: '0',
    },
  };
}

function requiredAmount(fieldName: string, label: string): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: 'selectRequired',
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision: 2,
      placeholder: '0.00',
    },
  };
}

function calculateBrushTotalCost(values: Record<string, any>) {
  const principal = Number(values.brushPrincipal ?? 0);
  const commission = Number(values.brushCommission ?? 0);
  const total = Number((principal + commission).toFixed(2));
  return Number.isFinite(total) ? total : 0;
}

function brushCostAmount(fieldName: string, label: string): VbenFormSchema {
  const schema = requiredAmount(fieldName, label);
  schema.componentProps = {
    ...schema.componentProps,
    onChange: () => {
      setTimeout(() => {
        void syncBrushTotalCost();
      }, 0);
    },
  };
  return schema;
}

function useBrushFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-2 min-w-0';
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'statDate',
      label: '刷单日期',
      rules: 'selectRequired',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: false,
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
        disabled: true,
      },
    },
    {
      fieldName: 'platformCode',
      label: '平台',
      rules: 'required',
      component: 'Input',
      componentProps: { class: 'w-full', disabled: true },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: { class: 'w-full', disabled: true },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: { class: 'w-full', disabled: true },
    },

    requiredInt('brushOrderCount', '刷单单量'),
    brushCostAmount('brushPrincipal', '刷单本金'),
    brushCostAmount('brushCommission', '刷单佣金'),
    {
      fieldName: 'brushTotalCost',
      label: '刷单总成本',
      rules: 'selectRequired',
      component: 'InputNumber',
      componentProps: { class: 'w-full', disabled: true, precision: 2 },
    },
    {
      fieldName: 'remark',
      label: '备注',
      formItemClass: fullWidth,
      component: 'Textarea',
      componentProps: {
        maxlength: 512,
        rows: 3,
        showCount: true,
        placeholder: '可选',
      },
    },
  ];
}

const [Form, formApi] = useVbenForm({
  schema: useBrushFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  // 与主表弹窗保持一致（有些 VbenFormProps 泛型会丢失 labelWidth 的类型提示）
  commonConfig: { labelWidth: 120, colon: true },
});

async function syncBrushTotalCost() {
  const values = await formApi.getValues().catch(() => ({}));
  await formApi.setFieldValue(
    'brushTotalCost',
    calculateBrushTotalCost(values),
    false,
  );
}

async function loadExistingBrushByBizKey(
  row: FdmdataEcShopDailyApi.EcShopDaily,
) {
  const statDate = normalizeStatDateForForm(row.statDate);
  const platformCode = String(row.platformCode ?? '').trim();
  const shopId = String(row.shopId ?? '').trim();
  const shopName = String(row.shopName ?? '').trim();
  if (!statDate || !platformCode || !shopName) return null;

  const page = await getEcShopDailyBrushPage({
    pageNo: 1,
    pageSize: 1,
    // 后端是 LocalDate[]，这里按同一天范围传两端
    statDate: [statDate, statDate],
    platformCode,
    shopId,
    shopName,
  } as any);
  return page?.list?.[0] ?? null;
}

function buildSubmitPayload(
  raw: Record<string, any>,
): FdmdataEcShopDailyBrushApi.EcShopDailyBrush {
  const principal = Number(raw.brushPrincipal ?? 0);
  const commission = Number(raw.brushCommission ?? 0);
  const total = calculateBrushTotalCost(raw);
  return {
    id: raw.id ? Number(raw.id) : undefined,
    statDate: raw.statDate,
    platformCode: String(raw.platformCode ?? '').trim(),
    shopId: String(raw.shopId ?? '').trim(),
    shopName: String(raw.shopName ?? '').trim(),
    brushOrderCount: Number(raw.brushOrderCount ?? 0),
    brushPrincipal: Number.isFinite(principal) ? principal : 0,
    brushCommission: Number.isFinite(commission) ? commission : 0,
    brushTotalCost: Number.isFinite(total) ? total : 0,
    remark: String(raw.remark ?? '').trim() || undefined,
  };
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    await syncBrushTotalCost();
    const { valid } = await formApi.validate();
    if (!valid) return;
    const raw = await formApi.getValues();
    const data = buildSubmitPayload(raw);
    modalApi.lock();
    try {
      if (data.id) {
        await updateEcShopDailyBrush(data);
        message.success(`刷单数据已更新（ID：${data.id}）`);
      } else {
        await createEcShopDailyBrush(data);
        message.success('刷单数据已保存');
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
      return;
    }

    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcShopDailyApi.EcShopDaily>();
    if (!row?.id) {
      message.error('缺少行数据，无法填写刷单信息');
      await modalApi.close();
      return;
    }

    modalApi.lock();
    try {
      const baseValues = {
        id: undefined,
        statDate: normalizeStatDateForForm(row.statDate),
        platformCode: row.platformCode,
        shopId: row.shopId ?? '',
        shopName: row.shopName ?? '',
        brushOrderCount: 0,
        brushPrincipal: 0,
        brushCommission: 0,
        brushTotalCost: 0,
        remark: '',
      };

      const existed = await loadExistingBrushByBizKey(row);
      if (mySeq !== openSeq) return;

      const merged = existed
        ? {
            ...baseValues,
            ...existed,
            statDate: normalizeStatDateForForm(
              existed.statDate ?? baseValues.statDate,
            ),
          }
        : baseValues;

      formData.value = existed ?? undefined;
      await formApi.resetForm();
      await formApi.setValues(merged as any, false);
      await syncBrushTotalCost();
    } catch (error) {
      if (mySeq === openSeq) {
        console.error('Load ecShopDailyBrush failed', error);
        message.error('加载刷单数据失败，请稍后再试');
        await modalApi.close();
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '刷单数据填写（修改）' : '刷单数据填写（新增）',
);
</script>

<template>
  <Modal :title="title" class="w-[720px]">
    <div
      class="ec-shop-daily-brush-body overflow-y-auto pr-1"
      style="max-height: 70vh"
    >
      <Form />
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-brush-body :deep(.ant-form-item-label > label) {
  white-space: nowrap;
}

.ec-shop-daily-brush-body :deep(.ant-form-item-label) {
  flex: 0 0 120px;
  max-width: 120px;
}
</style>
