<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemDeptApi } from '#/api/system/dept';

import { onMounted, reactive, ref } from 'vue';

import { handleTree } from '@vben/utils';

import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
  TreeSelect,
} from 'ant-design-vue';

import {
  createIndicator,
  deleteIndicator,
  getIndicatorPage,
  updateIndicator,
} from '#/api/fdmperformance';
import { getSimpleDeptList } from '#/api/system/dept';

import { SCORE_METHOD_OPTIONS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceIndicators' });

const loading = ref(false);
const deptLoading = ref(false);
const drawerOpen = ref(false);
const rows = ref<JixiaoApi.Indicator[]>([]);
const deptTreeOptions = ref<SystemDeptApi.Dept[]>([]);
const deptNameMap = ref<Record<number, string>>({});
const total = ref(0);

const query = reactive({
  deptId: undefined as number | undefined,
  dimensionName: '',
  name: '',
  pageNo: 1,
  pageSize: 10,
  status: undefined as number | undefined,
});

const form = reactive<JixiaoApi.Indicator>({
  defaultWeight: 0,
  dimensionName: '业绩指标',
  name: '',
  scoreMethod: 'NUMBER',
  standard: '',
  status: 0,
});

const deptFieldNames = { children: 'children', label: 'name', value: 'id' };

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '指标名称', width: 180 },
  { dataIndex: 'dimensionName', title: '维度', width: 140 },
  { dataIndex: 'deptId', title: '部门', width: 140 },
  { dataIndex: 'standard', title: '考核标准' },
  { dataIndex: 'defaultWeight', title: '默认权重', width: 100 },
  { dataIndex: 'scoreMethod', title: '评分方式', width: 120 },
  { dataIndex: 'status', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 150 },
];

function buildDeptNameMap(list: SystemDeptApi.Dept[]) {
  const map: Record<number, string> = {};
  const walk = (items: SystemDeptApi.Dept[]) => {
    for (const item of items) {
      if (item.id !== undefined) {
        map[item.id] = item.name;
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(list);
  return map;
}

function deptName(deptId?: number) {
  if (!deptId) {
    return '-';
  }
  return deptNameMap.value[deptId] || `#${deptId}`;
}

async function loadDepartments() {
  deptLoading.value = true;
  try {
    const data = await getSimpleDeptList();
    deptNameMap.value = buildDeptNameMap(data);
    deptTreeOptions.value = handleTree(data) as SystemDeptApi.Dept[];
  } finally {
    deptLoading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    defaultWeight: 0,
    deptId: undefined,
    dimensionName: '业绩指标',
    id: undefined,
    name: '',
    remark: '',
    scoreMethod: 'NUMBER',
    standard: '',
    status: 0,
  });
}

async function load() {
  loading.value = true;
  try {
    const data = await getIndicatorPage(query);
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  resetForm();
  drawerOpen.value = true;
}

function openEdit(record: JixiaoApi.Indicator) {
  resetForm();
  Object.assign(form, record);
  drawerOpen.value = true;
}

async function save() {
  if (!form.name?.trim() || !form.dimensionName?.trim()) {
    message.warning('请填写指标名称和维度');
    return;
  }
  await (form.id ? updateIndicator(form) : createIndicator(form));
  message.success('已保存');
  drawerOpen.value = false;
  await load();
}

async function remove(id?: number) {
  if (!id) return;
  await deleteIndicator(id);
  message.success('已删除');
  await load();
}

function handleTableChange(pagination: any) {
  query.pageNo = pagination.current;
  query.pageSize = pagination.pageSize;
  load();
}

onMounted(() => {
  loadDepartments();
  load();
});
</script>

<template>
  <PerformanceShell title="指标库">
    <template #actions>
      <Button type="primary" @click="openCreate">新增指标</Button>
    </template>

    <div class="filter-bar">
      <Input v-model:value="query.name" allow-clear placeholder="指标名称" />
      <Input
        v-model:value="query.dimensionName"
        allow-clear
        placeholder="维度"
      />
      <TreeSelect
        v-model:value="query.deptId"
        allow-clear
        :field-names="deptFieldNames"
        :loading="deptLoading"
        placeholder="选择部门"
        show-search
        tree-default-expand-all
        :tree-data="deptTreeOptions"
        tree-node-filter-prop="name"
      />
      <Select
        v-model:value="query.status"
        allow-clear
        :options="[
          { label: '启用', value: 0 },
          { label: '停用', value: 1 },
        ]"
        placeholder="状态"
      />
      <Button type="primary" @click="load">查询</Button>
    </div>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{ current: query.pageNo, pageSize: query.pageSize, total }"
      row-key="id"
      size="middle"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'defaultWeight'">
          {{ record.defaultWeight || 0 }}%
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <Tag :color="record.status === 0 ? 'green' : 'red'">
            {{ record.status === 0 ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'deptId'">
          {{ deptName(record.deptId) }}
        </template>
        <template v-else-if="column.dataIndex === 'scoreMethod'">
          {{
            SCORE_METHOD_OPTIONS.find(
              (item) => item.value === record.scoreMethod,
            )?.label || record.scoreMethod
          }}
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button size="small" type="link" @click="openEdit(record)">
编辑
</Button>
            <Popconfirm title="确认删除该指标？" @confirm="remove(record.id)">
              <Button danger size="small" type="link">删除</Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Drawer
      v-model:open="drawerOpen"
      destroy-on-close
      :width="520"
      title="指标编辑"
      @close="resetForm"
    >
      <Form layout="vertical">
        <Form.Item label="指标名称" required>
          <Input v-model:value="form.name" />
        </Form.Item>
        <Form.Item label="维度" required>
          <Input
            v-model:value="form.dimensionName"
            placeholder="如：业绩指标、工作态度"
          />
        </Form.Item>
        <Form.Item label="部门">
          <TreeSelect
            v-model:value="form.deptId"
            allow-clear
            :field-names="deptFieldNames"
            :loading="deptLoading"
            placeholder="选择部门"
            show-search
            tree-default-expand-all
            :tree-data="deptTreeOptions"
            tree-node-filter-prop="name"
          />
        </Form.Item>
        <Form.Item label="考核标准">
          <Textarea v-model:value="form.standard" :rows="5" />
        </Form.Item>
        <Form.Item label="默认权重">
          <InputNumber
            v-model:value="form.defaultWeight"
            :max="100"
            :min="0"
            class="full"
            addon-after="%"
          />
        </Form.Item>
        <Form.Item label="评分方式">
          <Select
            v-model:value="form.scoreMethod"
            :options="SCORE_METHOD_OPTIONS"
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select
            v-model:value="form.status"
            :options="[
              { label: '启用', value: 0 },
              { label: '停用', value: 1 },
            ]"
          />
        </Form.Item>
        <Form.Item label="备注">
          <Input v-model:value="form.remark" />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="drawerOpen = false">取消</Button>
          <Button type="primary" @click="save">保存</Button>
        </Space>
      </template>
    </Drawer>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 160px 180px 120px auto;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.full {
  width: 100%;
}

@media (max-width: 900px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }
}
</style>
