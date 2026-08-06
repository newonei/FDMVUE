<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { DingTalkApprovalApi } from '#/api/fdmdingtalk/approval';
import type { ActionItem } from '#/components/table-action/typing';

import { computed, h, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  approveDingTalkApproval,
  getDingTalkApprovalDetail,
  getDingTalkApprovalPage,
  getDingTalkApprovalTemplates,
  getDingTalkApprovalTodoCount,
  rejectDingTalkApproval,
} from '#/api/fdmdingtalk/approval';

import AttachmentList from './attachment-list.vue';
import { useGridColumns, useGridFormSchema } from './data';

defineOptions({ name: 'FdmDingtalkApproval' });

interface SearchFormValues {
  keyword?: string;
  timeRange?: string[];
}

const SCOPE_TABS: Array<{
  key: DingTalkApprovalApi.Scope;
  label: string;
}> = [
  { key: 'TODO', label: '待我审批' },
  { key: 'DONE', label: '我已处理' },
  { key: 'STARTED', label: '我发起的' },
  { key: 'CC', label: '抄送我的' },
];

const activeScope = ref<DingTalkApprovalApi.Scope>('TODO');
const approvalTemplates = ref<DingTalkApprovalApi.Template[]>([]);
const selectedProcessCode = ref<string>();
const templateLoading = ref(false);
const templateLoaded = ref(false);
const templateLoadFailed = ref(false);
const todoCount = ref<number>();
const todoCountLoading = ref(false);
const todoCountFailed = ref(false);
const pageNotice = ref('');
const pageTruncated = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<DingTalkApprovalApi.Detail>();
const selectedApproval = ref<DingTalkApprovalApi.Approval>();
const detailRequestSequence = ref(0);
const processingIds = ref<string[]>([]);
const rejectOpen = ref(false);
const rejectRemark = ref('');
const rejectTarget = ref<DingTalkApprovalApi.Detail>();

const currentActionTarget = computed<DingTalkApprovalApi.Detail | undefined>(
  () => detail.value,
);
const selectedTemplate = computed(() =>
  approvalTemplates.value.find(
    (item) => item.processCode === selectedProcessCode.value,
  ),
);
const rejectRemarkValid = computed(() => rejectRemark.value.trim().length > 0);
const detailFormComponents = computed(() => detail.value?.formComponents ?? []);
const rejectKeyFormComponents = computed(() =>
  rejectTarget.value ? getKeyFormComponents(rejectTarget.value) : [],
);

const taskColumns = [
  { dataIndex: 'activityId', title: '节点 ID', width: 180 },
  { dataIndex: 'userId', title: '处理人 ID', width: 150 },
  { dataIndex: 'status', title: '状态', width: 110 },
  { dataIndex: 'result', title: '结果', width: 110 },
  { dataIndex: 'createTime', title: '开始时间', width: 180 },
  { dataIndex: 'finishTime', title: '完成时间', width: 180 },
];

function normalizeApprovalTemplates(templates: DingTalkApprovalApi.Template[]) {
  const uniqueTemplates = new Map<string, DingTalkApprovalApi.Template>();
  for (const template of templates) {
    const processCode = template.processCode?.trim();
    const name = template.name?.trim();
    if (!processCode || !name || uniqueTemplates.has(processCode)) continue;
    uniqueTemplates.set(processCode, { ...template, name, processCode });
  }
  return [...uniqueTemplates.values()];
}

function templateOptionLabel(template: DingTalkApprovalApi.Template) {
  const datatype =
    template.datatype == null ? '' : ` · datatype ${template.datatype}`;
  return `${template.name}${datatype}`;
}

function closeCurrentDetail() {
  detailRequestSequence.value += 1;
  detailOpen.value = false;
  detailLoading.value = false;
  detail.value = undefined;
  selectedApproval.value = undefined;
}

