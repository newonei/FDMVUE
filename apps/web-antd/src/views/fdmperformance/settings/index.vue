<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tabs,
  message,
} from 'ant-design-vue';

import {
  getFdmPerformanceAssessmentBatchPage,
  getFdmPerformanceAssessmentChangeLogPage,
  stopFdmPerformanceAssessmentInstances,
  transferFdmPerformanceAssessmentTasks,
  type FdmPerformanceAssessmentApi,
} from '#/api/fdmperformance/assessment';
import {
  batchSaveFdmPerformanceSetting,
  getFdmPerformanceSettingList,
  type FdmPerformanceSettingApi,
} from '#/api/fdmperformance/setting';
import { getSimpleDeptList, type SystemDeptApi } from '#/api/system/dept';
import { getSimpleUserList, type SystemUserApi } from '#/api/system/user';

import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceSettings' });

type SettingKey =
  | 'actions'
  | 'available'
  | 'data'
  | 'integration'
  | 'logs'
  | 'menu'
  | 'performance'
  | 'relation'
  | 'reminders'
  | 'userGroups';

type EmployeeRow = {
  dept: string;
  id: number;
  name: string;
  post: string;
  role: string;
};

interface FieldSetting {
  enabled: boolean;
  field: string;
  type: string;
}

interface RelationSetting {
  departmentReadMode: 'all' | 'main';
  onboardReminder: boolean;
  resignedReminder: boolean;
  roleMatchMode: 'all' | 'main';
  useDeptSupervisor: boolean;
  useDirectSupervisor: boolean;
  useMainDeptSupervisor: boolean;
}

interface PerformanceSetting {
  allowCalibrationViewer: boolean;
  autoRemoveResigned: boolean;
  defaultDimensionWeight: boolean;
  defaultGradeEnabled: boolean;
  defaultResultInput: boolean;
  duplicateIndicatorName: boolean;
  excludedUserIds: number[];
  fieldSettings: FieldSetting[];
  reuseLastSignature: boolean;
  scoreRule: 'mixed' | 'multiply' | 'split';
  scoringMethod: 'manual' | 'scoreGroup';
  showCoefficient: boolean;
  showGrade: boolean;
  showTotalScore: boolean;
  syncResultToProfile: boolean;
}

interface ActionSetting {
  dueRequired: boolean;
  participantEditable: boolean;
  statuses: string[];
  stopReminderAfterCycle: boolean;
  subtaskEnabled: boolean;
  syncTaskTodo: boolean;
  taskRequiredOwner: boolean;
}

interface ReminderSetting {
  notifyHrTodo: boolean;
  reminderTarget: string;
  resignedMessageReminder: boolean;
  resultValueUpdateReminder: boolean;
}

interface IntegrationSetting {
  appId: string;
  appSecret: string;
  attendanceSyncEnabled: boolean;
  callbackUrl: string;
  dingCallbackEnabled: boolean;
}

interface MenuSetting {
  items: string[];
}

interface UserGroupSetting {
  desc: string;
  memberIds: number[];
  name: string;
  type: 'dynamic' | 'static';
}

interface UserGroupsSetting {
  groups: UserGroupSetting[];
}

interface UserGroupRow extends UserGroupSetting {
  group: UserGroupSetting;
  index?: number;
  members: string;
  system?: boolean;
  typeText: string;
}

interface SettingsState {
  actions: ActionSetting;
  integration: IntegrationSetting;
  menu: MenuSetting;
  performance: PerformanceSetting;
  relation: RelationSetting;
  reminders: ReminderSetting;
  userGroups: UserGroupsSetting;
}

const defaultSettings = (): SettingsState => ({
  relation: {
    departmentReadMode: 'all',
    onboardReminder: false,
    resignedReminder: true,
    roleMatchMode: 'all',
    useDeptSupervisor: false,
    useDirectSupervisor: true,
    useMainDeptSupervisor: true,
  },
  performance: {
    allowCalibrationViewer: false,
    autoRemoveResigned: true,
    defaultDimensionWeight: true,
    defaultGradeEnabled: true,
    defaultResultInput: false,
    duplicateIndicatorName: false,
    excludedUserIds: [],
    fieldSettings: [
      { enabled: true, field: '指标名称', type: '文本类型' },
      { enabled: true, field: '考核标准', type: '文本类型' },
      { enabled: true, field: '权重', type: '数字类型' },
      { enabled: true, field: '附件', type: '文本类型' },
      { enabled: false, field: '门槛值', type: '长文本类型' },
      { enabled: false, field: '目标值', type: '长文本类型' },
      { enabled: true, field: '结果值', type: '长文本类型' },
    ],
    reuseLastSignature: false,
    scoreRule: 'split',
    scoringMethod: 'manual',
    showCoefficient: false,
    showGrade: true,
    showTotalScore: true,
    syncResultToProfile: false,
  },
  actions: {
    dueRequired: false,
    participantEditable: false,
    statuses: ['待处理', '进行中', '已完成', '失败或放弃'],
    stopReminderAfterCycle: false,
    subtaskEnabled: false,
    syncTaskTodo: true,
    taskRequiredOwner: true,
  },
  reminders: {
    notifyHrTodo: true,
    reminderTarget: '优先最小管理员',
    resignedMessageReminder: true,
    resultValueUpdateReminder: true,
  },
  integration: {
    appId: '',
    appSecret: '',
    attendanceSyncEnabled: false,
    callbackUrl: '',
    dingCallbackEnabled: false,
  },
  menu: {
    items: ['首页', '目标地图', '行动计划', '考评表', '发起考核', '已发起考核', '指标库', '数据中心', '我的绩效', '系统设置'],
  },
  userGroups: {
    groups: [],
  },
});

