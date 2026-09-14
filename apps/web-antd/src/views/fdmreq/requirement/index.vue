<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Button,
  Form,
  FormItem,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
  message,
} from 'ant-design-vue';

import { createRequirement, listRequirements } from '#/api/fdmreq';

import { FDMREQ_STATUS_OPTIONS, getFdmReqStatusMeta } from '../status';

defineOptions({ name: 'FdmReqRequirement' });

const router = useRouter();
const loading = ref(false);
const rows = ref<FdmReqApi.Requirement[]>([]);
const statusFilter = ref<string | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  title: '',
  rawDescription: '',
  submitterId: '',
});

const columns = [
  { title: '编号', dataIndex: 'reqNo', key: 'reqNo', width: 180 },
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 140 },
  { title: '提交人', dataIndex: 'submitterId', key: 'submitterId', width: 120 },
  { title: '操作', key: 'actions', width: 120 },
];

const filteredHint = computed(() =>
  statusFilter.value ? `当前筛选：${getFdmReqStatusMeta(statusFilter.value).label}` : '全部状态',
);

async function load() {
  loading.value = true;
  try {
    rows.value = (await listRequirements(statusFilter.value)) ?? [];
  } finally {
    loading.value = false;
  }
}

function openDetail(reqNo: string) {
  router.push({ path: `/fdmreq/requirements/detail`, query: { reqNo } });
}

function resetForm() {
  form.title = '';
  form.rawDescription = '';
  form.submitterId = '';
}

async function submitCreate() {
  if (!form.title.trim() || !form.rawDescription.trim()) {
    message.warning('标题、原始描述必填（编号由系统自动生成）');
    return;
  }
  creating.value = true;
  try {
    const created = await createRequirement({
      title: form.title.trim(),
      rawDescription: form.rawDescription,
      submitterId: form.submitterId.trim() || undefined,
    });
    message.success(`已创建需求 ${created?.reqNo ?? ''}`.trim());
    createOpen.value = false;
    resetForm();
    await load();
    if (created?.reqNo) {
      openDetail(created.reqNo);
    }
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page auto-content-height>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="text-muted-foreground text-sm">{{ filteredHint }} · 原始描述仅在详情只读展示</div>
      <Space>
        <Select
          v-model:value="statusFilter"
          allow-clear
          placeholder="按状态筛选"
          style="width: 200px"
          :options="FDMREQ_STATUS_OPTIONS"
          @change="load"
        />
        <Button @click="load">刷新</Button>
        <Button type="primary" @click="createOpen = true">新建需求</Button>
      </Space>
    </div>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      row-key="reqNo"
      :pagination="false"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <Tag :color="getFdmReqStatusMeta(record.status).color">
            {{ getFdmReqStatusMeta(record.status).label }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button type="link" @click="openDetail(record.reqNo)">详情</Button>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="createOpen"
      title="新建需求"
      :confirm-loading="creating"
      ok-text="创建"
      @ok="submitCreate"
      @cancel="resetForm"
    >
      <Form layout="vertical">

        <FormItem label="需求编号"><span class="text-muted-foreground text-sm">系统自动生成（REQ-yyyyMMdd-NN，上海时区）</span></FormItem>
        <FormItem label="标题" required>
          <Input v-model:value="form.title" />
        </FormItem>
        <FormItem label="原始描述（创建后不可被整理稿覆盖）" required>
          <Textarea v-model:value="form.rawDescription" :rows="5" />
        </FormItem>
        <FormItem label="提交人 ID">
          <Input v-model:value="form.submitterId" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
