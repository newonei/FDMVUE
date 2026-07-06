<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { AssessmentTemplate } from '../shared/model';

import type { FdmPerformanceTemplateApi } from '#/api/fdmperformance/template';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { launchFdmPerformanceAssessment } from '#/api/fdmperformance/assessment';
import {
  getFdmPerformanceTemplate,
  getFdmPerformanceTemplatePage,
} from '#/api/fdmperformance/template';

import { apiPeriodTextToType, mapApiTemplate } from '../shared/api-adapter';
import PerformanceShell from '../shared/PerformanceShell.vue';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceLaunch' });

const route = useRoute();
const router = useRouter();
const { performancePath } = usePerformancePath();

const selectedTemplateIds = ref<number[]>(
  Number(route.query.templateId) ? [Number(route.query.templateId)] : [],
);
const periodValue = ref<Dayjs>(dayjs().startOf('month'));
const apiLoading = ref(false);
const apiTemplates = ref<AssessmentTemplate[]>([]);
const apiSelectedTemplates = ref<FdmPerformanceTemplateApi.Template[]>([]);
const confirmOpen = ref(false);

const selectedTemplates = computed(() =>
  apiSelectedTemplates.value.map((item) => mapApiTemplate(item)),
);
const selectedTemplate = computed(() => selectedTemplates.value[0]);
const selectedPeriodTypes = computed(() => [
  ...new Set(
    selectedTemplates.value.map((item) => item.periodType).filter(Boolean),
  ),
]);
const hasMixedPeriodTypes = computed(
  () => selectedPeriodTypes.value.length > 1,
);
const selectedResultVisibleRules = computed(() => [
  ...new Set(
    apiSelectedTemplates.value.map((item) => item.resultVisibleRule || 1),
  ),
]);
const selectedGradeEnabledRules = computed(() => [
  ...new Set(
    apiSelectedTemplates.value.map((item) => item.gradeEnabled !== false),
  ),
]);
const selectedScoreViewRules = computed(() => [
  ...new Set(
    apiSelectedTemplates.value.map((item) => item.scoreViewPermission || 1),
  ),
]);
const templateOptions = computed(() => {
  return apiTemplates.value.map((item) => ({
    label: `${item.name} · ${item.participants.length}人 · ${item.periodType}`,
    value: item.id,
  }));
});
const participantEmployees = computed(() =>
  [...new Set(selectedTemplates.value.flatMap((item) => item.participants))]
    .map((id) => getParticipantEmployee(id))
    .filter(Boolean),
);
const apiParticipantMap = computed(() => {
  const map = new Map<number, FdmPerformanceTemplateApi.Participant>();
  apiSelectedTemplates.value.forEach((template) => {
    (template.participants || []).forEach((item) => map.set(item.userId, item));
  });
  return map;
});
const launchPreviewRows = computed(() => {
  const selectedEmployeeMap = new Map<number, string[]>();
  selectedTemplates.value.forEach((template) => {
    template.participants.forEach((employeeId) => {
      selectedEmployeeMap.set(employeeId, [
        ...(selectedEmployeeMap.get(employeeId) || []),
        template.name,
      ]);
    });
  });
  return selectedTemplates.value.map((template) => {
    const baseValidation =
      template.participants.length > 0
        ? { ok: true, reason: '' }
        : { ok: false, reason: '该考评表暂无被考核人' };
    const duplicatedEmployees = template.participants
      .filter(
        (employeeId) => (selectedEmployeeMap.get(employeeId)?.length || 0) > 1,
      )
      .map((employeeId) => getParticipantEmployee(employeeId)?.name)
      .filter(Boolean);
    const validation =
      duplicatedEmployees.length > 0
        ? {
            ok: false,
            reason: `${duplicatedEmployees.slice(0, 3).join('、')} 重复归属多张考评表`,
          }
        : baseValidation;
    return {
      employees: template.participants
        .map((id) => getParticipantEmployee(id))
        .filter(Boolean)
        .map((item) => `${item!.name}·${item!.dept}`),
      template,
      validation,
    };
  });
});
const invalidPreviewRows = computed(() =>
  launchPreviewRows.value.filter((item) => !item.validation.ok),
);
const canLaunch = computed(
  () =>
    selectedTemplates.value.length > 0 &&
    invalidPreviewRows.value.length === 0 &&
    !hasMixedPeriodTypes.value,
);