const settingMeta: Record<keyof SettingsState, { name: string; sort: number; remark: string }> = {
  userGroups: { name: '用户组', sort: 5, remark: '智能绩效可使用人员用户组' },
  relation: { name: '关系识别', sort: 10, remark: '主管、部门、角色关系识别规则' },
  performance: { name: '绩效考核', sort: 20, remark: '绩效考核默认规则、字段和等级展示' },
  actions: { name: '行动计划', sort: 30, remark: '行动计划任务规则' },
  reminders: { name: '提醒设置', sort: 40, remark: '绩效提醒规则' },
  integration: { name: '数据连接', sort: 50, remark: '钉钉回调与考勤同步配置' },
  menu: { name: '菜单排序', sort: 60, remark: '智能绩效菜单排序' },
};

const router = useRouter();
const settings = reactive<SettingsState>(defaultSettings());
const activeKey = ref<SettingKey>('available');
const performanceTab = ref('score');
const dataTab = ref('stop');
const keyword = ref('');
const userGroupKeyword = ref('');
const userGroupImportRef = ref<HTMLInputElement>();
const userGroupModalOpen = ref(false);
const userGroupPreviewOpen = ref(false);
const editingUserGroupIndex = ref<number>();
const previewUserGroup = ref<UserGroupSetting>();
const fieldModalOpen = ref(false);
const editingFieldIndex = ref<number>();
const excludedUserId = ref<number>();
const logDetailOpen = ref(false);
const selectedLog = ref<FdmPerformanceAssessmentApi.ChangeLog>();
const callbackInputRef = ref();
const stopEmployeeId = ref<number>();
const stopBatchId = ref<number>();
const transferFrom = ref<number>();
const transferTo = ref<number>();
const loading = ref(false);
const apiUsers = ref<SystemUserApi.User[]>([]);
const apiDepts = ref<SystemDeptApi.Dept[]>([]);
const apiBatches = ref<FdmPerformanceAssessmentApi.Batch[]>([]);
const apiLogs = ref<FdmPerformanceAssessmentApi.ChangeLog[]>([]);
const userGroupEditor = reactive<UserGroupSetting>({
  desc: '',
  memberIds: [],
  name: '',
  type: 'static',
});
const fieldEditor = reactive<FieldSetting>({
  enabled: true,
  field: '',
  type: '文本类型',
});

const settingGroups: Array<{
  items: Array<{ key: SettingKey; label: string }>;
  title: string;
}> = [
  {
    title: '组织架构',
    items: [
      { key: 'available', label: '可使用人员' },
      { key: 'userGroups', label: '用户组' },
      { key: 'relation', label: '关系识别' },
    ],
  },
  {
    title: '模块管理',
    items: [
      { key: 'performance', label: '绩效考核' },
      { key: 'actions', label: '行动计划' },
      { key: 'reminders', label: '提醒设置' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'integration', label: '数据连接' },
      { key: 'menu', label: '菜单排序' },
      { key: 'logs', label: '操作日志' },
      { key: 'data', label: '数据处理' },
    ],
  },
];

const pageTitle = computed(
  () => settingGroups.flatMap((group) => group.items).find((item) => item.key === activeKey.value)?.label ?? '系统设置',
);

const deptNameMap = computed(() => {
  const map = new Map<number, string>();
  const visit = (items: SystemDeptApi.Dept[]) => {
    items.forEach((item) => {
      if (item.id) {
        map.set(item.id, item.name);
      }
      if (item.children?.length) {
        visit(item.children);
      }
    });
  };
  visit(apiDepts.value);
  return map;
});
const formalEmployeeRows = computed<EmployeeRow[]>(() =>
  apiUsers.value.map((item, index) => ({
    dept: item.deptId ? (deptNameMap.value.get(item.deptId) ?? `部门 ${item.deptId}`) : '未分配部门',
    id: item.id ?? index + 1,
    name: item.nickname || item.username,
    post: item.postIds?.length ? `岗位 ${item.postIds.join(',')}` : '普通员工',
    role: item.status === 0 ? '普通员工' : '停用',
  })),
);
const employeeRows = computed(() => {
  const text = keyword.value.trim();
  return formalEmployeeRows.value
    .filter((item) => !text || [item.name, item.dept, item.post, item.role].some((value) => value.includes(text)));
});
const employeeOptions = computed(() =>
  formalEmployeeRows.value.map((item) => ({ label: `${item.name} · ${item.dept}`, value: item.id })),
);
const employeeNameOptions = computed(() =>
  formalEmployeeRows.value.map((item) => ({ label: `${item.name} · ${item.dept}`, value: item.id })),
);
const employeeById = computed(() => new Map(formalEmployeeRows.value.map((item) => [item.id, item])));
const excludedEmployeeRows = computed(() =>
  settings.performance.excludedUserIds
    .map((id) => employeeById.value.get(id))
    .filter(Boolean) as EmployeeRow[],
);
const excludedUserOptions = computed(() => {
  const excluded = new Set(settings.performance.excludedUserIds);
  return formalEmployeeRows.value
    .filter((item) => !excluded.has(item.id))
    .map((item) => ({ label: `${item.name} · ${item.dept}`, value: item.id }));
});
const stopBatchOptions = computed(() => {
  if (!stopEmployeeId.value) return [];
  return apiBatches.value
    .filter((batch) => ![-1, 50, 100].includes(batch.status ?? 0))
    .map((batch) => ({ label: batch.name || `考核 ${batch.id}`, value: batch.id }));
});

const employeeColumns: TableColumnsType = [
  { dataIndex: 'name', title: '姓名', width: 220 },
  { dataIndex: 'dept', title: '部门' },
  { dataIndex: 'role', title: '角色', width: 160 },
];
const excludedColumns: TableColumnsType = [
  ...employeeColumns,
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 120 },
];

