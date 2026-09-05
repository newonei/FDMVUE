<script lang="ts" setup>
import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { computed, nextTick, ref, unref } from 'vue';

import { confirm, useVbenModal } from '@vben/common-ui';

import { Alert, Button, message } from 'ant-design-vue';

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
const formReady = ref(false);
const loadError = ref(false);
const saving = ref(false);

const getTitle = computed(() => {
  const subjectMap: Record<string, string> = {
    blank: '空白版 SKU',
    pattern: '图案商品',
    finished: '成品编码',
    accessory: '配件商品',
  };
  const subject = subjectMap[listTab.value] ?? '聚水潭 SKU 主数据';
  const title = formData.value?.id
    ? $t('ui.actionTitle.edit', [subject])
    : $t('ui.actionTitle.create', [subject]);
  return formData.value?.id && formData.value.itemCode
    ? `${title} · ${formData.value.itemCode}`
    : title;
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
  scrollToFirstError: true,
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1 gap-x-4 md:grid-cols-2',
});

function setupFormByTab(tab: string) {
  const isAccessory = tab === 'accessory';
  formApi.setState({
    commonConfig: {
      componentProps: {
        class: 'w-full',
      },
      formItemClass: 'col-span-1',
      labelWidth: isAccessory ? 112 : 90,
    },
    schema: isAccessory ? useAccessoryFormSchema() : useFormSchema(),
    wrapperClass: 'grid-cols-1 gap-x-4 md:grid-cols-2',
  });
}

async function loadForm() {
  formReady.value = false;
  loadError.value = false;
  modalApi.setState({ confirmDisabled: true });
  modalApi.lock();
  try {
    await formApi.resetForm();
    const id = formData.value?.id;
    if (id) {
      let detail;
      if (listTab.value === 'pattern') {
        detail = await getDataJustPattern(id);
      } else if (listTab.value === 'accessory') {
        detail = await getDataJustAccessory(id);
      } else if (listTab.value === 'finished') {
        detail = await getFinishedSku(id);
      } else {
        detail = await getDataJustSku(id);
      }
      if (!detail?.id) {
        throw new Error('商品详情为空');
      }
      formData.value = detail;
      await formApi.setValues({ ...detail, __listTab: listTab.value });
    } else {
      await formApi.setValues({
        __listTab: listTab.value,
        status: 1,
        ...(listTab.value === 'accessory' ? { styleCode: '配件-' } : {}),
      });
    }
    // 将已加载的字段作为初始值，复用表单原生的未保存改动检测。
    await formApi.resetForm(
      { values: await formApi.getValues() },
      { force: true },
    );
    formReady.value = true;
  } catch {
    loadError.value = true;
  } finally {
    modalApi.unlock();
    modalApi.setState({ confirmDisabled: !formReady.value });
  }
}

const [Modal, modalApi] = useVbenModal({
  confirmDisabled: true,
  confirmText: '保存',
  async onBeforeClose() {
    if (saving.value) {
      return false;
    }
    if (!formReady.value || !unref(formApi.form.meta)?.dirty) {
      return true;
    }
    try {
      await confirm({
        title: '放弃本次修改？',
        content: '当前修改尚未保存，关闭后需要重新填写。',
        confirmText: '放弃修改',
        cancelText: '继续编辑',
      });
      return true;
    } catch {
      return false;
    }
  },
  async onConfirm() {
    if (!formReady.value || saving.value) {
      return;
    }
    saving.value = true;
    modalApi.lock();
    try {
      const { valid } = await formApi.validate();
      if (!valid) {
        return;
      }
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
      formReady.value = false;
      saving.value = false;
      await modalApi.close();
      emit('success');
      message.success($t('ui.actionMessage.operationSuccess'));
    } finally {
      saving.value = false;
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      formData.value = undefined;
      listTab.value = 'blank';
      formReady.value = false;
      loadError.value = false;
      return;
    }
    formReady.value = false;
    loadError.value = false;
    modalApi.setState({ confirmDisabled: true });
    const raw = modalApi.getData<FormOpenPayload>();
    const tab =
      raw && typeof raw === 'object' && 'listTab' in raw
        ? raw.listTab
        : 'blank';
    listTab.value = tab ?? 'blank';
    setupFormByTab(listTab.value);
    const row =
      raw && typeof raw === 'object' && 'row' in raw
        ? raw.row
        : (raw as FdmdataDataJustSkuApi.DataJustSku);
    formData.value = row?.id ? row : undefined;
    await nextTick();
    await loadForm();
  },
});
</script>

<template>
  <Modal :class="modalClass" :title="getTitle">
    <Alert
      v-if="loadError"
      class="mx-4 mb-4"
      type="error"
      show-icon
      message="商品资料加载失败"
      description="暂时无法编辑，请重试加载；仍然失败时可关闭后重新打开。"
    >
      <template #action>
        <Button size="small" @click="loadForm">重新加载</Button>
      </template>
    </Alert>
    <div
      v-if="listTab === 'accessory' && !loadError"
      class="mx-4 mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700"
    >
      填写配件资料后，可在生成组合商品时按规格或宽度自动匹配适用配件。
    </div>
    <Form v-show="!loadError" class="mx-4" />
  </Modal>
</template>
