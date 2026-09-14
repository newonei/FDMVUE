<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, Card, Space, Table, Tag, message } from 'ant-design-vue';

import { listRequirements } from '#/api/fdmreq';

import { getFdmReqStatusMeta } from '../status';

defineOptions({ name: 'FdmReqPending' });

const router = useRouter();
const loading = ref(false);
const confirmRows = ref<FdmReqApi.Requirement[]>([]);
const acceptanceRows = ref<FdmReqApi.Requirement[]>([]);

const columns = [
  { title: '编号', dataIndex: 'reqNo', width: 180 },
  { title: '标题', dataIndex: 'title' },
  { title: '状态', dataIndex: 'status', width: 140 },
  { title: '操作', key: 'actions', width: 120 },
];

async function load() {
  loading.value = true;
  try {
    const [confirmList, acceptanceList] = await Promise.all([
      listRequirements('PENDING_CONFIRM'),
      listRequirements('PENDING_ACCEPTANCE'),
    ]);
    confirmRows.value = confirmList ?? [];
    acceptanceRows.value = acceptanceList ?? [];
  } catch (error) {
    message.error('加载待办失败');
    throw error;
  } finally {
    loading.value = false;
  }
}

function openDetail(reqNo: string) {
  router.push({ path: '/fdmreq/requirements/detail', query: { reqNo } });
}

onMounted(load);
</script>

<template>
  <Page auto-content-height :loading="loading">
    <div class="mb-4 flex justify-end">
      <Button @click="load">刷新</Button>
    </div>

    <Card class="mb-4" title="我的待确认（PENDING_CONFIRM）">
      <Table :columns="columns" :data-source="confirmRows" :pagination="false" row-key="reqNo">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status' || column.key === 'status'">
            <Tag :color="getFdmReqStatusMeta(record.status).color">
              {{ getFdmReqStatusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button type="link" @click="openDetail(record.reqNo)">去确认</Button>
          </template>
        </template>
      </Table>
    </Card>

    <Card title="我的待验收（PENDING_ACCEPTANCE）">
      <Table :columns="columns" :data-source="acceptanceRows" :pagination="false" row-key="reqNo">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status' || column.key === 'status'">
            <Tag :color="getFdmReqStatusMeta(record.status).color">
              {{ getFdmReqStatusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <Button type="link" @click="openDetail(record.reqNo)">去验收</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