function getResultVisibleRuleText(value?: number) {
  if (value === 2) return '人事审核后手动公示';
  if (value === 3) return '仅管理员可见';
  return '评分结束后自动公示';
}

function getScoreViewPermissionText(value?: number) {
  if (value === 2) return '被考核人可见全部评分内容';
  return '被考核人仅可见自己的评分内容';
}

function getMixedText<T>(values: T[], formatter: (value: T) => string) {
  if (values.length === 0) return '-';
  return values.length === 1 ? formatter(values[0]!) : '按考评表配置';
}

function getParticipantScopeText(template: AssessmentTemplate) {
  const scope = template.participantScope;
  if (!scope) return '按人员';
  if (scope.mode === 'department')
    return `按部门：${scope.deptNames.join('、') || '未设置'}`;
  if (scope.mode === 'role')
    return `按角色：${scope.roleNames.join('、') || '未设置'}`;
  if (scope.mode === 'userGroup')
    return `按用户组：${scope.userGroupNames.join('、') || '未设置'}`;
  return '按人员';
}

function getFlowSummary(template: AssessmentTemplate) {
  const nodes: { id: string; name: string; owner: string }[] = [];
  const walk = (node?: any) => {
    if (!node) {
      return;
    }
    const name = String(node.name || '');
    if (name.length > 0 && name !== '发起人' && name !== '结束') {
      nodes.push({
        id: String(node.id ?? nodes.length),
        name,
        owner: String(node.showText || node.owner || node.assignee || '未配置'),
      });
    }
    walk(node.childNode);
  };
  walk(template.flowNode);
  return nodes;
}

async function requestLaunch() {
  if (selectedTemplates.value.length === 0) {
    message.warning('请选择考评表');
    return;
  }
  if (invalidPreviewRows.value.length > 0) {
    message.warning(invalidPreviewRows.value[0]!.validation.reason);
    return;
  }
  if (hasMixedPeriodTypes.value) {
    message.warning('一次发起的考评表周期类型必须一致');
    return;
  }
  confirmOpen.value = true;
}

async function confirmLaunch() {
  const period = periodValue.value.format('YYYY年MM月');
  if (!selectedTemplate.value) {
    message.warning('请选择考评表');
    return;
  }
  const batchId = await launchFdmPerformanceAssessment({
    name: `${period}绩效考核`,
    periodKey: periodValue.value.format('YYYY-MM'),
    periodType: apiPeriodTextToType(selectedTemplate.value!.periodType),
    templateIds: selectedTemplateIds.value,
  });
  confirmOpen.value = false;
  message.success('考核已发起');
  router.push(performancePath(`/batches/${batchId}`));
}

function removeSelectedTemplate(id: number) {
  selectedTemplateIds.value = selectedTemplateIds.value.filter(
    (item) => item !== id,
  );
}

function selectAllEnabledTemplates() {
  const ids = apiTemplates.value
    .filter((item) => item.status === 'enabled')
    .map((item) => item.id);
  selectedTemplateIds.value = ids;
}

function clearSelectedTemplates() {
  selectedTemplateIds.value = [];
}

async function launch() {
  await requestLaunch();
}

function getParticipantEmployee(id: number) {
  const item = apiParticipantMap.value.get(id);
  if (!item) return undefined;
  return {
    dept: item.deptName || '未分配部门',
    id,
    name: item.userName || `用户${id}`,
    post: item.postName || '',
  };
}

