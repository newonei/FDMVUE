<script lang="ts" setup>
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

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

defineOptions({ name: 'EcShopDailyForm' });

const emit = defineEmits<{ success: [] }>();

// openSeq 用于防止多次快速切换时旧请求覆盖新请求
let openSeq = 0;

const formData = ref<FdmdataEcShopDailyApi.EcShopDaily | undefined>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  labelWidth: 120,
  commonConfig: { labelWidth: 120, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const raw = await formApi.getValues();
    const data = buildEcShopDailySubmitPayload(raw);
    modalApi.lock();
    try {
      if (data.id) {
        await updateEcShopDaily(data);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createEcShopDaily(data);
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
      void formApi.setValues(EC_SHOP_DAILY_CREATE_DEFAULTS as any, false);
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcShopDailyApi.EcShopDaily>();
    formData.value = undefined;
    await formApi.setValues(EC_SHOP_DAILY_CREATE_DEFAULTS as any, false);
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getEcShopDaily(row.id);
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
        console.error('Load ecShopDaily detail failed', error);
        message.error('加载详情失败，请稍后再试');
        await modalApi.close();
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '修改店铺日汇总' : '新增店铺日汇总',
);
</script>

<script lang="ts">
import { computed } from 'vue';
</script>

<template>
  <Modal :title="title" class="w-[860px]">
    <div
      class="ec-shop-daily-form-body overflow-y-auto pr-1"
      style="max-height: 70vh"
    >
      <Form />
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-form-body :deep(.ant-form-item-label > label) {
  white-space: nowrap;
}

/* label 固定宽度，与 labelWidth:120 对齐 */
.ec-shop-daily-form-body :deep(.ant-form-item-label) {
  flex: 0 0 120px;
  max-width: 120px;
}
</style>
