<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import { getSimpleDeptList } from '#/api/system/dept';
import { getSimpleUserList } from '#/api/system/user';
import type { FdmPerformanceGoalApi } from '#/api/fdmperformance/goal';

import {
  createFdmPerformanceActionPlanFromGoal,
  createFdmPerformanceGoal,
  deleteFdmPerformanceGoal,
  getFdmPerformanceGoalPage,
  updateFdmPerformanceGoal,
} from '#/api/fdmperformance/goal';
import { getFdmPerformanceIndicatorPage } from '#/api/fdmperformance/indicator';

import PerformanceShell from '../shared/PerformanceShell.vue';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceGoals' });

type GoalStatus = FdmPerformanceGoalApi.GoalStatus;
type SelectValue = number | string;

interface GoalDisplay {
  deptId?: number;
  deptName?: string;
  id: number;
  linkedIndicatorIds: number[];
  name: string;
  ownerUserId?: number;
  ownerUserName?: string;
  progress: number;
  status: GoalStatus;
  targetValue: string;
}

interface GoalEditor {
  deptValue?: SelectValue;
  id?: number;
  linkedIndicatorIds: number[];
  name: string;
  ownerValue?: SelectValue;
  progress: number;
  status: GoalStatus;
  targetValue: string;
}

const router = useRouter();
const { performancePath } = usePerformancePath();

const modalOpen = ref(false);
const loading = ref(false);
const goalRows = ref<GoalDisplay[]>([]);
const users = ref<any[]>([]);
const depts = ref<any[]>([]);
const indicators = ref<any[]>([]);
const goalKeyword = ref('');
const goalDeptId = ref<number>();
const goalOwnerUserId = ref<number>();
const goalStatus = ref<GoalStatus>();
const editingGoal = reactive<GoalEditor>({
  linkedIndicatorIds: [],
  name: '',
  progress: 0,
  status: 0,
  targetValue: '',
});

const statusMeta: Record<GoalStatus, { color: string; label: string }> = {
  0: { color: 'blue', label: '进行中' },
  1: { color: 'orange', label: '有风险' },
  2: { color: 'green', label: '已达成' },
};

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '目标名称' },
  { dataIndex: 'deptName', title: '部门', width: 140 },
  { dataIndex: 'ownerUserName', title: '负责人', width: 120 },
  { dataIndex: 'targetValue', title: '目标值', width: 260 },
  { dataIndex: 'linkedIndicatorIds', title: '关联指标', width: 260 },
  { dataIndex: 'progress', title: '进度', width: 180 },
  { dataIndex: 'status', title: '状态', width: 120 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 250 },
];

const rows = computed<GoalDisplay[]>(() => goalRows.value);

const avgProgress = computed(() => {
  const total = rows.value.reduce((sum, item) => sum + item.progress, 0);
  return Math.round(total / Math.max(rows.value.length, 1));
});
const atRiskCount = computed(() => rows.value.filter((item) => item.status === 1).length);
const doneCount = computed(() => rows.value.filter((item) => item.status === 2).length);

const employeeOptions = computed(() =>
  users.value.map((item) => ({ label: `${item.nickname || `用户${item.id}`} · ${deptName(item.deptId)}`, value: item.id })),
);
const deptOptions = computed(() =>
  depts.value.map((item) => ({ label: item.name, value: item.id })),
);
const indicatorOptions = computed(() =>
  indicators.value.map((item) => ({ label: item.name, value: item.id })),
);
const statusOptions = Object.entries(statusMeta).map(([value, meta]) => ({
  label: meta.label,
  value: Number(value),
}));

function deptName(id?: number) {
  return depts.value.find((item) => item.id === id)?.name || '未分配';
}

function optionLabel(options: { label: string; value: SelectValue }[], value?: SelectValue) {
  return options.find((item) => item.value === value)?.label?.split(' · ')[0];
}

function indicatorNames(ids: number[]) {
  return ids.map((id) => indicators.value.find((item: any) => item.id === id)?.name).filter(Boolean);
}

function getGoalStatusMeta(status: GoalStatus) {
  return statusMeta[status] || statusMeta[0];
}

async function loadOptions() {
  const [userList, deptList, indicatorPage] = await Promise.all([
    getSimpleUserList(),
    getSimpleDeptList(),
    getFdmPerformanceIndicatorPage({ pageNo: 1, pageSize: 200, status: 0 }),
  ]);
  users.value = userList;
  depts.value = deptList;
  indicators.value = indicatorPage.list || [];
}