async function loadApprovalTemplates(reloadList = false) {
  if (templateLoading.value) return;
  const previousProcessCode = selectedProcessCode.value;
  templateLoading.value = true;
  templateLoaded.value = false;
  templateLoadFailed.value = false;
  try {
    const result = await getDingTalkApprovalTemplates();
    if (!Array.isArray(result)) throw new Error('审批模板返回格式无效');
    approvalTemplates.value = normalizeApprovalTemplates(result);
    templateLoaded.value = true;
    if (
      previousProcessCode &&
      !approvalTemplates.value.some(
        (item) => item.processCode === previousProcessCode,
      )
    ) {
      selectedProcessCode.value = undefined;
      closeCurrentDetail();
    }
  } catch {
    approvalTemplates.value = [];
    selectedProcessCode.value = undefined;
    templateLoaded.value = true;
    templateLoadFailed.value = true;
    closeCurrentDetail();
  } finally {
    templateLoading.value = false;
  }
  if (reloadList) await gridApi.query();
}

async function queryTodoCount() {
  if (todoCountLoading.value) return;
  todoCountLoading.value = true;
  todoCountFailed.value = false;
  try {
    const result = await getDingTalkApprovalTodoCount();
    todoCount.value = result.count;
  } catch {
    todoCountFailed.value = true;
  } finally {
    todoCountLoading.value = false;
  }
}

function getPageParams(
  pageNo: number,
  pageSize: number,
  processCode: string,
  values: SearchFormValues,
): DingTalkApprovalApi.PageParams {
  const [startTime, endTime] = values.timeRange ?? [];
  const parsedEndTime = toTimestamp(endTime);
  return {
    pageNo,
    pageSize,
    keyword: values.keyword?.trim() || undefined,
    processCode,
    scope: activeScope.value,
    startTime: toTimestamp(startTime),
    endTime:
      parsedEndTime === undefined
        ? undefined
        : Math.min(parsedEndTime, Date.now()),
  };
}

function getEmptyPageResult(pageNo: number, pageSize: number) {
  return {
    list: [],
    pageNo,
    pageSize,
    scope: activeScope.value,
    total: 0,
  } satisfies DingTalkApprovalApi.ApprovalPageResult;
}

function toTimestamp(value?: string) {
  if (!value) return undefined;
  const time = dayjs(value);
  return time.isValid() ? time.valueOf() : undefined;
}

function withSummaryDisplayFields(
  detailValue: DingTalkApprovalApi.Detail,
  ...sources: Array<DingTalkApprovalApi.Approval | undefined>
) {
  return {
    ...detailValue,
    processCode:
      detailValue.processCode ||
      sources.find((source) => source?.processCode)?.processCode,
    templateName:
      detailValue.templateName ||
      sources.find((source) => source?.templateName)?.templateName,
  };
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const processCode = selectedProcessCode.value;
          if (!processCode) {
            pageNotice.value = '';
            pageTruncated.value = false;
            return getEmptyPageResult(page.currentPage, page.pageSize);
          }
          const result = await getDingTalkApprovalPage(
            getPageParams(
              page.currentPage,
              page.pageSize,
              processCode,
              formValues as SearchFormValues,
            ),
          );
          pageNotice.value = result.queryNotice || '';
          pageTruncated.value = result.truncated === true;
          return result;
        },
      },
    },
    rowConfig: {
      keyField: 'processInstanceId',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<DingTalkApprovalApi.Approval>,
});

onMounted(() => {
  void loadApprovalTemplates();
});

function isProcessing(processInstanceId?: string) {
  return Boolean(
    processInstanceId && processingIds.value.includes(processInstanceId),
  );
}

function setProcessing(processInstanceId: string, processing: boolean) {
  processingIds.value = processing
    ? [...new Set([...processingIds.value, processInstanceId])]
    : processingIds.value.filter((item) => item !== processInstanceId);
}

function hasActionableTask(approval?: DingTalkApprovalApi.Approval) {
  return approval?.canAction === true;
}

function isCurrentLoadedDetail(approval: DingTalkApprovalApi.Detail) {
  return (
    detailOpen.value &&
    !detailLoading.value &&
    detail.value === approval &&
    selectedApproval.value?.processInstanceId === approval.processInstanceId &&
    approval.canAction === true
  );
}

function scopeChanged(scope: number | string) {
  activeScope.value = scope as DingTalkApprovalApi.Scope;
  void gridApi.query();
}

function templateChanged(value: unknown) {
  selectedProcessCode.value = typeof value === 'string' ? value : undefined;
  pageNotice.value = '';
  pageTruncated.value = false;
  closeCurrentDetail();
  void gridApi.query();
}

