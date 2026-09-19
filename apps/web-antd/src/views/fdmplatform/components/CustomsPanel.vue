<script setup lang="ts">
import type {
  Access,
  BusinessRecord,
  Contract,
  Directory,
} from '#/api/fdmplatform';
import type {
  CustomsBatch,
  CustomsDetails,
  CustomsExpense,
  CustomsFile,
} from '#/api/fdmplatform/customs';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getAccess,
  getContract,
  getDirectory,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  downloadCustomsFile,
  getCustoms,
  getCustomsFiles,
  getCustomsPage,
  uploadCustomsFile,
} from '#/api/fdmplatform/customs';
import {
  createCustomsWithAttachments,
  customsActionWithAttachments,
} from '#/api/fdmplatform/submissions';

import { customsCategories, customsLabel, customsStatuses } from '../customs';
import { errorText } from '../data';
import { personLabel } from '../directory';
import LinkedRecordTable from '../documents/LinkedRecordTable.vue';
import {
  contractTarget,
  customsDocumentLinks,
  detailLocation,
  withoutDetailQuery,
} from '../documents/navigation';
import RelatedLink from '../documents/RelatedLink.vue';
import { useRouteOwner } from '../documents/useRouteOwner';
import CreationAttachments from './CreationAttachments.vue';
import CustomsEditor from './CustomsEditor.vue';

