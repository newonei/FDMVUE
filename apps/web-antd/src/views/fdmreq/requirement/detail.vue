<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Form,
  FormItem,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Textarea,
  message,
} from 'ant-design-vue';

import {
  approveRequirement,
  createRequirementTask,
  createRequirementVersion,
  getRequirementDetail,
} from '#/api/fdmreq';

import { displayValue, getFdmReqStatusMeta } from '../status';

defineOptions({ name: 'FdmReqRequirementDetail' });

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const canApprove = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:approve']),
);

const reqNo = computed(() => String(route.query.reqNo || ''));
const loading = ref(false);
const detail = ref<FdmReqApi.RequirementDetail | null>(null);

const versionOpen = ref(false);
const approveOpen = ref(false);
const taskOpen = ref(false);
const busy = ref(false);

const versionForm = reactive({
  versionNo: 'v1',
  contentJson: '{\n  "facts": "",\n  "assumptions": "",\n  "openQuestions": "",\n  "scope": "",\n  "outOfScope": "",\n  "acceptance": ""\n}',
});
const approveForm = reactive({
  versionId: undefined as number | undefined,
  allowedScopeJson: '{"repos":["newonei/FDMServer","newonei/FDMVUE"],"branch_policy":"feature+PR","auto_merge_main":false,"auto_deploy_prod":false}',
});
const taskForm = reactive({
  versionId: undefined as number | undefined,
  approvalId: undefined as number | undefined,
  branchName: '',
});

const requirement = computed(() => detail.value?.requirement);
const versions = computed(() => detail.value?.versions ?? []);
const approvals = computed(() => detail.value?.approvals ?? []);
const tasks = computed(() => detail.value?.tasks ?? []);
const reports = computed(() => detail.value?.reports ?? []);

async function load() {
  if (!reqNo.value) {
    message.error('缺少 reqNo');
    return;
  }
  loading.value = true;
  try {
    detail.value = await getRequirementDetail(reqNo.value);
    const latestVersion = versions.value[versions.value.length - 1];
    const latestApproval = approvals.value[approvals.value.length - 1];
    approveForm.versionId = latestVersion?.id;
    taskForm.versionId = latestVersion?.id;
    taskForm.approvalId = latestApproval?.id;
    taskForm.branchName = `feat/${reqNo.value}`;
  } finally {
    loading.value = false;
  }
}

async function submitVersion() {
  busy.value = true;
  try {
    await createRequirementVersion(reqNo.value, {
      versionNo: versionForm.versionNo.trim(),
      contentJson: versionForm.contentJson,
      createdBy: String(userStore.userInfo?.id ?? ''),
    });
    message.success('已创建不可变版本');
    versionOpen.value = false;
    await load();
  } finally {
    busy.value = false;
  }
}

async function submitApprove() {
  if (!canApprove.value) {
    message.error('无确认授权权限（需要 fdmreq:requirement:approve 或超管）');
    return;
  }
  if (!approveForm.versionId) {
    message.warning('请先有版本');
    return;
  }
  busy.value = true;
  try {
    await approveRequirement(reqNo.value, {
      versionId: approveForm.versionId,
      approverId: String(userStore.userInfo?.id ?? 'admin'),
      allowedScopeJson: approveForm.allowedScopeJson,
    });
    message.success('已确认需求并授权开发');
    approveOpen.value = false;
    await load();
  } finally {
    busy.value = false;
  }
}