async function loadApiTemplateDetails() {
  if (selectedTemplateIds.value.length === 0) {
    apiSelectedTemplates.value = [];
    return;
  }
  apiSelectedTemplates.value = await Promise.all(
    selectedTemplateIds.value.map((id) => getFdmPerformanceTemplate(id)),
  );
}

watch(selectedTemplateIds, loadApiTemplateDetails);

async function loadApiTemplates() {
  apiLoading.value = true;
  try {
    const templates = await getFdmPerformanceTemplatePage({
      pageNo: 1,
      pageSize: 200,
      status: 1,
    });
    apiTemplates.value = (templates.list || []).map((item) =>
      mapApiTemplate(item),
    );
    const queryTemplateId = Number(route.query.templateId);
    if (queryTemplateId) {
      selectedTemplateIds.value = [queryTemplateId];
    } else if (
      selectedTemplateIds.value.length === 0 &&
      apiTemplates.value[0]
    ) {
      selectedTemplateIds.value = [apiTemplates.value[0].id];
    }
    await loadApiTemplateDetails();
  } finally {
    apiLoading.value = false;
  }
}

onMounted(loadApiTemplates);
watch(
  () => route.query.templateId,
  async (value) => {
    const templateId = Number(value);
    if (templateId) {
      selectedTemplateIds.value = [templateId];
      await loadApiTemplateDetails();
    }
  },
);
</script>

