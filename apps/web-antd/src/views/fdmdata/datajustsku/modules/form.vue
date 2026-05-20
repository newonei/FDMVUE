<script lang="ts" setup>
import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createDataJustAccessory,
  getDataJustAccessory,
  updateDataJustAccessory,
} from '#/api/fdmdata/datajustaccessory';
import {
  createDataJustPattern,
  getDataJustPattern,
  updateDataJustPattern,
} from '#/api/fdmdata/datajustpattern';
import {
  createDataJustSku,
  getDataJustSku,
  updateDataJustSku,
  createFinishedSku,
  getFinishedSku,
  updateFinishedSku,
} from '#/api/fdmdata/datajustsku';
import { $t } from '#/locales';

import { useAccessoryFormSchema, useFormSchema } from '../data';

const emit = defineEmits(['success']);

/** 弹窗入参：直接传行，或 { row, listTab } */
type FormOpenPayload =
  | FdmdataDataJustSkuApi.DataJustSku
  | {
      row?:
        | FdmdataDataJustSkuApi.DataJustSku
        | FdmdataDataJustPatternApi.Pattern
        | FdmdataDataJustAccessoryApi.Accessory;
      listTab: string;
    };

const formData = ref<
  | FdmdataDataJustSkuApi.DataJustSku
  | FdmdataDataJustPatternApi.Pattern
  | FdmdataDataJustAccessoryApi.Accessory
>();
const listTab = ref<string>('blank');

const getTitle = computed(() => {
  const subjectMap: Record<string, string> = {
    blank: '空白版 SKU',
    pattern: '图案商品',
    finished: '成品编码',
    accessory: '配件商品',
  };
  const subject = subjectMap[listTab.value] ?? '聚水潭 SKU 主数据';
  return formData.value?.id
    ? $t('ui.actionTitle.edit', [subject])
    : $t('ui.actionTitle.create', [subject]);
});

/** 所有 tab 统一使用宽弹窗，accessory 稍宽 */
const modalClass = computed(() =>
  listTab.value === 'accessory'
    ? 'w-[960px] max-w-[calc(100vw-2rem)]'
    : 'w-[800px] max-w-[calc(100vw-2rem)]',
);

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-1',
    labelWidth: 90,
  },
  layout: 'horizontal',
  schema: useFormSchema(),
  showDefaultActions: false,
  wrapperClass: 'grid-cols-2 gap-x-4',
});

function setupFormByTab(tab: string) {
  const isAccessory = tab === 'accessory';
  formApi.setState({
    commonConfig: {
      componentProps: {
        class: 'w-full',
      },
      // 所有 tab 统一 2 列，labelWidth 统一 90
      formItemClass: 'col-span-1',
      labelWidth: isAccessory ? 112 : 90,
    },
    schema: isAccessory ? useAccessoryFormSchema() : useFormSchema(),
    wrapperClass: 'grid-cols-2 gap-x-4',
  });
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    try {
      if (listTab.value === 'pattern') {
        const data =
          (await formApi.getValues()) as FdmdataDataJustPatternApi.PatternSaveReq & {
            __listTab?: string;
          };
        delete data.__listTab;
        await (formData.value?.id
          ? updateDataJustPattern(data)
          : createDataJustPattern(data));
      } else if (listTab.value === 'accessory') {
        const data =
          (await formApi.getValues()) as FdmdataDataJustAccessoryApi.Accessory & {
            __listTab?: string;
          };
        delete data.__listTab;
        await (formData.value?.id
          ? updateDataJustAccessory(data)
          : createDataJustAccessory(data));
      } else {
        const data =
          (await formApi.getValues()) as FdmdataDataJustSkuApi.DataJustSku & {
            __listTab?: string;
          };
        delete data.__listTab;
        if (listTab.value === 'finished') {
          await (formData.value?.id
            ? updateFinishedSku(data)
            : createFinishedSku(data));
        } else {
          await (formData.value?.id
            ? updateDataJustSku(data)
            : createDataJustSku(data));
        }
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
      raw && typeof raw === 'object' && 'listTab' in raw
        ? raw.listTab
        : 'blank';
    listTab.value = tab ?? 'blank';
    setupFormByTab(listTab.value);
    await nextTick();
    const row =
      raw && typeof raw === 'object' && 'row' in raw
        ? raw.row
        : (raw as FdmdataDataJustSkuApi.DataJustSku);
    await formApi.resetForm();
    if (!row || !row.id) {
      formData.value = undefined;
      await formApi.setValues({
        __listTab: listTab.value,
        status: 1,
        ...(listTab.value === 'accessory' ? { styleCode: '配件-' } : {}),
      });
      return;
    }
    modalApi.lock();
    try {
      if (listTab.value === 'pattern') {
        formData.value = await getDataJustPattern(row.id);
      } else if (listTab.value === 'accessory') {
        formData.value = await getDataJustAccessory(row.id);
      } else if (listTab.value === 'finished') {
        formData.value = await getFinishedSku(row.id);
      } else {
        formData.value = await getDataJustSku(row.id);
      }
      await formApi.setValues({
        ...(formData.value as any),
        __listTab: listTab.value,
      });
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal :class="modalClass" :title="getTitle">
    <div
      v-if="listTab === 'accessory'"
      class="mx-4 mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700"
    >
      配件资料会写入 fdm_data_just_accessory，匹配规则用于后续组合编码生成。
    </div>
    <Form class="mx-4" />
  </Modal>
</template>