async function loadGoals() {
  loading.value = true;
  try {
    const page = await getFdmPerformanceGoalPage({
      deptId: goalDeptId.value,
      name: goalKeyword.value.trim() || undefined,
      ownerUserId: goalOwnerUserId.value,
      pageNo: 1,
      pageSize: 100,
      status: goalStatus.value,
    });
    goalRows.value = (page.list || []).map((item) => ({
      deptId: item.deptId,
      deptName: item.deptName,
      id: item.id!,
      linkedIndicatorIds: item.linkedIndicatorIds || [],
      name: item.name,
      ownerUserId: item.ownerUserId,
      ownerUserName: item.ownerUserName,
      progress: item.progress ?? 0,
      status: item.status ?? 0,
      targetValue: item.targetValue,
    }));
  } finally {
    loading.value = false;
  }
}

function resetGoalFilters() {
  goalKeyword.value = '';
  goalDeptId.value = undefined;
  goalOwnerUserId.value = undefined;
  goalStatus.value = undefined;
  loadGoals();
}

async function loadPage() {
  await loadOptions();
  await loadGoals();
}

function openCreate() {
  Object.assign(editingGoal, {
    deptValue: depts.value[0]?.id,
    id: undefined,
    linkedIndicatorIds: [],
    name: '',
    ownerValue: users.value[0]?.id,
    progress: 0,
    status: 0,
    targetValue: '',
  });
  modalOpen.value = true;
}

function openEdit(goal: GoalDisplay) {
  Object.assign(editingGoal, {
    deptValue: goal.deptId,
    id: goal.id,
    linkedIndicatorIds: [...goal.linkedIndicatorIds],
    name: goal.name,
    ownerValue: goal.ownerUserId,
    progress: goal.progress,
    status: goal.status,
    targetValue: goal.targetValue,
  });
  modalOpen.value = true;
}

async function saveGoal() {
  if (!editingGoal.name.trim()) {
    message.warning('请填写目标名称');
    return;
  }
  if (!editingGoal.targetValue.trim()) {
    message.warning('请填写目标值');
    return;
  }
  const req: FdmPerformanceGoalApi.GoalSaveReq = {
    deptId: typeof editingGoal.deptValue === 'number' ? editingGoal.deptValue : undefined,
    deptName: optionLabel(deptOptions.value, editingGoal.deptValue),
    id: editingGoal.id,
    linkedIndicatorIds: editingGoal.linkedIndicatorIds,
    name: editingGoal.name,
    ownerUserId: typeof editingGoal.ownerValue === 'number' ? editingGoal.ownerValue : undefined,
    ownerUserName: optionLabel(employeeOptions.value, editingGoal.ownerValue),
    progress: editingGoal.progress,
    status: editingGoal.status,
    targetValue: editingGoal.targetValue,
  };
  if (req.id) {
    await updateFdmPerformanceGoal(req);
  } else {
    await createFdmPerformanceGoal(req);
  }
  await loadGoals();
  modalOpen.value = false;
  message.success('目标已保存');
}

async function removeGoal(id: number) {
  await deleteFdmPerformanceGoal(id);
  await loadGoals();
  message.success('目标已删除');
}

async function createPlan(goalId: number) {
  const actionPlanId = await createFdmPerformanceActionPlanFromGoal(goalId);
  Modal.confirm({
    cancelText: '继续留在目标地图',
    content: `行动计划编号：${actionPlanId}`,
    okText: '查看行动计划',
    onOk: () => router.push(performancePath('/actions')),
    title: '已生成行动计划',
  });
}

onMounted(loadPage);
</script>

