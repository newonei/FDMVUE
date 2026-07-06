<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmPerformanceActionPlanApi } from '#/api/fdmperformance/action-plan';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createFdmPerformanceActionPlan,
  deleteFdmPerformanceActionPlan,
  getFdmPerformanceActionPlanPage,
  updateFdmPerformanceActionPlan,
  updateFdmPerformanceActionPlanStatus,
} from '#/api/fdmperformance/action-plan';
import { getFdmPerformanceGoalList } from '#/api/fdmperformance/goal';
import { getSimpleUserList } from '#/api/system/user';

import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceActions' });

type ActionPlanStatus = FdmPerformanceActionPlanApi.ActionPlanStatus;
type SelectValue = number | string;

interface ActionDisplay {
  assigneeUserId?: number;
  assigneeUserName?: string;
  deadline?: string;
  goalId?: number;
  goalName?: string;
  id: number;
  name: string;
  progress: number;
  status: ActionPlanStatus;
}

interface ActionEditor {
  assigneeValue?: SelectValue;
  deadline?: string;
  goalValue?: SelectValue;
  id?: number;
  name: string;
  progress: number;
  status: ActionPlanStatus;
}

const modalOpen = ref(false);
const loading = ref(false);
const actionRows = ref<ActionDisplay[]>([]);
const users = ref<any[]>([]);
const goals = ref<any[]>([]);
const actionKeyword = ref('');
const actionGoalId = ref<number>();
const actionAssigneeUserId = ref<number>();
const actionStatus = ref<ActionPlanStatus>();
const editingTask = reactive<ActionEditor>({
  deadline: '',
  name: '',
  progress: 0,
  status: 0,
});

const statusMeta: Record<ActionPlanStatus, { color: string; label: string }> = {
  0: { color: 'default', label: '待处理' },
  1: { color: 'blue', label: '进行中' },
  2: { color: 'green', label: '已完成' },
  3: { color: 'red', label: '失败或放弃' },
};

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '任务名称' },
  { dataIndex: 'assigneeUserName', title: '负责人', width: 120 },
  { dataIndex: 'deadline', title: '截止时间', width: 140 },
  { dataIndex: 'goalId', title: '关联目标', width: 220 },
  { dataIndex: 'progress', title: '进度', width: 180 },
  { dataIndex: 'status', title: '状态', width: 130 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 280 },
];

const rows = computed<ActionDisplay[]>(() => actionRows.value);

const processingCount = computed(
  () => rows.value.filter((item) => item.status === 1).length,
);
const pendingCount = computed(
  () => rows.value.filter((item) => item.status === 0).length,
);
const doneCount = computed(
  () => rows.value.filter((item) => item.status === 2).length,
);

const employeeOptions = computed(() =>
  users.value.map((item) => ({
    label: item.nickname || `用户${item.id}`,
    value: item.id,
  })),
);
const goalOptions = computed(() =>
  goals.value.map((item) => ({ label: item.name, value: item.id })),
);
const statusOptions = Object.entries(statusMeta).map(([value, meta]) => ({
  label: meta.label,
  value: Number(value),
}));

function optionLabel(
  options: { label: string; value: SelectValue }[],
  value?: SelectValue,
) {
  return options.find((item) => item.value === value)?.label?.split(' · ')[0];
}

function goalName(id?: number) {
  if (!id) {
    return '未关联';
  }
  return goals.value.find((item: any) => item.id === id)?.name || '未关联';
}

function getTaskStatusMeta(status: ActionPlanStatus) {
  return statusMeta[status] || statusMeta[0];
}

async function loadOptions() {
  const [userList, goalList] = await Promise.all([
    getSimpleUserList(),
    getFdmPerformanceGoalList(),
  ]);
  users.value = userList;
  goals.value = goalList || [];
}

async function loadActions() {
  loading.value = true;
  try {
    const page = await getFdmPerformanceActionPlanPage({
      assigneeUserId: actionAssigneeUserId.value,
      goalId: actionGoalId.value,
      name: actionKeyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 100,
      status: actionStatus.value,
    });
    actionRows.value = (page.list || []).map((item) => ({
      assigneeUserId: item.assigneeUserId,
      assigneeUserName: item.assigneeUserName,
      deadline: item.deadline,
      goalId: item.goalId,
      goalName: item.goalName,
      id: item.id!,
      name: item.name,
      progress: item.progress ?? 0,
      status: item.status ?? 0,
    }));
  } finally {
    loading.value = false;
  }
}

function resetActionFilters() {
  actionKeyword.value = '';
  actionGoalId.value = undefined;
  actionAssigneeUserId.value = undefined;
  actionStatus.value = undefined;
  loadActions();
}

async function loadPage() {
  await loadOptions();
  await loadActions();
}

function openCreate() {
  Object.assign(editingTask, {
    assigneeValue: users.value[0]?.id,
    deadline: '',
    goalValue: goalOptions.value[0]?.value,
    id: undefined,
    name: '',
    progress: 0,
    status: 0,
  });
  modalOpen.value = true;
}

function openEdit(record: ActionDisplay) {
  Object.assign(editingTask, {
    assigneeValue: record.assigneeUserId,
    deadline: record.deadline,
    goalValue: record.goalId,
    id: record.id,
    name: record.name,
    progress: record.progress,
    status: record.status,
  });
  modalOpen.value = true;
}

