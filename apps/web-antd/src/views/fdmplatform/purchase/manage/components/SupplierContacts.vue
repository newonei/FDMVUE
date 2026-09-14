<script setup lang="ts">
import type { SupplierContact } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { Alert, Button, message, Space, Table, Tag } from 'ant-design-vue';

import {
  getSupplierContacts,
  saveSupplierContact,
} from '#/api/fdmplatform/procurement';

import ActionDialog from '../../../components/ActionDialog.vue';
import { errorText, field } from '../../../data';
const props = defineProps<{ supplierId: string }>();
const emit = defineEmits<{ saved: [contact: SupplierContact] }>();
const contacts = ref<SupplierContact[]>([]);
const loading = ref(false);
const saving = ref(false);
const open = ref(false);
const selected = ref<SupplierContact>();
const pageError = ref('');
let sequence = 0;
const definition = computed(() => ({
  action: 'SAVE_CONTACT',
  title: selected.value ? '维护工厂联系人' : '新增工厂联系人',
  description:
    '电话按原文保存，包含国家区号与前导零。订单会保留选中时的联系人快照。',
  fields: [
    field('name', '姓名'),
    field('role', '职务 / 对接事项', undefined, { required: false }),
    field('phone', '电话', undefined, { required: false }),
    field('email', '邮箱', undefined, { required: false }),
    field('defaultContact', '默认联系人', 'boolean', { default: false }),
    field('active', '启用', 'boolean', { default: true }),
  ],
  initialValues: selected.value ? { ...selected.value } : undefined,
}));
async function load() {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const list = await getSupplierContacts(props.supplierId);
    if (run === sequence) contacts.value = list;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function save(payload: Record<string, unknown>, idempotencyKey: string) {
  saving.value = true;
  pageError.value = '';
  try {
    const result = await saveSupplierContact(props.supplierId, {
      ...payload,
      id: selected.value?.id,
      expectedVersion: selected.value?.version,
      idempotencyKey,
    });
    open.value = false;
    await load();
    emit('saved', result);
    message.success('联系人已保存');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
watch(
  () => props.supplierId,
  () => {
    open.value = false;
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <Space direction="vertical" style="width: 100%">
    <Space>
      <Button
        type="primary"
        @click="
          selected = undefined;
          open = true;
        "
      >
        新增联系人
</Button><Button :loading="loading" @click="load">刷新</Button>
</Space><Alert v-if="pageError" type="error" :message="pageError" /><Table
      :data-source="contacts"
      :loading="loading"
      row-key="id"
      :columns="[
        { key: 'name', dataIndex: 'name', title: '姓名' },
        { key: 'role', dataIndex: 'role', title: '对接事项' },
        { key: 'phone', dataIndex: 'phone', title: '电话' },
        { key: 'email', dataIndex: 'email', title: '邮箱' },
        { key: 'state', title: '状态' },
        { key: 'action', title: '操作' },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <Space v-if="column.key === 'state'">
          <Tag v-if="record.defaultContact" color="blue">默认</Tag><Tag>{{ record.active ? '启用' : '停用' }}</Tag>
</Space><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="
            selected = record as SupplierContact;
            open = true;
          "
        >
          维护
        </Button>
      </template>
</Table><ActionDialog
      :open="open"
      :definition="definition"
      :saving="saving"
      :error="pageError"
      @close="open = false"
      @submit="save"
    />
  </Space>
</template>
