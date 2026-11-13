<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';
import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemDeptApi } from '#/api/system/dept';
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import {
  downloadFileFromBlobPart,
  getLayoutScrollElement,
  handleTree,
} from '@vben/utils';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Textarea,
  TreeSelect,
} from 'ant-design-vue';
import {
  cancelInstance,
  deleteInstance,
  exportInstanceExcel,
  getInstancePage,
  getPerformanceAccess,
  remindInstances,
} from '#/api/fdmperformance';
import { getSimpleDeptList } from '#/api/system/dept';
import { usePerformanceManagementStore } from '#/store/performance-management';
import { usePerformanceAccess } from '../shared/access';
import {
  INSTANCE_STATUS_MAP,
  PERFORMANCE_PAGE_SIZE_OPTIONS,
  TASK_LABELS,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import {
  actionLabel,
  defaultManagementScope,
  hasAction,
  managementScopes,
  SCOPE_LABELS,
  visibilityLabel,
} from '../shared/workspace';
import TemplateManager from '../templates/components/TemplateManager.vue';
import HrReviewQueue from './components/HrReviewQueue.vue';
import {
  defaultManagementQuery,
  restoreManagementListState,
} from './list-state';

defineOptions({ name: 'FdmPerformanceBatches' });
const router = useRouter();
const listState = usePerformanceManagementStore();
const shell = ref<InstanceType<typeof PerformanceShell>>();
const { access, accessLoading } = usePerformanceAccess();
const loading = ref(false);
const loadError = ref(false);
const exporting = ref(false);
const reminding = ref(false);
const deptLoading = ref(false);
const deptTreeOptions = ref<SystemDeptApi.Dept[]>([]);
const rows = ref<JixiaoApi.Instance[]>([]);
const total = ref(0);
const selectedIds = ref<number[]>([]);
const activeTab = ref('instances');
const cancelOpen = ref(false);
const cancelTarget = ref<JixiaoApi.Instance>();
const cancelReason = ref('');
const cancelLoading = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref<JixiaoApi.Instance>();
const deleteReason = ref('');
const deleteLoading = ref(false);
let requestId = 0;
let lifecycleId = 0;
let initialized = false;
let activatedOnce = false;
let pageActive = false;
let stateOwner = listState.identity;
let scrollTop = 0;
const query = reactive(defaultManagementQuery());
const appliedQuery = reactive(defaultManagementQuery());
const rememberedCreators = ref<{ label: string; value: number }[]>([]);
const scopes = computed(() => managementScopes(access.value));
const creatorOptions = computed(() => [
  ...new Map([
    ...rememberedCreators.value.map(
      (option) => [option.value, option] as const,
    ),
    ...rows.value
      .filter((row) => row.creatorUserId)
      .map(
        (row) =>
          [
            row.creatorUserId,
            {
              label: row.creatorUserName || `用户 ${row.creatorUserId}`,
              value: row.creatorUserId!,
            },
          ] as const,
      ),
  ]).values(),
]);
const selectedRows = computed(() =>
  rows.value.filter((row) => selectedIds.value.includes(row.id!)),
);
const canRemindSelected = computed(
  () =>
    selectedRows.value.length > 0 &&
    selectedRows.value.every((row) => hasAction(row, 'REMIND')),
);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedIds.value,
  getCheckboxProps: (row: JixiaoApi.Instance) => ({
    disabled: !hasAction(row, 'REMIND'),
  }),
  onChange: (keys: (number | string)[]) => {
    selectedIds.value = keys.map(Number);
  },
}));
const columns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人', width: 160 },
  { dataIndex: 'templateName', title: '考核与周期', width: 200 },
  { dataIndex: 'creatorUserName', title: '发起人', width: 120 },
  { dataIndex: 'currentTaskName', title: '阶段与处理人', width: 180 },
  { dataIndex: 'finalScore', title: '成绩', width: 130 },
  { dataIndex: 'action', title: '操作', fixed: 'right', width: 220 },
];
async function load() {
  if (!access.value?.canManage) return;
  const current = ++requestId;
  loading.value = true;
  loadError.value = false;
  selectedIds.value = [];
  const creatorIds = [query.creatorUserId, appliedQuery.creatorUserId];
  rememberedCreators.value = creatorOptions.value.filter((option) =>
    creatorIds.includes(option.value),
  );
  try {
    const params = { ...appliedQuery };
    let result = await getInstancePage(params);
    if (current !== requestId) return;
    const lastPage = Math.max(1, Math.ceil(result.total / params.pageSize));
    if (params.pageNo > lastPage) {
      result = await getInstancePage({ ...params, pageNo: lastPage });
      if (current !== requestId) return;
      appliedQuery.pageNo = lastPage;
      query.pageNo = lastPage;
    }
    rows.value = result.list;
    total.value = result.total;
  } catch {
    if (current === requestId) {
      loadError.value = true;
      rows.value = [];
      total.value = 0;
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
function search() {
  query.pageNo = 1;
  Object.assign(appliedQuery, query);
  scrollTop = 0;
  void load();
}
function resetSearch() {
  const defaults = defaultManagementQuery(
    defaultManagementScope(access.value!),
  );
  Object.assign(query, defaults);
  Object.assign(appliedQuery, defaults);
  rememberedCreators.value = [];
  scrollTop = 0;
  listState.clear();
  void load();
}
function changePage(pagination: { current?: number; pageSize?: number }) {
  if (accessLoading.value) return;
  const pageSize = pagination.pageSize || 10;
  appliedQuery.pageNo =
    pageSize !== appliedQuery.pageSize ? 1 : pagination.current || 1;
  appliedQuery.pageSize = pageSize;
  query.pageNo = appliedQuery.pageNo;
  query.pageSize = pageSize;
  void load();
}
function changeScope(scope: string | number) {
  if (accessLoading.value) return;
  if (!scopes.value.includes(scope as JixiaoApi.Scope)) return;
  query.scope = scope as JixiaoApi.Scope;
  query.creatorUserId = undefined;
  search();
}
function openInstance(row: JixiaoApi.Instance) {
  void router.push(
    `/fdmperformance/batches/${row.batchId}/instances/${row.id}`,
  );
}
async function remind(instanceIds: number[]) {
  reminding.value = true;
  try {
    const count = await remindInstances({ instanceIds });
    message.success(`已提交 ${count} 位处理人的催办消息`);
    selectedIds.value = [];
    await load();
  } finally {
    reminding.value = false;
  }
}
async function exportRows() {
  if (!access.value?.canExport) return;
  exporting.value = true;
  try {
    const data = await exportInstanceExcel({ ...appliedQuery });
    downloadFileFromBlobPart({ fileName: '绩效考核结果.xlsx', source: data });
  } finally {
    exporting.value = false;
  }
}
function openCancel(row: JixiaoApi.Instance) {
  cancelTarget.value = row;
  cancelReason.value = '';
  cancelOpen.value = true;
}
async function confirmCancel() {
  if (!cancelTarget.value?.id || !cancelReason.value.trim()) {
    message.warning('请填写撤销原因');
    return;
  }
  cancelLoading.value = true;
  try {
    await cancelInstance({
      instanceId: cancelTarget.value.id,
      reason: cancelReason.value.trim(),
    });
    message.success('考核已撤销');
    cancelOpen.value = false;
    await load();
  } finally {
    cancelLoading.value = false;
  }
}
function openDelete(row: JixiaoApi.Instance) {
  deleteTarget.value = row;
  deleteReason.value = '';
  deleteOpen.value = true;
}
async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target?.id || !hasAction(target, 'DELETE')) return;
  if (!deleteReason.value.trim()) {
    message.warning('请填写删除原因');
    return;
  }
  deleteLoading.value = true;
  try {
    await deleteInstance(target.id, deleteReason.value.trim());
    message.success('考核已删除');
    deleteOpen.value = false;
    await load();
  } finally {
    deleteLoading.value = false;
  }
}
async function initialize() {
  const current = ++lifecycleId;
  const owner = listState.identity;
  const saved = initialized ? snapshot() : listState.restore();
  initialized = false;
  accessLoading.value = true;
  loading.value = true;
  selectedIds.value = [];
  try {
    const capability = await getPerformanceAccess();
    if (current !== lifecycleId || owner !== listState.identity) return;
    stateOwner = owner;
    access.value = capability;
    if (!capability.canManage) {
      rows.value = [];
      total.value = 0;
      listState.clear();
      return;
    }
    const restored = restoreManagementListState(saved, capability);
    Object.assign(query, defaultManagementQuery(), restored.draftQuery);
    Object.assign(
      appliedQuery,
      defaultManagementQuery(),
      restored.appliedQuery,
    );
    activeTab.value = restored.activeTab;
    rememberedCreators.value = restored.creatorOptions;
    scrollTop = restored.scrollTop;
    initialized = true;
    await Promise.all([load(), loadDepartments()]);
    if (current !== lifecycleId || !pageActive) return;
    persistState();
    await nextTick();
    // The layout resets scroll after navigation; restore after its next render.
    requestAnimationFrame(() => {
      if (current === lifecycleId && pageActive) {
        getScrollElement()?.scrollTo({ top: restored.scrollTop });
      }
    });
  } catch {
    if (current === lifecycleId) {
      loadError.value = true;
      rows.value = [];
      total.value = 0;
    }
  } finally {
    if (current === lifecycleId) {
      accessLoading.value = false;
      loading.value = false;
    }
  }
}
async function loadDepartments() {
  if (!access.value?.canManage) return;
  const current = lifecycleId;
  deptLoading.value = true;
  try {
    const departments = await getSimpleDeptList();
    if (current === lifecycleId)
      deptTreeOptions.value = handleTree(departments);
  } catch {
    if (current === lifecycleId)
      message.warning('部门列表加载失败，请刷新后重试');
  } finally {
    if (current === lifecycleId) deptLoading.value = false;
  }
}
function snapshot() {
  const creatorIds = [query.creatorUserId, appliedQuery.creatorUserId];
  return {
    activeTab: activeTab.value,
    appliedQuery: { ...appliedQuery },
    creatorOptions: creatorOptions.value.filter((option) =>
      creatorIds.includes(option.value),
    ),
    draftQuery: { ...query },
    scrollTop,
  };
}
function persistState() {
  if (initialized && pageActive && access.value?.canManage) {
    listState.save(snapshot(), stateOwner);
  }
}
function rememberScroll(event: Event) {
  const element = getScrollElement();
  if (!pageActive || loading.value || event.target !== element) return;
  scrollTop = element?.scrollTop || 0;
  persistState();
}
function getScrollElement() {
  const root = shell.value?.$el as HTMLElement | undefined;
  let element =
    root?.querySelector<HTMLElement>('.performance-shell')?.parentElement;
  while (element) {
    if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY))
      return element;
    element = element.parentElement;
  }
  return getLayoutScrollElement();
}
watch([query, appliedQuery, activeTab], persistState, { deep: true });
watch(
  () => listState.identity,
  () => {
    initialized = false;
    ++requestId;
    ++lifecycleId;
    rows.value = [];
    total.value = 0;
    deptTreeOptions.value = [];
    access.value = undefined;
    if (pageActive && listState.identity) void initialize();
  },
  { flush: 'sync' },
);
onBeforeRouteLeave(persistState);
onMounted(() => {
  pageActive = true;
  document.addEventListener('scroll', rememberScroll, true);
  window.addEventListener('pagehide', persistState);
  void initialize();
});
onActivated(() => {
  pageActive = true;
  if (activatedOnce) void initialize();
  activatedOnce = true;
});
onDeactivated(() => {
  pageActive = false;
  ++requestId;
  ++lifecycleId;
  loading.value = false;
  cancelOpen.value = false;
  deleteOpen.value = false;
});
onBeforeUnmount(() => {
  pageActive = false;
  ++requestId;
  ++lifecycleId;
  document.removeEventListener('scroll', rememberScroll, true);
  window.removeEventListener('pagehide', persistState);
});
</script>

