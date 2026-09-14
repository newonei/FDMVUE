<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccess } from '@vben/access';

import {
  Button,
  Card,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  completeRequirement,
  getRequirementDetail,
  startDev,
} from '#/api/fdmreq';

import { displayValue, getFdmReqStatusMeta } from '../status';

defineOptions({ name: 'FdmReqRequirementDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
/** Boss/超管可见；非管理员不可见（不是灰显） */
const canApprove = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:approve']),
);

const reqNo = computed(() => String(route.query.reqNo || ''));
const loading = ref(false);
const busy = ref(false);
const detail = ref<FdmReqApi.RequirementDetail | null>(null);

const requirement = computed(() => detail.value?.requirement);
const versions = computed(() => detail.value?.versions ?? []);
const tasks = computed(() => detail.value?.tasks ?? []);

const currentProposal = computed(() => {
  const list = versions.value;
  if (!list.length) return null;
  const currentId = requirement.value?.currentVersionId;
  const byId = currentId != null ? list.find((v) => v.id === currentId) : undefined;
  return byId ?? list[list.length - 1] ?? null;
});

const showStartDev = computed(() => {
  if (!canApprove.value) return false;
  const status = requirement.value?.status;
  return status === 'PENDING_CONFIRM' && !!currentProposal.value?.contentJson;
});

const showComplete = computed(() => {
  if (!canApprove.value) return false;
  const status = String(requirement.value?.status ?? '');
  return status === 'PENDING_ACCEPTANCE' || status === 'TESTING' || status === 'PUSHED_CHECKING';
});

function formatProposal(content?: string) {
  if (!content) return '方案准备中';
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

async function load() {
  if (!reqNo.value) {
    message.error('缺少 reqNo');
    return;
  }
  loading.value = true;
  try {
    detail.value = await getRequirementDetail(reqNo.value);
  } finally {
    loading.value = false;
  }
}

async function onStartDev() {
  if (!canApprove.value) return;
  busy.value = true;
  try {
    await startDev(reqNo.value);
    message.success('已开始开发（已写入批准快照）');
    await load();
  } finally {
    busy.value = false;
  }
}

async function onComplete() {
  if (!canApprove.value) return;
  busy.value = true;
  try {
    const res = await completeRequirement(reqNo.value);
    const mergeMsg = res?.merge?.message ? `；合入：${res.merge.message}` : '';
    message.success(`已完结${mergeMsg}`);
    await load();
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page auto-content-height :loading="loading">
    <div class="mb-4 flex items-center justify-between gap-3">
      <Space>
        <Button @click="router.back()">返回</Button>
        <Button @click="load">刷新</Button>
      </Space>
      <Space>
        <Button
          v-if="showStartDev"
          type="primary"
          :loading="busy"
          @click="onStartDev"
        >
          开始开发
        </Button>
        <Button
          v-if="showComplete"
          type="primary"
          danger
          :loading="busy"
          @click="onComplete"
        >
          完结
        </Button>
      </Space>
    </div>

    <Card class="mb-4" title="原始需求（只读）">
      <div class="grid gap-2 md:grid-cols-2">
        <div><b>编号：</b>{{ displayValue(requirement?.reqNo) }}</div>
        <div>
          <b>状态：</b>
          <Tag :color="getFdmReqStatusMeta(requirement?.status).color">
            {{ getFdmReqStatusMeta(requirement?.status).label }}
          </Tag>
        </div>
        <div class="md:col-span-2"><b>标题：</b>{{ displayValue(requirement?.title) }}</div>
        <div><b>提交人：</b>{{ displayValue(requirement?.submitterId) }}</div>
        <div><b>创建时间：</b>{{ displayValue(requirement?.createTime) }}</div>
      </div>
      <pre class="mt-3 whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-sm">{{
        displayValue(requirement?.rawDescription)
      }}</pre>
    </Card>

    <Card class="mb-4" title="当前方案（只读）">
      <div v-if="currentProposal" class="mb-2 text-sm text-muted-foreground">
        内部版本 {{ displayValue(currentProposal.versionNo) }}
        · hash {{ displayValue(currentProposal.snapshotHash) }}
      </div>
      <pre class="whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-sm">{{
        formatProposal(currentProposal?.contentJson)
      }}</pre>
    </Card>

    <Card title="开发进展">
      <Table
        :data-source="tasks"
        :pagination="false"
        row-key="id"
        :locale="{ emptyText: '无' }"
        :columns="[
          { title: '任务号', dataIndex: 'taskNo', width: 220 },
          { title: '状态', dataIndex: 'status', width: 140 },
          { title: '分支', dataIndex: 'branchName' },
          { title: 'SHA', dataIndex: 'commitSha', width: 120 },
          { title: 'PR', dataIndex: 'prUrl' },
          { title: '心跳', dataIndex: 'heartbeatAt', width: 180 },
          { title: '日志摘要', dataIndex: 'logExcerpt' },
          { title: '失败原因', dataIndex: 'failReason' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="getFdmReqStatusMeta(record.status).color">
              {{ getFdmReqStatusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'prUrl'">
            <a v-if="record.prUrl" :href="record.prUrl" target="_blank" rel="noopener noreferrer">打开</a>
            <span v-else>无</span>
          </template>
          <template v-else-if="['branchName','commitSha','heartbeatAt','logExcerpt','failReason'].includes(String(column.dataIndex))">
            {{ displayValue(record[column.dataIndex as string]) }}
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
