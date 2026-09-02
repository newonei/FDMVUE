<script lang="ts" setup>
import type { FdmjustShopApi } from '#/api/fdmjust/shop';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { updateShop } from '#/api/fdmjust/shop';

import { useUpdateFormSchema } from '../data';

defineOptions({ name: 'FdmjustShopForm' });

const emit = defineEmits<{ success: [] }>();

const shop = ref<FdmjustShopApi.Shop>();

const [Form, formApi] = useVbenForm({
  commonConfig: {
    colon: true,
    labelWidth: 90,
  },
  layout: 'horizontal',
  schema: useUpdateFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid || !shop.value) {
      return;
    }

    const values =
      (await formApi.getValues()) as FdmjustShopApi.ShopUpdateParams;
    modalApi.lock();
    try {
      await updateShop({
        id: shop.value.id,
        enabled: Number(values.enabled),
        remark: values.remark?.trim() ?? '',
      });
      message.success('店铺设置已保存');
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      shop.value = undefined;
      await formApi.resetForm();
      return;
    }

    const row = modalApi.getData<FdmjustShopApi.Shop>();
    if (!row?.id) {
      message.error('未找到要编辑的店铺');
      await modalApi.close();
      return;
    }
    shop.value = row;
    await formApi.setValues(
      {
        id: row.id,
        enabled: row.enabled,
        remark: row.remark,
      },
      false,
    );
  },
});

const title = computed(() =>
  shop.value ? `编辑店铺：${shop.value.shopName}` : '编辑店铺',
);
</script>

<template>
  <Modal :title="title" class="w-[620px] max-w-[calc(100vw-2rem)]">
    <div
      v-if="shop"
      class="mb-5 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
    >
      <div class="font-medium text-foreground">{{ shop.shopName }}</div>
      <div class="mt-1 text-muted-foreground">
        店铺 ID：{{ shop.shopId
        }}<span v-if="shop.shopSite"> · 平台：{{ shop.shopSite }}</span>
      </div>
    </div>
    <Form />
  </Modal>
</template>