async function submitTask() {
  if (!taskForm.versionId || !taskForm.approvalId) {
    message.warning('需要有效 versionId 与 approvalId');
    return;
  }
  busy.value = true;
  try {
    await createRequirementTask(reqNo.value, {
      versionId: taskForm.versionId,
      approvalId: taskForm.approvalId,
      branchName: taskForm.branchName || undefined,
    });
    message.success('已创建/返回开发任务（幂等）');
    taskOpen.value = false;
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
        <Button @click="versionOpen = true">新建整理版本</Button>
        <Button v-if="canApprove" type="primary" @click="approveOpen = true">确认需求并授权开发</Button>
        <Button @click="taskOpen = true">创建开发任务</Button>
      </Space>
    </div>

    <Card class="mb-4" title="需求概况">
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
        <div><b>当前版本 ID：</b>{{ displayValue(requirement?.currentVersionId) }}</div>
      </div>
    </Card>

    <Card class="mb-4" title="原始区（只读，不可被整理稿覆盖）">
      <pre class="whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-sm">{{
        displayValue(requirement?.rawDescription)
      }}</pre>
    </Card>

    <Card class="mb-4" title="版本列表（不可变快照）">
      <Table
        :data-source="versions"
        :pagination="false"
        row-key="id"
        :columns="[
          { title: '版本号', dataIndex: 'versionNo', width: 100 },
          { title: '快照 Hash', dataIndex: 'snapshotHash' },
          { title: '创建人', dataIndex: 'createdBy', width: 120 },
          { title: '时间', dataIndex: 'createTime', width: 180 },
        ]"
      />
    </Card>

    <Card class="mb-4" title="审批">
      <Table
        :data-source="approvals"
        :pagination="false"
        row-key="id"
        :columns="[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '版本 ID', dataIndex: 'versionId', width: 100 },
          { title: '审批人', dataIndex: 'approverId', width: 120 },
          { title: '时间', dataIndex: 'approvedAt', width: 180 },
          { title: '授权范围', dataIndex: 'allowedScopeJson' },
        ]"
      />
    </Card>

    <Card class="mb-4" title="任务 / 交付（已推送 ≠ 测试通过 ≠ 已验收 ≠ 可生产发布）">
      <Table
        :data-source="tasks"
        :pagination="false"
        row-key="id"
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

    <Card title="测试报告">
      <Table
        :data-source="reports"
        :pagination="false"
        row-key="id"
        :columns="[
          { title: '结果', dataIndex: 'result', width: 100 },
          { title: '任务', dataIndex: 'taskId', width: 80 },
          { title: 'SHA', dataIndex: 'commitSha', width: 120 },
          { title: '命令', dataIndex: 'commandsJson' },
          { title: '未执行原因', dataIndex: 'skippedReason' },
          { title: '剩余风险', dataIndex: 'residualRisk' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex !== 'result'">
            {{ displayValue(record[column.dataIndex as string]) }}
          </template>
        </template>
      </Table>
    </Card>

    <Modal v-model:open="versionOpen" title="新建整理版本" :confirm-loading="busy" @ok="submitVersion">
      <Form layout="vertical">
        <FormItem label="versionNo" required>
          <Input v-model:value="versionForm.versionNo" />
        </FormItem>
        <FormItem label="contentJson（分区内容）" required>
          <Textarea v-model:value="versionForm.contentJson" :rows="10" />
        </FormItem>
      </Form>
    </Modal>

    <Modal v-model:open="approveOpen" title="确认需求并授权开发" :confirm-loading="busy" @ok="submitApprove">
      <Form layout="vertical">
        <FormItem label="versionId" required>
          <Input v-model:value="approveForm.versionId" type="number" />
        </FormItem>
        <FormItem label="allowedScopeJson">
          <Textarea v-model:value="approveForm.allowedScopeJson" :rows="6" />
        </FormItem>
      </Form>
    </Modal>

    <Modal v-model:open="taskOpen" title="创建开发任务" :confirm-loading="busy" @ok="submitTask">
      <Form layout="vertical">
        <FormItem label="versionId" required>
          <Input v-model:value="taskForm.versionId" type="number" />
        </FormItem>
        <FormItem label="approvalId" required>
          <Input v-model:value="taskForm.approvalId" type="number" />
        </FormItem>
        <FormItem label="branchName">
          <Input v-model:value="taskForm.branchName" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
