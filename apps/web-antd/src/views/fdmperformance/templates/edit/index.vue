<script lang="ts" setup>
import type {
  AssessmentTemplate,
  Employee,
  Indicator,
} from '../../shared/model';

import type { FdmPerformanceIndicatorApi } from '#/api/fdmperformance/indicator';
import type { FdmPerformanceSettingApi } from '#/api/fdmperformance/setting';
import type { FdmPerformanceTemplateApi } from '#/api/fdmperformance/template';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemPostApi } from '#/api/system/post';
import type { SystemRoleApi } from '#/api/system/role';
import type { SystemUserApi } from '#/api/system/user';
import type { SimpleFlowNode } from '#/views/bpm/components/simple-process-design';

import { computed, onMounted, provide, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { BpmModelFormType } from '@vben/constants';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  createFdmPerformanceIndicator,
  createFdmPerformanceIndicatorTag,
  getFdmPerformanceIndicatorPage,
  getFdmPerformanceIndicatorTagList,
} from '#/api/fdmperformance/indicator';
import { getFdmPerformanceSettingList } from '#/api/fdmperformance/setting';
import {
  createFdmPerformanceFlowPreset,
  createFdmPerformanceTemplate,
  getFdmPerformanceFlowPresetSimpleList,
  getFdmPerformanceTemplate,
  getFdmPerformanceTemplateGroupSimpleList,
  getFdmPerformanceTemplatePage,
  updateFdmPerformanceTemplate,
} from '#/api/fdmperformance/template';
import { getSimpleDeptList } from '#/api/system/dept';
import { getSimplePostList } from '#/api/system/post';
import { getSimpleRoleList } from '#/api/system/role';
import { getSimpleUserList } from '#/api/system/user';
import { SimpleProcessDesigner } from '#/views/bpm/components/simple-process-design';
import { CandidateStrategy } from '#/views/bpm/components/simple-process-design/consts';

import { apiPeriodTextToType, mapApiTemplate } from '../../shared/api-adapter';
import { defaultTemplateFlowNode } from '../../shared/model';
import PerformanceShell from '../../shared/PerformanceShell.vue';
import { usePerformancePath } from '../../shared/route';

defineOptions({ name: 'FdmPerformanceTemplateEdit' });

const route = useRoute();
const router = useRouter();
const { performancePath } = usePerformancePath();

type PerformanceEmployee = Employee & {
  deptId?: number;
  postId?: number;
  username?: string;
};
type PerformanceIndicator = Indicator & { indicatorId?: number };
interface UserGroupSetting {
  desc: string;
  memberIds: number[];
  name: string;
  type: 'dynamic' | 'static';
}

const routeId = computed(() => route.params.id as string);
const apiEmployees = ref<PerformanceEmployee[]>([]);
const apiIndicators = ref<PerformanceIndicator[]>([]);
const apiTemplateIndicators = ref<PerformanceIndicator[]>([]);
const localDraftIndicators = ref<PerformanceIndicator[]>([]);
const apiTemplates = ref<AssessmentTemplate[]>([]);
const apiTemplateGroups = ref<FdmPerformanceTemplateApi.TemplateGroup[]>([]);
const flowPresetList = ref<FdmPerformanceTemplateApi.FlowPreset[]>([]);
const apiDeptList = ref<SystemDeptApi.Dept[]>([]);
const apiPostList = ref<SystemPostApi.Post[]>([]);
const apiRoleList = ref<SystemRoleApi.Role[]>([]);
const apiUserList = ref<SystemUserApi.User[]>([]);
const userGroupSettings = ref<UserGroupSetting[]>([]);
const apiIndicatorTagRows = ref<FdmPerformanceIndicatorApi.IndicatorTag[]>([]);
const apiIndicatorTags = ref<string[]>([]);
const loading = ref(false);
const sourceEmployees = computed<PerformanceEmployee[]>(
  () => apiEmployees.value,
);
const sourceTemplates = computed(() => apiTemplates.value);
const sourceIndicators = computed<PerformanceIndicator[]>(() => {
  const rows = new Map<number, PerformanceIndicator>();
  [
    ...apiIndicators.value,
    ...apiTemplateIndicators.value,
    ...localDraftIndicators.value,
  ].forEach((item) => {
    rows.set(item.id, item);
  });
  return [...rows.values()];
});

function cloneTemplate(template?: AssessmentTemplate): AssessmentTemplate {
  const source: AssessmentTemplate = template || {
    admins: [],
    autoLaunch: false,
    customDimensions: [],
    flowNode: defaultTemplateFlowNode,
    group: '未分类考评表',
    id: 0,
    indicatorIds: [],
    name: '',
    participants: [],
    periodType: '月度',
    scorerRules: {},
    scorerStrategy: 'unified',
    scoringRule: '加扣计算',
    status: 'enabled',
    updatedAt: '',
  };
  return JSON.parse(JSON.stringify(source)) as AssessmentTemplate;
}

const draft = reactive<AssessmentTemplate>(cloneTemplate());
const currentStep = ref(0);
const selectedIndicatorIds = ref<number[]>(
  draft.indicatorIds?.length ? [...draft.indicatorIds] : [],
);
const scorerRules = reactive<Record<number, string>>({ ...draft.scorerRules });
const participantMode = ref<'department' | 'people' | 'role' | 'userGroup'>(
  draft.participantScope?.mode || 'people',
);
const selectedPeopleIds = ref<number[]>(
  draft.participantScope?.peopleIds?.length
    ? [...draft.participantScope.peopleIds]
    : [...draft.participants],
);
const selectedDeptNames = ref<string[]>(
  draft.participantScope?.deptNames || [],
);
const selectedRoleNames = ref<string[]>(
  draft.participantScope?.roleNames || [],
);
const selectedUserGroupNames = ref<string[]>(
  draft.participantScope?.userGroupNames || [],
);
const importModalOpen = ref(false);
const importKeyword = ref('');
const importDimension = ref<string>();
const importTag = ref<string>();
const importSelectedIndicatorIds = ref<number[]>([]);
const activeImportDimension = ref<string>();
const processData = ref<SimpleFlowNode>(draft.flowNode);
const designerRef = ref<{
  getCurrentFlowData?: () => SimpleFlowNode | undefined;
  validate?: () => Promise<boolean>;
}>();
const flowRenderKey = ref(0);
const selectedFlowPresetId = ref<number>();
const flowPresetModalOpen = ref(false);
const flowPresetSaving = ref(false);
const flowPresetDraft = reactive({
  name: '',
  remark: '',
});
const dimensionModalOpen = ref(false);
const templateSettingOpen = ref(false);
const dedupeEnabled = ref(true);
const partialIndicatorOnly = ref(false);
const examDescriptionEnabled = ref(false);
const dimensionWeightEnabled = ref(true);
const unlimitedIndicatorWeight = ref(true);
const totalLimitEnabled = ref(false);
const resultVisibleRule = ref('评分结束后自动公示');
const scoreCalculateRule = ref('加扣计算');
const scorerStrategy = ref<'byIndicator' | 'unified'>(
  draft.scorerStrategy || 'unified',
);
const unifiedScorer = ref(
  Object.values(draft.scorerRules || {})[0] || '直接主管',
);
const dimensionDraft = reactive({
  name: '',
  type: '量化指标 100%',
  weight: 20,
});
const configHelpText = {
  dimensionWeight:
    '启用后先按维度权重折算维度得分，再进入评分节点权重汇总；关闭后按指标贡献分直接汇总。',
  enabledTemplateCount:
    '当前处于启用状态的考评表数量，用于判断本配置会影响多少可发起模板。',
  examDescription:
    '启用后在考评表中展示考核说明相关内容，方便评分人查看填写要求。',
  scorerStrategy:
    '统一评分人会让所有指标使用同一评分人；按指标设置时，每个指标可单独指定评分人。',
  scoreCalculate:
    '加扣计算按贡献分直接累加：普通/加分项累加，扣分项按负数计入。加权平均按权重折算；其他方式为规则预留。',
  totalLimit:
    '启用后最终总分受规则上限/下限约束，避免加分或扣分后超出考评表允许范围。',
  unlimitedIndicatorWeight:
    '启用后维度内指标权重不强制合计 100，适合贡献分、加分项和扣分项；关闭后需按权重合计校验。',
};

const deptNameMap = computed(
  () => new Map(apiDeptList.value.map((item) => [Number(item.id), item.name])),
);
const postNameMap = computed(
  () => new Map(apiPostList.value.map((item) => [Number(item.id), item.name])),
);
const designerDeptList = computed(() => apiDeptList.value);
const designerPostList = computed(() => apiPostList.value);
const designerUserList = computed(() =>
  apiUserList.value.map((item) => {
    const postId = Number(item.postIds?.[0] || 0) || undefined;
    return {
      ...item,
      deptName: item.deptId
        ? deptNameMap.value.get(Number(item.deptId))
        : undefined,
      postName: postId ? postNameMap.value.get(postId) : undefined,
    };
  }),
);
const designerRoleList = computed(() => apiRoleList.value);
const effectiveUserGroups = computed<UserGroupSetting[]>(() => [
  {
    desc: '系统默认用户组',
    memberIds: sourceEmployees.value.map((item) => item.id),
    name: '所有可使用成员',
    type: 'dynamic',
  },
  ...userGroupSettings.value,
]);
const designerUserGroupList = computed(() =>
  effectiveUserGroups.value.map((group, index) => ({
    id: index + 1,
    name: group.name,
    status: 0,
  })),
);