<template>
  <PerformanceShell
    ref="shell"
    title="考核管理"
    description="管理自己发起的考核；分管主管发起的记录可监督查看。只有当前获准的任务和管理操作才会显示。"
  >
    <template #actions
      ><Space
        ><Button
          v-if="access?.canConfigure"
          @click="router.push('/fdmperformance/results')"
          >结果公布与复盘</Button
        ><Button
          v-if="access?.canLaunch"
          type="primary"
          @click="router.push('/fdmperformance/launch')"
          >发起考核</Button
        ></Space
      ></template
    >
    <Alert
      v-if="loadError && !access"
      type="error"
      message="考核管理加载失败，请重试。"
      show-icon
    >
      <template #action>
        <Button size="small" @click="initialize">重试</Button>
      </template>
    </Alert>
    <Alert
      v-if="!accessLoading && access && !access.canManage"
      type="info"
      message="当前岗位仅能查看本人的绩效，请前往我的绩效。"
      show-icon
    />
    <Tabs v-if="access?.canManage" v-model:active-key="activeTab">
      <Tabs.TabPane key="instances" tab="考核记录" :disabled="accessLoading">
        <div class="management-panel">
          <Alert
            v-if="loadError"
            type="error"
            message="考核记录加载失败，请重新查询。"
            show-icon
          />
          <Tabs :active-key="query.scope" @change="changeScope"
            ><Tabs.TabPane
              v-for="scope in scopes"
              :key="scope"
              :tab="SCOPE_LABELS[scope]"
          /></Tabs>
          <div class="filter-bar">
            <TreeSelect
              v-model:value="query.deptId"
              :disabled="accessLoading"
              :tree-data="deptTreeOptions"
              :field-names="{ children: 'children', label: 'name', value: 'id' }"
              :loading="deptLoading"
              placeholder="全部部门（含下级）"
              allow-clear
              show-search
              tree-node-filter-prop="name"
            />
            <DatePicker
              v-model:value="query.periodKey"
              :disabled="accessLoading"
              picker="month"
              value-format="YYYY-MM"
              placeholder="考核月份"
              allow-clear
            />
            <Input
              v-model:value="query.userName"
              :disabled="accessLoading"
              placeholder="搜索被考核人"
              allow-clear
              @press-enter="search"
            />
            <Select
              v-model:value="query.status"
              :disabled="accessLoading"
              :options="[
                { label: '进行中', value: 1 },
                { label: '已完成', value: 2 },
                { label: '已撤销', value: 3 },
              ]"
              placeholder="全部状态"
              allow-clear
            />
            <Select
              v-if="query.scope !== 'INITIATED'"
              v-model:value="query.creatorUserId"
              :disabled="accessLoading"
              :options="creatorOptions"
              placeholder="本页发起人"
              allow-clear
              show-search
              option-filter-prop="label"
            />
            <Button type="primary" :disabled="accessLoading" @click="search">查询</Button>
            <Button :disabled="accessLoading" @click="resetSearch">重置</Button>
          </div>
          <div class="table-toolbar">
            <span
              >共 {{ total }} 条 ·
              {{ SCOPE_LABELS[appliedQuery.scope || 'VISIBLE'] }}</span
            ><Space
              ><Popconfirm
                v-if="canRemindSelected"
                :title="`催办选中的 ${selectedIds.length} 条考核？`"
                @confirm="remind(selectedIds)"
                ><Button :loading="reminding"
                  >批量催办（{{ selectedIds.length }}）</Button
                ></Popconfirm
              ><Button
                v-if="access.canExport"
                :loading="exporting"
                @click="exportRows"
                >导出当前范围</Button
              ></Space
            >
          </div>
          <Table
            class="performance-compact-table"
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :row-selection="rowSelection"
            :pagination="{
              current: appliedQuery.pageNo,
              pageSize: appliedQuery.pageSize,
              total,
              disabled: accessLoading,
              showSizeChanger: true,
              pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
            }"
            :scroll="{ x: 1050 }"
            row-key="id"
            size="small"
            @change="changePage"
          >
            <template #emptyText
              ><Empty
                :description="
                  loadError
                    ? '加载失败，请重新查询'
                    : '当前范围没有符合条件的考核'
                "
            /></template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'userName'"
                ><strong>{{ record.userName }}</strong>
                <div class="secondary">
                  {{ record.deptName || '—' }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'templateName'"
                ><span>{{ record.templateName || '绩效考核' }}</span>
                <div class="secondary">{{ record.periodKey }}</div></template
              >
              <template v-else-if="column.dataIndex === 'creatorUserName'"
                ><span>{{ record.creatorUserName || '—' }}</span>
                <div class="secondary">
                  {{ visibilityLabel(record.visibilityReason) }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'currentTaskName'"
                ><Tag :color="INSTANCE_STATUS_MAP[record.status]?.color">{{
                  record.currentTaskKey
                    ? TASK_LABELS[record.currentTaskKey] ||
                      record.currentTaskName
                    : INSTANCE_STATUS_MAP[record.status]?.text
                }}</Tag>
                <div class="secondary">
                  {{ record.currentTaskAssigneeUserName || '—' }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'finalScore'"
                >{{ record.finalScore ?? '—' }}
                <Tag v-if="record.grade">{{ record.grade }}</Tag>
                <div class="secondary">
                  {{
                    record.publicTime
                      ? '已公布'
                      : record.finalScore != null
                        ? '待公布'
                        : '尚未完成评分'
                  }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'action'"
                ><Space :size="0" wrap
                  ><Button
                    size="small"
                    type="link"
                    @click="openInstance(record)"
                    >{{ actionLabel(record) }}</Button
                  ><Popconfirm
                    v-if="hasAction(record, 'REMIND')"
                    title="向当前处理人发送催办提醒？"
                    @confirm="remind([record.id])"
                    ><Button size="small" type="link" :loading="reminding"
                      >催办</Button
                    ></Popconfirm
                  ><Button
                    v-if="hasAction(record, 'CANCEL')"
                    size="small"
                    type="link"
                    @click="openCancel(record)"
                    >撤销</Button
                  ><Button
                    v-if="access.canConfigure && hasAction(record, 'DELETE')"
                    danger
                    size="small"
                    type="link"
                    @click="openDelete(record)"
                    >删除</Button
                  ></Space
                ></template
              >
            </template>
          </Table>
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane v-if="access.canConfigure" key="hr-review" tab="待人事审核" :disabled="accessLoading"
        ><HrReviewQueue :active="activeTab === 'hr-review'"
      /></Tabs.TabPane>
      <Tabs.TabPane
        v-if="access.canManageTemplate"
        key="templates"
        tab="考评表"
        :disabled="accessLoading"
        ><div class="management-panel"><TemplateManager /></div
      ></Tabs.TabPane>
    </Tabs>
    <Modal
      v-model:open="cancelOpen"
      title="撤销考核"
      :confirm-loading="cancelLoading"
      ok-text="确认撤销"
      @ok="confirmCancel"
      ><p>
        撤销 {{ cancelTarget?.userName }} 的
        {{ cancelTarget?.periodKey }} 考核，评分与处理轨迹将保留。
      </p>
      <Textarea
        v-model:value="cancelReason"
        :rows="4"
        :maxlength="500"
        placeholder="填写撤销原因"
    /></Modal>
    <Modal
      v-model:open="deleteOpen"
      title="删除考核"
      :confirm-loading="deleteLoading"
      :ok-button-props="{ danger: true }"
      ok-text="确认删除"
      @ok="confirmDelete"
      ><p>
        删除 {{ deleteTarget?.userName }} 的
        {{ deleteTarget?.periodKey }} 考核（{{
          INSTANCE_STATUS_MAP[deleteTarget?.status ?? -1]?.text || '未知状态'
        }}）。
      </p>
      <Alert
        class="delete-alert"
        type="warning"
        show-icon
        message="删除后无法在页面上恢复"
        ><template #description
          ><ul class="delete-effects">
            <li>进行中的考核会先终止流程，并关闭相关待办。</li>
            <li>
              评分、结果和复核记录会一并删除，绩效结果和绩效分析中不再显示。
            </li>
            <li>删除后可以为此人在同一周期重新发起考核。</li>
          </ul></template
        ></Alert
      >
      <Textarea
        v-model:value="deleteReason"
        :rows="3"
        :maxlength="200"
        placeholder="填写删除原因，例如：此人本期不需要考核"
    /></Modal>
  </PerformanceShell>
</template>

<style scoped>
.management-panel {
  padding: 18px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card));
}
.delete-alert {
  margin-bottom: 12px;
}
.delete-effects {
  padding-left: 18px;
  margin: 0;
  list-style: disc;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}
.filter-bar :deep(.ant-input-affix-wrapper),
.filter-bar :deep(.ant-select),
.filter-bar :deep(.ant-picker) {
  width: 180px;
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.table-toolbar > span,
.secondary {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.secondary {
  margin-top: 5px;
}
@media (max-width: 700px) {
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .management-panel {
    padding: 12px;
  }
}
</style>
