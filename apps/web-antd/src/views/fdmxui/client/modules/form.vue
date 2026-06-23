<script lang="ts" setup>
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createFdmxuiClient } from '#/api/fdmxui/client';
import { getSimpleFdmxuiInboundList } from '#/api/fdmxui/inbound';
import { $t } from '#/locales';

import {
  FDMXUI_CLIENT_DEFAULTS,
  type SelectOption,
  useFormSchema,
} from '../data';

defineOptions({ name: 'FdmxuiClientForm' });

const emit = defineEmits<{ success: [] }>();

const inboundOptions = ref<SelectOption[]>([]);

const [Form, formApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 120, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      await createFdmxuiClient(data as FdmxuiClientApi.Client);
      message.success($t('ui.actionMessage.createSuccess'));
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      inboundOptions.value = [];
      return;
    }
    inboundOptions.value = [];
    rebuildSchema();
    await formApi.setValues(FDMXUI_CLIENT_DEFAULTS as any, false);
  },
});

async function handlePanelChange(panelId?: number) {
  await formApi.setFieldValue('inboundIds', []);
  inboundOptions.value = [];
  if (panelId) {
    const list = await getSimpleFdmxuiInboundList(Number(panelId));
    inboundOptions.value = list.map((item) => ({
      label: `${item.remark || item.tag || item.xuiInboundId} / ${item.protocol || '-'}:${item.port || '-'}`,
      value: item.id!,
    }));
  }
  rebuildSchema();
}

function rebuildSchema() {
  formApi.setState({
    schema: useFormSchema(handlePanelChange, inboundOptions.value),
  });
}
</script>

<template>
  <Modal title="新增3XUI客户端" class="w-[860px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
