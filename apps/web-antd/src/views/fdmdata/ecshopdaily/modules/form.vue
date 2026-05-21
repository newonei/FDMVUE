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

// Bumped on every modal open so async loaders can detect that the user
// already closed/re-opened the modal and skip applying their result.
// Without this guard, a late getEcShopDaily resolution can call
// formApi.setValues on a Form component that destroyOnClose already
// unmounted, which crashes Vue with
// "Cannot read properties of null (reading 'type')".
let openSeq = 0;

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
    formItemClass: 'col-span-1 min-w-0',
    labelWidth: 110,
  },
  layout: 'horizontal',
  schema: useFormSchema(),
  showDefaultActions: false,
  wrapperClass: 'grid-cols-2 gap-x-6 gap-y-1',
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
    try {
      const raw = await formApi.getValues();
      const data = buildEcShopDailySubmitPayload({
        ...raw,
        statDate: normalizeStatDate(raw),
      });
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
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcShopDailyApi.EcShopDaily>();

    // Create flow: no async work, no race window.
    if (!row?.id) {
      formData.value = undefined;
      await formApi.setValues(EC_SHOP_DAILY_CREATE_DEFAULTS as any, false);
      return;
    }

    // Edit flow: fetch the latest snapshot from server before populating.
    modalApi.lock();
    try {
      const detail = await getEcShopDaily(row.id);
      // The modal may have been closed (or re-opened with a different row)
      // while we were waiting; drop the stale result so we never touch a
      // destroyed Form instance.
      if (mySeq !== openSeq) {
        return;
      }
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
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal :title="getTitle" :width="980" class="ec-shop-daily-modal">
    <div
      class="ec-shop-daily-form-scroll max-h-[min(72vh,720px)] overflow-y-auto px-5 py-3"
    >
      <Form class="ec-shop-daily-form" />
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-form :deep(.ant-form-item) {
  margin-bottom: 6px;
}

.ec-shop-daily-form :deep(.ant-form-item-row) {
  flex-wrap: nowrap;
}

.ec-shop-daily-form :deep(.ant-form-item-label) {
  flex: 0 0 110px;
  max-width: 110px;
  padding-right: 8px;
  overflow: visible;
  text-align: right;
}

.ec-shop-daily-form :deep(.ant-form-item-label > label) {
  height: auto;
  line-height: 1.4;
  word-break: keep-all;
  white-space: normal;
}

.ec-shop-daily-form :deep(.ant-form-item-control) {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}

/* Section divider — tighten the gap and align with the form rows */
.ec-shop-daily-form :deep(.ant-divider-horizontal.ant-divider-with-text) {
  margin: 12px 0 4px;
  font-size: 13px;
  color: hsl(var(--foreground));
}

.ec-shop-daily-form
  :deep(.ant-divider-horizontal.ant-divider-with-text:first-child) {
  margin-top: 0;
}
</style>