async function openDetail(row: DingTalkApprovalApi.Approval) {
  const requestSequence = ++detailRequestSequence.value;
  selectedApproval.value = row;
  detail.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const loadedDetail = await getDingTalkApprovalDetail(row.processInstanceId);
    if (
      requestSequence !== detailRequestSequence.value ||
      selectedApproval.value?.processInstanceId !== row.processInstanceId ||
      !detailOpen.value
    ) {
      return;
    }
    detail.value = withSummaryDisplayFields(loadedDetail, row);
  } catch {
    if (
      requestSequence === detailRequestSequence.value &&
      selectedApproval.value?.processInstanceId === row.processInstanceId &&
      detailOpen.value
    ) {
      detailOpen.value = false;
    }
  } finally {
    if (requestSequence === detailRequestSequence.value) {
      detailLoading.value = false;
    }
  }
}

async function refreshAfterAction(processInstanceId: string) {
  try {
    await gridApi.query();
  } catch {
    message.warning('审批已成功，列表刷新失败，请手动刷新');
  }
  if (
    detailOpen.value &&
    detail.value?.processInstanceId === processInstanceId
  ) {
    const requestSequence = ++detailRequestSequence.value;
    const currentDetail = detail.value;
    const currentSummary = selectedApproval.value;
    try {
      const latestDetail = await getDingTalkApprovalDetail(processInstanceId);
      if (
        requestSequence !== detailRequestSequence.value ||
        selectedApproval.value?.processInstanceId !== processInstanceId ||
        !detailOpen.value
      ) {
        return;
      }
      detail.value = {
        ...withSummaryDisplayFields(
          latestDetail,
          currentDetail,
          currentSummary,
        ),
        canAction: false,
      };
    } catch {
      // 动作已成功时保留已失效的本地详情，避免刷新失败后按钮恢复。
    }
  }
}

function invalidateAction(processInstanceId: string) {
  if (detail.value?.processInstanceId === processInstanceId) {
    detail.value = { ...detail.value, canAction: false };
  }
  if (selectedApproval.value?.processInstanceId === processInstanceId) {
    selectedApproval.value = { ...selectedApproval.value, canAction: false };
  }
}

async function submitApprove(row: DingTalkApprovalApi.Detail) {
  const { processInstanceId } = row;
  if (isProcessing(processInstanceId)) return;
  if (!isCurrentLoadedDetail(row)) {
    message.warning('审批详情已变化，请重新打开详情后再操作');
    return;
  }
  setProcessing(processInstanceId, true);
  try {
    const result = await approveDingTalkApproval(processInstanceId);
    if (!result.success) throw new Error('钉钉未确认审批操作成功');
    invalidateAction(processInstanceId);
    message.success('审批单已同意');
    await refreshAfterAction(processInstanceId);
  } finally {
    setProcessing(processInstanceId, false);
  }
}

function approvalSummary(row: DingTalkApprovalApi.Detail) {
  const keyFields = getKeyFormComponents(row);
  const summary = [
    h(
      'p',
      { class: 'approval-confirm__title' },
      row.title || row.templateName || '未命名审批单',
    ),
    h('p', {}, `审批流程：${row.templateName || '-'}`),
    h('p', {}, `发起人：${originatorText(row)}`),
    h(
      'p',
      { class: 'approval-confirm__id' },
      `审批实例 ID：${row.processInstanceId}`,
    ),
    h(
      'p',
      { class: 'approval-confirm__warning' },
      '确认后将直接提交到钉钉，审批流程会继续流转。',
    ),
  ];
  if (keyFields.length > 0) {
    summary.push(
      h('p', { class: 'approval-confirm__section-title' }, '关键表单字段'),
      ...keyFields.map((field, index) =>
        h(
          'p',
          { class: 'approval-confirm__field' },
          `${formFieldLabel(field, index)}：${compactFormDisplayValue(field)}`,
        ),
      ),
    );
  }
  summary.push(
    h(
      'p',
      { class: 'approval-confirm__hint' },
      row.formComponents?.length
        ? '其余表单字段已在详情抽屉展示，请确认无误后再提交。'
        : '该审批单没有可展示的表单字段，请结合详情抽屉中的审批记录确认。',
    ),
  );
  return summary;
}