provide('processData', processData);
provide('formFields', ref<string[]>([]));
provide('formType', ref(BpmModelFormType.CUSTOM));
provide('roleList', designerRoleList);
provide('postList', designerPostList);
provide('userList', designerUserList);
provide('deptList', designerDeptList);
provide('userGroupList', designerUserGroupList);
provide('deptTree', designerDeptList);
provide('startUserIds', []);
provide('startDeptIds', []);
provide('tasks', []);
provide('processInstance', {});

const periodOptions = [
  '月度',
  '季度',
  '半年度',
  '年度',
  '试用期',
  '日',
  '自定义',
].map((value) => ({ label: value, value }));
const groupOptions = computed(() =>
  [
    ...new Set(
      [
        ...apiTemplateGroups.value.map((item) => item.name),
        ...sourceTemplates.value.map((item) => item.group),
        draft.group || '未分类考评表',
      ].filter(Boolean) as string[],
    ),
  ].map((value) => ({
    label: value,
    value,
  })),
);
function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function buildEmployeeLabel(item: PerformanceEmployee) {
  return [item.name, item.dept || '未分配部门', item.post || '未分配岗位']
    .filter(Boolean)
    .join(' · ');
}

function buildEmployeeSearchText(item: PerformanceEmployee) {
  return [
    item.name,
    item.username,
    item.dept,
    item.post,
    item.id,
    item.deptId,
    item.postId,
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(' ');
}

function filterEmployeeOption(input: string, option?: any) {
  const keyword = normalizeSearchText(input);
  if (!keyword) {
    return true;
  }
  return normalizeSearchText(
    `${option?.label ?? ''} ${option?.searchText ?? ''} ${option?.value ?? ''}`,
  ).includes(keyword);
}

const employeeOptions = computed(() =>
  sourceEmployees.value.map((item) => ({
    label: buildEmployeeLabel(item),
    searchText: buildEmployeeSearchText(item),
    value: item.id,
  })),
);
const deptOptions = computed(() =>
  [
    ...new Set(sourceEmployees.value.map((item) => item.dept).filter(Boolean)),
  ].map((value) => ({
    label: value,
    value,
  })),
);
const roleOptions = computed(() =>
  [
    ...new Set(sourceEmployees.value.map((item) => item.post).filter(Boolean)),
  ].map((value) => ({
    label: value,
    value,
  })),
);
const userGroupOptions = computed(() =>
  effectiveUserGroups.value.map((group) => ({
    label: group.name,
    value: group.name,
  })),
);
const flowPresetOptions = computed(() =>
  flowPresetList.value.map((item) => ({
    label: item.name,
    value: Number(item.id),
  })),
);
const userGroupMemberMap = computed(
  () =>
    new Map(
      effectiveUserGroups.value.map((group) => [group.name, group.memberIds]),
    ),
);
const adminOptions = computed(() =>
  sourceEmployees.value.map((item) => ({
    label: buildEmployeeLabel(item),
    searchText: buildEmployeeSearchText(item),
    value: String(item.id),
  })),
);
const scorerOptions = [
  '直接主管',
  '部门负责人',
  '考评表管理员',
  '被考核人',
  '指定评分人',
].map((value) => ({
  label: value,
  value,
}));
const scoreModeOptions = [
  '手动评分',
  '按分数区间对应',
  '输入框手动输入',
  '设置评分组',
].map((value) => ({
  label: value,
  value,
}));
const tagOptions = computed(() =>
  [
    ...new Set([
      ...apiIndicatorTags.value,
      ...sourceIndicators.value.flatMap((item) => item.tags),
    ]),
  ].map((value) => ({
    label: value,
    value,
  })),
);
const scoreNodeDimensionNames = new Set(['主管评分']);

const indicatorColumns = [
  { dataIndex: 'checked', title: '', width: 48 },
  { dataIndex: 'name', title: '指标名称', width: 220 },
  { dataIndex: 'dimension', title: '维度', width: 120 },
  { dataIndex: 'standard', title: '考核标准' },
  { dataIndex: 'weight', title: '权重', width: 100 },
  { dataIndex: 'scoreMode', title: '评分方式', width: 130 },
  { dataIndex: 'scorer', title: '指定评分人', width: 150 },
];
const importIndicatorColumns = [
  { dataIndex: 'name', title: '指标名称', width: 220 },
  { dataIndex: 'dimension', title: '指标类型', width: 120 },
  { dataIndex: 'standard', title: '考核标准' },
  { dataIndex: 'weight', title: '默认权重', width: 110 },
  { dataIndex: 'tags', title: '标签', width: 220 },
];

const selectedIndicators = computed(() =>
  sourceIndicators.value.filter((item) =>
    selectedIndicatorIds.value.includes(item.id),
  ),
);
const weightTotal = computed(() =>
  selectedIndicators.value.reduce((sum, item) => sum + item.weight, 0),
);
const dimensions = computed(() => [
  ...new Set(
    [
      '加分项',
      '业绩指标',
      '过程指标',
      '自我管理',
      ...(draft.customDimensions || []),
      ...sourceIndicators.value.map((item) => item.dimension),
    ].filter((dimension) => !scoreNodeDimensionNames.has(dimension)),
  ),
]);
const flowNodeCount = computed(() => countFlowNodes(processData.value));
const enabledTemplateCount = computed(
  () =>
    sourceTemplates.value.filter((item) => item.status === 'enabled').length,
);
const participantPreview = computed(
  () =>
    resolveParticipantIds()
      .map((id) => findEmployee(id))
      .filter(Boolean) as PerformanceEmployee[],
);
const importIndicatorRows = computed(() => {
  const text = importKeyword.value.trim();
  return sourceIndicators.value.filter((item) => {
    if (scoreNodeDimensionNames.has(item.dimension)) {
      return false;
    }
    const textMatched =
      !text ||
      [item.name, item.dimension, item.standard, item.tags.join(',')]
        .filter(Boolean)
        .some((value) => value.includes(text));
    const dimensionMatched =
      !importDimension.value || item.dimension === importDimension.value;
    const tagMatched = !importTag.value || item.tags.includes(importTag.value);
    return textMatched && dimensionMatched && tagMatched;
  });
});
const importRowSelection = computed(() => ({
  selectedRowKeys: importSelectedIndicatorIds.value,
  onChange: (keys: (number | string)[]) => {
    importSelectedIndicatorIds.value = keys.map(Number);
  },
}));
const flowGuideItems = [
  {
    desc: '部门负责人或考评表管理员维护指标，发起后生成个人实例。',
    icon: 'lucide:file-pen-line',
    title: '指标制定',
  },
  {
    desc: '被考核人确认指标，支持退回沟通、催办和 DING 提醒。',
    icon: 'lucide:user-round-check',
    title: '指标确认',
  },
  {
    desc: '执行期内允许录入结果值、自评、主管评分、互评和指定评分。',
    icon: 'lucide:workflow',
    title: '评分执行',
  },
  {
    desc: '人事复核后进入待公示，公示后被考核人在我的绩效中确认分数、等级和系数。',
    icon: 'lucide:badge-check',
    title: '审核公示',
  },
];

function toggleIndicator(id: number, checked: boolean) {
  selectedIndicatorIds.value = checked
    ? [...new Set([...selectedIndicatorIds.value, id])]
    : selectedIndicatorIds.value.filter((item) => item !== id);
}

function getDimensionIndicators(dimension: string) {
  const rows = sourceIndicators.value.filter(
    (item) => item.dimension === dimension,
  );
  if (!partialIndicatorOnly.value) {
    return rows;
  }
  return rows.filter(
    (item) => selectedIndicatorIds.value.includes(item.id) || item.weight > 0,
  );
}

function isLocalDraftIndicator(record: Record<string, any>) {
  return Number(record.id) < 0 || !record.indicatorId;
}

function cloneFlowNode(node: SimpleFlowNode) {
  return JSON.parse(JSON.stringify(node)) as SimpleFlowNode;
}

function countFlowNodes(node?: SimpleFlowNode): number {
  if (!node) {
    return 0;
  }
  const conditionCount =
    node.conditionNodes?.reduce((sum, item) => sum + countFlowNodes(item), 0) ??
    0;
  return 1 + conditionCount + countFlowNodes(node.childNode);
}

function handleFlowSave(node?: SimpleFlowNode) {
  if (!node) {
    return;
  }
  processData.value = node;
  draft.flowNode = cloneFlowNode(node);
}

function resetDefaultFlow() {
  const defaultFlow = cloneTemplate().flowNode;
  processData.value = defaultFlow;
  draft.flowNode = cloneFlowNode(defaultFlow);
  flowRenderKey.value += 1;
  message.success('已恢复默认绩效流程');
}

function getCurrentEditableFlow() {
  const currentFlow = designerRef.value?.getCurrentFlowData?.();
  return cloneFlowNode(
    currentFlow ||
      processData.value ||
      draft.flowNode ||
      defaultTemplateFlowNode,
  );
}

function parsePresetFlow(preset: FdmPerformanceTemplateApi.FlowPreset) {
  if (!preset.simpleFlowJson) {
    return undefined;
  }
  try {
    return cloneFlowNode(JSON.parse(preset.simpleFlowJson) as SimpleFlowNode);
  } catch (error) {
    console.warn('解析流程预设失败', error);
    return undefined;
  }
}

function applySelectedFlowPreset(presetId?: unknown) {
  const normalizedPresetId = Number(presetId);
  if (!Number.isFinite(normalizedPresetId) || normalizedPresetId <= 0) {
    return;
  }
  const preset = flowPresetList.value.find(
    (item) => Number(item.id) === normalizedPresetId,
  );
  const flowNode = preset ? parsePresetFlow(preset) : undefined;
  if (!flowNode) {
    message.warning('流程预设数据不完整，无法应用');
    return;
  }
  processData.value = flowNode;
  draft.flowNode = cloneFlowNode(flowNode);
  flowRenderKey.value += 1;
  message.success('已应用流程预设，可继续调整节点执行人');
}

function openFlowPresetModal() {
  const currentFlow = getCurrentEditableFlow();
  if (!currentFlow) {
    message.warning('当前流程为空，无法保存为预设');
    return;
  }
  flowPresetDraft.name = draft.name ? `${draft.name}-流程` : '绩效考核流程';
  flowPresetDraft.remark = '';
  flowPresetModalOpen.value = true;
}

async function saveFlowPreset() {
  const name = flowPresetDraft.name.trim();
  if (!name) {
    message.warning('请填写流程预设名称');
    return;
  }
  const currentFlow = getCurrentEditableFlow();
  flowPresetSaving.value = true;
  try {
    await createFdmPerformanceFlowPreset({
      flowNodes: buildFlowNodes(currentFlow),
      name,
      remark: flowPresetDraft.remark.trim(),
      simpleFlowJson: JSON.stringify(currentFlow),
      sort: flowPresetList.value.length * 10,
      status: 0,
    });
    flowPresetList.value = await getFdmPerformanceFlowPresetSimpleList();
    const created = flowPresetList.value.find((item) => item.name === name);
    selectedFlowPresetId.value = created?.id;
    flowPresetModalOpen.value = false;
    message.success('流程预设已保存');
  } finally {
    flowPresetSaving.value = false;
  }
}

function openDimensionModal() {
  Object.assign(dimensionDraft, {
    name: '',
    type: '量化指标 100%',
    weight: 20,
  });
  dimensionModalOpen.value = true;
}

function openImportModal(dimension?: string) {
  activeImportDimension.value = dimension;
  importSelectedIndicatorIds.value = dimension
    ? selectedIndicatorIds.value.filter(
        (id) =>
          sourceIndicators.value.find((item) => item.id === id)?.dimension ===
          dimension,
      )
    : [...selectedIndicatorIds.value];
  importKeyword.value = '';
  importDimension.value = dimension;
  importTag.value = undefined;
  importModalOpen.value = true;
}

function confirmImportIndicators() {
  if (activeImportDimension.value) {
    const activeDimension = activeImportDimension.value;
    const replaceableIds = new Set(
      sourceIndicators.value
        .filter(
          (item) => item.dimension === activeDimension && Number(item.id) > 0,
        )
        .map((item) => item.id),
    );
    selectedIndicatorIds.value = [
      ...new Set([
        ...selectedIndicatorIds.value.filter((id) => !replaceableIds.has(id)),
        ...importSelectedIndicatorIds.value,
      ]),
    ];
  } else {
    selectedIndicatorIds.value = [...new Set(importSelectedIndicatorIds.value)];
  }
  importSelectedIndicatorIds.value.forEach((id) => {
    if (!scorerRules[id]) {
      scorerRules[id] = '直接主管';
    }
  });
  importModalOpen.value = false;
  message.success(`已导入 ${importSelectedIndicatorIds.value.length} 个指标`);
  activeImportDimension.value = undefined;
}

function addManualIndicator(dimension: string) {
  const newIndicatorId =
    Math.min(0, ...localDraftIndicators.value.map((item) => item.id)) - 1;
  const sameDimensionCount = getDimensionIndicators(dimension).length + 1;
  const indicator: PerformanceIndicator = {
    dimension,
    id: newIndicatorId,
    name: `${dimension}指标${sameDimensionCount}`,
    scoreMode: '手动评分',
    standard: '请补充考核标准',
    status: 'enabled',
    tags: [draft.group, dimension].filter(Boolean),
    weight: dimension === '加分项' || dimension === '扣分项' ? 0 : 10,
  };
  localDraftIndicators.value.unshift(indicator);
  scorerRules[newIndicatorId] = '直接主管';
  selectedIndicatorIds.value = [
    ...new Set([...selectedIndicatorIds.value, newIndicatorId]),
  ];
  message.success(`已在「${dimension}」下新增指标`);
}

async function ensureIndicatorTag(name: string) {
  const tagName = name.trim();
  const existed = apiIndicatorTagRows.value.find(
    (item) => item.name === tagName && item.id,
  );
  if (existed?.id) {
    return Number(existed.id);
  }
  const id = await createFdmPerformanceIndicatorTag({
    name: tagName,
    remark: '考评表 AI 生成指标使用',
    sort: apiIndicatorTagRows.value.length + 1,
    status: 0,
    tagType: 3,
  });
  apiIndicatorTagRows.value.push({
    id,
    name: tagName,
    remark: '考评表 AI 生成指标使用',
    sort: apiIndicatorTagRows.value.length + 1,
    status: 0,
    tagType: 3,
  });
  apiIndicatorTags.value = apiIndicatorTagRows.value
    .map((item) => item.name || '')
    .filter(Boolean);
  return Number(id);
}

async function generateIndicatorsByAI() {
  const groupName = draft.group || '通用';
  const generated = [
    {
      dimension: '业绩指标',
      name: `${groupName}核心目标达成率`,
      standard:
        '目标达成率 X：X>=110% 得120，100%<=X<110% 得110，90%<=X<100% 得100，80%<=X<90% 得80，X<80% 得60。',
      weight: 40,
    },
    {
      dimension: '过程指标',
      name: `${groupName}过程动作完成质量`,
      standard: '按月度关键动作完成率、过程记录完整性、异常闭环时效综合评分。',
      weight: 30,
    },
    {
      dimension: '自我管理',
      name: `${groupName}协作与复盘质量`,
      standard: '结合协作响应、复盘沉淀、风险预警和主动改进情况评分。',
      weight: 20,
    },
  ];
  const createdIds: number[] = [];
  message.loading('正在生成指标并写入指标库...', 1);
  for (const item of generated) {
    const existed = sourceIndicators.value.find(
      (indicator) =>
        indicator.dimension === item.dimension && indicator.name === item.name,
    );
    if (existed) {
      createdIds.push(existed.id);
      continue;
    }
    const dimensionTagId = await ensureIndicatorTag(item.dimension);
    const aiTagId = await ensureIndicatorTag('AI生成');
    const groupTagId =
      groupName === '通用' ? undefined : await ensureIndicatorTag(groupName);
    const tagIds = [
      ...new Set([dimensionTagId, aiTagId, groupTagId].filter(Boolean)),
    ] as number[];
    const id = await createFdmPerformanceIndicator({
      name: item.name,
      remark: `来自考评表「${draft.name || groupName}」AI生成`,
      sourceType: 3,
      standard: item.standard,
      status: 0,
      tagIds,
    });
    const indicator: PerformanceIndicator = {
      dimension: item.dimension,
      id,
      indicatorId: id,
      name: item.name,
      scoreMode: '手动评分',
      standard: item.standard,
      status: 'enabled',
      tags: [groupName, 'AI生成'],
      weight: item.weight,
    };
    apiIndicators.value.unshift(indicator);
    scorerRules[id] = '直接主管';
    createdIds.push(id);
  }
  selectedIndicatorIds.value = [
    ...new Set([...selectedIndicatorIds.value, ...createdIds]),
  ];
  message.success(`已生成 ${createdIds.length} 个指标库指标`);
}

function dedupeSelectedIndicators() {
  const seen = new Set<string>();
  const deduped: number[] = [];
  selectedIndicators.value.forEach((item) => {
    const key = `${item.dimension}-${item.name}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(item.id);
  });
  const removed = selectedIndicatorIds.value.length - deduped.length;
  selectedIndicatorIds.value = deduped;
  message.success(
    removed > 0 ? `已去除 ${removed} 个重复指标` : '当前没有重复指标',
  );
}

function togglePartialIndicators() {
  partialIndicatorOnly.value = !partialIndicatorOnly.value;
  if (partialIndicatorOnly.value) {
    selectedIndicatorIds.value = selectedIndicators.value
      .filter(
        (item) =>
          item.weight > 0 &&
          !['一票否决', '加分项', '扣分项'].includes(item.dimension),
      )
      .map((item) => item.id);
  }
  message.success(
    partialIndicatorOnly.value ? '已切换为仅评部分指标' : '已恢复全部指标展示',
  );
}

function addDimension() {
  const name = dimensionDraft.name.trim();
  if (!name) {
    message.warning('请填写维度名称');
    return;
  }
  if (scoreNodeDimensionNames.has(name)) {
    message.warning('主管评分属于考核流程中的评分节点，不需要作为指标维度添加');
    return;
  }
  draft.customDimensions = [
    ...new Set([...(draft.customDimensions || []), name]),
  ];
  const newIndicatorId =
    Math.min(0, ...localDraftIndicators.value.map((item) => item.id)) - 1;
  const indicator: PerformanceIndicator = {
    dimension: name,
    id: newIndicatorId,
    name: `${name}指标`,
    scoreMode: '手动评分',
    standard: `${name}的考核标准待完善`,
    status: 'enabled',
    tags: [draft.group],
    weight: dimensionDraft.weight,
  };
  localDraftIndicators.value.unshift(indicator);
  scorerRules[newIndicatorId] = '直接主管';
  selectedIndicatorIds.value = [
    ...new Set([...selectedIndicatorIds.value, newIndicatorId]),
  ];
  dimensionModalOpen.value = false;
  message.success('已添加考核维度');
}

function resolveParticipantIds() {
  if (participantMode.value === 'people') {
    return [...selectedPeopleIds.value];
  }
  if (participantMode.value === 'department') {
    return sourceEmployees.value
      .filter((item) => selectedDeptNames.value.includes(item.dept))
      .map((item) => item.id);
  }
  if (participantMode.value === 'role') {
    return sourceEmployees.value
      .filter((item) => selectedRoleNames.value.includes(item.post))
      .map((item) => item.id);
  }
  return [
    ...new Set(
      selectedUserGroupNames.value.flatMap(
        (name) => userGroupMemberMap.value.get(name) || [],
      ),
    ),
  ];
}

function applyParticipantScope() {
  draft.participants = [...new Set(resolveParticipantIds())];
  draft.participantScope = {
    deptNames: [...selectedDeptNames.value],
    mode: participantMode.value,
    peopleIds: [...selectedPeopleIds.value],
    roleNames: [...selectedRoleNames.value],
    userGroupNames: [...selectedUserGroupNames.value],
  };
}

function findEmployee(id?: number) {
  return sourceEmployees.value.find((item) => item.id === id);
}

function mapApiIndicator(
  item: FdmPerformanceIndicatorApi.Indicator,
): PerformanceIndicator {
  const tagNames = (item.tagIds || [])
    .map((id) => apiIndicatorTagRows.value.find((tag) => tag.id === id)?.name)
    .filter(Boolean) as string[];
  return {
    dimension: tagNames[0] || '指标库',
    id: Number(item.id || 0),
    indicatorId: Number(item.id || 0),
    name: item.name || '未命名指标',
    scoreMode: '手动评分',
    standard: item.standard || '',
    status: item.status === 1 ? 'stopped' : 'enabled',
    tags: tagNames.length > 0 ? tagNames : ['指标库'],
    weight: 0,
  };
}

function mapTemplateIndicators(
  template: FdmPerformanceTemplateApi.Template,
): PerformanceIndicator[] {
  return (template.dimensions || []).flatMap((dimension) =>
    (dimension.indicators || []).map((item) => ({
      dimension: dimension.name,
      dimensionId: Number(dimension.id || 0),
      id: Number(item.id || item.indicatorId || 0),
      indicatorId: item.indicatorId ? Number(item.indicatorId) : undefined,
      name: item.name,
      scoreMode: item.scoringMethod === 2 ? '评分组' : '手动评分',
      standard: item.standard || '',
      status: item.status === 1 ? 'stopped' : 'enabled',
      tags: [dimension.name],
      templateIndicatorId: Number(item.id || 0),
      weight: Number(item.weight || 0),
    })),
  );
}

function getResultVisibleRuleValue() {
  if (resultVisibleRule.value === '人事审核后手动公示') return 2;
  if (resultVisibleRule.value === '仅管理员可见') return 3;
  return 1;
}

function applyResultVisibleRule(value?: number) {
  const ruleMap: Record<number, string> = {
    1: '评分结束后自动公示',
    2: '人事审核后手动公示',
    3: '仅管理员可见',
  };
  resultVisibleRule.value = ruleMap[value || 1] || ruleMap[1]!;
}

function getDimensionType(dimension: string) {
  if (dimension === '加分项') return 3;
  if (dimension === '扣分项') return 4;
  if (dimension === '一票否决') return 5;
  if (dimension === '加减分项') return 6;
  if (dimension === '计划') return 7;
  return 1;
}

function buildParticipants(): FdmPerformanceTemplateApi.Participant[] {
  return participantPreview.value.map((employee) => ({
    deptId: employee.deptId,
    deptName: employee.dept,
    postId: employee.postId,
    postName: employee.post,
    userId: employee.id,
    userName: employee.name,
  }));
}

function buildDimensions(): FdmPerformanceTemplateApi.Dimension[] {
  return dimensions.value
    .map((dimension, index) => {
      const indicators = getDimensionIndicators(dimension)
        .filter((item) => selectedIndicatorIds.value.includes(item.id))
        .map((item, indicatorIndex) => ({
          fieldValueJson: JSON.stringify({
            scoreMode: item.scoreMode,
            tags: item.tags,
          }),
          indicatorId: resolveIndicatorId(item),
          name: item.name,
          requiredFlag: false,
          scorerRuleJson: JSON.stringify({
            scorer: scorerRules[item.id] || unifiedScorer.value,
          }),
          scoringMethod: item.scoreMode === '评分组' ? 2 : 1,
          sort: indicatorIndex * 10,
          standard: item.standard,
          status: item.status === 'stopped' ? 1 : 0,
          weight: item.weight,
        }));
      return {
        allowCopy: true,
        allowIndicatorImport: true,
        allowManualAdd: true,
        allowTemplateIndicatorDelete: true,
        dimensionType: getDimensionType(dimension),
        fieldConfigJson: JSON.stringify({
          dimensionWeightEnabled: dimensionWeightEnabled.value,
          partialIndicatorOnly: partialIndicatorOnly.value,
          unlimitedIndicatorWeight: unlimitedIndicatorWeight.value,
        }),
        indicators,
        name: dimension,
        scoringConfigJson: JSON.stringify({
          scoreCalculateRule: scoreCalculateRule.value,
          scorerStrategy: scorerStrategy.value,
        }),
        sort: index * 10,
        status: 0,
        weight: indicators.reduce(
          (sum, item) => sum + Number(item.weight || 0),
          0,
        ),
      };
    })
    .filter((dimension) => dimension.indicators.length > 0);
}

function resolveIndicatorId(item: PerformanceIndicator) {
  if (item.indicatorId && item.indicatorId > 0) {
    return item.indicatorId;
  }
  if (item.id > 0) {
    return item.id;
  }
  return undefined;
}

function buildFlowNodes(node?: SimpleFlowNode) {
  const nodes: FdmPerformanceTemplateApi.FlowNode[] = [];
  const visit = (current?: SimpleFlowNode) => {
    if (!current) return;
    if (current.id !== 'StartUserNode' && current.id !== 'EndEvent') {
      const flowMeta = resolvePerformanceFlowMeta(current);
      nodes.push({
        assigneeType: flowMeta.assigneeType,
        assigneeUserIds: extractCandidateUserIds(current),
        nodeConfigJson: JSON.stringify({
          candidateParam: current.candidateParam,
          candidateStrategy: current.candidateStrategy,
          showText: current.showText,
          type: current.type,
        }),
        nodeKey: String(current.id || current.name || nodes.length + 1),
        nodeName: current.name || '未命名节点',
        requiredFlag: true,
        scoreWeight: flowMeta.scoreWeight,
        sort: nodes.length * 10,
        stageType: flowMeta.stageType,
        taskType: flowMeta.taskType,
      });
    }
    current.conditionNodes?.forEach((item) => visit(item));
    visit(current.childNode);
  };
  visit(node);
  return nodes;
}

function extractCandidateUserIds(node: SimpleFlowNode) {
  if (
    node.candidateStrategy !== CandidateStrategy.USER ||
    !node.candidateParam
  ) {
    return undefined;
  }
  const userIds = node.candidateParam
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return userIds.length > 0 ? userIds : undefined;
}

function resolvePerformanceFlowMeta(node: SimpleFlowNode) {
  const name = node.name || '';
  const showText = node.showText || '';
  const scoreWeight =
    Number(name.match(/(\d+(?:\.\d+)?)%/)?.[1] || 0) || undefined;
  if (name.includes('指标制定')) {
    return { assigneeType: 3, scoreWeight, stageType: 1, taskType: 1 };
  }
  if (name.includes('指标确认')) {
    return { assigneeType: 2, scoreWeight, stageType: 1, taskType: 1 };
  }
  if (name.includes('执行') || name.includes('结果值录入')) {
    return { assigneeType: 2, scoreWeight, stageType: 2, taskType: 2 };
  }
  if (name.includes('自评')) {
    return { assigneeType: 2, scoreWeight, stageType: 3, taskType: 2 };
  }
  if (name.includes('审批') || name.includes('审核')) {
    return { assigneeType: 3, scoreWeight, stageType: 4, taskType: 4 };
  }
  if (name.includes('互评') || showText.includes('同级')) {
    return { assigneeType: 6, scoreWeight, stageType: 3, taskType: 3 };
  }
  if (name.includes('指定评分')) {
    return { assigneeType: 5, scoreWeight, stageType: 3, taskType: 3 };
  }
  if (name.includes('评分')) {
    return { assigneeType: 3, scoreWeight, stageType: 3, taskType: 3 };
  }
  if (name.includes('确认')) {
    return { assigneeType: 2, scoreWeight, stageType: 5, taskType: 5 };
  }
  return { assigneeType: 2, scoreWeight, stageType: 2, taskType: 2 };
}

function buildGradeRules(): FdmPerformanceTemplateApi.GradeRule[] {
  return [
    {
      coefficient: 0,
      gradeName: 'C',
      includeMax: false,
      includeMin: true,
      maxScore: 30,
      minScore: 0,
      sort: 10,
    },
    {
      coefficient: 0.8,
      gradeName: 'C+',
      includeMax: false,
      includeMin: true,
      maxScore: 40,
      minScore: 30,
      sort: 20,
    },
    {
      coefficient: 1,
      gradeName: 'B',
      includeMax: false,
      includeMin: true,
      maxScore: 110,
      minScore: 40,
      sort: 30,
    },
    {
      coefficient: 1.5,
      gradeName: 'A',
      includeMax: false,
      includeMin: true,
      maxScore: 115,
      minScore: 110,
      sort: 40,
    },
    {
      coefficient: 2,
      gradeName: 'A+',
      includeMax: false,
      includeMin: true,
      minScore: 115,
      sort: 50,
    },
  ];
}

function buildTemplateSaveReq(): FdmPerformanceTemplateApi.TemplateSaveReq {
  const participants = buildParticipants();
  const dimensionsPayload = buildDimensions();
  return {
    ...(routeId.value !== 'new' && Number(routeId.value) > 0
      ? { id: Number(routeId.value) }
      : {}),
    autoLaunch: draft.autoLaunch,
    communicationFeedback: true,
    dimensions: dimensionsPayload,
    fieldConfigJson: JSON.stringify({
      examDescriptionEnabled: examDescriptionEnabled.value,
      totalLimitEnabled: totalLimitEnabled.value,
    }),
    flowNodes: buildFlowNodes(draft.flowNode),
    gradeEnabled: true,
    gradeRules: buildGradeRules(),
    groupName: draft.group,
    launchRuleJson: JSON.stringify({
      autoLaunch: draft.autoLaunch,
      participantScope: draft.participantScope,
    }),
    managerUserIds: draft.admins
      .map(Number)
      .filter((item) => Number.isFinite(item) && item > 0),
    name: draft.name.trim(),
    participants,
    periodType: apiPeriodTextToType(draft.periodType),
    resultVisibleRule: getResultVisibleRuleValue(),
    reuseIndicator: false,
    scoreViewPermission: 1,
    simpleFlowJson: JSON.stringify(draft.flowNode),
    status: draft.status === 'enabled' ? 1 : 0,
  };
}

function applyDraft(nextTemplate?: AssessmentTemplate) {
  const next = cloneTemplate(nextTemplate);
  Object.assign(draft, next);
  selectedIndicatorIds.value = [...(next.indicatorIds || [])];
  Object.keys(scorerRules).forEach((key) =>
    Reflect.deleteProperty(scorerRules, key),
  );
  Object.entries(next.scorerRules || {}).forEach(([id, scorer]) => {
    scorerRules[Number(id)] = scorer;
  });
  participantMode.value = next.participantScope?.mode || 'people';
  selectedPeopleIds.value = next.participantScope?.peopleIds?.length
    ? [...next.participantScope.peopleIds]
    : [...(next.participants || [])];
  selectedDeptNames.value = next.participantScope?.deptNames || [];
  selectedRoleNames.value = next.participantScope?.roleNames || [];
  selectedUserGroupNames.value = next.participantScope?.userGroupNames || [];
  scorerStrategy.value = next.scorerStrategy || 'unified';
  unifiedScorer.value = Object.values(next.scorerRules || {})[0] || '直接主管';
  processData.value = cloneFlowNode(next.flowNode);
  flowRenderKey.value += 1;
}

function applyApiTemplate(template?: FdmPerformanceTemplateApi.Template) {
  if (!template) {
    const next = cloneTemplate();
    const aiGenerated = route.query.ai === '1';
    const queryGroup =
      typeof route.query.group === 'string' ? route.query.group : '';
    const groupName = queryGroup || '未分类考评表';
    if (aiGenerated) {
      const shortGroupName = groupName.replace('考评表', '') || '通用';
      next.name = `${shortGroupName}-AI生成考评表`;
      next.group = groupName;
      next.scoringRule =
        'AI生成草稿：请从真实指标库导入指标，并确认权重、评分人和流程。';
    }
    next.admins = [];
    next.indicatorIds = [];
    next.participants = [];
    next.participantScope = {
      deptNames: [],
      mode: 'people',
      peopleIds: [],
      roleNames: [],
      userGroupNames: [],
    };
    next.status = 'enabled';
    applyDraft(next);
    apiTemplateIndicators.value = [];
    localDraftIndicators.value = [];
    return;
  }
  const mapped = mapApiTemplate(template);
  const indicators = mapTemplateIndicators(template);
  apiTemplateIndicators.value = indicators;
  localDraftIndicators.value = [];
  mapped.admins = (template.managerUserIds || []).map(String);
  mapped.indicatorIds = indicators.map((item) => item.id);
  mapped.participants = (template.participants || []).map((item) =>
    Number(item.userId),
  );
  mapped.participantScope = mapped.participantScope || {
    deptNames: [],
    mode: 'people',
    peopleIds: [...mapped.participants],
    roleNames: [],
    userGroupNames: [],
  };
  applyDraft(mapped);
  applyResultVisibleRule(template.resultVisibleRule);
}

function normalizeUserGroupSetting(
  group?: Partial<UserGroupSetting>,
): UserGroupSetting {
  return {
    desc: group?.desc || '',
    memberIds: Array.isArray(group?.memberIds)
      ? [
          ...new Set(
            group.memberIds.map(Number).filter((id) => Number.isFinite(id)),
          ),
        ]
      : [],
    name: group?.name?.trim() || '',
    type: group?.type === 'dynamic' ? 'dynamic' : 'static',
  };
}

function parseUserGroupsSetting(settings?: FdmPerformanceSettingApi.Setting[]) {
  const setting = settings?.find((item) => item.settingKey === 'userGroups');
  if (!setting?.settingValue) {
    return [];
  }
  try {
    const parsed = JSON.parse(setting.settingValue) as {
      groups?: Partial<UserGroupSetting>[];
    };
    return (parsed.groups || [])
      .map((group) => normalizeUserGroupSetting(group))
      .filter((group) => group.name);
  } catch (error) {
    console.warn('解析绩效用户组设置失败', error);
    return [];
  }
}

async function loadTemplateData() {
  loading.value = true;
  try {
    const [
      users,
      depts,
      posts,
      roles,
      tags,
      indicators,
      templates,
      groups,
      settings,
      flowPresets,
    ] = await Promise.all([
      getSimpleUserList(),
      getSimpleDeptList(),
      getSimplePostList(),
      getSimpleRoleList(),
      getFdmPerformanceIndicatorTagList({ status: 0 }),
      getFdmPerformanceIndicatorPage({ pageNo: 1, pageSize: 200, status: 0 }),
      getFdmPerformanceTemplatePage({ pageNo: 1, pageSize: 200 }),
      getFdmPerformanceTemplateGroupSimpleList(),
      getFdmPerformanceSettingList(),
      getFdmPerformanceFlowPresetSimpleList(),
    ]);
    apiDeptList.value = depts || [];
    apiPostList.value = posts || [];
    apiRoleList.value = roles || [];
    apiUserList.value = users || [];
    userGroupSettings.value = parseUserGroupsSetting(settings);
    const deptMap = new Map(
      apiDeptList.value.map((item) => [item.id, item.name]),
    );
    const postMap = new Map(
      apiPostList.value.map((item) => [item.id, item.name]),
    );
    apiEmployees.value = apiUserList.value
      .filter((item) => item.id)
      .map((item) => {
        const postId = Number(item.postIds?.[0] || 0) || undefined;
        return {
          dept: deptMap.get(item.deptId) || '未分配部门',
          deptId: item.deptId,
          id: Number(item.id),
          name: item.nickname || item.username,
          username: item.username,
          post: postId ? postMap.get(postId) || '未分配岗位' : '未分配岗位',
          postId,
        };
      });
    apiIndicatorTagRows.value = tags || [];
    apiIndicatorTags.value = apiIndicatorTagRows.value
      .map((item) => item.name || '')
      .filter(Boolean);
    apiIndicators.value = (indicators.list || []).map((item) =>
      mapApiIndicator(item),
    );
    apiTemplates.value = (templates.list || []).map((item) =>
      mapApiTemplate(item),
    );
    apiTemplateGroups.value = groups || [];
    flowPresetList.value = flowPresets || [];
    if (routeId.value === 'new') {
      applyApiTemplate();
    } else {
      applyApiTemplate(await getFdmPerformanceTemplate(Number(routeId.value)));
    }
  } finally {
    loading.value = false;
  }
}

async function saveTemplate() {
  try {
    applyParticipantScope();
    if (!draft.name.trim()) {
      message.warning('请填写考评表名称');
      currentStep.value = 0;
      return;
    }
    if (currentStep.value === 2) {
      const isValid = await designerRef.value?.validate?.().catch((error) => {
        console.error('绩效流程校验失败', error);
        return false;
      });
      const currentFlow = designerRef.value?.getCurrentFlowData?.();
      if (!isValid || !currentFlow) {
        message.warning('请完善流程节点配置');
        return;
      }
      draft.flowNode = cloneFlowNode(currentFlow);
    } else if (processData.value) {
      draft.flowNode = cloneFlowNode(processData.value);
    }
    draft.indicatorIds = [...selectedIndicatorIds.value];
    if (scorerStrategy.value === 'unified') {
      selectedIndicatorIds.value.forEach((id) => {
        scorerRules[id] = unifiedScorer.value;
      });
    }
    draft.scorerRules = Object.fromEntries(
      selectedIndicatorIds.value.map((id) => [
        id,
        scorerRules[id] || unifiedScorer.value,
      ]),
    );
    draft.scorerStrategy = scorerStrategy.value;
    draft.scoringRule = `已选 ${selectedIndicators.value.length} 个指标，总权重 ${weightTotal.value}%`;
    const payload = buildTemplateSaveReq();
    if (payload.participants.length === 0) {
      message.warning('请选择被考核人员');
      currentStep.value = 0;
      return;
    }
    if (payload.dimensions.length === 0) {
      message.warning('请先勾选要参与考核的指标，或在维度下新增/导入指标');
      currentStep.value = 1;
      return;
    }
    if (payload.id) {
      await updateFdmPerformanceTemplate(payload);
    } else {
      draft.id = await createFdmPerformanceTemplate(payload);
    }
    message.success('考评表已保存');
    router.push(performancePath('/templates'));
  } catch (error: any) {
    const errorMessage =
      error?.data?.msg ||
      error?.data?.message ||
      error?.response?.data?.msg ||
      error?.response?.data?.message ||
      error?.msg ||
      error?.message ||
      '保存考评表失败，请检查配置后重试';
    const errorDebugInfo = {
      data: error?.data,
      keys: error && typeof error === 'object' ? Object.keys(error) : [],
      message: error?.message,
      raw: error,
      responseData: error?.response?.data,
      status: error?.status || error?.response?.status,
    };
    console.error(`保存考评表失败 ${JSON.stringify(errorDebugInfo)}`);
    message.error(errorMessage);
  }
}

function goPreview() {
  currentStep.value = 2;
}

function goLaunch() {
  if (!draft.id) {
    message.warning('请先保存考评表后再发起考核');
    return;
  }
  router.push({
    path: performancePath('/launch'),
    query: { templateId: draft.id },
  });
}

onMounted(loadTemplateData);
watch(
  () => [route.path, route.params.id],
  () => loadTemplateData(),
);
</script>

<template>
  <PerformanceShell
    description="编辑考评表时按基础信息、考核指标、考核流程三步配置。"
    :title="draft.name || '新增考评表'"
  >
    <template #actions>
      <Button @click="templateSettingOpen = true">设置</Button>
      <Button @click="goPreview">预览</Button>
      <Button @click="goLaunch">发起考核</Button>
      <Button type="primary" @click="saveTemplate">保存</Button>
    </template>

    <Card :loading="loading">
      <div class="editor-action-row">
        <Space>
          <Button @click="templateSettingOpen = true">设置</Button>
          <Button @click="goPreview">预览</Button>
          <Button @click="goLaunch">发起考核</Button>
          <Button type="primary" @click="saveTemplate">保存</Button>
        </Space>
      </div>

      <Steps
        v-model:current="currentStep"
        :items="[
          { title: '基础信息' },
          { title: '考核指标' },
          { title: '考核流程' },
        ]"
        class="stepper"
      />

      <div class="config-strip">
        <button
          type="button"
          :class="{ active: totalLimitEnabled }"
          @click="totalLimitEnabled = !totalLimitEnabled"
        >
          <span class="config-option-text">总分限制</span>
          <Tooltip :title="configHelpText.totalLimit">
            <IconifyIcon
              class="config-help-icon"
              icon="lucide:circle-help"
              @click.stop
            />
          </Tooltip>
        </button>
        <button
          type="button"
          class="active"
          @click="
            scoreCalculateRule =
              scoreCalculateRule === '加扣计算' ? '加权平均' : '加扣计算'
          "
        >
          <span class="config-option-text">计分方式：{{ scoreCalculateRule }}</span>
          <Tooltip :title="configHelpText.scoreCalculate">
            <IconifyIcon
              class="config-help-icon"
              icon="lucide:circle-help"
              @click.stop
            />
          </Tooltip>
        </button>
        <button
          type="button"
          :class="{ active: dimensionWeightEnabled }"
          @click="dimensionWeightEnabled = !dimensionWeightEnabled"
        >
          <span class="config-option-text">维度权重参与计算</span>
          <Tooltip :title="configHelpText.dimensionWeight">
            <IconifyIcon
              class="config-help-icon"
              icon="lucide:circle-help"
              @click.stop
            />
          </Tooltip>
        </button>
        <button
          type="button"
          :class="{ active: unlimitedIndicatorWeight }"
          @click="unlimitedIndicatorWeight = !unlimitedIndicatorWeight"
        >
          <span class="config-option-text">不限制所有指标权重</span>
          <Tooltip :title="configHelpText.unlimitedIndicatorWeight">
            <IconifyIcon
              class="config-help-icon"
              icon="lucide:circle-help"
              @click.stop
            />
          </Tooltip>
        </button>
        <label>
          <span class="config-option-text">考核说明</span>
          <Tooltip :title="configHelpText.examDescription">
            <IconifyIcon
              class="config-help-icon"
              icon="lucide:circle-help"
              @click.stop
            />
          </Tooltip>
          <Switch v-model:checked="examDescriptionEnabled" size="small" />
        </label>
        <span class="enabled-template-count">
          已启用 {{ enabledTemplateCount }} 张考评表
          <Tooltip :title="configHelpText.enabledTemplateCount">
            <IconifyIcon class="config-help-icon" icon="lucide:circle-help" />
          </Tooltip>
        </span>
      </div>

      <section v-if="currentStep === 0" class="form-panel">
        <Form layout="vertical">
          <Form.Item label="考评表名称" required>
            <Input v-model:value="draft.name" placeholder="请输入考评表名称" />
          </Form.Item>
          <Form.Item label="考核周期" required>
            <Radio.Group
              v-model:value="draft.periodType"
              :options="periodOptions"
            />
          </Form.Item>
          <Form.Item label="考评表分组" required>
            <Select v-model:value="draft.group" :options="groupOptions" />
          </Form.Item>
          <Form.Item label="考评表管理员">
            <Select
              v-model:value="draft.admins"
              allow-clear
              :filter-option="filterEmployeeOption"
              mode="multiple"
              option-filter-prop="label"
              :options="adminOptions"
              show-search
            />
          </Form.Item>
          <Form.Item label="被考核人员" required>
            <div class="participant-scope">
              <Radio.Group v-model:value="participantMode">
                <Radio value="people">按人员</Radio>
                <Radio value="department">按部门</Radio>
                <Radio value="role">按角色</Radio>
                <Radio value="userGroup">按用户组</Radio>
              </Radio.Group>
              <Select
                v-if="participantMode === 'people'"
                v-model:value="selectedPeopleIds"
                allow-clear
                :filter-option="filterEmployeeOption"
                :options="employeeOptions"
                mode="multiple"
                option-filter-prop="label"
                placeholder="请选择被考核人员"
                show-search
              />
              <Select
                v-else-if="participantMode === 'department'"
                v-model:value="selectedDeptNames"
                :options="deptOptions"
                mode="multiple"
                placeholder="请选择部门"
              />
              <Select
                v-else-if="participantMode === 'role'"
                v-model:value="selectedRoleNames"
                :options="roleOptions"
                mode="multiple"
                placeholder="请选择角色"
              />
              <Select
                v-else
                v-model:value="selectedUserGroupNames"
                :options="userGroupOptions"
                mode="multiple"
                placeholder="请选择用户组"
              />
              <div class="participant-preview">
                <span>预览 {{ participantPreview.length }} 人</span>
                <Tag
                  v-for="employee in participantPreview.slice(0, 8)"
                  :key="employee?.id"
                >
                  {{ employee?.name }} · {{ employee?.dept }}
                </Tag>
                <Tag v-if="participantPreview.length > 8">
                  +{{ participantPreview.length - 8 }}
                </Tag>
              </div>
            </div>
            <div class="hint">
              发起考核时会按当前范围生成被考核人员，保存后作为正式考评表模板使用。
            </div>
          </Form.Item>
          <div class="setting-row">
            <span>自动发起考核</span>
            <Switch v-model:checked="draft.autoLaunch" />
          </div>
          <div class="setting-row">
            <span>结果展示规则</span>
            <Select
              v-model:value="resultVisibleRule"
              :options="
                [
                  '评分结束后自动公示',
                  '人事审核后手动公示',
                  '仅管理员可见',
                ].map((value) => ({ label: value, value }))
              "
              class="inline-select"
            />
          </div>
          <div class="setting-row">
            <span>考评表状态</span>
            <Switch
              :checked="draft.status === 'enabled'"
              checked-children="启用"
              un-checked-children="草稿"
              @change="draft.status = $event ? 'enabled' : 'draft'"
            />
          </div>
          <div class="setting-row">
            <span>无须考核人员</span>
            <Checkbox>试用期员工</Checkbox>
            <Checkbox>实习期员工</Checkbox>
            <Checkbox>按人员设置</Checkbox>
          </div>
        </Form>
      </section>

      <section v-if="currentStep === 1" class="indicator-panel">
        <div class="panel-toolbar">
          <Space>
            <Button @click="router.push(performancePath('/indicators'))">
              维护指标库
            </Button>
            <Button @click="generateIndicatorsByAI">AI生成</Button>
            <Button @click="openDimensionModal">添加考核维度</Button>
          </Space>
          <Space>
            <Tag v-if="partialIndicatorOnly" color="blue">仅评部分指标</Tag>
            <Tag :color="weightTotal === 100 ? 'green' : 'orange'">
              当前总权重 {{ weightTotal }}%
            </Tag>
          </Space>
        </div>
        <Alert
          show-icon
          type="info"
          message="指标库列表只是候选项，只有已勾选的指标会保存到考评表。可以在对应维度下手动新增指标，或从指标库导入后再勾选。"
        />

        <div class="dimension-list">
          <Card
            v-for="dimension in dimensions"
            :key="dimension"
            :title="dimension"
          >
            <Table
              :columns="indicatorColumns"
              :data-source="getDimensionIndicators(dimension)"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'checked'">
                  <Checkbox
                    :checked="selectedIndicatorIds.includes(record.id)"
                    @change="toggleIndicator(record.id, $event.target.checked)"
                  />
                </template>
                <template
                  v-else-if="
                    column.dataIndex === 'name' && isLocalDraftIndicator(record)
                  "
                >
                  <Input
                    v-model:value="record.name"
                    placeholder="请输入指标名称"
                    size="small"
                  />
                </template>
                <template
                  v-else-if="
                    column.dataIndex === 'standard' &&
                    isLocalDraftIndicator(record)
                  "
                >
                  <Input.TextArea
                    v-model:value="record.standard"
                    auto-size
                    placeholder="请输入考核标准"
                    size="small"
                  />
                </template>
                <template v-else-if="column.dataIndex === 'weight'">
                  <InputNumber
                    v-model:value="record.weight"
                    :max="100"
                    :min="0"
                    addon-after="%"
                  />
                </template>
                <template
                  v-else-if="
                    column.dataIndex === 'scoreMode' &&
                    isLocalDraftIndicator(record)
                  "
                >
                  <Select
                    v-model:value="record.scoreMode"
                    :options="scoreModeOptions"
                    size="small"
                  />
                </template>
                <template v-else-if="column.dataIndex === 'scorer'">
                  <Select
                    v-model:value="scorerRules[record.id]"
                    :disabled="
                      scorerStrategy === 'unified' ||
                      !selectedIndicatorIds.includes(record.id)
                    "
                    :options="scorerOptions"
                    size="small"
                  />
                </template>
              </template>
            </Table>
            <div class="dimension-footer-actions">
              <Button
                size="small"
                type="link"
                @click="addManualIndicator(dimension)"
              >
                <template #icon><IconifyIcon icon="lucide:plus" /></template>
                新增指标
              </Button>
              <Button
                size="small"
                type="link"
                @click="openImportModal(dimension)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:download" />
                </template>
                指标库导入
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section v-if="currentStep === 2" class="flow-panel">
        <div class="panel-toolbar">
          <div>
            <h3>考核流程</h3>
            <p>
              复用当前系统 BPM
              的仿钉钉简易流程组件，维护考评表的完整审批和评分链路。
            </p>
          </div>
          <Space wrap>
            <Select
              v-model:value="selectedFlowPresetId"
              allow-clear
              class="flow-preset-select"
              :options="flowPresetOptions"
              placeholder="选择流程预设"
              @change="applySelectedFlowPreset"
            />
            <Button @click="openFlowPresetModal">保存为流程预设</Button>
            <Button @click="resetDefaultFlow">恢复默认流程</Button>
            <Button @click="dedupeSelectedIndicators">去重设置</Button>
            <Button @click="templateSettingOpen = true">流程设置</Button>
            <Button
              :type="partialIndicatorOnly ? 'primary' : 'default'"
              @click="togglePartialIndicators"
            >
              仅评部分指标
            </Button>
          </Space>
        </div>

        <div class="scorer-strategy-panel">
          <div>
            <strong>评分人设置</strong>
            <span>根据考核实际情况选择统一评分人，或分不同指标设置不同评分人。</span>
          </div>
          <Radio.Group v-model:value="scorerStrategy">
            <Radio value="unified">统一评分人</Radio>
            <Radio value="byIndicator">按指标设置评分人</Radio>
          </Radio.Group>
          <Select
            v-if="scorerStrategy === 'unified'"
            v-model:value="unifiedScorer"
            :options="scorerOptions"
            class="scorer-select"
          />
          <Tag v-else color="blue">
            在指标行的评分方式和指定评分人字段中分别维护
          </Tag>
        </div>

        <div class="flow-workbench">
          <aside class="flow-guide-panel">
            <div class="flow-guide-title">绩效节点映射</div>
            <div
              v-for="item in flowGuideItems"
              :key="item.title"
              class="flow-guide-item"
            >
              <span>
                <IconifyIcon :icon="item.icon" />
              </span>
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.desc }}</p>
              </div>
            </div>
          </aside>

          <div class="flow-canvas-panel">
            <div class="flow-canvas-head">
              <div>
                <strong>流程设计器</strong>
                <span>{{ flowNodeCount }} 个节点</span>
              </div>
              <Tag color="processing">流程模板</Tag>
            </div>
            <div class="flow-canvas">
              <SimpleProcessDesigner
                :key="flowRenderKey"
                ref="designerRef"
                model-name="绩效考评流程"
                :model-form-type="BpmModelFormType.CUSTOM"
                :use-local-options="true"
                :local-roles="designerRoleList"
                :local-posts="designerPostList"
                :local-users="designerUserList"
                :local-depts="designerDeptList"
                :local-user-groups="designerUserGroupList"
                @success="handleFlowSave"
              />
            </div>
          </div>

          <aside class="flow-inspector">
            <div class="flow-guide-title">配置说明</div>
            <div class="inspector-block">
              <span>执行人来源</span>
              <strong>{{
                scorerStrategy === 'unified'
                  ? `统一评分人：${unifiedScorer}`
                  : '按指标设置评分人'
              }}</strong>
            </div>
            <div class="inspector-block">
              <span>评分权重</span>
              <strong>自评、上级评分、互评可在节点名称中体现权重</strong>
            </div>
            <div class="inspector-block">
              <span>指标范围</span>
              <strong>{{
                partialIndicatorOnly
                  ? '仅评已选计分指标'
                  : '全部指标参与当前考评表配置'
              }}</strong>
            </div>
            <div class="inspector-block">
              <span>重复指标</span>
              <strong>{{
                dedupeEnabled ? '保存前可手动去重' : '允许重复指标'
              }}</strong>
            </div>
            <div class="inspector-block">
              <span>实例生成</span>
              <strong>保存为考评流程，发起考核时生成个人流程实例</strong>
            </div>
          </aside>
        </div>
      </section>

      <div class="footer-actions">
        <Button :disabled="currentStep === 0" @click="currentStep -= 1">
          上一步
        </Button>
        <Button v-if="currentStep < 2" type="primary" @click="currentStep += 1">
          下一步
        </Button>
        <Button v-else type="primary" @click="saveTemplate">保存</Button>
      </div>
    </Card>

    <Modal
      v-model:open="flowPresetModalOpen"
      :confirm-loading="flowPresetSaving"
      title="保存流程预设"
      @ok="saveFlowPreset"
    >
      <Form layout="vertical">
        <Form.Item label="流程预设名称" required>
          <Input
            v-model:value="flowPresetDraft.name"
            :maxlength="128"
            placeholder="例如：月度绩效标准流程"
          />
        </Form.Item>
        <Form.Item label="备注">
          <Input
            v-model:value="flowPresetDraft.remark"
            :maxlength="512"
            placeholder="可填写适用部门或场景"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="dimensionModalOpen"
      title="添加考核维度"
      @ok="addDimension"
    >
      <Form layout="vertical">
        <Form.Item label="维度名称" required>
          <Input
            v-model:value="dimensionDraft.name"
            placeholder="请输入维度名称"
          />
        </Form.Item>
        <Form.Item label="维度类型">
          <Select
            v-model:value="dimensionDraft.type"
            :options="
              [
                '量化指标 100%',
                '其他指标',
                '加分项',
                '扣分项',
                '一票否决',
                '加减分项',
                '计划',
                '自定义维度',
              ].map((value) => ({ label: value, value }))
            "
          />
        </Form.Item>
        <Form.Item label="维度权重">
          <InputNumber
            v-model:value="dimensionDraft.weight"
            :max="100"
            :min="0"
            addon-after="%"
            class="full"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="importModalOpen"
      :title="
        activeImportDimension
          ? `从指标库导入到：${activeImportDimension}`
          : '指标库导入'
      "
      width="980px"
      @cancel="activeImportDimension = undefined"
      @ok="confirmImportIndicators"
    >
      <div class="import-toolbar">
        <Input
          v-model:value="importKeyword"
          allow-clear
          placeholder="搜索指标名称、考核标准、标签"
        />
        <Select
          v-model:value="importDimension"
          allow-clear
          :disabled="Boolean(activeImportDimension)"
          :options="dimensions.map((value) => ({ label: value, value }))"
          placeholder="指标类型"
        />
        <Select
          v-model:value="importTag"
          allow-clear
          :options="tagOptions"
          placeholder="岗位标签"
        />
      </div>
      <Table
        :columns="importIndicatorColumns"
        :data-source="importIndicatorRows"
        :pagination="{ pageSize: 6 }"
        :row-selection="importRowSelection"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'weight'">
            {{ record.weight }}%
          </template>
          <template v-else-if="column.dataIndex === 'tags'">
            <Space :size="4" wrap>
              <Tag v-for="tag in record.tags" :key="tag">{{ tag }}</Tag>
            </Space>
          </template>
        </template>
      </Table>
    </Modal>

    <Modal
      v-model:open="templateSettingOpen"
      title="考评表设置"
      width="760px"
      @ok="saveTemplate"
    >
      <div class="setting-modal-grid">
        <section>
          <h3>发起与结果</h3>
          <div class="modal-setting-row">
            <span>自动发起考核</span>
            <Switch v-model:checked="draft.autoLaunch" />
          </div>
          <div class="modal-setting-row">
            <span>评分结果</span>
            <Select
              v-model:value="resultVisibleRule"
              :options="
                [
                  '评分结束后自动公示',
                  '人事审核后手动公示',
                  '仅管理员可见',
                ].map((value) => ({ label: value, value }))
              "
            />
          </div>
          <div class="modal-setting-row">
            <span>考评表状态</span>
            <Switch
              :checked="draft.status === 'enabled'"
              checked-children="启用"
              un-checked-children="草稿"
              @change="draft.status = $event ? 'enabled' : 'draft'"
            />
          </div>
        </section>

        <section>
          <h3>指标计算</h3>
          <div class="modal-setting-row">
            <span class="setting-label-with-help">
              总分限制
              <Tooltip :title="configHelpText.totalLimit">
                <IconifyIcon
                  class="config-help-icon"
                  icon="lucide:circle-help"
                />
              </Tooltip>
            </span>
            <Switch v-model:checked="totalLimitEnabled" />
          </div>
          <div class="modal-setting-row">
            <span class="setting-label-with-help">
              计分方式
              <Tooltip :title="configHelpText.scoreCalculate">
                <IconifyIcon
                  class="config-help-icon"
                  icon="lucide:circle-help"
                />
              </Tooltip>
            </span>
            <Select
              v-model:value="scoreCalculateRule"
              :options="
                ['加扣计算', '加权平均', '分数区间对应', '结果相乘'].map(
                  (value) => ({ label: value, value }),
                )
              "
            />
          </div>
          <div class="modal-setting-row">
            <span class="setting-label-with-help">
              维度权重参与计算
              <Tooltip :title="configHelpText.dimensionWeight">
                <IconifyIcon
                  class="config-help-icon"
                  icon="lucide:circle-help"
                />
              </Tooltip>
            </span>
            <Switch v-model:checked="dimensionWeightEnabled" />
          </div>
          <div class="modal-setting-row">
            <span class="setting-label-with-help">
              不限制所有指标权重
              <Tooltip :title="configHelpText.unlimitedIndicatorWeight">
                <IconifyIcon
                  class="config-help-icon"
                  icon="lucide:circle-help"
                />
              </Tooltip>
            </span>
            <Switch v-model:checked="unlimitedIndicatorWeight" />
          </div>
          <div class="modal-setting-row">
            <span class="setting-label-with-help">
              评分人策略
              <Tooltip :title="configHelpText.scorerStrategy">
                <IconifyIcon
                  class="config-help-icon"
                  icon="lucide:circle-help"
                />
              </Tooltip>
            </span>
            <Select
              v-model:value="scorerStrategy"
              :options="[
                { label: '统一评分人', value: 'unified' },
                { label: '按指标设置评分人', value: 'byIndicator' },
              ]"
            />
          </div>
        </section>
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.stepper {
  max-width: 720px;
  margin: 0 auto 28px;
}

.editor-action-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 18px;
}

.form-panel {
  max-width: 680px;
  min-height: 520px;
  margin: 0 auto;
}

.config-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 0 14px;
  margin: -8px 0 18px;
  border-bottom: 1px solid #edf0f4;
}

.config-strip button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  color: #374151;
  cursor: pointer;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.config-strip button.active {
  color: #1677ff;
  background: #eaf3ff;
  border-color: #b8d7ff;
}

.config-strip label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 30px;
  color: #374151;
}

.config-strip .config-option-text {
  color: inherit;
}

.config-strip .enabled-template-count {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: #94a3b8;
}

.config-help-icon {
  flex-shrink: 0;
  font-size: 14px;
  color: #94a3b8;
  cursor: help;
}

.full {
  width: 100%;
}

.hint {
  margin-top: 8px;
  color: #94a3b8;
}

.participant-scope {
  display: grid;
  gap: 12px;
}

.participant-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 38px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.participant-preview span {
  margin-right: 4px;
  font-size: 12px;
  color: #64748b;
}

.setting-row {
  display: flex;
  gap: 14px;
  align-items: center;
  min-height: 42px;
}

.inline-select {
  width: 260px;
  max-width: 100%;
}

.indicator-panel,
.flow-panel {
  display: grid;
  gap: 14px;
}

.panel-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.panel-toolbar h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: #111827;
  letter-spacing: 0;
}

.panel-toolbar p {
  margin: 4px 0 0;
  color: #64748b;
}

.dimension-list {
  display: grid;
  gap: 14px;
}

.dimension-footer-actions {
  display: flex;
  gap: 18px;
  align-items: center;
  min-height: 42px;
  padding: 8px 0 0;
  border-top: 1px solid #edf0f4;
}

.dimension-footer-actions :deep(.ant-btn) {
  padding-inline: 0;
}

.dimension-footer-actions :deep(.ant-btn .anticon + span),
.dimension-footer-actions :deep(.ant-btn span + span) {
  margin-inline-start: 4px;
}

.import-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px 180px;
  gap: 10px;
  margin-bottom: 12px;
}

.scorer-strategy-panel {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto 220px;
  gap: 14px;
  align-items: center;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.scorer-strategy-panel > div {
  display: grid;
  gap: 4px;
}

.scorer-strategy-panel strong {
  font-weight: 650;
  color: #111827;
}

.scorer-strategy-panel span {
  font-size: 12px;
  color: #64748b;
}

.scorer-select {
  width: 220px;
}

.flow-preset-select {
  width: 220px;
}

.flow-workbench {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 280px;
  gap: 14px;
  min-width: 0;
}

.flow-guide-panel,
.flow-inspector,
.flow-canvas-panel {
  min-width: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.flow-guide-panel,
.flow-inspector {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
}

.flow-guide-title {
  font-size: 14px;
  font-weight: 650;
  color: #111827;
}

.flow-guide-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.flow-guide-item > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #1677ff;
  background: #eaf3ff;
  border-radius: 8px;
}

.flow-guide-item strong,
.inspector-block strong {
  font-size: 14px;
  color: #111827;
}

.flow-guide-item p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.flow-canvas-panel {
  overflow: hidden;
}

.flow-canvas-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid #e5e7eb;
}

.flow-canvas-head > div {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
}

.flow-canvas-head span {
  font-size: 12px;
  color: #94a3b8;
}

.flow-canvas {
  height: 720px;
  overflow: auto;
  background: #f3f5f8;
}

.flow-canvas :deep(.simple-process-model-container) {
  min-height: 720px;
}

.flow-canvas :deep(.simple-process-model) {
  padding-bottom: 120px;
}

.inspector-block {
  display: grid;
  gap: 6px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.inspector-block span {
  font-size: 12px;
  color: #64748b;
}

.footer-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding-top: 24px;
}

.setting-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.setting-modal-grid section {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.setting-modal-grid h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #111827;
}

.modal-setting-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.modal-setting-row span {
  color: #64748b;
}

.setting-label-with-help {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

@media (max-width: 1280px) {
  .flow-workbench {
    grid-template-columns: 1fr;
  }

  .flow-guide-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-guide-title {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .panel-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .flow-guide-panel {
    grid-template-columns: 1fr;
  }

  .import-toolbar,
  .scorer-strategy-panel {
    grid-template-columns: 1fr;
  }

  .scorer-select {
    width: 100%;
  }

  .setting-modal-grid,
  .modal-setting-row {
    grid-template-columns: 1fr;
  }
}
</style>
