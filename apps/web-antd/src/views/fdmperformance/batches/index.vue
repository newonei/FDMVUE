<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Input, Select, Space, Table, Tag } from 'ant-design-vue';

import { getBatchPage, getInstancePage } from '#/api/fdmperformance';

import { INSTANCE_STATUS_MAP } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceBatches' });

const router = useRouter();
const loading = ref(false);
const instanceLoading = ref(false);
const batches = ref<JixiaoApi.Batch[]>([]);
const instances = ref<JixiaoApi.Instance[]>([]);
const selectedBatch = ref<JixiaoApi.Batch>();
const batchTotal = ref(0);
const instanceTotal = ref(0);
const batchQuery = reactive({
  name: '',
  pageNo: 1,
  pageSize: 10,
  periodKey: '',
  status: undefined as number | undefined,
});
const instanceQuery = reactive({
  batchId: undefined as number | undefined,
  pageNo: 1,
  pageSize: 10,
  status: undefined as number | undefined,
});

const batchColumns: TableColumnsType = [
  { dataIndex: 'name', title: '批次名称' },
  { dataIndex: 'templateName', title: '考评表', width: 180 },
  { dataIndex: 'periodKey', title: '周期', width: 120 },
  { dataIndex: 'totalCount', title: '人数', width: 90 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'createTime', title: '发起时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 120 },
];

const instanceColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人' },
  { dataIndex: 'supervisorUserName', title: '主管' },
  { dataIndex: 'currentTaskName', title: '当前节点' },
  { dataIndex: 'finalScore', title: '主管汇总分', width: 120 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 100 },
];

function instanceStatus(status?: number): { color: string; text: string } {
  return INSTANCE_STATUS_MAP[status ?? 1] ?? { color: 'default', text: '-' };
}

async function loadBatches() {
  loading.value = true;
  try {
    const data = await getBatchPage(batchQuery);
    batches.value = data.list;
    batchTotal.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadInstances(batch?: JixiaoApi.Batch) {
  if (batch) {
    selectedBatch.value = batch;
    instanceQuery.batchId = batch.id;
    instanceQuery.pageNo = 1;
  }
  if (!instanceQuery.batchId) return;
  instanceLoading.value = true;
  try {
    const data = await getInstancePage(instanceQuery);
    instances.value = data.list;
    instanceTotal.value = data.total;
  } finally {
    instanceLoading.value = false;
  }
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

function changeBatchPage(pagination: any) {
  batchQuery.pageNo = pagination.current;
  batchQuery.pageSize = pagination.pageSize;
  loadBatches();
}

function changeInstancePage(pagination: any) {
  instanceQuery.pageNo = pagination.current;
  instanceQuery.pageSize = pagination.pageSize;
  loadInstances();
}

onMounted(loadBatches);
</script>

<template>
  <PerformanceShell title="考核管理">
    <div class="filter-bar">
      <Input
        v-model:value="batchQuery.name"
        allow-clear
        placeholder="批次名称"
      />
      <Input
        v-model:value="batchQuery.periodKey"
        allow-clear
        placeholder="周期"
      />
      <Select
        v-model:value="batchQuery.status"
        allow-clear
        :options="[
          { label: '进行中', value: 1 },
          { label: '已完成', value: 2 },
          { label: '已取消', value: 3 },
        ]"
        placeholder="状态"
      />
      <Button type="primary" @click="loadBatches">查询</Button>
    </div>

    <Table
      :columns="batchColumns"
      :data-source="batches"
      :loading="loading"
      :pagination="{
        current: batchQuery.pageNo,
        pageSize: batchQuery.pageSize,
        total: batchTotal,
      }"
      row-key="id"
      @change="changeBatchPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'status'">
          <Tag :color="instanceStatus(record.status).color">
            {{ instanceStatus(record.status).text }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Button size="small" type="link" @click="loadInstances(record)">
            查看人员
          </Button>
        </template>
      </template>
    </Table>

    <div v-if="selectedBatch" class="instance-panel">
      <div class="panel-head">
        <strong>{{ selectedBatch.name }} / 单人实例</strong>
        <Space>
          <Select
            v-model:value="instanceQuery.status"
            allow-clear
            :options="[
              { label: '进行中', value: 1 },
              { label: '已完成', value: 2 },
              { label: '已取消', value: 3 },
            ]"
            placeholder="状态"
            style="width: 120px"
            @change="loadInstances()"
          />
        </Space>
      </div>
      <Table
        :columns="instanceColumns"
        :data-source="instances"
        :loading="instanceLoading"
        :pagination="{
          current: instanceQuery.pageNo,
          pageSize: instanceQuery.pageSize,
          total: instanceTotal,
        }"
        row-key="id"
        @change="changeInstancePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="instanceStatus(record.status).color">
              {{ instanceStatus(record.status).text }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Button size="small" type="link" @click="openInstance(record)">
详情
</Button>
          </template>
        </template>
      </Table>
    </div>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar,
.instance-panel {
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 160px 130px auto;
  gap: 8px;
}

.panel-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

@media (max-width: 900px) {
  .filter-bar,
  .panel-head {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