const props = defineProps<{
  companyId: number;
  contractId?: string;
  embedded?: boolean;
}>();
const emit = defineEmits<{ busy: [value: boolean]; changed: [] }>();
const route = useRoute();
const router = useRouter();
const routeActive = useRouteOwner();
const detailContract = ref<Contract>();
const sourceLinks = computed(() =>
  detailContract.value && selected.value
    ? customsDocumentLinks(
        detailContract.value,
        selected.value as unknown as BusinessRecord,
      )
    : [],
);
const access = ref<Access>();
const directory = ref<Directory>();
const batches = ref<CustomsBatch[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const status = ref<string>();
const scope = ref('ALL');
const loading = ref(false);
const loadError = ref('');
const selected = ref<CustomsBatch>();
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const files = ref<CustomsFile[]>([]);
const storageEnabled = ref(false);
const editorOpen = ref(false);
const editing = ref<CustomsBatch>();
const saving = ref(false);
const editorError = ref('');
const commandKey = ref('');
const actionOpen = ref(false);
const actionName = ref('');
const actionError = ref('');
const actionFiles = ref<File[]>([]);
const targetUser = ref<number>();
const reason = ref('');
const nextStatus = ref('PROCESSING');
const occurredDate = ref('');
const evidence = ref('');
const differenceReason = ref('');
const dueDate = ref('');
const feedbackId = ref('');
const category = ref('CONTRACT');
const applicable = ref(true);
const mandatory = ref(false);
const uploadCategory = ref('CONTRACT');
const replacesId = ref<string>();
const uploadRemark = ref('');
const pendingFiles = ref<File[]>([]);
const uploading = ref(false);
const uploadError = ref('');
const downloading = ref('');
const fileInput = ref<HTMLInputElement>();
const activeDetailTab = ref('overview');
const expenseId = ref('');
const expenseAttachment = ref<string>();
const expenseItem = ref<string>();
const expenseAmount = ref('');
const expenseCurrency = ref('CNY');
const expenseRate = ref('');
const expenseQuantity = ref('');
const expenseTax = ref('');
const expenseIncludes = ref<string[]>([]);
const previewOpen = ref(false);
const previewUrl = ref('');
const previewName = ref('');
const previewImage = ref(false);
const nestedBusy = computed(
  () =>
    saving.value ||
    uploading.value ||
    editorOpen.value ||
    actionOpen.value ||
    previewOpen.value,
);
watch(
  () => nestedBusy.value || detailOpen.value,
  (value) => emit('busy', value),
  { flush: 'sync' },
);
const uploadKeys = new WeakMap<File, string>();
let loadSequence = 0;
let detailSequence = 0;
const nextStatuses = computed(() => {
  const transitions: Record<string, string[]> = {
    DRAFT: ['PROCESSING'],
    PROCESSING: ['SUBMITTED', 'SUPPLEMENTING'],
    SUBMITTED: ['RELEASED', 'SUPPLEMENTING'],
    SUPPLEMENTING: ['PROCESSING', 'SUBMITTED'],
    RELEASED: ['ARCHIVED', 'SUPPLEMENTING'],
  };
  return (transitions[selected.value?.status ?? ''] ?? []).map((value) => ({
    value,
    label: customsLabel(value),
  }));
});
const hasAction = (action: string) =>
  selected.value?.allowedActions?.includes(action) ?? false;
const currentFiles = computed(() => {
  const replaced = new Set(
    files.value.map((file) => file.replacesId).filter(Boolean),
  );
  return files.value.filter((file) => !replaced.has(file.id));
});
const summary = computed(() => {
  const value = selected.value;
  if (!value) return [];
  return [
    ['关联合同', value.contractCode],
    ['负责人', personLabel(directory.value, value.ownerUserId)],
    ['办理状态', customsLabel(value.status)],
    ['资料状态', customsLabel(value.documentStatus)],
    ['计划出运', value.plannedDate],
    ['实际出运', value.actualDate],
    ['目的地', value.destination],
    ['运输方式', value.transportMode],
    ['货代 / 报关服务方', value.agentName],
    ['外部参考编号', value.externalReference],
  ];
});
const columns = [
  { key: 'name', title: '批次 / 合同', width: 240 },
  { key: 'owner', title: '采购负责人', width: 160 },
  { key: 'status', title: '办理状态', width: 140 },
  { key: 'documentStatus', title: '资料状态', width: 110 },
  {
    key: 'plannedDate',
    title: '计划出运',
    dataIndex: 'plannedDate',
    width: 120,
  },
  { key: 'action', title: '操作', width: 90 },
];
const fileColumns = [
  { key: 'file', title: '文件 / 类别', width: 250 },
  { key: 'version', title: '版本', width: 100 },
  { key: 'uploadedBy', title: '上传人', width: 150 },
  { key: 'createdAt', title: '上传时间', dataIndex: 'createdAt', width: 175 },
  { key: 'action', title: '操作', width: 130 },
];
const checklistColumns = [
  { key: 'category', title: '资料类别', width: 170 },
  { key: 'applicable', title: '是否适用', width: 90 },
  { key: 'required', title: '必须提供', width: 90 },
  { key: 'reason', title: '说明', dataIndex: 'reason', width: 200 },
  { key: 'action', title: '操作', width: 90 },
];
const feedbackColumns = [
  { key: 'message', title: '待补内容', dataIndex: 'message', width: 250 },
  { key: 'dueDate', title: '要求日期', dataIndex: 'dueDate', width: 110 },
  { key: 'resolution', title: '处理结果', width: 200 },
  { key: 'action', title: '操作', width: 90 },
];
const historyColumns = [
  { key: 'action', title: '动作', width: 130 },
  { key: 'status', title: '办理状态', width: 140 },
  { key: 'remark', title: '记录 / 依据', width: 250 },
  { key: 'actorId', title: '操作人', width: 150 },
  { key: 'createdAt', title: '时间', dataIndex: 'createdAt', width: 180 },
];
const expenseColumns = [
  { key: 'amount', title: '费用金额', width: 140 },
  { key: 'item', title: '归属产品', width: 160 },
  { key: 'evidence', title: '凭据', width: 200 },
  { key: 'status', title: '归集状态', width: 120 },
  { key: 'action', title: '财务处理', width: 150 },
];
async function load() {
  const request = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getCustomsPage({
      companyId: 0,
      contractId: props.contractId,
      pageNo: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      status: status.value,
      ownerUserId: scope.value === 'OWN' ? access.value?.userId : undefined,
    });
    if (request !== loadSequence) return;
    batches.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (request === loadSequence) loadError.value = errorText(error);
  } finally {
    if (request === loadSequence) loading.value = false;
  }
}
function search() {
  page.value = 1;
  void load();
}
async function refreshDetail(id: string) {
  const request = ++detailSequence;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const [batch, attachments] = await Promise.all([
      getCustoms(id),
      getCustomsFiles(id),
    ]);
    if (request !== detailSequence || (!props.embedded && !routeActive.value))
      return;
    if (
      props.embedded
        ? !props.contractId || batch.contractId !== props.contractId
        : typeof route.query.contractId === 'string' &&
          batch.contractId !== route.query.contractId
    )
      throw new Error('此报关批次不属于链接中的合同，请从来源单据重新打开');
    const contract = await getContract(batch.contractId);
    if (request !== detailSequence || (!props.embedded && !routeActive.value))
      return;
    detailContract.value = contract;
    selected.value = batch;
    files.value = attachments.items;
    storageEnabled.value = attachments.enabled;
  } catch (error) {
    if (request === detailSequence) detailError.value = errorText(error);
  } finally {
    if (request === detailSequence) detailLoading.value = false;
  }
}
async function openDetail(batch: CustomsBatch) {
  if (props.embedded) {
    if (batch.contractId !== props.contractId) {
      loadError.value = '此报关批次不属于当前合同，请刷新后重新选择';
      return;
    }
    files.value = [];
    pendingFiles.value = [];
    replacesId.value = undefined;
    uploadError.value = '';
    selected.value = undefined;
    activeDetailTab.value = 'overview';
    detailOpen.value = true;
    await refreshDetail(batch.id);
    return;
  }
  if (route.query.documentId === batch.id) {
    await refreshDetail(batch.id);
    detailOpen.value = true;
    return;
  }
  await router.push({
    query: {
      ...route.query,
      contractId: batch.contractId,
      documentId: batch.id,
    },
  });
}
function closeDetail() {
  if (nestedBusy.value) return;
  detailSequence++;
  detailOpen.value = false;
  actionOpen.value = false;
  if (!props.embedded && routeActive.value)
    void router.replace({ query: withoutDetailQuery(route.query) });
}
function beginEdit(batch?: CustomsBatch) {
  editing.value = batch;
  editorError.value = '';
  commandKey.value = newIdempotencyKey();
  editorOpen.value = true;
}
async function saveBatch(value: {
  contractId: string;
  contractVersion: number;
  details: CustomsDetails;
  files: File[];
}) {
  if (saving.value) return;
  if (props.embedded && value.contractId !== props.contractId) {
    editorError.value = '报关批次必须关联当前合同';
    return;
  }
  saving.value = true;
  editorError.value = '';
  try {
    const result = editing.value
      ? await customsActionWithAttachments(
          editing.value.id,
          editing.value.version,
          commandKey.value,
          'UPDATE',
          { ...value.details },
          value.files,
        )
      : await createCustomsWithAttachments(
          {
            contractId: value.contractId,
            contractVersion: value.contractVersion,
            details: value.details,
            idempotencyKey: commandKey.value,
          },
          value.files,
        );
    editorOpen.value = false;
    message.success('报关批次已保存');
    await load();
    await openDetail(result);
    emit('changed');
  } catch (error) {
    editorError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function beginAction(action: string, record?: Record<string, unknown>) {
  actionFiles.value = [];
  actionName.value = action;
  actionError.value = '';
  commandKey.value = newIdempotencyKey();
  targetUser.value = selected.value?.ownerUserId;
  reason.value = String(record?.reason ?? '');
  nextStatus.value = nextStatuses.value[0]?.value ?? '';
  const today = new Date();
  occurredDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  evidence.value = '';
  differenceReason.value = '';
  dueDate.value = '';
  feedbackId.value = String(record?.id ?? '');
  expenseId.value = String(record?.id ?? '');
  expenseAttachment.value = undefined;
  expenseItem.value = undefined;
  expenseAmount.value = '';
  expenseCurrency.value = 'CNY';
  expenseRate.value = '';
  expenseQuantity.value = '';
  expenseTax.value = '';
  if (action === 'SUBMIT_COST' && selected.value?.lines.length === 1) {
    expenseItem.value = selected.value.lines[0]!.contractItemId;
    expenseQuantity.value = String(selected.value.lines[0]!.quantity);
  }
  expenseIncludes.value = [];
  category.value = String(record?.category ?? 'CONTRACT');
  applicable.value = record?.applicable !== false;
  mandatory.value = record?.required === true;
  actionOpen.value = true;
}
function closeAction() {
  if (saving.value) return;
  const finish = () => {
    actionOpen.value = false;
    actionFiles.value = [];
  };
  if (actionFiles.value.length > 0)
    Modal.confirm({
      title: '关闭当前办理？',
      content: '待上传附件尚未保存，关闭后将清除。',
      onOk: finish,
    });
  else finish();
}
async function perform() {
  if (saving.value || !selected.value) return;
  if (actionName.value === 'SUBMIT_COST') {
    if (
      (!expenseAttachment.value && actionFiles.value.length === 0) ||
      !expenseItem.value ||
      !expenseTax.value.trim() ||
      !(Number(expenseAmount.value) > 0) ||
      !Number.isFinite(Number(expenseAmount.value)) ||
      !(Number(expenseQuantity.value) > 0) ||
      !Number.isFinite(Number(expenseQuantity.value))
    ) {
      actionError.value =
        '请选择凭据、归属产品，填写正数金额、正数数量及税费口径';
      return;
    }
    if (
      expenseCurrency.value !== detailContract.value?.currency &&
      (!(Number(expenseRate.value) > 0) ||
        !Number.isFinite(Number(expenseRate.value)))
    ) {
      actionError.value = '费用币种与合同币种不同时，请填写有效的正数折算汇率';
      return;
    }
  }
  let payload: Record<string, unknown> = {};
  if (actionName.value === 'ASSIGN')
    payload = { ownerUserId: targetUser.value, reason: reason.value };
  if (actionName.value === 'PROGRESS')
    payload = {
      status: nextStatus.value,
      occurredDate: occurredDate.value || undefined,
      evidence: evidence.value,
      remark: reason.value,
      differenceReason: differenceReason.value,
    };
  if (actionName.value === 'CHECKLIST')
    payload = {
      category: category.value,
      applicable: applicable.value,
      required: mandatory.value,
      reason: reason.value,
    };
  if (actionName.value === 'FEEDBACK')
    payload = { message: reason.value, dueDate: dueDate.value || undefined };
  if (actionName.value === 'RESOLVE_FEEDBACK')
    payload = { feedbackId: feedbackId.value, remark: reason.value };
  if (['CANCEL', 'REOPEN'].includes(actionName.value))
    payload = { reason: reason.value };
  if (actionName.value === 'SUBMIT_COST')
    payload = {
      attachmentId: expenseAttachment.value,
      contractItemId: expenseItem.value,
      category: 'TRANSPORT',
      amount: expenseAmount.value,
      currency: expenseCurrency.value,
      exchangeRate: expenseRate.value || undefined,
      quantity: expenseQuantity.value || undefined,
      taxTreatment: expenseTax.value,
      includesCategories: expenseIncludes.value,
    };
  if (actionName.value === 'REGISTER_COST')
    payload = { expenseId: expenseId.value };
  saving.value = true;
  actionError.value = '';
  try {
    const result = await customsActionWithAttachments(
      selected.value.id,
      selected.value.version,
      commandKey.value,
      actionName.value,
      payload,
      actionFiles.value,
      actionName.value === 'SUBMIT_COST'
        ? actionFiles.value.map(() => 'COST_EVIDENCE')
        : undefined,
    );
    actionFiles.value = [];
    selected.value = result;
    actionOpen.value = false;
    message.success('跟进记录已保存');
    await Promise.all([load(), refreshDetail(result.id)]);
    emit('changed');
  } catch (error) {
    actionError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function chooseFiles(event: Event) {
  pendingFiles.value = [...((event.target as HTMLInputElement).files ?? [])];
  uploadError.value = '';
}
async function upload() {
  if (!selected.value || pendingFiles.value.length === 0) return;
  if (replacesId.value && pendingFiles.value.length !== 1) {
    uploadError.value = '替换版本时请只选择一个文件。';
    return;
  }
  if (
    pendingFiles.value.some(
      (file) => file.size === 0 || file.size > 20 * 1024 * 1024,
    )
  ) {
    uploadError.value = '单个文件须大于 0 且不超过 20 MB。';
    return;
  }
  uploading.value = true;
  uploadError.value = '';
  const id = selected.value.id;
  try {
    while (pendingFiles.value.length > 0) {
      const file = pendingFiles.value[0];
      if (!file) break;
      if (!uploadKeys.has(file)) uploadKeys.set(file, newIdempotencyKey());
      await uploadCustomsFile(id, file, {
        category: uploadCategory.value,
        expectedVersion: selected.value.version,
        idempotencyKey: uploadKeys.get(file)!,
        replacesId: replacesId.value,
        remark: uploadRemark.value,
      });
      pendingFiles.value.shift();
      await refreshDetail(id);
      if (detailError.value)
        throw new Error(
          '文件已上传，刷新版本失败；请刷新详情后继续上传剩余文件。',
        );
    }
    if (fileInput.value) fileInput.value.value = '';
    replacesId.value = undefined;
    uploadRemark.value = '';
    message.success('资料已上传并保留版本');
    await load();
    emit('changed');
  } catch (error) {
    uploadError.value = errorText(error);
  } finally {
    uploading.value = false;
  }
}
async function download(file: CustomsFile) {
  if (!selected.value) return;
  downloading.value = file.id;
  try {
    const blob = await downloadCustomsFile(selected.value.id, file.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    detailError.value = errorText(error);
  } finally {
    downloading.value = '';
  }
}
function replace(file: CustomsFile) {
  replacesId.value = file.id;
  uploadCategory.value = file.category;
  activeDetailTab.value = 'files';
  fileInput.value?.click();
}
function previewable(file: CustomsFile) {
  return /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
}
async function preview(file: CustomsFile) {
  if (!selected.value) return;
  downloading.value = file.id;
  try {
    const blob = await downloadCustomsFile(selected.value.id, file.id);
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewImage.value = !/\.pdf$/i.test(file.name);
    previewUrl.value = URL.createObjectURL(
      previewImage.value ? blob : new Blob([blob], { type: 'application/pdf' }),
    );
    previewName.value = file.name;
    previewOpen.value = true;
  } catch (error) {
    detailError.value = errorText(error);
  } finally {
    downloading.value = '';
  }
}
function registerExpense(expense: CustomsExpense) {
  beginAction('REGISTER_COST', { id: expense.id });
}
watch(
  () => [props.companyId, props.contractId],
  async () => {
    const request = ++loadSequence;
    detailSequence++;
    detailOpen.value = false;
    selected.value = undefined;
    page.value = 1;
    batches.value = [];
    loadError.value = '';
    try {
      const [currentAccess, users] = await Promise.all([
        getAccess(),
        getDirectory(0),
      ]);
      if (request !== loadSequence) return;
      access.value = currentAccess;
      directory.value = users;
      await load();
    } catch (error) {
      if (request === loadSequence) loadError.value = errorText(error);
    }
  },
  { immediate: true },
);
watch(
  () => [route.query.documentId, route.query.contractId, routeActive.value],
  async () => {
    if (props.embedded) return;
    detailSequence++;
    detailOpen.value = false;
    actionOpen.value = false;
    selected.value = undefined;
    detailContract.value = undefined;
    if (!routeActive.value) return;
    try {
      const location = detailLocation(route.query);
      if (!location) return;
      files.value = [];
      pendingFiles.value = [];
      replacesId.value = undefined;
      uploadError.value = '';
      activeDetailTab.value = 'overview';
      detailOpen.value = true;
      await refreshDetail(location.documentId);
    } catch (error) {
      loadError.value = errorText(error);
    }
  },
  { immediate: true },
);
watch(previewOpen, (open) => {
  if (!open && previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
  }
});
onBeforeUnmount(() => {
  loadSequence++;
  detailSequence++;
  emit('busy', false);
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <div class="customs-panel">
    <Space wrap class="customs-toolbar">
      <Input
        v-model:value="keyword"
        placeholder="合同编号、批次名称或外部编号"
        allow-clear
        class="customs-search"
        @press-enter="search"
      />
      <Select
        v-model:value="status"
        :options="customsStatuses"
        placeholder="办理状态"
        allow-clear
        class="customs-filter"
        @change="search"
      />
      <Select
        v-model:value="scope"
        :options="[
          { value: 'ALL', label: '全部批次' },
          { value: 'OWN', label: '我负责的批次' },
        ]"
        class="customs-filter"
        @change="search"
      />
      <Button :loading="loading" @click="search">查询</Button>
      <Button type="primary" @click="beginEdit()"> 新建报关批次 </Button>
    </Space>
    <Alert v-if="loadError" type="error" show-icon :message="loadError" />
    <Table
      :columns="columns"
      :data-source="batches"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 860 }"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (count: number) => `共 ${count} 个批次`,
      }"
      @change="
        (pagination) => {
          page = pagination.current ?? 1;
          pageSize = pagination.pageSize ?? 10;
          load();
        }
      "
    >
      <template #emptyText>
        <Empty
          description="当前范围暂无报关批次"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
        />
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'name'">
          <Button
            type="link"
            class="customs-name"
            @click="openDetail(record as CustomsBatch)"
          >
            {{ record.name }}
          </Button>
          <div class="customs-muted">
            {{ record.contractCode }} · {{ record.code }}
          </div>
        </div>
        <span v-else-if="column.key === 'owner'">{{
          personLabel(directory, record.ownerUserId)
        }}</span>
        <Tag
          v-else-if="column.key === 'status'"
          :color="
            ['RELEASED', 'ARCHIVED'].includes(record.status)
              ? 'green'
              : undefined
          "
        >
          {{ customsLabel(record.status) }}
        </Tag>
        <span v-else-if="column.key === 'documentStatus'">{{
          customsLabel(record.documentStatus)
        }}</span>
        <Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="openDetail(record as CustomsBatch)"
        >
          查看跟进
        </Button>
      </template>
    </Table>
    <CustomsEditor
      v-model:open="editorOpen"
      :company-id="companyId"
      :contract-id="contractId"
      :lock-contract="embedded"
      :batch="editing"
      :saving="saving"
      :error="editorError"
      @save="saveBatch"
    />
    <Drawer
      :open="detailOpen && (embedded || routeActive)"
      @close="closeDetail"
      :title="selected?.name ?? '报关跟进'"
      width="min(1120px, 97vw)"
      :mask-closable="!nestedBusy"
      :closable="!nestedBusy"
      :keyboard="!nestedBusy"
    >
      <Alert
        v-if="detailError && !selected"
        type="error"
        :message="detailError"
      />
      <div v-if="selected" class="customs-detail">
        <Alert
          v-if="detailError"
          type="error"
          show-icon
          :message="detailError"
        />
        <Space wrap>
          <Button :loading="detailLoading" @click="refreshDetail(selected.id)">
            刷新详情
          </Button>
          <Button
            v-if="hasAction('UPDATE')"
            :disabled="saving || uploading"
            @click="beginEdit(selected)"
          >
            编辑批次
          </Button>
          <Button
            v-if="hasAction('ASSIGN')"
            :disabled="saving || uploading"
            @click="beginAction('ASSIGN')"
          >
            分派 / 转派
          </Button>
          <Button
            v-if="hasAction('PROGRESS')"
            type="primary"
            :disabled="saving || uploading"
            @click="beginAction('PROGRESS')"
          >
            登记办理进度
          </Button>
          <Button
            v-if="hasAction('FEEDBACK')"
            :disabled="saving || uploading"
            @click="beginAction('FEEDBACK')"
          >
            反馈待补资料
          </Button>
          <Button
            v-if="hasAction('CANCEL')"
            danger
            :disabled="saving || uploading"
            @click="beginAction('CANCEL')"
          >
            取消批次
          </Button>
          <Button
            v-if="hasAction('REOPEN')"
            :disabled="saving || uploading"
            @click="beginAction('REOPEN')"
          >
            更正已完成批次
          </Button>
        </Space>
        <Descriptions bordered size="small" :column="2">
          <DescriptionsItem
            v-for="item in summary"
            :key="String(item[0])"
            :label="item[0]"
          >
            <RelatedLink
              v-if="item[0] === '关联合同'"
              :target="contractTarget(selected.contractId)"
            >
              {{ item[1] || '查看合同' }}
</RelatedLink><span v-else>{{ item[1] || '—' }}</span>
          </DescriptionsItem>
          <DescriptionsItem
            v-for="link in sourceLinks"
            :key="JSON.stringify(link.target)"
            :label="link.label"
          >
            <RelatedLink :target="link.target">
              {{ link.value }}
            </RelatedLink>
          </DescriptionsItem>
        </Descriptions>
        <Tabs v-model:active-key="activeDetailTab">
          <TabPane key="overview" tab="本批产品与出货">
            <Alert
              v-if="!selected.required"
              type="info"
              show-icon
              :message="`本批不需报关：${selected.notRequiredReason || '—'}`"
            />
            <LinkedRecordTable
              :contract="detailContract"
              :data="selected.lines as unknown as BusinessRecord[]"
              :columns="[
                { title: '产品', key: 'skuName' },
                { title: '规格', key: 'specification' },
                { title: '本批数量', key: 'quantity' },
                { title: '单位', key: 'unit' },
              ]"
              row-key="contractItemId"
              :pagination="false"
              size="small"
              :scroll="{ x: 600 }"
            />
            <div class="customs-section">
              <strong>已关联发货</strong><Table
                :data-source="selected.shipments"
                :columns="[
                  { title: '发货记录', dataIndex: 'eventId' },
                  { title: '规格版本', dataIndex: 'specVersion' },
                  { title: '本批分配数量', dataIndex: 'quantity' },
                ]"
                row-key="eventId"
                :pagination="false"
                size="small"
              />
            </div>
            <p class="customs-muted">{{ selected.remark || '暂无补充说明' }}</p>
          </TabPane>
          <TabPane key="files" tab="资料与版本">
            <div
              v-if="hasAction('UPLOAD') || hasAction('ATTACHMENT_UPLOAD')"
              class="customs-upload"
            >
              <Alert
                v-if="!storageEnabled"
                type="warning"
                show-icon
                message="系统文件存储暂不可用，请检查基础设施中的文件配置。"
              />
              <Space wrap>
                <Select
                  v-model:value="uploadCategory"
                  :options="customsCategories"
                  class="customs-filter"
                  :disabled="uploading || !!replacesId"
                />
                <Select
                  v-model:value="replacesId"
                  allow-clear
                  placeholder="新增文件（或选择替换版本）"
                  class="customs-replace"
                  :disabled="uploading"
                  :options="
                    currentFiles
                      .filter((file) => file.category === uploadCategory)
                      .map((file) => ({ value: file.id, label: file.name }))
                  "
                />
                <Input
                  v-model:value="uploadRemark"
                  placeholder="文件说明"
                  :disabled="uploading"
                  class="customs-search"
                />
              </Space>
              <input
                ref="fileInput"
                type="file"
                multiple
                :disabled="!storageEnabled || uploading"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                aria-label="选择报关资料文件"
                @change="chooseFiles"
              />
              <Space wrap>
                <span class="customs-muted">已选择 {{ pendingFiles.length }} 个文件，单个不超过 20
                  MB</span><Button
                  type="primary"
                  :loading="uploading"
                  :disabled="!storageEnabled || !pendingFiles.length"
                  @click="upload"
                >
                  上传资料
                </Button>
              </Space>
              <Alert
                v-if="uploadError"
                type="error"
                show-icon
                :message="uploadError"
              />
            </div>
            <Table
              :columns="fileColumns"
              :data-source="files"
              row-key="id"
              :pagination="{ pageSize: 8 }"
              :scroll="{ x: 800 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <div v-if="column.key === 'file'">
                  {{ record.name }}
                  <div class="customs-muted">
                    {{ customsLabel(record.category) }} ·
                    {{ (record.size / 1024).toFixed(1) }} KB
                  </div>
                </div>
                <span v-else-if="column.key === 'version'">V{{ record.revision ?? 1 }} ·
                  {{
                    currentFiles.some((file) => file.id === record.id)
                      ? '当前'
                      : '历史'
                  }}</span>
                <span v-else-if="column.key === 'uploadedBy'">{{
                  personLabel(directory, record.uploadedBy)
                }}</span>
                <Space v-else-if="column.key === 'action'" wrap>
                  <Button
                    v-if="previewable(record as CustomsFile)"
                    type="link"
                    :loading="downloading === record.id"
                    @click="preview(record as CustomsFile)"
                  >
                    预览
</Button><Button
                    type="link"
                    :loading="downloading === record.id"
                    @click="download(record as CustomsFile)"
                  >
                    下载
</Button><Button
                    v-if="
                      (hasAction('UPLOAD') || hasAction('ATTACHMENT_UPLOAD')) &&
                      currentFiles.some((file) => file.id === record.id)
                    "
                    type="link"
                    :disabled="uploading"
                    @click="replace(record as CustomsFile)"
                  >
                    替换
                  </Button>
                </Space>
              </template>
            </Table>
          </TabPane>
          <TabPane key="checklist" tab="资料要求">
            <p class="customs-muted">
              根据适用的必需资料与已上传文件自动判断是否齐全。
            </p>
            <Space class="customs-section">
              <Button
                v-if="hasAction('CHECKLIST')"
                @click="beginAction('CHECKLIST')"
              >
                设置资料要求
              </Button>
            </Space>
            <Table
              :columns="checklistColumns"
              :data-source="selected.checklist ?? []"
              row-key="category"
              :pagination="false"
              size="small"
              :scroll="{ x: 650 }"
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'category'">{{
                  customsLabel(record.category)
                }}</span>
                <span v-else-if="column.key === 'applicable'">{{
                  record.applicable ? '适用' : '不适用'
                }}</span>
                <span v-else-if="column.key === 'required'">{{
                  record.required ? '是' : '否'
                }}</span>
                <Button
                  v-else-if="column.key === 'action' && hasAction('CHECKLIST')"
                  type="link"
                  @click="beginAction('CHECKLIST', record)"
                >
                  设置资料要求
                </Button>
              </template>
            </Table>
          </TabPane>
          <TabPane key="feedback" tab="待补资料反馈">
            <Table
              :columns="feedbackColumns"
              :data-source="selected.feedback ?? []"
              row-key="id"
              :pagination="false"
              size="small"
              :scroll="{ x: 650 }"
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'resolution'">{{
                  record.resolvedAt
                    ? record.resolvedRemark || '已处理'
                    : '待处理'
                }}</span>
                <Button
                  v-else-if="
                    column.key === 'action' &&
                    !record.resolvedAt &&
                    hasAction('RESOLVE_FEEDBACK')
                  "
                  type="link"
                  @click="beginAction('RESOLVE_FEEDBACK', record)"
                >
                  登记处理结果
                </Button>
              </template>
            </Table>
          </TabPane>
          <TabPane key="history" tab="办理记录">
            <Table
              :columns="historyColumns"
              :data-source="selected.history ?? []"
              row-key="id"
              :pagination="{ pageSize: 10 }"
              :scroll="{ x: 800 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <span
                  v-if="['action', 'status'].includes(String(column.key))"
                  >{{
                    customsLabel(
                      column.key === 'action' ? record.action : record.status,
                    )
                  }}</span>
                <span v-else-if="column.key === 'actorId'">{{
                  personLabel(directory, record.actorId)
                }}</span>
                <span v-else-if="column.key === 'remark'">{{
                  [record.remark, record.evidence].filter(Boolean).join('；') ||
                  '—'
                }}</span>
              </template>
            </Table>
          </TabPane>
          <TabPane key="expenses" tab="费用凭据与归集">
            <div class="customs-section">
              <Button
                v-if="hasAction('SUBMIT_COST')"
                @click="beginAction('SUBMIT_COST')"
              >
                提交报关 / 运输费用
              </Button>
            </div>
            <Alert
              type="info"
              show-icon
              message="登记费用及凭据后，可直接确认归集到合同成本。"
              class="customs-section"
            />
            <Table
              :columns="expenseColumns"
              :data-source="selected.expenses ?? []"
              row-key="id"
              :pagination="false"
              size="small"
              :scroll="{ x: 760 }"
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'amount'">{{ record.cost?.amount }} {{ record.cost?.currency }}</span>
                <span v-else-if="column.key === 'item'">{{
                  selected.lines.find(
                    (line) =>
                      line.contractItemId === record.cost?.contractItemId,
                  )?.skuName ?? '合同整体'
                }}</span>
                <span v-else-if="column.key === 'evidence'">{{
                  files.find((file) => file.id === record.attachmentId)?.name ??
                  '费用凭据'
                }}</span>
                <div v-else-if="column.key === 'status'">
                  <Tag>
                    {{
                      record.status === 'PENDING'
                        ? '待归集'
                        : customsLabel(record.status)
                    }}
                  </Tag>
                  <div class="customs-muted">{{ record.reason }}</div>
                </div>
                <Space
                  v-else-if="
                    column.key === 'action' && record.status === 'PENDING'
                  "
                  wrap
                >
                  <Button
                    v-if="hasAction('REGISTER_COST')"
                    type="link"
                    @click="registerExpense(record as CustomsExpense)"
                  >
                    确认归集
                  </Button>
                </Space>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </div>
    </Drawer>
    <Modal
      :open="actionOpen"
      @cancel="closeAction"
      :title="customsLabel(actionName)"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :closable="!saving"
      :keyboard="!saving"
      :cancel-button-props="{ disabled: saving }"
      @ok="perform"
    >
      <Alert
        v-if="actionError"
        type="error"
        show-icon
        :message="actionError"
        class="customs-section"
      />
      <Form layout="vertical">
        <template v-if="actionName === 'SUBMIT_COST'">
          <Form.Item
            label="费用凭据"
            :required="actionFiles.length === 0"
            :extra="
              actionFiles.length > 0
                ? '本次上传附件保存时自动作为费用凭据。'
                : undefined
            "
          >
            <Select
              v-model:value="expenseAttachment"
              :options="
                currentFiles
                  .filter((file) => file.category === 'COST_EVIDENCE')
                  .map((file) => ({ value: file.id, label: file.name }))
              "
              placeholder="选择已有凭据，或在下方添加新附件"
            />
          </Form.Item>
          <Form.Item label="归属合同产品" required>
            <Select
              v-model:value="expenseItem"
              :options="
                (selected?.lines ?? []).map((line) => ({
                  value: line.contractItemId,
                  label: line.skuName,
                }))
              "
              placeholder="请选择本批归属产品"
              @change="
                (value) => {
                  expenseQuantity = String(
                    selected?.lines.find(
                      (line) => line.contractItemId === value,
                    )?.quantity ?? '',
                  );
                }
              "
            />
          </Form.Item>
          <Form.Item label="费用金额" required>
            <Input v-model:value="expenseAmount" inputmode="decimal" />
          </Form.Item>
          <Form.Item label="费用币种" required>
            <Select
              v-model:value="expenseCurrency"
              :options="
                ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'].map((value) => ({
                  value,
                  label: value,
                }))
              "
            />
          </Form.Item>
          <Form.Item label="折算为合同币种的汇率（不同币种时填写）">
            <Input v-model:value="expenseRate" inputmode="decimal" />
          </Form.Item>
          <Form.Item label="归属数量" required>
            <Input v-model:value="expenseQuantity" inputmode="decimal" />
          </Form.Item>
          <Form.Item label="税费处理口径" required>
            <Input v-model:value="expenseTax" placeholder="按费用凭据填写" />
          </Form.Item>
          <Form.Item label="费用已包含的其他要素">
            <Select
              v-model:value="expenseIncludes"
              mode="multiple"
              :options="[
                { value: 'PACKAGING', label: '包装' },
                { value: 'LABOR', label: '人工' },
                { value: 'CUSTOMIZATION', label: '定制' },
              ]"
            />
          </Form.Item>
        </template>
        <Alert
          v-if="actionName === 'REGISTER_COST'"
          type="warning"
          show-icon
          message="确认后将作为真实费用归集到合同，请先核对凭据、金额和币种。"
        />
        <Form.Item v-if="actionName === 'ASSIGN'" label="采购负责人" required>
          <Select
            v-model:value="targetUser"
            show-search
            option-filter-prop="label"
            :options="
              (directory?.users ?? []).map((user) => ({
                value: user.id,
                label: personLabel(directory, user.id),
              }))
            "
            placeholder="选择启用用户"
          />
        </Form.Item>
        <template v-if="actionName === 'PROGRESS'">
          <Form.Item label="办理状态" required>
            <Select v-model:value="nextStatus" :options="nextStatuses" />
          </Form.Item>
          <Form.Item label="实际发生日期" required>
            <Input v-model:value="occurredDate" type="date" />
          </Form.Item>
          <Form.Item label="办理依据 / 外部参考信息">
            <Input v-model:value="evidence" />
          </Form.Item>
          <Form.Item label="数量差异说明（存在差异时填写）">
            <Input.TextArea v-model:value="differenceReason" :rows="2" />
          </Form.Item>
        </template>
        <template v-if="actionName === 'CHECKLIST'">
          <Form.Item label="资料类别" required>
            <Select v-model:value="category" :options="customsCategories" />
          </Form.Item>
          <Space wrap>
            <Checkbox v-model:checked="applicable">适用</Checkbox><Checkbox v-model:checked="mandatory" :disabled="!applicable">
              必须提供
            </Checkbox>
          </Space>
        </template>
        <Form.Item v-if="actionName === 'FEEDBACK'" label="要求补齐日期">
          <Input v-model:value="dueDate" type="date" />
        </Form.Item>
        <Form.Item
          v-if="!['SUBMIT_COST', 'REGISTER_COST'].includes(actionName)"
          :label="
            actionName === 'FEEDBACK' ? '需要补充的资料' : '说明 / 处理记录'
          "
          required
        >
          <Input.TextArea v-model:value="reason" :rows="3" :maxlength="2000" />
        </Form.Item>
      </Form>
      <CreationAttachments
        v-if="
          ['SUBMIT_COST', 'PROGRESS', 'FEEDBACK', 'RESOLVE_FEEDBACK'].includes(
            actionName,
          )
        "
        v-model:files="actionFiles"
        :disabled="saving"
      />
    </Modal>
    <Modal
      v-model:open="previewOpen"
      :title="previewName"
      :footer="null"
      width="min(1000px, 95vw)"
    >
      <img
        v-if="previewImage"
        :src="previewUrl"
        :alt="previewName"
        class="customs-preview-image"
      /><iframe
        v-else-if="previewUrl"
        :src="previewUrl"
        :title="previewName"
        class="customs-preview-pdf"
      ></iframe>
    </Modal>
  </div>
</template>

<style scoped>
.customs-panel,
.customs-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.customs-toolbar {
  justify-content: flex-start;
}

.customs-search {
  width: 260px;
  max-width: 100%;
}

.customs-filter {
  min-width: 160px;
  max-width: 100%;
}

.customs-replace {
  width: 260px;
  max-width: 100%;
}

.customs-name {
  height: auto;
  padding: 0;
  text-align: left;
  white-space: normal;
}

.customs-muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.customs-section {
  margin: 16px 0;
}

.customs-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.customs-preview-image {
  max-width: 100%;
  height: auto;
}

.customs-preview-pdf {
  width: 100%;
  height: 70vh;
  border: 0;
}

@media (max-width: 640px) {
  .customs-search,
  .customs-replace {
    width: 100%;
  }
}
</style>
