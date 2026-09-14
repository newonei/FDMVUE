<script setup lang="ts">
import type { MasterRecord } from '#/api/fdmplatform';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { saveMasterData, updateMasterData } from '#/api/fdmplatform';
import { getMasterPage, getMasterRecord } from '#/api/fdmplatform/masters';

import ActionDialog from '../../components/ActionDialog.vue';
import { errorText, field } from '../../data';
import { useEntityDetail } from '../../documents/useEntityDetail';
import { useRouteOwner } from '../../documents/useRouteOwner';
import SupplierContacts from '../manage/components/SupplierContacts.vue';

defineOptions({ name: 'FdmPlatformPurchaseSuppliers' });
const contactSupplier = ref<MasterRecord>();
const activeRoute = useRouteOwner();
const records = ref<MasterRecord[]>([]);
const pageNo = ref(1);
const pageSize = ref(20);
const total = ref(0);
let sequence = 0;
const keyword = ref('');
const loading = ref(false);
const pageError = ref('');
const saving = ref(false);
const open = ref(false);
const editing = ref<MasterRecord>();
const definition = computed(() => ({
  action: 'SAVE_SUPPLIER',
  title: editing.value ? '维护供应商' : '新增供应商',
  description:
    '统一维护采购报价与采购单使用的供应商资料，停用后历史单据保持可查。',
  fields: [
    field('name', '供应商名称'),
    field('code', '供应商编码'),
    field('active', '启用', 'boolean', { default: true }),
  ],
  initialValues: editing.value ? { ...editing.value } : undefined,
}));
async function load() {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getMasterPage({
      type: 'SUPPLIER',
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    });
    if (run === sequence) {
      records.value = result.list;
      total.value = result.total;
    }
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
    const data = { ...payload, companyId: 0, type: 'SUPPLIER', idempotencyKey };
    await (editing.value
      ? updateMasterData('SUPPLIER', editing.value.id, {
          ...data,
          expectedVersion: editing.value.version,
        })
      : saveMasterData(data));
    message.success('供应商已保存');
    entityDetail.close();
    await load();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
const entityDetail = useEntityDetail(
  'supplierId',
  (id) => getMasterRecord('SUPPLIER', id),
  (value) => {
    editing.value = value;
    open.value = true;
  },
  () => {
    open.value = false;
  },
  (value) => {
    pageError.value = value;
  },
);
onMounted(load);
</script>
<template>
  <Page
    title="供应商管理"
    description="维护采购使用的供应商，新增后可直接在报价单选择。"
  >
    <Card>
      <Space direction="vertical" style="width: 100%">
        <Space>
          <Button type="primary" @click="entityDetail.open()">
            新增供应商
</Button><Input.Search
            v-model:value="keyword"
            placeholder="搜索名称或编码"
            allow-clear
            @search="
              pageNo = 1;
              load();
            "
          /><Button :loading="loading" @click="load">刷新</Button>
</Space><Alert v-if="pageError" :message="pageError" type="error" /><Table
          :data-source="records"
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            showSizeChanger: true,
          }"
          @change="
            (value) => {
              pageNo = value.current ?? 1;
              pageSize = value.pageSize ?? 20;
              load();
            }
          "
          :loading="loading"
          row-key="id"
          :columns="[
            { key: 'code', dataIndex: 'code', title: '编码' },
            { key: 'name', dataIndex: 'name', title: '供应商名称' },
            { key: 'active', title: '状态' },
            { key: 'action', title: '操作' },
          ]"
        >
          <template #bodyCell="{ column, record }">
            <Tag v-if="column.key === 'active'">
              {{ record.active ? '启用' : '停用' }}
</Tag><Button
              v-else-if="column.key === 'action'"
              type="link"
              @click="entityDetail.open(String(record.id))"
            >
              维护
</Button><Button
              v-if="column.key === 'action'"
              type="link"
              @click="contactSupplier = record as MasterRecord"
            >
              工厂联系人
            </Button>
          </template>
        </Table>
      </Space>
</Card><ActionDialog
      :open="open"
      :definition="definition"
      :saving="saving"
      :error="pageError"
      @close="entityDetail.close"
      @submit="save"
    />
    <Drawer
      :open="!!contactSupplier && activeRoute"
      :title="`${contactSupplier?.name ?? ''} · 工厂联系人`"
      width="900px"
      @close="contactSupplier = undefined"
    >
      <SupplierContacts
        v-if="contactSupplier"
        :supplier-id="contactSupplier.id"
      />
    </Drawer>
  </Page>
</template>