function requestApprove(row: DingTalkApprovalApi.Detail) {
  if (!isCurrentLoadedDetail(row) || isProcessing(row.processInstanceId)) {
    message.warning('请先打开并确认最新审批详情');
    return;
  }
  Modal.confirm({
    title: '确认同意此审批单？',
    content: h('div', { class: 'approval-confirm' }, approvalSummary(row)),
    okText: '确认同意',
    cancelText: '取消',
    centered: true,
    async onOk() {
      await submitApprove(row);
    },
  });
}

function requestReject(row: DingTalkApprovalApi.Detail) {
  if (!isCurrentLoadedDetail(row) || isProcessing(row.processInstanceId)) {
    message.warning('请先打开并确认最新审批详情');
    return;
  }
  rejectTarget.value = row;
  rejectRemark.value = '';
  rejectOpen.value = true;
}

function closeRejectModal() {
  if (isProcessing(rejectTarget.value?.processInstanceId)) return;
  rejectOpen.value = false;
  rejectTarget.value = undefined;
  rejectRemark.value = '';
}

async function confirmReject() {
  const row = rejectTarget.value;
  const remark = rejectRemark.value.trim();
  if (!row || isProcessing(row.processInstanceId)) return;
  if (!isCurrentLoadedDetail(row)) {
    message.warning('审批详情已变化，请重新打开详情后再操作');
    return;
  }
  if (!remark) {
    message.warning('请输入拒绝原因');
    return;
  }

  setProcessing(row.processInstanceId, true);
  try {
    const result = await rejectDingTalkApproval(row.processInstanceId, {
      remark,
    });
    if (!result.success) throw new Error('钉钉未确认审批操作成功');
    invalidateAction(row.processInstanceId);
    message.success('审批单已拒绝');
    rejectOpen.value = false;
    rejectTarget.value = undefined;
    rejectRemark.value = '';
    await refreshAfterAction(row.processInstanceId);
  } finally {
    setProcessing(row.processInstanceId, false);
  }
}

function getRowActions(row: DingTalkApprovalApi.Approval): ActionItem[] {
  const processing = isProcessing(row.processInstanceId);
  return [
    {
      label: '查看',
      type: 'link',
      icon: ACTION_ICON.VIEW,
      auth: ['fdmdingtalk:approval:query'],
      disabled: processing,
      onClick: () => openDetail(row),
    },
  ];
}

function originatorText(row?: DingTalkApprovalApi.Approval) {
  if (!row) return '-';
  return (
    [row.originatorUserId, row.originatorDeptName]
      .filter(Boolean)
      .join(' · ') || '-'
  );
}