const allUsersGroup = computed<UserGroupSetting>(() => ({
  desc: '系统默认用户组，包含所有可使用人员，不可编辑',
  memberIds: formalEmployeeRows.value.map((item) => item.id),
  name: '所有可使用成员',
  type: 'dynamic',
}));
const userGroupRows = computed<UserGroupRow[]>(() => {
  const text = userGroupKeyword.value.trim();
  const rows: UserGroupRow[] = [
    buildUserGroupRow(allUsersGroup.value, undefined, true),
    ...settings.userGroups.groups.map((group, index) => buildUserGroupRow(group, index, false)),
  ];
  return rows.filter(
    (item) => !text || [item.name, item.members, item.desc, item.typeText].some((value) => value.includes(text)),
  );
});
const userGroupColumns: TableColumnsType = [
  { dataIndex: 'name', title: '用户组', width: 220 },
  { dataIndex: 'typeText', title: '类型', width: 140 },
  { dataIndex: 'members', title: '成员', width: 240 },
  { dataIndex: 'desc', title: '描述' },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];
const previewUserGroupMemberRows = computed(() => resolveUserGroupMemberRows(previewUserGroup.value));

const gradeRows = [
  { name: '不及格', range: '0 ≤ 分数 ≤ 80，系数 0' },
  { name: '及格', range: '81 ≤ 分数 ≤ 90，系数 0.80' },
  { name: '平均', range: '91 ≤ 分数 ≤ 100，系数 1.00' },
  { name: '优秀', range: '101 ≤ 分数 ≤ 110，系数 1.50' },
  { name: '卓越', range: '111 ≤ 分数 ≤ 120，系数 2.00' },
];
const gradeColumns: TableColumnsType = [
  { dataIndex: 'name', title: '等级名称', width: 160 },
  { dataIndex: 'range', title: '分数区间' },
];

const fieldRows = computed(() => settings.performance.fieldSettings);
const fieldTypeOptions = ['文本类型', '数字类型', '长文本类型', '日期类型', '附件类型'].map((value) => ({
  label: value,
  value,
}));
const fieldColumns: TableColumnsType = [
  { dataIndex: 'field', title: '字段', width: 260 },
  { dataIndex: 'enabled', title: '状态', width: 160 },
  { dataIndex: 'type', title: '字段类型' },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];

const operationTypeText: Record<string, string> = {
  HISTORY_IMPORT: '导入历史绩效',
  INTERVIEW: '记录绩效面谈',
  RESULT_OBJECTION: '提交结果异议',
  TASK_REMIND: '绩效待办催办',
};
const operatorNameMap = computed(() => {
  const map = new Map<number, string>();
  apiUsers.value.forEach((item) => {
    if (item.id) {
      map.set(item.id, item.nickname || item.username || `${item.id}`);
    }
  });
  return map;
});
const logs = computed(() =>
  apiLogs.value.map((item) => ({
    actor: item.operatorUserId ? (operatorNameMap.value.get(item.operatorUserId) ?? `${item.operatorUserId}`) : '-',
    content: formatLogContent(item),
    id: item.id,
    module: '绩效考核',
    time: item.createTime || '-',
    type: item.operationType ? (operationTypeText[item.operationType] ?? item.operationType) : '-',
  })),
);
const logColumns: TableColumnsType = [
  { dataIndex: 'time', title: '操作时间', width: 190 },
  { dataIndex: 'actor', title: '操作人', width: 150 },
  { dataIndex: 'module', title: '模块', width: 140 },
  { dataIndex: 'type', title: '操作类型', width: 220 },
  { dataIndex: 'content', title: '具体内容' },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 110 },
];

const statusTags = computed(() =>
  settings.actions.statuses.map((label, index) => ({
    color: index < 2 ? (index === 0 ? 'blue' : 'processing') : 'green',
    label,
  })),
);

function normalizeUserGroup(group?: Partial<UserGroupSetting>): UserGroupSetting {
  return {
    desc: group?.desc?.trim() ?? '',
    memberIds: Array.isArray(group?.memberIds) ? group.memberIds.filter((id) => Number.isFinite(Number(id))) : [],
    name: group?.name?.trim() ?? '',
    type: group?.type === 'dynamic' ? 'dynamic' : 'static',
  };
}

function buildUserGroupRow(group: UserGroupSetting, index?: number, system = false): UserGroupRow {
  const normalized = normalizeUserGroup(group);
  return {
    ...normalized,
    group: normalized,
    index,
    members: system ? '所有可使用人员' : resolveUserGroupMemberNames(normalized),
    system,
    typeText: normalized.type === 'dynamic' ? '动态用户组' : '静态用户组',
  };
}

function resolveUserGroupMemberRows(group?: UserGroupSetting): EmployeeRow[] {
  const ids = group?.memberIds ?? [];
  return ids.map((id) => employeeById.value.get(id)).filter(Boolean) as EmployeeRow[];
}

function resolveUserGroupMemberNames(group?: UserGroupSetting) {
  const rows = resolveUserGroupMemberRows(group);
  if (rows.length === 0) {
    return '暂无成员';
  }
  const names = rows.map((item) => item.name);
  return names.length > 4 ? `${names.slice(0, 4).join('、')} 等${names.length}人` : names.join('、');
}

function resetUserGroupEditor(group?: UserGroupSetting) {
  const normalized = normalizeUserGroup(group);
  userGroupEditor.name = normalized.name;
  userGroupEditor.type = normalized.type;
  userGroupEditor.memberIds = [...normalized.memberIds];
  userGroupEditor.desc = normalized.desc;
}

