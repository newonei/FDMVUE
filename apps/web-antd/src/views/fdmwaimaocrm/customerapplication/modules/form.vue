<script lang="ts" setup>
import type { CustomerApplicationDraftFormValues } from '../draft-utils';

import type { FdmWaimaoCrmCustomerApplicationApi } from '#/api/fdmwaimaocrm/customer-application';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Modal as AntModal, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createCustomerApplicationDraft,
  getCustomerApplicationDraft,
  updateCustomerApplicationDraft,
} from '#/api/fdmwaimaocrm/customer-application';

import { useCustomerApplicationDraftFormSchema } from '../data';
import {
  buildCustomerApplicationDraftCreateRequest,
  buildCustomerApplicationDraftUpdateRequest,
  createEmptyCustomerApplicationDraftFormValues,
  isCustomerApplicationVersionConflict,
  mapCustomerApplicationDraftToFormValues,
} from '../draft-utils';
import { confirmDraftVersionConflict } from '../draft-version-conflict';

defineOptions({ name: 'FdmWaimaoCrmCustomerApplicationForm' });

const emit = defineEmits<{ success: [] }>();

const editingId = ref<number>();
let openSequence = 0;

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: { class: 'w-full' },
    labelWidth: 120,
  },
  layout: 'vertical',
  schema: useCustomerApplicationDraftFormSchema(),
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
});

async function resetDraftForm() {
  await formApi.resetForm();
  await formApi.setValues(
    createEmptyCustomerApplicationDraftFormValues(),
    false,
  );
}

async function loadDraft(id: number, sequence: number) {
  const detail = await getCustomerApplicationDraft(id);
  if (sequence !== openSequence) {
    return false;
  }
  editingId.value = detail.id;
  await resetDraftForm();
  await formApi.setValues(
    mapCustomerApplicationDraftToFormValues(detail),
    false,
  );
  return true;
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }

    const values =
      await formApi.getValues<CustomerApplicationDraftFormValues>();
    modalApi.lock();
    try {
      if (editingId.value === undefined) {
        await createCustomerApplicationDraft(
          buildCustomerApplicationDraftCreateRequest(values),
        );
        message.success('客户申请草稿已创建');
      } else {
        await updateCustomerApplicationDraft(
          buildCustomerApplicationDraftUpdateRequest({
            ...values,
            id: editingId.value,
          }),
        );
        message.success('客户申请草稿已更新');
      }
      emit('success');
      await modalApi.close();
    } catch (error) {
      if (
        editingId.value !== undefined &&
        isCustomerApplicationVersionConflict(error)
      ) {
        const id = editingId.value;
        await confirmDraftVersionConflict({
          confirm: (config) => AntModal.confirm(config),
          loadLatest: () => loadDraft(id, ++openSequence),
          onLoadError: () =>
            message.error('最新内容加载失败，当前输入仍已保留'),
          onLoaded: () => message.success('已载入服务器最新内容'),
        });
      }
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    const sequence = ++openSequence;
    if (!isOpen) {
      editingId.value = undefined;
      modalApi.unlock();
      await resetDraftForm();
      return;
    }

    editingId.value = undefined;
    await resetDraftForm();
    const row =
      modalApi.getData<
        Pick<FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft, 'id'>
      >();
    if (!row?.id) {
      return;
    }

    modalApi.lock();
    try {
      await loadDraft(row.id, sequence);
    } catch {
      if (sequence === openSequence) {
        await modalApi.close();
      }
    } finally {
      if (sequence === openSequence) {
        modalApi.unlock();
      }
    }
  },
});

const title = computed(() =>
  editingId.value === undefined ? '新建客户申请草稿' : '编辑客户申请草稿',
);
</script>

<template>
  <Modal :title="title" class="w-[920px] max-w-[calc(100vw-2rem)]">
    <Form />
  </Modal>
</template>