function formatTime(value?: number | string) {
  return value === undefined || value === null || value === ''
    ? '-'
    : formatDateTime(value) || '-';
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formDisplayValue(field: DingTalkApprovalApi.FormComponent) {
  const value = field.value;
  const hasValue =
    typeof value === 'string'
      ? value.trim().length > 0
      : value !== undefined && value !== null;
  return displayValue(hasValue ? value : field.extValue);
}

function compactFormDisplayValue(field: DingTalkApprovalApi.FormComponent) {
  if (isAttachmentFormField(field)) {
    return field.attachments?.length
      ? `共 ${field.attachments.length} 个附件`
      : '暂无附件';
  }
  const text = formDisplayValue(field);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function isAttachmentFormField(field: DingTalkApprovalApi.FormComponent) {
  return (
    !!field.attachments?.length ||
    /attachment/i.test(field.componentType?.trim() || '')
  );
}

function getKeyFormComponents(detailValue: DingTalkApprovalApi.Detail) {
  const priorityPattern =
    /金额|收款|账户|账号|银行|付款|费用|报销|事由|用途|姓名|供应商|amount|bank|account|payee|payment/i;
  return [...(detailValue.formComponents ?? [])]
    .map((field, index) => ({
      field,
      index,
      priority: priorityPattern.test(
        `${field.name || ''} ${field.bizAlias || ''}`,
      )
        ? 1
        : 0,
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .slice(0, 5)
    .map(({ field }) => field);
}

function formFieldLabel(
  field: DingTalkApprovalApi.FormComponent,
  index: number,
) {
  return field.name || field.id || `字段 ${index + 1}`;
}

function operationName(record: DingTalkApprovalApi.OperationRecord) {
  return record.showName || record.userId || '系统';
}

function operationAction(record: DingTalkApprovalApi.OperationRecord) {
  return record.type || record.result || record.activityId || '处理审批';
}

function operationTime(record: DingTalkApprovalApi.OperationRecord) {
  return formatTime(record.date);
}

function statusMeta(value?: string) {
  const normalized = value?.trim().toUpperCase() || '';
  const meta: Record<string, { color: string; label: string }> = {
    CANCELED: { color: 'default', label: '已撤销' },
    CANCELLED: { color: 'default', label: '已撤销' },
    COMPLETED: { color: 'success', label: '已完成' },
    PROCESSING: { color: 'processing', label: '审批中' },
    RUNNING: { color: 'processing', label: '审批中' },
    TERMINATED: { color: 'error', label: '已终止' },
  };
  return meta[normalized] ?? { color: 'default', label: value || '未知' };
}

function resultMeta(value?: string) {
  const normalized = value?.trim().toUpperCase() || '';
  const meta: Record<string, { color: string; label: string }> = {
    AGREE: { color: 'success', label: '已同意' },
    APPROVED: { color: 'success', label: '已同意' },
    NONE: { color: 'default', label: '无结果' },
    PROCESSING: { color: 'processing', label: '处理中' },
    REFUSE: { color: 'error', label: '已拒绝' },
    REJECTED: { color: 'error', label: '已拒绝' },
  };
  return meta[normalized] ?? { color: 'default', label: value || '无结果' };
}
</script>

<template>
  <Page auto-content-height title="钉钉审批单">
    <Alert class="mb-3" show-icon type="info">
      <template #message>当前登录用户的钉钉审批单</template>
      <template #description>
        标准 OpenAPI 默认聚合最近 30
        天，列表按当前选择的审批模板查询，受实例扫描上限影响，不等同于钉钉审批中心全历史。审批动作会直接同步到钉钉；同意前需二次确认，拒绝时必须填写原因。
      </template>
    </Alert>

    <Card class="template-picker-card" size="small">
      <div class="template-picker-content">
        <div class="template-picker-heading">
          <Typography.Text strong>钉钉审批模板</Typography.Text>
          <Typography.Text type="secondary">
            请先选择模板，下方列表只查询该模板的审批单
          </Typography.Text>
        </div>
        <Space class="template-picker-actions" wrap>
          <Select
            v-model:value="selectedProcessCode"
            allow-clear
            :disabled="
              templateLoading ||
              templateLoadFailed ||
              approvalTemplates.length === 0
            "
            :filter-option="
              (input, option) =>
                String(option?.label || '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
            "
            :loading="templateLoading"
            option-label-prop="label"
            placeholder="请选择钉钉审批模板"
            show-search
            @change="templateChanged"
          >
            <Select.Option
              v-for="template in approvalTemplates"
              :key="template.processCode"
              :label="templateOptionLabel(template)"
              :value="template.processCode"
            >
              <div class="template-option">
                <span class="template-option-name">{{ template.name }}</span>
                <Tag v-if="template.datatype != null" color="blue">
                  datatype {{ template.datatype }}
                </Tag>
                <Typography.Text class="template-option-code" type="secondary">
                  {{ template.processCode }}
                </Typography.Text>
              </div>
            </Select.Option>
          </Select>
          <Button
            v-access:code="['fdmdingtalk:approval:query']"
            :loading="templateLoading"
            @click="loadApprovalTemplates(true)"
          >
            刷新模板
          </Button>
        </Space>
      </div>

      <Alert
        v-if="templateLoadFailed"
        class="template-status"
        description="模板接口加载失败，审批列表查询已禁用。请检查后端服务或钉钉应用配置后重试。"
        message="无法加载钉钉审批模板"
        show-icon
        type="error"
      />
      <Alert
        v-else-if="templateLoaded && approvalTemplates.length === 0"
        class="template-status"
        description="当前企业没有可查询的审批模板，请检查金智 CRM 审批模板配置或点击“刷新模板”。"
        message="暂无钉钉审批模板"
        show-icon
        type="warning"
      />
      <Alert
        v-else-if="templateLoaded && !selectedTemplate"
        class="template-status"
        description="选择模板后才会调用审批实例列表接口；搜索和分页请求都会携带该模板的 processCode。"
        message="请先选择审批模板"
        show-icon
        type="info"
      />
      <div v-else-if="selectedTemplate" class="selected-template-summary">
        <span>当前模板：</span>
        <strong>{{ selectedTemplate.name }}</strong>
        <Tag v-if="selectedTemplate.datatype != null" color="blue">
          datatype {{ selectedTemplate.datatype }}
        </Tag>
        <Typography.Text code copyable>
          {{ selectedTemplate.processCode }}
        </Typography.Text>
      </div>
    </Card>

    <Card class="todo-count-card" size="small">
      <div class="todo-count-content">
        <div>
          <Typography.Text type="secondary">
            当前用户全部模板待审批数量
          </Typography.Text>
          <div class="todo-count-value">
            <strong>{{ todoCount ?? '-' }}</strong>
            <span v-if="todoCount !== undefined">个审批单</span>
          </div>
        </div>
        <div class="todo-count-action">
          <Button
            v-access:code="['fdmdingtalk:approval:query']"
            :loading="todoCountLoading"
            type="primary"
            @click="queryTodoCount"
          >
            {{ todoCount === undefined ? '获取待审批数量' : '重新获取' }}
          </Button>
          <Typography.Text v-if="todoCountFailed" type="danger">
            获取失败，请重试
          </Typography.Text>
          <Typography.Text v-else type="secondary">
            统计当前登录用户在全部审批模板中的待审批任务，不受下方模板选择影响
          </Typography.Text>
        </div>
      </div>
    </Card>

    <Alert
      v-if="pageNotice || pageTruncated"
      class="mb-3"
      :description="
        pageNotice || '本次结果已达到扫描上限，请缩小时间范围后重试。'
      "
      :message="pageTruncated ? '查询结果可能不完整' : '查询说明'"
      show-icon
      type="warning"
    />

    <Tabs
      :active-key="activeScope"
      :items="SCOPE_TABS"
      class="approval-tabs"
      @change="scopeChanged"
    />

    <Grid
      :table-title="`${
        SCOPE_TABS.find((item) => item.key === activeScope)?.label
      } · ${selectedTemplate?.name || '请先选择模板'}`"
    >
      <template #approval-title="{ row }">
        <button
          class="approval-title-link"
          type="button"
          @click="openDetail(row)"
        >
          {{ row.title || row.templateName || '未命名审批单' }}
        </button>
        <div v-if="row.currentTaskId" class="approval-subtitle">
          任务 ID：{{ row.currentTaskId }}
        </div>
      </template>

      <template #originator="{ row }">
        <div>{{ row.originatorUserId || '-' }}</div>
        <div v-if="row.originatorDeptName" class="approval-subtitle">
          {{ row.originatorDeptName }}
        </div>
      </template>

      <template #approval-status="{ row }">
        <Space wrap :size="4">
          <Tag :color="statusMeta(row.status).color">
            {{ statusMeta(row.status).label }}
          </Tag>
          <Tag v-if="row.result" :color="resultMeta(row.result).color">
            {{ resultMeta(row.result).label }}
          </Tag>
        </Space>
      </template>

      <template #actions="{ row }">
        <TableAction :actions="getRowActions(row)" />
      </template>
    </Grid>

    <Drawer
      v-model:open="detailOpen"
      :title="detail?.title || selectedApproval?.title || '审批单详情'"
      :width="860"
      destroy-on-close
    >
      <template #extra>
        <Space v-if="hasActionableTask(currentActionTarget)">
          <Button
            v-access:code="['fdmdingtalk:approval:approve']"
            :disabled="isProcessing(currentActionTarget?.processInstanceId)"
            :loading="isProcessing(currentActionTarget?.processInstanceId)"
            type="primary"
            @click="currentActionTarget && requestApprove(currentActionTarget)"
          >
            同意
          </Button>
          <Button
            v-access:code="['fdmdingtalk:approval:reject']"
            :disabled="isProcessing(currentActionTarget?.processInstanceId)"
            danger
            @click="currentActionTarget && requestReject(currentActionTarget)"
          >
            拒绝
          </Button>
        </Space>
      </template>

      <div v-if="detailLoading" class="detail-loading">
        <Spin tip="正在读取审批详情…" />
      </div>
      <template v-else-if="detail">
        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="审批标题" :span="2">
            {{ detail.title || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="审批流程">
            {{ detail.templateName || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="发起人">
            {{ originatorText(detail) }}
          </Descriptions.Item>
          <Descriptions.Item label="审批状态">
            <Space wrap :size="4">
              <Tag :color="statusMeta(detail.status).color">
                {{ statusMeta(detail.status).label }}
              </Tag>
              <Tag
                v-if="detail.result"
                :color="resultMeta(detail.result).color"
              >
                {{ resultMeta(detail.result).label }}
              </Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="是否可处理">
            <Tag :color="detail.canAction ? 'processing' : 'default'">
              {{ detail.canAction ? '待当前用户处理' : '不可处理' }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="发起时间">
            {{ formatTime(detail.createTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {{ formatTime(detail.finishTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="审批实例 ID" :span="2">
            <Typography.Text copyable>
              {{ detail.processInstanceId }}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item
            v-if="detail.currentTaskId"
            label="当前任务 ID"
            :span="2"
          >
            {{ detail.currentTaskId }}
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">审批表单</Divider>
        <Descriptions
          v-if="detailFormComponents.length"
          bordered
          :column="1"
          size="small"
        >
          <Descriptions.Item
            v-for="(field, index) in detailFormComponents"
            :key="field.id || `${formFieldLabel(field, index)}-${index}`"
            :label="formFieldLabel(field, index)"
          >
            <AttachmentList
              v-if="isAttachmentFormField(field)"
              :attachments="field.attachments"
              :process-instance-id="detail.processInstanceId"
            />
            <span v-else class="field-value">
              {{ formDisplayValue(field) }}
            </span>
          </Descriptions.Item>
        </Descriptions>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="暂无表单字段"
        />

        <Divider orientation="left">审批记录</Divider>
        <Timeline v-if="detail.operationRecords?.length">
          <Timeline.Item
            v-for="(record, index) in detail.operationRecords"
            :key="`${operationTime(record)}-${index}`"
            :color="resultMeta(record.result || record.type).color"
          >
            <div class="timeline-title">
              {{ operationName(record) }} · {{ operationAction(record) }}
            </div>
            <div class="approval-subtitle">{{ operationTime(record) }}</div>
            <div v-if="record.remark" class="timeline-remark">
              意见：{{ record.remark }}
            </div>
            <AttachmentList
              v-if="record.attachments?.length || record.images?.length"
              :attachments="record.attachments"
              class="timeline-attachments"
              :images="record.images"
              :process-instance-id="detail.processInstanceId"
            />
          </Timeline.Item>
        </Timeline>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="暂无审批记录"
        />

        <Divider orientation="left">审批任务</Divider>
        <Table
          v-if="detail.tasks?.length"
          :columns="taskColumns"
          :data-source="detail.tasks"
          :pagination="false"
          :scroll="{ x: 850 }"
          row-key="taskId"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'status'">
              <Tag :color="statusMeta(record.status).color">
                {{ statusMeta(record.status).label }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'result'">
              <Tag :color="resultMeta(record.result).color">
                {{ resultMeta(record.result).label }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'createTime'">
              {{ formatTime(record.createTime) }}
            </template>
            <template v-else-if="column.dataIndex === 'finishTime'">
              {{ formatTime(record.finishTime) }}
            </template>
          </template>
        </Table>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="暂无任务记录"
        />
      </template>
      <Empty v-else description="未能读取审批详情" />
    </Drawer>

    <Modal
      v-model:open="rejectOpen"
      :cancel-button-props="{
        disabled: isProcessing(rejectTarget?.processInstanceId),
      }"
      cancel-text="取消"
      centered
      :closable="!isProcessing(rejectTarget?.processInstanceId)"
      :confirm-loading="isProcessing(rejectTarget?.processInstanceId)"
      destroy-on-close
      :keyboard="!isProcessing(rejectTarget?.processInstanceId)"
      :mask-closable="false"
      :ok-button-props="{ danger: true, disabled: !rejectRemarkValid }"
      ok-text="确认拒绝"
      title="拒绝钉钉审批单"
      @cancel="closeRejectModal"
      @ok="confirmReject"
    >
      <Alert
        class="mb-3"
        description="拒绝结果会直接同步到钉钉，提交后无法在本页面撤销。"
        message="请确认审批单信息并填写拒绝原因"
        show-icon
        type="warning"
      />
      <Descriptions v-if="rejectTarget" :column="1" size="small">
        <Descriptions.Item label="审批单">
          {{
            rejectTarget.title || rejectTarget.templateName || '未命名审批单'
          }}
        </Descriptions.Item>
        <Descriptions.Item label="发起人">
          {{ originatorText(rejectTarget) }}
        </Descriptions.Item>
        <Descriptions.Item label="审批实例 ID">
          <Typography.Text copyable>
            {{ rejectTarget.processInstanceId }}
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>
      <Divider orientation="left">关键表单字段</Divider>
      <Descriptions
        v-if="rejectKeyFormComponents.length"
        bordered
        :column="1"
        size="small"
      >
        <Descriptions.Item
          v-for="(field, index) in rejectKeyFormComponents"
          :key="field.id || `${formFieldLabel(field, index)}-${index}`"
          :label="formFieldLabel(field, index)"
        >
          {{ compactFormDisplayValue(field) }}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Text class="reject-detail-hint" type="secondary">
        {{
          rejectTarget?.formComponents?.length
            ? '其余表单字段已在详情抽屉展示，请确认无误后再提交。'
            : '该审批单没有可展示的表单字段，请结合详情抽屉中的审批记录确认。'
        }}
      </Typography.Text>
      <div class="reject-label"><span aria-hidden="true">*</span> 拒绝原因</div>
      <Input.TextArea
        v-model:value="rejectRemark"
        :auto-size="{ minRows: 4, maxRows: 8 }"
        :disabled="isProcessing(rejectTarget?.processInstanceId)"
        :maxlength="1024"
        placeholder="请输入明确的拒绝原因（必填）"
        show-count
      />
    </Modal>
  </Page>
</template>

<style scoped>
.template-picker-card {
  margin-bottom: 12px;
}

.template-picker-content {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.template-picker-heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.template-picker-actions {
  flex: 1;
  justify-content: flex-end;
}

.template-picker-actions :deep(.ant-select) {
  width: min(620px, 60vw);
  min-width: 360px;
}

.template-option,
.selected-template-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.template-option-name {
  font-weight: 500;
}

.template-option-code {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.template-status,
.selected-template-summary {
  margin-top: 12px;
}

@media (width <= 768px) {
  .template-picker-actions {
    justify-content: flex-start;
  }

  .template-picker-actions :deep(.ant-select) {
    width: calc(100vw - 96px);
    min-width: 240px;
  }
}

.todo-count-card {
  margin-bottom: 12px;
}

.todo-count-content {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
}

.todo-count-value {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 2px;
}

.todo-count-value strong {
  font-size: 28px;
  line-height: 1.2;
  color: hsl(var(--foreground));
}

.todo-count-action {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.approval-tabs {
  padding: 0 16px;
  margin-bottom: 8px;
  background: hsl(var(--card));
  border-radius: 8px;
}

.approval-title-link {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  font-weight: 500;
  color: hsl(var(--primary));
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.approval-subtitle {
  margin-top: 3px;
  overflow: hidden;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-loading {
  display: grid;
  min-height: 260px;
  place-items: center;
}

.field-value {
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.timeline-title {
  font-weight: 500;
}

.timeline-remark {
  padding: 8px 10px;
  margin-top: 6px;
  line-height: 1.6;
  color: hsl(var(--foreground));
  white-space: pre-wrap;
  background: hsl(var(--muted));
  border-radius: 6px;
}

.timeline-attachments {
  margin-top: 8px;
}

.reject-label {
  margin: 14px 0 6px;
  font-weight: 500;
}

.reject-detail-hint {
  display: block;
  margin-top: 8px;
}

.reject-label span,
:global(.approval-confirm__warning) {
  color: #dc2626;
}

:global(.approval-confirm p) {
  margin-bottom: 6px;
}

:global(.approval-confirm__title) {
  font-weight: 600;
}

:global(.approval-confirm__section-title) {
  padding-top: 8px;
  margin-top: 10px;
  font-weight: 600;
  border-top: 1px solid #e2e8f0;
}

:global(.approval-confirm__field) {
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:global(.approval-confirm__hint) {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

:global(.approval-confirm__id) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: #64748b;
  overflow-wrap: anywhere;
}

:global(.approval-confirm__warning) {
  margin-top: 12px;
}
</style>
