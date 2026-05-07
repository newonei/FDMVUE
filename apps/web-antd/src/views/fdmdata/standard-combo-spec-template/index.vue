<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import { getDataJustAccessoryPage } from '#/api/fdmdata/datajustaccessory';
import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import {
  createStandardComboSpecTemplate,
  deleteStandardComboSpecTemplate,
  getStandardComboSpecTemplate,
  getStandardComboSpecTemplatePage,
  updateStandardComboSpecTemplate,
  type StandardComboSpecTemplateApi,
} from '#/api/fdmdata/standard-combo-spec-template';

const loading = ref(false);
const list = ref<StandardComboSpecTemplateApi.Row[]>([]);
const total = ref(0);
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  specLwKey: '',
});

const accessoryOptions = ref<{ label: string; value: number }[]>([]);

const editOpen = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  id: undefined as number | undefined,
  accessoryId: undefined as number | undefined,
  specLwKey: '',
  specFullKey: '',
  remark: '',
});

async function loadAccessories() {
  const res = await getDataJustAccessoryPage({ pageNo: 1, pageSize: -1 } as any);
  const rows = res.list ?? [];
  accessoryOptions.value = rows.map((r: FdmdataDataJustAccessoryApi.Accessory) => ({
    value: r.id!,
    label: `${r.itemCode ?? ''}｜${r.productName ?? ''}`,
  }));
}

async function fetchList() {
  loading.value = true;
  try {
    const res = await getStandardComboSpecTemplatePage({
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      specLwKey: query.specLwKey?.trim() || undefined,
    });
    list.value = res.list ?? [];
    total.value = res.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editForm.id = undefined;
  editForm.accessoryId = undefined;
  editForm.specLwKey = '';
  editForm.specFullKey = '';
  editForm.remark = '';
  editOpen.value = true;
}

async function openEdit(row: StandardComboSpecTemplateApi.Row) {
  editLoading.value = true;
  editOpen.value = true;
  try {
    const d = await getStandardComboSpecTemplate(row.id!);
    editForm.id = d.id;
    editForm.accessoryId = d.accessoryId;
    editForm.specLwKey = d.specLwKey ?? '';
    editForm.specFullKey = d.specFullKey ?? '';
    editForm.remark = d.remark ?? '';
  } finally {
    editLoading.value = false;
  }
}

async function submitEdit() {
  if (editForm.accessoryId == null) {
    message.warning('请选择配件');
    return Promise.reject();
  }
  const lw = editForm.specLwKey.trim();
  const full = editForm.specFullKey.trim();
  if (!lw && !full) {
    message.warning('长*宽 与 长*宽*厚 至少填一项');
    return Promise.reject();
  }
  editLoading.value = true;
  try {
    if (editForm.id) {
      await updateStandardComboSpecTemplate({
        id: editForm.id,
        accessoryId: editForm.accessoryId,
        specLwKey: lw,
        specFullKey: full,
        remark: editForm.remark.trim() || undefined,
      });
      message.success('已更新');
    } else {
      await createStandardComboSpecTemplate({
        accessoryId: editForm.accessoryId,
        specLwKey: lw,
        specFullKey: full,
        remark: editForm.remark.trim() || undefined,
      });
      message.success('已新增');
    }
    editOpen.value = false;
    await fetchList();
  } finally {
    editLoading.value = false;
  }
}

async function handleDelete(row: StandardComboSpecTemplateApi.Row) {
  Modal.confirm({
    title: '确认删除该对照行？',
    onOk: async () => {
      await deleteStandardComboSpecTemplate(row.id!);
      message.success('已删除');
      await fetchList();
    },
  });
}

const columns: ColumnsType = [
  { title: '配件编码', dataIndex: 'accessoryItemCode', width: 140, ellipsis: true },
  { title: '配件名称', dataIndex: 'accessoryProductName', width: 200, ellipsis: true },
  { title: '成品匹配键(长*宽)', dataIndex: 'specLwKey', width: 120, ellipsis: true },
  { title: '成品匹配键(含厚)', dataIndex: 'specFullKey', width: 130, ellipsis: true },
  { title: '备注', dataIndex: 'remark', width: 160, ellipsis: true },
  {
    title: '操作',
    key: 'act',
    width: 140,
    fixed: 'right',
  },
];

onMounted(async () => {
  await loadAccessories();
  await fetchList();
});
</script>

<template>
  <Page auto-content-height description="用于标准组合生成：配件名称里含误导性「长*宽」时，在此维护该配件实际可配的瑜伽垫等成品规格键（与成品列表解析规则一致：优先长*宽*厚，可退回长*宽）。">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <Input
        v-model:value="query.specLwKey"
        allow-clear
        placeholder="按长*宽键模糊查"
        class="w-48"
        @press-enter="fetchList"
      />
      <Button type="primary" :loading="loading" @click="fetchList">查询</Button>
      <Button type="primary" @click="openCreate">新增对照</Button>
    </div>
    <Table
      size="small"
      :loading="loading"
      :data-source="list"
      :columns="columns"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        total,
        showSizeChanger: true,
        onChange: (p, ps) => {
          query.pageNo = p;
          query.pageSize = ps;
          fetchList();
        },
      }"
      row-key="id"
      bordered
      :scroll="{ x: 960 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'act'">
          <Space>
            <Button type="link" size="small" @click="openEdit(record)">编辑</Button>
            <Button type="link" size="small" danger @click="handleDelete(record)">删除</Button>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="editOpen"
      :title="editForm.id ? '编辑规格对照' : '新增规格对照'"
      :confirm-loading="editLoading"
      destroy-on-close
      width="560px"
      @ok="submitEdit"
    >
      <Form layout="vertical" class="mt-2">
        <FormItem label="配件" required>
          <Select
            v-model:value="editForm.accessoryId"
            show-search
            :options="accessoryOptions"
            :filter-option="
              (input, opt) =>
                (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            "
            placeholder="选择配件 SKU"
            class="w-full"
          />
        </FormItem>
        <FormItem label="成品规格键：长*宽" extra="如 183*61，与成品列表「匹配键(长*宽)」一致">
          <Input v-model:value="editForm.specLwKey" placeholder="183*61" allow-clear />
        </FormItem>
        <FormItem label="成品规格键：长*宽*厚（可选）" extra="若只按长宽匹配可留空">
          <Input v-model:value="editForm.specFullKey" placeholder="183*61*0.6" allow-clear />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="editForm.remark" allow-clear />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