function openUserGroupModal(index?: number) {
  editingUserGroupIndex.value = index;
  resetUserGroupEditor(typeof index === 'number' ? settings.userGroups.groups[index] : undefined);
  userGroupModalOpen.value = true;
}

function saveUserGroup() {
  const payload = normalizeUserGroup(userGroupEditor);
  if (!payload.name) {
    message.warning('请输入用户组名称');
    return;
  }
  const duplicated = settings.userGroups.groups.some(
    (group, index) => group.name === payload.name && index !== editingUserGroupIndex.value,
  );
  if (duplicated || payload.name === allUsersGroup.value.name) {
    message.warning('用户组名称不能重复');
    return;
  }
  if (typeof editingUserGroupIndex.value === 'number') {
    settings.userGroups.groups.splice(editingUserGroupIndex.value, 1, payload);
  } else {
    settings.userGroups.groups.push(payload);
  }
  userGroupModalOpen.value = false;
  message.success('用户组已更新，保存设置后生效');
}

function removeUserGroup(index?: number) {
  if (typeof index !== 'number') {
    return;
  }
  settings.userGroups.groups.splice(index, 1);
  message.success('用户组已移除，保存设置后生效');
}

function openUserGroupPreview(group: UserGroupSetting) {
  previewUserGroup.value = normalizeUserGroup(group);
  userGroupPreviewOpen.value = true;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function resolveImportedMemberIds(value = '') {
  const names = value
    .split(/[|、，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const employees = formalEmployeeRows.value;
  return names
    .map((name) => employees.find((item) => item.name === name || item.name.includes(name) || name.includes(item.name))?.id)
    .filter(Boolean) as number[];
}

function importUserGroups(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const imported = lines
      .filter((line, index) => !(index === 0 && line.includes('用户组')))
      .map((line) => {
        const [name, members = '', desc = ''] = parseCsvLine(line);
        return normalizeUserGroup({
          desc,
          memberIds: resolveImportedMemberIds(members),
          name,
          type: 'static',
        });
      })
      .filter((group) => group.name);
    if (imported.length === 0) {
      message.warning('未识别到可导入的用户组');
      input.value = '';
      return;
    }
    const exists = new Set([allUsersGroup.value.name, ...settings.userGroups.groups.map((group) => group.name)]);
    imported.forEach((group) => {
      if (!exists.has(group.name)) {
        settings.userGroups.groups.push(group);
        exists.add(group.name);
      }
    });
    message.success(`已导入 ${imported.length} 个用户组，保存设置后生效`);
    input.value = '';
  };
  reader.onerror = () => {
    message.error('用户组文件读取失败');
    input.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const content = rows.map((row) => row.map(toCsvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadAvailableUsers() {
  downloadCsv('智能绩效可使用人员.csv', [
    ['姓名', '部门', '角色', '岗位'],
    ...formalEmployeeRows.value.map((item) => [item.name, item.dept, item.role, item.post]),
  ]);
}

function openSystemUserManagement() {
  router.push('/system/user');
}

function resetFieldEditor(field?: FieldSetting) {
  fieldEditor.field = field?.field ?? '';
  fieldEditor.type = field?.type ?? '文本类型';
  fieldEditor.enabled = field?.enabled ?? true;
}

function openFieldModal(index?: number) {
  editingFieldIndex.value = index;
  resetFieldEditor(typeof index === 'number' ? settings.performance.fieldSettings[index] : undefined);
  fieldModalOpen.value = true;
}

function saveField() {
  const fieldName = fieldEditor.field.trim();
  if (!fieldName) {
    message.warning('请输入字段名称');
    return;
  }
  const duplicated = settings.performance.fieldSettings.some(
    (item, index) => item.field === fieldName && index !== editingFieldIndex.value,
  );
  if (duplicated) {
    message.warning('字段名称不能重复');
    return;
  }
  const payload: FieldSetting = {
    enabled: fieldEditor.enabled,
    field: fieldName,
    type: fieldEditor.type,
  };
  if (typeof editingFieldIndex.value === 'number') {
    settings.performance.fieldSettings.splice(editingFieldIndex.value, 1, payload);
  } else {
    settings.performance.fieldSettings.push(payload);
  }
  fieldModalOpen.value = false;
  message.success('字段设置已更新，保存设置后生效');
}

function toggleField(index: number) {
  const field = settings.performance.fieldSettings[index];
  if (!field) {
    return;
  }
  field.enabled = !field.enabled;
}

function removeField(index: number) {
  settings.performance.fieldSettings.splice(index, 1);
  message.success('字段已删除，保存设置后生效');
}

function addExcludedUser() {
  if (!excludedUserId.value) {
    message.warning('请选择无需考核人员');
    return;
  }
  if (!settings.performance.excludedUserIds.includes(excludedUserId.value)) {
    settings.performance.excludedUserIds.push(excludedUserId.value);
  }
  excludedUserId.value = undefined;
}

function removeExcludedUser(id: number) {
  settings.performance.excludedUserIds = settings.performance.excludedUserIds.filter((item) => item !== id);
}

async function copyText(value: string, label: string) {
  if (!value) {
    message.warning(`${label}为空`);
    return;
  }
  await navigator.clipboard.writeText(value);
  message.success(`${label}已复制`);
}

function moveMenuItem(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= settings.menu.items.length) {
    return;
  }
  const items = settings.menu.items;
  const currentItem = items[index];
  const targetItem = items[target];
  if (!currentItem || !targetItem) {
    return;
  }
  items[index] = targetItem;
  items[target] = currentItem;
}

function openLogDetail(logId: number) {
  selectedLog.value = apiLogs.value.find((item) => item.id === logId);
  logDetailOpen.value = true;
}

function formatLogContent(item: FdmPerformanceAssessmentApi.ChangeLog) {
  if (item.reason) {
    return item.reason;
  }
  if (item.afterJson) {
    try {
      const parsed = JSON.parse(item.afterJson) as Record<string, unknown>;
      const message = parsed.message || parsed.reason || parsed.conclusion;
      if (message) {
        return String(message);
      }
    } catch {
      return item.afterJson;
    }
  }
  return `${item.targetTable || '-'} #${item.targetId || '-'}`;
}

function parseSettingValue(row: FdmPerformanceSettingApi.Setting) {
  const key = row.settingKey as keyof SettingsState;
  if (!Object.prototype.hasOwnProperty.call(settings, key) || !row.settingValue) {
    return;
  }
  try {
    Object.assign(settings[key], JSON.parse(row.settingValue));
  } catch {
    // 配置值异常时保留前端默认值，避免设置页不可进入。
  }
}

function toSaveReqList(): FdmPerformanceSettingApi.SettingSaveReq[] {
  return (Object.keys(settingMeta) as Array<keyof SettingsState>).map((key) => ({
    settingKey: key,
    settingName: settingMeta[key].name,
    settingValue: JSON.stringify(settings[key]),
    sort: settingMeta[key].sort,
    remark: settingMeta[key].remark,
  }));
}

async function loadSettings() {
  loading.value = true;
  try {
    const [users, depts, rows, batchPage, logPage] = await Promise.all([
      getSimpleUserList(),
      getSimpleDeptList(),
      getFdmPerformanceSettingList(),
      getFdmPerformanceAssessmentBatchPage({ pageNo: 1, pageSize: -1 }),
      getFdmPerformanceAssessmentChangeLogPage({ pageNo: 1, pageSize: 20 }),
    ]);
    apiUsers.value = users || [];
    apiDepts.value = depts || [];
    apiBatches.value = batchPage.list || [];
    apiLogs.value = logPage.list || [];
    (rows || []).forEach(parseSettingValue);
  } finally {
    loading.value = false;
  }
}

async function save() {
  await batchSaveFdmPerformanceSetting(toSaveReqList());
  message.success('设置已保存');
}

async function stopAssessment() {
  if (!stopEmployeeId.value) {
    message.warning('请选择需要停止考核的被考核人');
    return;
  }
  const count = await stopFdmPerformanceAssessmentInstances({
    batchId: stopBatchId.value,
    userId: stopEmployeeId.value,
  });
  if (count === 0) {
    message.info('没有可停止的考核');
    return;
  }
  message.success(`已停止 ${count} 条考核记录`);
  await loadSettings();
}

async function transferData() {
  if (!transferFrom.value || !transferTo.value) {
    message.warning('请选择原处理人和接收人');
    return;
  }
  if (transferFrom.value === transferTo.value) {
    message.warning('原处理人和接收人不能相同');
    return;
  }
  const count = await transferFdmPerformanceAssessmentTasks({
    fromUserId: transferFrom.value,
    toUserId: transferTo.value,
  });
  if (count === 0) {
    message.info('没有需要转交的数据');
    return;
  }
  message.success(`已转交 ${count} 条绩效数据`);
  await loadSettings();
}

onMounted(loadSettings);
</script>

<template>
  <PerformanceShell :description="pageTitle" title="系统设置">
    <template #actions>
      <Button type="primary" @click="save">保存设置</Button>
    </template>

    <div class="settings-layout">
      <aside class="settings-menu">
        <section v-for="group in settingGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <button
            v-for="item in group.items"
            :key="item.key"
            :class="{ active: activeKey === item.key }"
            type="button"
            @click="activeKey = item.key"
          >
            {{ item.label }}
          </button>
        </section>
      </aside>

      <Card class="settings-content" :loading="loading" :title="pageTitle">
        <template v-if="activeKey === 'available'">
          <div class="toolbar-row">
            <Input v-model:value="keyword" allow-clear placeholder="搜索人员" />
            <Space>
              <Button type="link" @click="downloadAvailableUsers">下载名单</Button>
              <Button type="primary" @click="openSystemUserManagement">人员管理</Button>
            </Space>
          </div>
          <Table :columns="employeeColumns" :data-source="employeeRows" :pagination="{ pageSize: 10 }" row-key="id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'name'">
                <Space>
                  <span class="avatar">{{ record.name.slice(0, 1) }}</span>
                  {{ record.name }}
                </Space>
              </template>
              <template v-else-if="column.dataIndex === 'role'">
                <Tag>{{ record.role }}</Tag>
              </template>
            </template>
          </Table>
        </template>

        <template v-else-if="activeKey === 'userGroups'">
          <div class="toolbar-row">
            <Input v-model:value="userGroupKeyword" allow-clear placeholder="搜索用户组" />
            <Space>
              <input
                ref="userGroupImportRef"
                accept=".csv,.txt"
                class="hidden-file-input"
                type="file"
                @change="importUserGroups"
              />
              <Button @click="userGroupImportRef?.click()">导入</Button>
              <Button type="primary" @click="openUserGroupModal()">添加</Button>
            </Space>
          </div>
          <Table :columns="userGroupColumns" :data-source="userGroupRows" :pagination="false" row-key="name">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'action'">
                <Space>
                  <Button :disabled="record.system" size="small" type="link" @click="openUserGroupModal(record.index)">
                    编辑
                  </Button>
                  <Button size="small" type="link" @click="openUserGroupPreview(record.group)">预览成员</Button>
                  <Popconfirm
                    v-if="!record.system"
                    title="确定移除该用户组？"
                    @confirm="removeUserGroup(record.index)"
                  >
                    <Button danger size="small" type="link">移除</Button>
                  </Popconfirm>
                  <Button v-else danger disabled size="small" type="link">移除</Button>
                </Space>
              </template>
            </template>
          </Table>
        </template>

        <template v-else-if="activeKey === 'relation'">
          <section class="form-section">
            <h3>主管查询设置</h3>
            <Checkbox v-model:checked="settings.relation.useDirectSupervisor">
              使用钉钉通讯录员工信息的「直属主管」
            </Checkbox>
            <Checkbox v-model:checked="settings.relation.useMainDeptSupervisor">使用主部门的主管</Checkbox>
            <Checkbox v-model:checked="settings.relation.useDeptSupervisor">使用钉钉通讯录部门的「部门主管」</Checkbox>
          </section>
          <section class="form-section">
            <h3>角色查询设置</h3>
            <p>当被考核人在通讯录中属于多个部门时，如何匹配指定角色中的人员</p>
            <Radio.Group v-model:value="settings.relation.roleMatchMode">
              <Radio value="all">所有部门</Radio>
              <Radio value="main">仅主部门</Radio>
            </Radio.Group>
          </section>
          <section class="form-section">
            <h3>部门设置</h3>
            <p>当员工在通讯录中属于多个部门时，如何读取「部门」数据</p>
            <Radio.Group v-model:value="settings.relation.departmentReadMode">
              <Radio value="main">优先主部门</Radio>
              <Radio value="all">全部所在部门</Radio>
            </Radio.Group>
          </section>
          <section class="form-section">
            <h3>入转调离</h3>
            <Checkbox v-model:checked="settings.relation.onboardReminder">入职提醒</Checkbox>
            <Checkbox v-model:checked="settings.relation.resignedReminder">离职提醒</Checkbox>
          </section>
        </template>

        <template v-else-if="activeKey === 'performance'">
          <Tabs v-model:active-key="performanceTab">
            <Tabs.TabPane key="score" tab="评分设置">
              <section class="form-section">
                <h3>默认评分规则设置</h3>
                <Radio.Group v-model:value="settings.performance.scoreRule">
                  <Space direction="vertical">
                    <Radio value="mixed">合并计算量化和行为价值观</Radio>
                    <Radio value="split">分开计算量化和行为价值观</Radio>
                    <Radio value="multiply">分开计算量化和行为价值观，结果相乘</Radio>
                  </Space>
                </Radio.Group>
              </section>
              <section class="form-section">
                <h3>评分方式</h3>
                <p>量化类型 / 行为价值观：输入框手动输入</p>
              </section>
            </Tabs.TabPane>
            <Tabs.TabPane key="grade" tab="绩效结果和等级">
              <Checkbox v-model:checked="settings.performance.defaultGradeEnabled">开启默认绩效等级</Checkbox>
              <Table :columns="gradeColumns" :data-source="gradeRows" :pagination="false" row-key="name" />
              <Divider />
              <div class="check-list">
                <Checkbox v-model:checked="settings.performance.showTotalScore">考核总分</Checkbox>
                <Checkbox v-model:checked="settings.performance.showGrade">绩效等级</Checkbox>
                <Checkbox v-model:checked="settings.performance.showCoefficient">绩效系数</Checkbox>
                <Checkbox v-model:checked="settings.performance.syncResultToProfile">同步考核结果到员工档案</Checkbox>
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane key="fields" tab="字段设置">
              <div class="toolbar-row">
                <span class="muted">控制考评表指标字段的默认展示和启停状态。</span>
                <Button type="primary" @click="openFieldModal()">添加字段</Button>
              </div>
              <Table :columns="fieldColumns" :data-source="fieldRows" :pagination="false" row-key="field">
                <template #bodyCell="{ column, index, record }">
                  <template v-if="column.dataIndex === 'enabled'">
                    <Tag :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '启用中' : '停用' }}</Tag>
                  </template>
                  <template v-else-if="column.dataIndex === 'action'">
                    <Space>
                      <Button size="small" type="link" @click="openFieldModal(index)">编辑</Button>
                      <Button size="small" type="link" @click="toggleField(index)">{{ record.enabled ? '停用' : '启用' }}</Button>
                      <Popconfirm title="确认删除该字段？" @confirm="removeField(index)">
                        <Button danger size="small" type="link">删除</Button>
                      </Popconfirm>
                    </Space>
                  </template>
                </template>
              </Table>
            </Tabs.TabPane>
            <Tabs.TabPane key="defaults" tab="默认值设置">
              <div class="check-list">
                <Checkbox v-model:checked="settings.performance.defaultDimensionWeight">默认开启维度权重参与计算</Checkbox>
                <Checkbox v-model:checked="settings.performance.defaultResultInput">新增指标时，默认开启结果值录入</Checkbox>
                <Checkbox v-model:checked="settings.performance.allowCalibrationViewer">
                  设置校准流程时，默认开启允许等级校准人查看详情
                </Checkbox>
                <Checkbox v-model:checked="settings.performance.reuseLastSignature">签字默认复用上一次签名</Checkbox>
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane key="resigned" tab="离职人员设置">
              <Checkbox v-model:checked="settings.performance.autoRemoveResigned">
                离职人员自动从考评表被考核人员中移除
              </Checkbox>
              <p class="muted">仅对考评表中的被考核人员生效；发起中的考核不自动变更执行人。</p>
            </Tabs.TabPane>
            <Tabs.TabPane key="excluded" tab="无需考核人员">
              <div class="toolbar-row">
                <Select
                  v-model:value="excludedUserId"
                  allow-clear
                  show-search
                  :filter-option="false"
                  :options="excludedUserOptions"
                  placeholder="请选择无需考核人员"
                />
                <Button type="primary" @click="addExcludedUser">添加</Button>
              </div>
              <Table :columns="excludedColumns" :data-source="excludedEmployeeRows" :pagination="false" row-key="id">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.dataIndex === 'action'">
                    <Button danger size="small" type="link" @click="removeExcludedUser(record.id)">移除</Button>
                  </template>
                </template>
              </Table>
            </Tabs.TabPane>
            <Tabs.TabPane key="library" tab="指标库设置">
              <Checkbox v-model:checked="settings.performance.duplicateIndicatorName">指标库重名</Checkbox>
            </Tabs.TabPane>
          </Tabs>
        </template>

        <template v-else-if="activeKey === 'actions'">
          <div class="check-list">
            <Checkbox v-model:checked="settings.actions.syncTaskTodo">同步任务到钉钉待办</Checkbox>
            <Checkbox v-model:checked="settings.actions.taskRequiredOwner">负责人必填</Checkbox>
            <Checkbox v-model:checked="settings.actions.dueRequired">截止时间必填</Checkbox>
            <Checkbox v-model:checked="settings.actions.participantEditable">任务参与人可以编辑任务</Checkbox>
            <Checkbox v-model:checked="settings.actions.stopReminderAfterCycle">周期结束后未完成的任务不再提醒</Checkbox>
            <Checkbox v-model:checked="settings.actions.subtaskEnabled">启用子任务</Checkbox>
          </div>
          <Divider />
          <div class="status-row">
            <Tag v-for="item in statusTags" :key="item.label" :color="item.color">{{ item.label }}</Tag>
          </div>
        </template>

        <template v-else-if="activeKey === 'reminders'">
          <section class="form-section">
            <h3>绩效提醒设置</h3>
            <Checkbox v-model:checked="settings.reminders.notifyHrTodo">开启待办事项提醒</Checkbox>
            <Checkbox v-model:checked="settings.reminders.resultValueUpdateReminder">结果值更新提醒</Checkbox>
            <Checkbox v-model:checked="settings.reminders.resignedMessageReminder">离职消息提醒</Checkbox>
          </section>
          <section class="form-section">
            <h3>提醒对象</h3>
            <Select
              :options="['优先最小管理员', '考评表管理员', '人事管理员'].map((value) => ({ label: value, value }))"
              v-model:value="settings.reminders.reminderTarget"
              class="select-control"
            />
          </section>
        </template>

        <template v-else-if="activeKey === 'integration'">
          <section class="form-section">
            <h3>开发者信息</h3>
            <div class="kv-list">
              <span>AppId</span><Input v-model:value="settings.integration.appId" placeholder="无" /><Button type="link" @click="copyText(settings.integration.appId, 'AppId')">复制</Button>
              <span>AppSecret</span><Input v-model:value="settings.integration.appSecret" placeholder="无" /><Button type="link" @click="copyText(settings.integration.appSecret, 'AppSecret')">复制</Button>
              <span>回调地址</span><Input ref="callbackInputRef" v-model:value="settings.integration.callbackUrl" placeholder="无" /><Button type="link" @click="callbackInputRef?.focus?.()">编辑</Button>
            </div>
            <Checkbox v-model:checked="settings.integration.dingCallbackEnabled">开启待办回调</Checkbox>
          </section>
          <section class="form-section">
            <h3>钉钉考勤数据</h3>
            <p class="muted">当前未开启考勤数据同步，无法引入考勤数据作为考核指标的结果值。</p>
            <Switch v-model:checked="settings.integration.attendanceSyncEnabled" />
          </section>
        </template>

        <template v-else-if="activeKey === 'menu'">
          <div class="menu-list">
            <div v-for="(item, index) in settings.menu.items" :key="item">
              <span>{{ item }}</span>
              <Space>
                <Button :disabled="index === 0" size="small" @click="moveMenuItem(index, -1)">上移</Button>
                <Button :disabled="index === settings.menu.items.length - 1" size="small" @click="moveMenuItem(index, 1)">下移</Button>
              </Space>
            </div>
          </div>
        </template>

        <template v-else-if="activeKey === 'logs'">
          <div class="toolbar-row">
            <Space>
              <Input value="2026-06-29 至 2026-06-29" />
              <Select value="全部" :options="['全部', '设置', '绩效考核'].map((value) => ({ label: value, value }))" />
            </Space>
          </div>
          <Table :columns="logColumns" :data-source="logs" :pagination="{ pageSize: 20 }" row-key="id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'action'">
                <Button size="small" type="link" @click="openLogDetail(record.id)">查看</Button>
              </template>
            </template>
          </Table>
        </template>

        <template v-else-if="activeKey === 'data'">
          <Tabs v-model:active-key="dataTab">
            <Tabs.TabPane key="stop" tab="停止考核">
              <div class="step-box">
                <strong>1</strong>
                <div>
                  <h3>选择需要停止考核的被考核人</h3>
                  <Select
                    v-model:value="stopEmployeeId"
                    allow-clear
                    class="select-control"
                    :options="employeeOptions"
                    placeholder="搜索执行人"
                  />
                </div>
              </div>
              <div class="step-box" :class="{ disabled: !stopEmployeeId }">
                <strong>2</strong>
                <div>
                  <h3>选择需要停止的考核</h3>
                  <Select
                    v-model:value="stopBatchId"
                    allow-clear
                    class="select-control"
                    :disabled="!stopEmployeeId"
                    :options="stopBatchOptions"
                    placeholder="选择需要停止的考核"
                  />
                </div>
              </div>
              <Button :disabled="!stopEmployeeId" type="primary" @click="stopAssessment">停止考核</Button>
            </Tabs.TabPane>
            <Tabs.TabPane key="transfer" tab="绩效数据转交">
              <div class="step-box">
                <strong>1</strong>
                <div>
                  <h3>选择原处理人</h3>
                  <Select
                    v-model:value="transferFrom"
                    allow-clear
                    class="select-control"
                    :options="employeeNameOptions"
                    placeholder="搜索原处理人"
                  />
                </div>
              </div>
              <div class="step-box">
                <strong>2</strong>
                <div>
                  <h3>选择接收人</h3>
                  <Select
                    v-model:value="transferTo"
                    allow-clear
                    class="select-control"
                    :options="employeeNameOptions"
                    placeholder="搜索接收人"
                  />
                </div>
              </div>
              <Button type="primary" @click="transferData">转交数据</Button>
            </Tabs.TabPane>
          </Tabs>
        </template>
      </Card>
    </div>

    <Modal
      v-model:open="userGroupModalOpen"
      :title="editingUserGroupIndex === undefined ? '添加用户组' : '编辑用户组'"
      @ok="saveUserGroup"
    >
      <Form layout="vertical">
        <Form.Item required label="用户组名称">
          <Input v-model:value="userGroupEditor.name" placeholder="请输入用户组名称" />
        </Form.Item>
        <Form.Item required label="用户组类型">
          <Select
            v-model:value="userGroupEditor.type"
            :options="[
              { label: '静态用户组', value: 'static' },
              { label: '动态用户组', value: 'dynamic' },
            ]"
          />
        </Form.Item>
        <Form.Item label="成员">
          <Select
            v-model:value="userGroupEditor.memberIds"
            allow-clear
            mode="multiple"
            :options="employeeOptions"
            placeholder="请选择成员"
          />
        </Form.Item>
        <Form.Item label="描述">
          <Input.TextArea v-model:value="userGroupEditor.desc" :rows="3" placeholder="请输入描述" />
        </Form.Item>
      </Form>
    </Modal>

    <Modal v-model:open="userGroupPreviewOpen" title="预览成员" :footer="null">
      <Table
        :columns="employeeColumns"
        :data-source="previewUserGroupMemberRows"
        :pagination="{ pageSize: 6 }"
        row-key="id"
        size="small"
      />
    </Modal>

    <Modal
      v-model:open="fieldModalOpen"
      :title="editingFieldIndex === undefined ? '添加字段' : '编辑字段'"
      @ok="saveField"
    >
      <Form layout="vertical">
        <Form.Item required label="字段名称">
          <Input v-model:value="fieldEditor.field" placeholder="请输入字段名称" />
        </Form.Item>
        <Form.Item required label="字段类型">
          <Select v-model:value="fieldEditor.type" :options="fieldTypeOptions" />
        </Form.Item>
        <Form.Item label="字段状态">
          <Switch v-model:checked="fieldEditor.enabled" />
        </Form.Item>
      </Form>
    </Modal>

    <Modal v-model:open="logDetailOpen" title="操作日志详情" :footer="null" width="720px">
      <div v-if="selectedLog" class="log-detail">
        <div><span>操作时间</span><strong>{{ selectedLog.createTime || '-' }}</strong></div>
        <div><span>操作类型</span><strong>{{ selectedLog.operationType || '-' }}</strong></div>
        <div><span>操作人</span><strong>{{ selectedLog.operatorUserId ? operatorNameMap.get(selectedLog.operatorUserId) || selectedLog.operatorUserId : '-' }}</strong></div>
        <div><span>对象</span><strong>{{ selectedLog.targetTable || '-' }} #{{ selectedLog.targetId || '-' }}</strong></div>
        <div class="full"><span>摘要</span><pre>{{ formatLogContent(selectedLog) }}</pre></div>
        <div v-if="selectedLog.beforeJson" class="full"><span>变更前</span><pre>{{ selectedLog.beforeJson }}</pre></div>
        <div v-if="selectedLog.afterJson" class="full"><span>变更后</span><pre>{{ selectedLog.afterJson }}</pre></div>
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}

.settings-menu {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.settings-menu h3 {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.settings-menu button {
  display: block;
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  color: #111827;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.settings-menu button.active {
  color: #1677ff;
  background: #eaf3ff;
}

.settings-content {
  min-width: 0;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.toolbar-row > :deep(.ant-input-affix-wrapper),
.toolbar-row > :deep(.ant-input) {
  max-width: 280px;
}

.hidden-file-input {
  display: none;
}

.muted {
  color: #64748b;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #fff;
  background: #1677ff;
  border-radius: 50%;
}

.form-section {
  display: grid;
  gap: 12px;
  padding: 0 0 18px;
}

.form-section + .form-section {
  padding-top: 18px;
  border-top: 1px solid #f1f5f9;
}

.form-section h3 {
  margin: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 650;
}

.form-section p {
  margin: 0;
  color: #64748b;
}

.check-list {
  display: grid;
  gap: 12px;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.select-control {
  width: 320px;
  max-width: 100%;
}

.kv-list {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 80px;
  gap: 10px;
  align-items: center;
  max-width: 560px;
}

.kv-list span {
  color: #64748b;
}

.menu-list {
  display: grid;
  gap: 8px;
  max-width: 560px;
}

.menu-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.log-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.log-detail > div {
  display: grid;
  gap: 6px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.log-detail .full {
  grid-column: 1 / -1;
}

.log-detail span {
  color: #64748b;
}

.log-detail pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
}

.step-box {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 18px;
}

.step-box > strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #fff;
  background: #1677ff;
  border-radius: 50%;
}

.step-box.disabled {
  opacity: 0.45;
}

.step-box h3 {
  margin: 0 0 10px;
  color: #111827;
  font-size: 16px;
  font-weight: 650;
}

@media (max-width: 960px) {
  .settings-layout,
  .toolbar-row,
  .kv-list {
    grid-template-columns: 1fr;
  }

  .toolbar-row {
    align-items: stretch;
  }
}
</style>
