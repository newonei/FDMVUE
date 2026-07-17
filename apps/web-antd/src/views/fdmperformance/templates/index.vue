<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import { getSimpleProcessDefinitionList } from '#/api/bpm/definition';
import {
  deleteTemplate,
  disableTemplate,
  enableTemplate,
  getEnabledIndicators,
  getTemplate,
  getTemplatePage,
  saveTemplate,
  validateTemplateProcess,
} from '#/api/fdmperformance';
import { getSimpleDeptList } from '#/api/system/dept';
import { getSimpleUserList } from '#/api/system/user';

import {
  PERIOD_OPTIONS,
  SCORE_METHOD_OPTIONS,
  TEMPLATE_STATUS_MAP,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceTemplates' });

const loading = ref(false);
const drawerOpen = ref(false);
const indicatorImportOpen = ref(false);
const indicatorImportKeyword = ref('');
const indicatorImportCategory = ref<string>();
const indicatorImportDeptId = ref<number>();
const indicatorImportDimension = ref<JixiaoApi.TemplateDimension>();
const selectedIndicatorIds = ref<number[]>([]);
const departments = ref<SystemDeptApi.Dept[]>([]);
const users = ref<SystemUserApi.User[]>([]);
const indicators = ref<JixiaoApi.Indicator[]>([]);
const processDefinitions = ref<any[]>([]);
const rows = ref<JixiaoApi.Template[]>([]);
const total = ref(0);
const query = reactive({
  name: '',
  pageNo: 1,
  pageSize: 10,
  periodType: undefined as string | undefined,
  status: undefined as number | undefined,
});
const form = reactive<JixiaoApi.Template>({
  dimensions: [],
  name: '',
  periodType: 'MONTH',
  persons: [],
  processDefinitionKey: '',
  remark: '',
  status: 0,
});

const userOptions = computed(() =>
  users.value.map((item) => ({
    label: `${item.nickname || item.username} (${item.id})`,
    value: item.id,
  })),
);
const processOptions = computed(() =>
  processDefinitions.value.map((item) => ({
    label: `${item.name || item.key} (${item.key})`,
    value: item.key,
  })),
);
const departmentOptions = computed(() => {
  const options: Array<{ label: string; value: number }> = [];
  const walk = (items: SystemDeptApi.Dept[]) => {
    for (const item of items) {
      if (item.id !== undefined) {
        options.push({ label: item.name, value: item.id });
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(departments.value);
  return options;
});
const departmentNameMap = computed(
  () =>
    new Map(
      departmentOptions.value.map((item) => [item.value, item.label] as const),
    ),
);
const indicatorImportDepartmentRows = computed(() => {
  if (indicatorImportDeptId.value === undefined) return indicators.value;
  return indicators.value.filter(
    (indicator) =>
      !indicator.deptId || indicator.deptId === indicatorImportDeptId.value,
  );
});
const indicatorImportCategories = computed(() => {
  const countMap = new Map<string, number>();
  for (const indicator of indicatorImportDepartmentRows.value) {
    const category = indicatorDimensionName(indicator.dimensionName);
    countMap.set(category, (countMap.get(category) || 0) + 1);
  }
  return [
    {
      count: indicatorImportDepartmentRows.value.length,
      label: '全部指标',
      value: undefined,
    },
    ...[...countMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
      .map(([label, count]) => ({ count, label, value: label })),
  ];
});
const indicatorImportRows = computed(() => {
  const keyword = indicatorImportKeyword.value.trim().toLowerCase();
  return indicatorImportDepartmentRows.value.filter((indicator) => {
    if (
      indicatorImportCategory.value &&
      indicatorDimensionName(indicator.dimensionName) !==
        indicatorImportCategory.value
    ) {
      return false;
    }
    if (!keyword) return true;
    return [indicator.name, indicator.dimensionName, indicator.standard].some(
      (value) => value?.toLowerCase().includes(keyword),
    );
  });
});
const currentDimensionIndicatorIds = computed(() => {
  const ids =
    indicatorImportDimension.value?.indicators
      ?.map((item) => item.indicatorId)
      .filter((id): id is number => typeof id === 'number') ?? [];
  return new Set(ids);
});
const importRowSelection = computed(() => ({
  preserveSelectedRowKeys: true,
  selectedRowKeys: selectedIndicatorIds.value,
  getCheckboxProps: (record: JixiaoApi.Indicator) => ({
    disabled: Boolean(
      record.id && currentDimensionIndicatorIds.value.has(record.id),
    ),
  }),
  onChange: (keys: Array<number | string>) => {
    selectedIndicatorIds.value = keys
      .map(Number)
      .filter((key) => Number.isFinite(key));
  },
}));

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '考评表名称' },
  { dataIndex: 'periodType', title: '周期', width: 120 },
  { dataIndex: 'processDefinitionKey', title: 'BPM 流程', width: 210 },
  { dataIndex: 'status', title: '状态', width: 90 },
  { dataIndex: 'createTime', title: '创建时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 260 },
];
const indicatorImportColumns: TableColumnsType = [
  { dataIndex: 'dimensionName', title: '指标维度', width: 110 },
  { dataIndex: 'name', title: '指标名称', width: 150 },
  { dataIndex: 'deptId', title: '适用部门', width: 120 },
  { dataIndex: 'defaultWeight', title: '默认权重', width: 90 },
  { dataIndex: 'scoreMethod', title: '评分方式', width: 100 },
  { dataIndex: 'standard', title: '考核标准', width: 180 },
];

function statusMeta(status?: number): { color: string; text: string } {
  return TEMPLATE_STATUS_MAP[status ?? 0] ?? { color: 'default', text: '-' };
}

async function load() {
  loading.value = true;
  try {
    const data = await getTemplatePage(query);
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const [userList, indicatorList, processData, departmentList] =
    await Promise.all([
      getSimpleUserList(),
      getEnabledIndicators(),
      getSimpleProcessDefinitionList() as any,
      getSimpleDeptList(),
    ]);
  users.value = userList;
  indicators.value = indicatorList;
  departments.value = departmentList;
  processDefinitions.value = Array.isArray(processData)
    ? processData
    : processData?.list || [];
}

function resetForm() {
  Object.assign(form, {
    dimensions: [],
    id: undefined,
    name: '',
    periodType: 'MONTH',
    persons: [],
    processDefinitionKey: '',
    remark: '',
    status: 0,
  });
}

function openCreate() {
  resetForm();
  addPerson();
  addDimension();
  drawerOpen.value = true;
}

async function openEdit(record: JixiaoApi.Template) {
  resetForm();
  const detail = await getTemplate(record.id!);
  Object.assign(form, detail);
  form.persons ||= [];
  form.dimensions ||= [];
  drawerOpen.value = true;
}

function addPerson() {
  form.persons ||= [];
  form.persons.push({});
}

function removePerson(index: number) {
  form.persons?.splice(index, 1);
}

function addDimension() {
  form.dimensions ||= [];
  form.dimensions.push({
    indicators: [],
    name: '业绩指标',
    sort: form.dimensions.length,
    weight: 0,
  });
}

function removeDimension(index: number) {
  form.dimensions?.splice(index, 1);
}

function addIndicator(dimension: JixiaoApi.TemplateDimension) {
  dimension.indicators ||= [];
  dimension.indicators.push({
    actionPlanEnabled: false,
    name: '',
    scoreMethod: 'NUMBER',
    sort: dimension.indicators.length,
    status: 0,
    weight: 0,
  });
}

function removeIndicator(
  dimension: JixiaoApi.TemplateDimension,
  index: number,
) {
  dimension.indicators?.splice(index, 1);
}

function openIndicatorImport(dimension: JixiaoApi.TemplateDimension) {
  indicatorImportDimension.value = dimension;
  indicatorImportKeyword.value = '';
  indicatorImportCategory.value = undefined;
  indicatorImportDeptId.value = undefined;
  selectedIndicatorIds.value = [];
  indicatorImportOpen.value = true;
}

function indicatorDimensionName(dimensionName?: string) {
  return dimensionName?.trim() || '未分类';
}

function departmentName(deptId?: number) {
  if (!deptId) return '通用';
  return departmentNameMap.value.get(deptId) || `部门 #${deptId}`;
}

function scoreMethodText(method?: string) {
  return (
    SCORE_METHOD_OPTIONS.find((item) => item.value === method)?.label ||
    method ||
    '-'
  );
}

function normalizeWeight(value?: number | string) {
  const weight = Number(value ?? 0);
  return Number.isFinite(weight) ? weight : 0;
}

function insertImportedIndicators() {
  const dimension = indicatorImportDimension.value;
  if (!dimension) return;
  if (selectedIndicatorIds.value.length === 0) {
    message.warning('请选择要导入的指标');
    return;
  }
  dimension.indicators ||= [];
  const selected = indicators.value.filter(
    (indicator) =>
      typeof indicator.id === 'number' &&
      selectedIndicatorIds.value.includes(indicator.id),
  );
  const existingIds = new Set(
    dimension.indicators
      .map((item) => item.indicatorId)
      .filter((id): id is number => typeof id === 'number'),
  );
  const startSort = dimension.indicators.length;
  const importedIndicators: JixiaoApi.TemplateIndicator[] = selected
    .filter((indicator) => indicator.id && !existingIds.has(indicator.id))
    .map((indicator, index) => ({
      actionPlanEnabled: false,
      indicatorId: indicator.id,
      name: indicator.name,
      scoreMethod: indicator.scoreMethod || 'NUMBER',
      sort: startSort + index,
      standard: indicator.standard,
      status: 0,
      weight: normalizeWeight(indicator.defaultWeight),
    }));

  if (importedIndicators.length === 0) {
    message.warning('所选指标已在当前维度中');
    return;
  }
  dimension.indicators.push(...importedIndicators);
  message.success(`已插入 ${importedIndicators.length} 个指标`);
  indicatorImportOpen.value = false;
}

async function save() {
  if (!form.name?.trim() || !form.processDefinitionKey) {
    message.warning('请填写基础信息和流程定义');
    return;
  }
  await saveTemplate(form);
  message.success('已保存');
  drawerOpen.value = false;
  await load();
}

async function enable(id?: number) {
  if (!id) return;
  await enableTemplate(id);
  message.success('已启用');
  await load();
}

async function disable(id?: number) {
  if (!id) return;
  await disableTemplate(id);
  message.success('已停用');
  await load();
}

async function validateProcess(id?: number) {
  if (!id) return;
  await validateTemplateProcess(id);
  message.success('流程节点校验通过');
}

async function remove(id?: number) {
  if (!id) return;
  await deleteTemplate(id);
  message.success('已删除');
  await load();
}

function handleTableChange(pagination: any) {
  query.pageNo = pagination.current;
  query.pageSize = pagination.pageSize;
  load();
}

onMounted(async () => {
  await loadOptions();
  await load();
});
</script>

<template>
  <PerformanceShell title="考评表">
    <template #actions>
      <Button type="primary" @click="openCreate">新增考评表</Button>
    </template>

    <div class="filter-bar">
      <Input v-model:value="query.name" allow-clear placeholder="考评表名称" />
      <Select
        v-model:value="query.periodType"
        allow-clear
        :options="PERIOD_OPTIONS"
        placeholder="考核周期"
      />
      <Select
        v-model:value="query.status"
        allow-clear
        :options="[
          { label: '草稿', value: 0 },
          { label: '启用', value: 1 },
          { label: '停用', value: 2 },
        ]"
        placeholder="状态"
      />
      <Button type="primary" @click="load">查询</Button>
    </div>

    <Table
      class="performance-compact-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        size: 'small',
        total,
      }"
      row-key="id"
      size="small"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'periodType'">
          {{
            PERIOD_OPTIONS.find((item) => item.value === record.periodType)
              ?.label
          }}
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <Tag :color="statusMeta(record.status).color">
            {{ statusMeta(record.status).text }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button size="small" type="link" @click="openEdit(record)">
              编辑
            </Button>
            <Button
              size="small"
              type="link"
              @click="validateProcess(record.id)"
            >
              校验流程
            </Button>
            <Button
              v-if="record.status !== 1"
              size="small"
              type="link"
              @click="enable(record.id)"
            >
              启用
            </Button>
            <Button v-else size="small" type="link" @click="disable(record.id)">
              停用
            </Button>
            <Popconfirm title="确认删除该考评表？" @confirm="remove(record.id)">
              <Button danger size="small" type="link">删除</Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Drawer
      v-model:open="drawerOpen"
      destroy-on-close
      :body-style="{ overflow: 'auto', padding: '24px' }"
      root-class-name="template-editor-drawer"
      width="100vw"
      title="考评表编辑"
      @close="resetForm"
    >
      <div class="editor">
        <section>
          <h2>基础信息</h2>
          <Form layout="vertical">
            <div class="form-grid">
              <Form.Item label="考评表名称" required>
                <Input v-model:value="form.name" />
              </Form.Item>
              <Form.Item label="考核周期" required>
                <Select
                  v-model:value="form.periodType"
                  :options="PERIOD_OPTIONS"
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  v-model:value="form.status"
                  :options="[
                    { label: '草稿', value: 0 },
                    { label: '启用', value: 1 },
                    { label: '停用', value: 2 },
                  ]"
                />
              </Form.Item>
            </div>
            <Form.Item label="备注">
              <Input v-model:value="form.remark" />
            </Form.Item>
          </Form>
        </section>

        <section>
          <div class="section-title">
            <h2>人员与主管</h2>
            <Button size="small" @click="addPerson">添加人员</Button>
          </div>
          <div class="rows">
            <div
              v-for="(person, index) in form.persons"
              :key="index"
              class="person-row"
            >
              <Select
                v-model:value="person.userId"
                show-search
                :options="userOptions"
                option-filter-prop="label"
                placeholder="被考核人"
              />
              <Select
                v-model:value="person.supervisorUserId"
                show-search
                :options="userOptions"
                option-filter-prop="label"
                placeholder="直属主管"
              />
              <Select
                v-model:value="person.superiorSupervisorUserId"
                allow-clear
                show-search
                :options="userOptions"
                option-filter-prop="label"
                placeholder="主管上级"
              />
              <Button danger @click="removePerson(index)">移除</Button>
            </div>
          </div>
        </section>

        <section>
          <div class="section-title">
            <h2>维度指标</h2>
            <Button size="small" @click="addDimension">添加维度</Button>
          </div>
          <Alert
            message="最终得分按所有启用指标汇总；勾选“参与行动计划”后，员工确认指标时会立即收到对应钉钉待办。行动计划与考核流程并行，不影响后续节点。"
            show-icon
            type="info"
          />
          <div
            v-for="(dimension, dimensionIndex) in form.dimensions"
            :key="dimensionIndex"
            class="dimension-block"
          >
            <div class="dimension-head">
              <Input v-model:value="dimension.name" placeholder="维度名称" />
              <InputNumber
                v-model:value="dimension.weight"
                :min="0"
                class="weight"
                addon-after="%"
              />
              <Button @click="addIndicator(dimension)">添加自填指标</Button>
              <Button @click="openIndicatorImport(dimension)">
                指标库导入
              </Button>
              <Button danger @click="removeDimension(dimensionIndex)">
                删除维度
              </Button>
            </div>
            <div
              v-for="(item, indicatorIndex) in dimension.indicators"
              :key="indicatorIndex"
              class="indicator-row"
            >
              <Tag
                :color="item.indicatorId ? 'blue' : 'default'"
                class="indicator-source"
              >
                {{ item.indicatorId ? '指标库' : '自填' }}
              </Tag>
              <Input v-model:value="item.name" placeholder="指标名称" />
              <InputNumber
                v-model:value="item.weight"
                :max="100"
                :min="0"
                addon-after="%"
              />
              <Select
                v-model:value="item.scoreMethod"
                :options="SCORE_METHOD_OPTIONS"
              />
              <Textarea
                v-model:value="item.standard"
                :rows="2"
                placeholder="考核标准"
              />
              <Checkbox v-model:checked="item.actionPlanEnabled">
                参与行动计划
              </Checkbox>
              <Button
                danger
                @click="removeIndicator(dimension, indicatorIndex)"
              >
                删除
              </Button>
            </div>
          </div>
        </section>

        <section>
          <h2>流程绑定</h2>
          <Form layout="vertical">
            <Form.Item label="BPM 流程定义 key" required>
              <Select
                v-model:value="form.processDefinitionKey"
                show-search
                :options="processOptions"
                option-filter-prop="label"
                placeholder="选择已部署流程"
              />
            </Form.Item>
          </Form>
          <Alert
            message="流程必须包含 JIXIAO_INDICATOR_CONFIRM、JIXIAO_SELF_SCORE、JIXIAO_SUPERVISOR_SCORE、JIXIAO_EMPLOYEE_CONFIRM、JIXIAO_HR_REVIEW 五个用户任务 key。"
            show-icon
            type="warning"
          />
        </section>
      </div>

      <template #footer>
        <Space>
          <Button @click="drawerOpen = false">取消</Button>
          <Button type="primary" @click="save">保存</Button>
        </Space>
      </template>
    </Drawer>

    <Modal
      v-model:open="indicatorImportOpen"
      destroy-on-close
      :width="1080"
      title="指标库导入"
      @cancel="indicatorImportOpen = false"
    >
      <div class="import-toolbar">
        <Input
          v-model:value="indicatorImportKeyword"
          allow-clear
          placeholder="搜索指标名称、维度或考核标准"
        />
        <Select
          v-model:value="indicatorImportDeptId"
          :options="departmentOptions"
          allow-clear
          option-filter-prop="label"
          placeholder="全部部门"
          show-search
        />
      </div>
      <div class="indicator-import-layout">
        <aside class="indicator-category-panel">
          <div class="category-title">指标分类</div>
          <div class="category-list">
            <button
              v-for="category in indicatorImportCategories"
              :key="category.value || '__all__'"
              :aria-pressed="indicatorImportCategory === category.value"
              class="category-item"
              :class="[{ active: indicatorImportCategory === category.value }]"
              type="button"
              @click="indicatorImportCategory = category.value"
            >
              <span>{{ category.label }}</span>
              <span class="category-count">{{ category.count }}</span>
            </button>
          </div>
        </aside>
        <div class="indicator-import-table">
          <Table
            :columns="indicatorImportColumns"
            :data-source="indicatorImportRows"
            :pagination="{ pageSize: 8, showSizeChanger: false }"
            :row-selection="importRowSelection"
            :scroll="{ x: 780, y: 420 }"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'deptId'">
                {{ departmentName(record.deptId) }}
              </template>
              <template v-else-if="column.dataIndex === 'defaultWeight'">
                {{ normalizeWeight(record.defaultWeight) }}%
              </template>
              <template v-else-if="column.dataIndex === 'scoreMethod'">
                {{ scoreMethodText(record.scoreMethod) }}
              </template>
            </template>
          </Table>
        </div>
      </div>
      <template #footer>
        <div class="import-footer">
          <span>已选择 {{ selectedIndicatorIds.length }} 项</span>
          <Space>
            <Button @click="indicatorImportOpen = false">取消</Button>
            <Button
              :disabled="selectedIndicatorIds.length === 0"
              type="primary"
              @click="insertImportedIndicators"
            >
              插入
            </Button>
          </Space>
        </div>
      </template>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 160px 120px auto;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.editor {
  display: grid;
  gap: 22px;
}

section {
  min-width: 0;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 650;
  color: #111827;
}

.form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 120px;
  gap: 12px;
}

.section-title,
.dimension-head,
.person-row,
.indicator-row {
  display: grid;
  gap: 8px;
  align-items: center;
}

.section-title {
  grid-template-columns: 1fr auto;
}

.rows {
  display: grid;
  gap: 8px;
}

.person-row {
  grid-template-columns: 1fr 1fr 1fr auto;
}

.dimension-block {
  display: grid;
  gap: 8px;
  padding: 12px;
  margin-top: 10px;
  background: #fafafa;
  border: 1px solid #eef0f3;
  border-radius: 8px;
}

.dimension-head {
  grid-template-columns: minmax(160px, 1fr) 130px auto auto auto;
}

.indicator-row {
  grid-template-columns:
    90px minmax(160px, 1fr) 120px 130px minmax(240px, 1.4fr)
    140px auto;
}

.indicator-source {
  justify-self: start;
}

.import-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px;
  gap: 10px;
  margin-bottom: 14px;
}

.indicator-import-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 14px;
}