async function save() {
  if (!editingTask.name.trim()) {
    message.warning('请填写任务名称');
    return;
  }
  const req: FdmPerformanceActionPlanApi.ActionPlanSaveReq = {
    assigneeUserId:
      typeof editingTask.assigneeValue === 'number'
        ? editingTask.assigneeValue
        : undefined,
    assigneeUserName: optionLabel(
      employeeOptions.value,
      editingTask.assigneeValue,
    ),
    deadline: editingTask.deadline,
    goalId:
      typeof editingTask.goalValue === 'number'
        ? editingTask.goalValue
        : undefined,
    id: editingTask.id,
    name: editingTask.name,
    progress: editingTask.progress,
    sourceType: 3,
    status: editingTask.status,
  };
  await (req.id
    ? updateFdmPerformanceActionPlan(req)
    : createFdmPerformanceActionPlan(req));
  await loadActions();
  modalOpen.value = false;
  message.success('行动计划已保存');
}

async function updateStatus(id: number, status: ActionPlanStatus) {
  await updateFdmPerformanceActionPlanStatus(id, status);
  await loadActions();
  message.success('状态已更新');
}

async function removeTask(id: number) {
  await deleteFdmPerformanceActionPlan(id);
  await loadActions();
  message.success('行动计划已删除');
}

onMounted(loadPage);
</script>

<template>
  <PerformanceShell
    description="承接绩效过程中的改进任务、面谈后续动作和跨部门协作事项。"
    title="行动计划"
  >
    <template #actions>
      <Button @click="loadPage">同步待办</Button>
      <Button type="primary" @click="openCreate">新增任务</Button>
    </template>

    <div class="metric-grid">
      <Card>
        <strong>{{ rows.length }}</strong><span>全部任务</span>
      </Card>
      <Card>
        <strong>{{ pendingCount }}</strong><span>待处理</span>
      </Card>
      <Card>
        <strong>{{ processingCount }}</strong><span>进行中</span>
      </Card>
      <Card>
        <strong>{{ doneCount }}</strong><span>已完成</span>
      </Card>
    </div>

    <Card title="任务列表">
      <div class="filter-row">
        <Input
          v-model:value="actionKeyword"
          allow-clear
          placeholder="搜索任务名称"
          @press-enter="loadActions"
        />
        <Select
          v-model:value="actionGoalId"
          allow-clear
          :options="goalOptions"
          placeholder="筛选目标"
          show-search
        />
        <Select
          v-model:value="actionAssigneeUserId"
          allow-clear
          :options="employeeOptions"
          placeholder="筛选负责人"
          show-search
        />
        <Select
          v-model:value="actionStatus"
          allow-clear
          :options="statusOptions"
          placeholder="筛选状态"
        />
        <Space>
          <Button type="primary" @click="loadActions">查询</Button>
          <Button @click="resetActionFilters">重置</Button>
        </Space>
      </div>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'goalId'">
            {{ record.goalName || goalName(record.goalId) }}
          </template>
          <template v-else-if="column.dataIndex === 'progress'">
            <Progress :percent="record.progress" size="small" />
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="getTaskStatusMeta(record.status).color">
              {{ getTaskStatusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button
                size="small"
                type="link"
                @click="openEdit(record as ActionDisplay)"
              >
                编辑
              </Button>
              <Button
                size="small"
                type="link"
                @click="updateStatus(record.id, 1)"
              >
                开始
              </Button>
              <Button
                size="small"
                type="link"
                @click="updateStatus(record.id, 2)"
              >
                完成
              </Button>
              <Button
                danger
                size="small"
                type="link"
                @click="updateStatus(record.id, 3)"
              >
                放弃
              </Button>
              <Popconfirm
                title="确认删除该任务？"
                @confirm="removeTask(record.id)"
              >
                <Button danger size="small" type="link">删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalOpen"
      title="行动计划任务"
      width="720px"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="任务名称" required>
          <Input
            v-model:value="editingTask.name"
            placeholder="请输入任务名称"
          />
        </Form.Item>
        <Form.Item label="负责人" required>
          <Select
            v-model:value="editingTask.assigneeValue"
            :options="employeeOptions"
            show-search
          />
        </Form.Item>
        <Form.Item label="关联目标">
          <Select
            v-model:value="editingTask.goalValue"
            allow-clear
            :options="goalOptions"
          />
        </Form.Item>
        <Form.Item label="截止时间">
          <DatePicker
            v-model:value="editingTask.deadline"
            allow-clear
            class="full"
            format="YYYY-MM-DD"
            placeholder="请选择截止时间"
            value-format="YYYY-MM-DD"
          />
        </Form.Item>
        <Form.Item label="进度">
          <InputNumber
            v-model:value="editingTask.progress"
            :max="100"
            :min="0"
            addon-after="%"
            class="full"
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select v-model:value="editingTask.status" :options="statusOptions" />
        </Form.Item>
      </Form>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.filter-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.3fr) minmax(160px, 1fr) minmax(160px, 1fr)
    minmax(140px, 0.8fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.metric-grid :deep(.ant-card-body) {
  display: grid;
  gap: 6px;
}

.metric-grid strong {
  font-size: 28px;
  font-weight: 650;
  color: #1677ff;
}

.metric-grid span {
  color: #64748b;
}

.full {
  width: 100%;
}

@media (max-width: 960px) {
  .metric-grid,
  .filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