<template>
  <PerformanceShell
    description="把公司、部门目标和绩效指标建立关系，考评表可从目标地图导入指标。"
    title="目标地图"
  >
    <template #actions>
      <Button @click="router.push(performancePath('/indicators'))">指标库</Button>
      <Button @click="router.push(performancePath('/actions'))">行动计划</Button>
      <Button type="primary" @click="openCreate">新增目标</Button>
    </template>

    <div class="metric-grid">
      <Card><Statistic :value="rows.length" title="目标数" /></Card>
      <Card><Statistic :value="avgProgress" suffix="%" title="平均进度" /></Card>
      <Card><Statistic :value="atRiskCount" title="风险目标" /></Card>
      <Card><Statistic :value="doneCount" title="已达成" /></Card>
    </div>

    <Card title="目标分解">
      <div class="filter-row">
        <Input
          v-model:value="goalKeyword"
          allow-clear
          placeholder="搜索目标名称"
          @press-enter="loadGoals"
        />
        <Select
          v-model:value="goalDeptId"
          allow-clear
          :options="deptOptions"
          placeholder="筛选部门"
          show-search
        />
        <Select
          v-model:value="goalOwnerUserId"
          allow-clear
          :options="employeeOptions"
          placeholder="筛选负责人"
          show-search
        />
        <Select
          v-model:value="goalStatus"
          allow-clear
          :options="statusOptions"
          placeholder="筛选状态"
        />
        <Space>
          <Button type="primary" @click="loadGoals">查询</Button>
          <Button @click="resetGoalFilters">重置</Button>
        </Space>
      </div>
      <Table :columns="columns" :data-source="rows" :loading="loading" :pagination="false" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'linkedIndicatorIds'">
            <Space :size="4" wrap>
              <Tag v-for="name in indicatorNames(record.linkedIndicatorIds)" :key="name" color="blue">
                {{ name }}
              </Tag>
            </Space>
          </template>
          <template v-else-if="column.dataIndex === 'progress'">
            <Progress :percent="record.progress" size="small" />
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="getGoalStatusMeta(record.status).color">{{ getGoalStatusMeta(record.status).label }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button size="small" type="link" @click="createPlan(record.id)">生成行动计划</Button>
              <Button size="small" type="link" @click="openEdit(record as GoalDisplay)">编辑</Button>
              <Popconfirm title="确认删除该目标？" @confirm="removeGoal(record.id)">
                <Button danger size="small" type="link">删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Card title="目标到考核的关系">
      <div class="relation-grid">
        <div v-for="goal in rows" :key="goal.id" class="relation-card">
          <div>
            <strong>{{ goal.name }}</strong>
            <span>{{ goal.deptName || '未分配' }} · {{ goal.ownerUserName || '未指定' }}</span>
          </div>
          <div class="relation-arrow">目标指标</div>
          <div class="indicator-list">
            <Tag v-for="name in indicatorNames(goal.linkedIndicatorIds)" :key="name" color="processing">
              {{ name }}
            </Tag>
          </div>
        </div>
      </div>
    </Card>

    <Modal v-model:open="modalOpen" title="目标设置" width="720px" @ok="saveGoal">
      <Form layout="vertical">
        <Form.Item label="目标名称" required>
          <Input v-model:value="editingGoal.name" placeholder="请输入目标名称" />
        </Form.Item>
        <Form.Item label="部门" required>
          <Select v-model:value="editingGoal.deptValue" :options="deptOptions" />
        </Form.Item>
        <Form.Item label="负责人" required>
          <Select v-model:value="editingGoal.ownerValue" :options="employeeOptions" show-search />
        </Form.Item>
        <Form.Item label="目标值" required>
          <Input v-model:value="editingGoal.targetValue" placeholder="例如：月度毛利增长率提升 12%" />
        </Form.Item>
        <Form.Item label="关联指标">
          <Select v-model:value="editingGoal.linkedIndicatorIds" :options="indicatorOptions" mode="multiple" />
        </Form.Item>
        <Form.Item label="进度">
          <InputNumber v-model:value="editingGoal.progress" :max="100" :min="0" addon-after="%" class="full" />
        </Form.Item>
        <Form.Item label="状态">
          <Select v-model:value="editingGoal.status" :options="statusOptions" />
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
  grid-template-columns: minmax(180px, 1.3fr) minmax(140px, 1fr) minmax(160px, 1fr) minmax(140px, 0.8fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.relation-grid {
  display: grid;
  gap: 12px;
}

.relation-card {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 100px minmax(260px, 1.4fr);
  gap: 16px;
  align-items: center;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.relation-card strong,
.relation-card span {
  display: block;
}

.relation-card span {
  margin-top: 6px;
  color: #64748b;
}

.relation-arrow {
  color: #1677ff;
  text-align: center;
}

.indicator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.full {
  width: 100%;
}

@media (max-width: 960px) {
  .metric-grid,
  .filter-row,
  .relation-card {
    grid-template-columns: 1fr;
  }

  .relation-arrow {
    text-align: left;
  }
}
</style>