<template>
  <PerformanceShell
    description="按考评表和时间周期发起一次绩效考核，生成被考核人的个人考核实例。"
    title="发起考核"
  >
    <template #actions>
      <Button @click="clearSelectedTemplates">清空</Button>
      <Button @click="selectAllEnabledTemplates">选择全部启用表</Button>
      <Button :disabled="!canLaunch" type="primary" @click="launch">
        发起考核
      </Button>
    </template>

    <Card class="launch-card">
      <Form layout="vertical">
        <Form.Item label="时间周期" required>
          <Space>
            <Select
              :value="
                selectedTemplates.length === 1
                  ? selectedTemplate?.periodType || '月度'
                  : '按考评表周期'
              "
              disabled
              style="width: 160px"
            />
            <DatePicker
              v-model:value="periodValue"
              picker="month"
              style="width: 260px"
            />
          </Space>
        </Form.Item>
        <Form.Item label="参与考评表" required>
          <Select
            v-model:value="selectedTemplateIds"
            :loading="apiLoading"
            mode="multiple"
            :options="templateOptions"
            placeholder="请选择考评表"
          />
          <div class="hint">
            支持一次选择多张考评表；一个被考核人同一周期只能归属一张考评表，冲突会在下方预览中提示。
          </div>
        </Form.Item>
        <Alert
          v-if="invalidPreviewRows.length"
          show-icon
          type="warning"
          :message="`有 ${invalidPreviewRows.length} 张考评表暂不可发起`"
          :description="
            invalidPreviewRows
              .map((item) => `${item.template.name}：${item.validation.reason}`)
              .join('；')
          "
        />
        <Alert
          v-if="hasMixedPeriodTypes"
          show-icon
          type="warning"
          message="一次发起的考评表周期类型必须一致"
          :description="`当前已选择：${selectedPeriodTypes.join('、')}`"
        />
        <Form.Item label="发起预览">
          <div class="template-preview-list">
            <div
              v-for="row in launchPreviewRows"
              :key="row.template.id"
              class="template-preview-card"
              :class="{ invalid: !row.validation.ok }"
            >
              <div class="template-preview-head">
                <div>
                  <strong>{{ row.template.name }}</strong>
                  <span>{{ row.template.group }} · {{ row.template.periodType }} ·
                    {{ row.template.scoringRule }}</span>
                  <span>{{ getParticipantScopeText(row.template) }}</span>
                </div>
                <Space>
                  <Tag :color="row.validation.ok ? 'green' : 'orange'">
                    {{ row.validation.ok ? '可发起' : row.validation.reason }}
                  </Tag>
                  <Button
                    size="small"
                    type="link"
                    @click="removeSelectedTemplate(row.template.id)"
                  >
                    移除
                  </Button>
                </Space>
              </div>
              <div class="people-list compact">
                <Tag
                  v-for="employee in row.employees.slice(0, 10)"
                  :key="employee"
                  color="blue"
                >
                  {{ employee }}
                </Tag>
                <Tag v-if="row.employees.length > 10">
                  +{{ row.employees.length - 10 }}
                </Tag>
              </div>
              <div class="flow-summary">
                <span>流程摘要</span>
                <Tag
                  v-for="node in getFlowSummary(row.template)"
                  :key="node.id"
                  color="processing"
                >
                  {{ node.name }}：{{ node.owner }}
                </Tag>
              </div>
            </div>
          </div>
        </Form.Item>
        <Form.Item label="考核设置">
          <div class="setting-summary">
            <div><span>沟通反馈</span><strong>开启</strong></div>
            <div>
              <span>评分结果</span>
              <strong>{{
                getMixedText(
                  selectedResultVisibleRules,
                  getResultVisibleRuleText,
                )
              }}</strong>
            </div>
            <div>
              <span>等级配置</span>
              <strong>{{
                getMixedText(selectedGradeEnabledRules, (enabled) =>
                  enabled ? '启用绩效等级' : '不启用绩效等级',
                )
              }}</strong>
            </div>
            <div>
              <span>评分内容可见权限</span>
              <strong>{{
                getMixedText(selectedScoreViewRules, getScoreViewPermissionText)
              }}</strong>
            </div>
          </div>
        </Form.Item>
        <Form.Item label="预览被考核人员">
          <div class="people-list">
            <Tag
              v-for="employee in participantEmployees"
              :key="employee!.id"
              color="blue"
            >
              {{ employee!.name }} · {{ employee!.dept }}
            </Tag>
          </div>
        </Form.Item>
      </Form>
    </Card>

    <Modal
      v-model:open="confirmOpen"
      title="确认发起考核"
      width="760px"
      @ok="confirmLaunch"
    >
      <div class="confirm-summary">
        <strong>{{ periodValue.format('YYYY年MM月') }} 将发起 1 个考核批次</strong>
        <span>系统会根据每张考评表的人员范围生成个人考核实例，发起后可在“已发起考核”中推进指标确认、评分、审核、公示和结果确认。</span>
      </div>
      <div class="template-preview-list">
        <div
          v-for="row in launchPreviewRows"
          :key="row.template.id"
          class="template-preview-card"
        >
          <div class="template-preview-head">
            <div>
              <strong>{{ row.template.name }}</strong>
              <span>{{ row.employees.length }} 人 ·
                {{ row.template.periodType }}</span>
            </div>
            <Tag color="green">可发起</Tag>
          </div>
          <div class="flow-summary">
            <span>流程摘要</span>
            <Tag
              v-for="node in getFlowSummary(row.template)"
              :key="node.id"
              color="processing"
            >
              {{ node.name }}：{{ node.owner }}
            </Tag>
          </div>
        </div>
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.launch-card {
  max-width: 920px;
  margin: 0 auto;
}

.hint {
  margin-top: 8px;
  color: #94a3b8;
}

.setting-summary {
  display: grid;
  gap: 10px;
}

.setting-summary div {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 16px;
}

.setting-summary span {
  color: #64748b;
}

.people-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.people-list.compact {
  margin-top: 10px;
}

.flow-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.flow-summary span {
  color: #64748b;
}

.template-preview-list {
  display: grid;
  gap: 10px;
}

.template-preview-card {
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.template-preview-card.invalid {
  background: #fff7e6;
  border-color: #ffd591;
}

.template-preview-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
}

.template-preview-head strong,
.template-preview-head span {
  display: block;
}

.template-preview-head span,
.confirm-summary span {
  margin-top: 5px;
  color: #64748b;
}

.confirm-summary {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}
</style>