.indicator-category-panel {
  min-width: 0;
  padding-right: 14px;
  border-right: 1px solid #edf0f4;
}

.category-title {
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  color: #646a73;
}

.category-list {
  display: grid;
  gap: 4px;
}

.category-item {
  display: flex;
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  color: #3c4149;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
  align-items: center;
  justify-content: space-between;
}

.category-item:hover,
.category-item:focus-visible {
  background: #f3f5f7;
  outline: none;
}

.category-item.active {
  font-weight: 600;
  color: #1677ff;
  background: #eaf3ff;
}

.category-count {
  min-width: 24px;
  font-size: 12px;
  color: #8f959e;
  text-align: right;
}

.indicator-import-table {
  min-width: 0;
}

.import-footer {
  display: flex;
  color: #646a73;
  align-items: center;
  justify-content: space-between;
}

.weight {
  width: 100%;
}

@media (max-width: 1100px) {
  .filter-bar,
  .form-grid,
  .person-row,
  .dimension-head,
  .indicator-row {
    grid-template-columns: 1fr;
  }

  .indicator-import-layout {
    grid-template-columns: 1fr;
  }

  .indicator-category-panel {
    padding-right: 0;
    border-right: 0;
    border-bottom: 1px solid #edf0f4;
  }

  .category-list {
    display: flex;
    padding-bottom: 10px;
    overflow-x: auto;
  }

  .category-item {
    width: auto;
    min-width: 120px;
    gap: 12px;
  }
}

@media (max-width: 640px) {
  .import-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
