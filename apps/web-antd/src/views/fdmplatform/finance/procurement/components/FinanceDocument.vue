<script setup lang="ts">
import type { ActionDefinition } from '../../../data';

import type { BusinessDocumentFile } from '#/api/fdmplatform/business-documents';
import type {
  ProcurementFinanceFile,
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, nextTick, ref, watch } from 'vue';

import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  message,
  Modal,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDirectory, newIdempotencyKey } from '#/api/fdmplatform';
import { downloadBusinessDocumentFile } from '#/api/fdmplatform/business-documents';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  downloadProcurementFinanceFile,
  getProcurementFinance,
  getProcurementFinanceFiles,
  uploadProcurementFinanceFile,
} from '#/api/fdmplatform/procurement-finance';
import {
  createProcurementFinanceWithAttachments,
  procurementFinanceActionWithAttachments,
} from '#/api/fdmplatform/submissions';

import ActionDialog from '../../../components/ActionDialog.vue';
import CreationAttachments from '../../../components/CreationAttachments.vue';
import RecordTable from '../../../components/RecordTable.vue';
import { errorText, field, rows, selectField } from '../../../data';
import { needsImportedValue } from '../../../documents/import-completion';
import { contractReferenceText } from '../../../documents/migration-display';
import MigrationSource from '../../../documents/MigrationSource.vue';
import { contractTarget, documentTarget } from '../../../documents/navigation';
import RelatedLink from '../../../documents/RelatedLink.vue';
import { currencyOptions } from '../../../products/model';
import { downloadBlob, sumAmounts } from '../../../purchase/manage/model';
import {
  actionNames,
  financeStatus,
  financeTitles,
  hasPayableBalance,
  payableBalance,
} from '../model';
import FinanceForm from './FinanceForm.vue';
import ReimbursementDetail from './ReimbursementDetail.vue';
import ReimbursementForm from './ReimbursementForm.vue';
const props = defineProps<{
  context?: Record<string, unknown>;
  open: boolean;
  recordId?: string;
  type: ProcurementFinanceType;
}>();
const emit = defineEmits<{
  close: [];
  updated: [record: ProcurementFinanceRecord];
}>();
const record = ref<ProcurementFinanceRecord>();
const loading = ref(false);
const saving = ref(false);
const submitting = ref(false);
const pageError = ref('');
const files = ref<ProcurementFinanceFile[]>([]);
const draftFiles = ref<File[]>([]);
const actionFiles = ref<File[]>([]);
const canUpload = ref(false);
const enabled = ref(false);
const formRef = ref<InstanceType<typeof FinanceForm>>();
const reimbursementRef = ref<InstanceType<typeof ReimbursementForm>>();
const userNames = ref<Record<string, string>>({});
const fileInput = ref<HTMLInputElement>();
const actionDefinition = ref<ActionDefinition>();
const actionOpen = ref(false);
const related = ref<{
  context: Record<string, unknown>;
  type: ProcurementFinanceType;
}>();
const childOpen = computed(() => actionOpen.value || !!related.value);
const busy = computed(() => saving.value || submitting.value);
const operationKeys = new Map<string, string>();
const uploadKeys = new WeakMap<File, string>();
let sequence = 0;
let relatedRefreshSequence = 0;
const type = computed(() => record.value?.type ?? props.type);
const planAvailable = computed(() => {
  const periods = rows(record.value?.periods);
  return periods.every(
    (period) =>
      period.availableRequestAmount !== undefined &&
      period.availableRequestAmount !== null,
  )
    ? sumAmounts(periods.map((period) => period.availableRequestAmount))
    : '待计算';
});
const supportsActionFiles = computed(
  () =>
    type.value === 'PAYMENT' &&
    (actionDefinition.value?.action === 'COMPLETE_MIGRATED_PAYMENT' ||
      (actionDefinition.value?.action === 'REVERSE' &&
        ['CONFIRMED', 'PARTIALLY_REVERSED'].includes(
          record.value?.status ?? '',
        ))),
);
const editable = computed(
  () => !record.value || record.value.allowedActions.includes('UPDATE'),
);
const actions = computed(
  () =>
    record.value?.allowedActions.filter(
      (action) => !['APPROVE', 'REJECT', 'UPDATE'].includes(action),
    ) ?? [],
);
const reimbursementDraftActions = computed(() =>
  actions.value.filter((action) => action !== 'SUBMIT'),
);
const returnReason = computed(
  () =>
    [...rows(record.value?.history)]
      .toReversed()
      .find((entry) => entry.action === 'REJECT')?.reason,
);
const allowsPayment = computed(
  () =>
    record.value &&
    ['REIMBURSEMENT', 'REQUEST'].includes(record.value.type) &&
    record.value.status === 'APPROVED' &&
    record.value.summary?.complete !== false &&
    hasPayableBalance(record.value.summary?.availablePaymentAmount),
);
function key(action: string) {
  let value = operationKeys.get(action);
  if (!value) {
    value = newIdempotencyKey();
    operationKeys.set(action, value);
  }
  return value;
}
async function loadFiles() {
  if (!record.value) return;
  const id = record.value.id;
  const run = sequence;
  const listing = await getProcurementFinanceFiles(record.value.id);
  if (run !== sequence || record.value?.id !== id || !props.open) return;
  files.value = listing.items;
  canUpload.value = listing.canUpload;
  enabled.value = listing.enabled;
}
function close() {
  if (busy.value || childOpen.value) return;
  const finish = () => {
    draftFiles.value = [];
    actionFiles.value = [];
    emit('close');
  };
  if (
    draftFiles.value.length + actionFiles.value.length > 0 ||
    reimbursementRef.value?.isDirty()
  )
    Modal.confirm({
      title: '关闭当前单据？',
      content: '当前填写内容或待上传附件尚未保存，关闭后将清除。',
      okText: '关闭',
      onOk: finish,
    });
  else finish();
}
function closeAction() {
  if (saving.value) return;
  const finish = () => {
    actionFiles.value = [];
    actionOpen.value = false;
  };
  if (actionFiles.value.length > 0)
    Modal.confirm({
      title: '关闭当前办理？',
      content: '待上传凭据尚未保存，关闭后将清除。',
      okText: '关闭',
      onOk: finish,
    });
  else finish();
}
async function load() {
  const run = ++sequence;
  loading.value = false;
  record.value = undefined;
  files.value = [];
  draftFiles.value = [];
  actionFiles.value = [];
  pageError.value = '';
  operationKeys.clear();
  if (props.type === 'REIMBURSEMENT') {
    void getDirectory(0)
      .then((directory) => {
        if (run === sequence)
          userNames.value = Object.fromEntries(
            directory.users.map((user) => [String(user.id), user.nickname]),
          );
      })
      .catch(() => {
        /* IDs remain visible when the directory is temporarily unavailable. */
      });
  }
  if (!props.recordId) return;
  loading.value = true;
  try {
    const value = await getProcurementFinance(props.recordId);
    if (run !== sequence) return;
    record.value = value;
    await loadFiles();
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => [props.open, props.recordId, props.type],
  () => {
    actionOpen.value = false;
    related.value = undefined;
    if (props.open) void load();
    else sequence++;
  },
  { immediate: true },
);
async function save(payload: Record<string, unknown>, quiet = false) {
  if (saving.value) return undefined;
  const run = sequence;
  saving.value = true;
  pageError.value = '';
  try {
    const pendingFiles =
      type.value === 'REIMBURSEMENT'
        ? (reimbursementRef.value?.pendingAttachments() ?? [])
        : draftFiles.value;
    const value = record.value
      ? await procurementFinanceActionWithAttachments(
          record.value.id,
          {
            action: 'UPDATE',
            expectedVersion: record.value.version,
            idempotencyKey: key('UPDATE'),
            payload,
          },
          pendingFiles,
        )
      : await createProcurementFinanceWithAttachments(
          {
            type: props.type,
            idempotencyKey: key('CREATE'),
            payload,
          },
          pendingFiles,
        );
    if (run !== sequence || !props.open) return undefined;
    draftFiles.value = [];
    record.value = value;
    await nextTick();
    reimbursementRef.value?.markSaved();
    operationKeys.delete('UPDATE');
    operationKeys.delete('CREATE');
    emit('updated', value);
    await loadFiles();
    if (!quiet) message.success('草稿已保存');
    return value;
  } catch (error) {
    if (run === sequence && props.open) pageError.value = errorText(error);
    return undefined;
  } finally {
    saving.value = false;
  }
}
async function submitDocument(payload: Record<string, unknown>) {
  if (busy.value || childOpen.value) return;
  const run = sequence;
  submitting.value = true;
  try {
    const saved = await save(payload, true);
    if (
      !saved ||
      run !== sequence ||
      record.value?.id !== saved.id ||
      !props.open
    )
      return;
    await execute('SUBMIT', {}, key('SUBMIT'), true);
  } finally {
    submitting.value = false;
  }
}
async function openAction(action: string) {
  if (busy.value) return;
  actionFiles.value = [];
  if (['CONFIRM', 'SUBMIT'].includes(action)) {
    void execute(action, {}, key(action));
    return;
  }
  const fields = [field('reason', '原因与依据', 'textarea')];
  if (action === 'COMPLETE_MIGRATED_PAYMENT' && record.value) {
    const id = record.value.id;
    const run = sequence;
    try {
      const entities = await getProcurementSettings('entities', {
        active: true,
        usage: 'PAY',
      });
      if (!props.open || record.value?.id !== id || run !== sequence) return;
      const missing = [
        selectField('currency', '原付款币种', currencyOptions, {
          required: false,
        }),
        field('amount', '原付款金额', 'decimal', {
          min: 0.000001,
          required: false,
        }),
        field('paidAt', '实际付款日期', 'date', { required: false }),
        selectField(
          'payerEntityId',
          '实际付款主体',
          entities.map((entity) => ({ value: entity.id, label: entity.name })),
          { required: false },
        ),
        field('payerAccount', '付款账户', undefined, { required: false }),
        field('payeeName', '收款人', undefined, { required: false }),
        field('payeeAccount', '收款账户', undefined, { required: false }),
      ].filter((item) => needsImportedValue(record.value?.[item.key]));
      fields.unshift(
        ...missing,
        selectField(
          'evidenceRef',
          '核实凭证',
          files.value.map((file) => ({ value: file.id, label: file.name })),
        ),
      );
    } catch (error) {
      pageError.value = errorText(error);
      return;
    }
  }
  if (action === 'REDUCE_REMAINING')
    fields.unshift(field('amount', '调整后申请总额', 'decimal', { min: 0 }));
  if (action === 'REVERSE' && type.value === 'PAYMENT')
    fields.unshift(
      field('amount', '本次退款 / 冲销金额', 'decimal', { min: 0.000001 }),
      field('occurredDate', '实际发生日期', 'date'),
      selectField(
        'evidenceRef',
        '退款 / 冲销凭证',
        files.value.map((file) => ({ value: file.id, label: file.name })),
      ),
    );
  actionDefinition.value = {
    action,
    title: actionNames[action] ?? action,
    description:
      action === 'WITHDRAW'
        ? '撤回成功后将保留在当前单据，立即开放草稿编辑。已有付款等执行记录时以后台实际阻断信息为准。'
        : '此操作保留历史记录，并按当前版本核验关联执行。',
    fields,
  };
  actionOpen.value = true;
}
async function execute(
  action: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  alreadySaved = false,
) {
  if (saving.value || !record.value) return;
  const run = sequence;
  pageError.value = '';
  if (
    ['CONFIRM', 'SUBMIT'].includes(action) &&
    editable.value &&
    formRef.value &&
    !alreadySaved
  ) {
    const saved = await save(formRef.value.payload());
    if (
      !saved ||
      run !== sequence ||
      record.value?.id !== saved.id ||
      !props.open
    )
      return;
  }
  saving.value = true;
  try {
    const value = await procurementFinanceActionWithAttachments(
      record.value.id,
      {
        action,
        expectedVersion: record.value.version,
        idempotencyKey,
        payload,
      },
      actionFiles.value,
    );
    if (run !== sequence || !props.open) return;
    actionFiles.value = [];
    record.value = value;
    operationKeys.delete(action);
    actionOpen.value = false;
    emit('updated', value);
    await loadFiles();
    let successMessage = '操作已完成';
    if (action === 'WITHDRAW') successMessage = '已撤回，可在当前页面直接编辑';
    else if (action === 'SUBMIT')
      successMessage = '单据已生效，可继续办理付款与成本归集';
    message.success(successMessage);
  } catch (error) {
    if (run === sequence && props.open) pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !record.value) return;
  if (editable.value && formRef.value) {
    const saved = await save(formRef.value.payload());
    if (!saved) return;
  }
  saving.value = true;
  try {
    await uploadProcurementFinanceFile(record.value.id, file, {
      expectedVersion: record.value.version,
      idempotencyKey:
        uploadKeys.get(file) ??
        (() => {
          const value = newIdempotencyKey();
          uploadKeys.set(file, value);
          return value;
        })(),
    });
    record.value = await getProcurementFinance(record.value.id);
    emit('updated', record.value);
    await loadFiles();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
async function download(file: ProcurementFinanceFile) {
  if (!record.value) return;
  try {
    downloadBlob(
      await downloadProcurementFinanceFile(record.value.id, file.id),
      file.name,
    );
  } catch (error) {
    pageError.value = errorText(error);
  }
}
async function downloadSource(file: BusinessDocumentFile) {
  const id = record.value?.sourceAttachmentDocumentId;
  if (!id) return;
  try {
    downloadBlob(await downloadBusinessDocumentFile(id, file.id), file.name);
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function pay() {
  if (!record.value || childOpen.value || saving.value) return;
  createRelated('PAYMENT', {
    sourceDocumentId: record.value.id,
    contractId: record.value.contractId,
    orderId: record.value.orderId,
    payerEntityId: record.value.payerEntityId,
    currency: record.value.currency,
    amount: record.value.summary?.availablePaymentAmount,
    payeeName: record.value.payeeName,
    payeeAccount: record.value.payeeAccount,
  });
}
function requestPeriod(period: Record<string, unknown>) {
  if (!record.value || childOpen.value || saving.value) return;
  createRelated('REQUEST', {
    contractId: record.value.contractId,
    orderId: record.value.orderId,
    currency: record.value.currency,
    planId: record.value.id,
    periodId: period.id,
    payerEntityId: period.payerEntityId,
    amount: period.availableRequestAmount ?? period.amount,
    name: period.name,
  });
}
function createRelated(
  type: ProcurementFinanceType,
  context: Record<string, unknown>,
) {
  related.value = { type, context };
}
function allocateCosts() {
  if (!record.value || childOpen.value || saving.value) return;
  createRelated('COST_ALLOCATION', {
    sourceType: 'REIMBURSEMENT',
    sourceDocumentId: record.value.id,
    contractId: record.value.contractId,
    orderId: record.value.orderId,
    currency: record.value.currency,
    costScope: 'ORDER',
  });
}
async function relatedUpdated() {
  const id = record.value?.id;
  const run = sequence;
  const refresh = ++relatedRefreshSequence;
  if (!id) return;
  try {
    const value = await getProcurementFinance(id);
    if (
      !props.open ||
      run !== sequence ||
      refresh !== relatedRefreshSequence ||
      record.value?.id !== id
    )
      return;
    record.value = value;
    emit('updated', value);
  } catch (error) {
    if (props.open && run === sequence && refresh === relatedRefreshSequence)
      pageError.value = errorText(error);
  }
}
</script>
<template>
  <Drawer
    :open="open"
    :title="
      record
        ? `${financeTitles[type]} · ${record.code}`
        : `新建${financeTitles[type]}`
    "
    :width="type === 'REIMBURSEMENT' ? 'min(1440px,98vw)' : 'min(1180px,97vw)'"
    :mask-closable="!busy && !childOpen"
    :closable="!busy && !childOpen"
    :keyboard="!busy && !childOpen"
    @close="close"
  >
    <Space direction="vertical" size="middle" style="width: 100%">
      <Alert v-if="pageError" type="error" :message="pageError" /><Alert
        v-if="loading"
        type="info"
        message="正在读取当前单据…"
      /><template v-else>
        <Descriptions
          v-if="record && type !== 'REIMBURSEMENT'"
          bordered
          size="small"
          :column="3"
        >
          <Descriptions.Item label="名称">{{ record.name }}</Descriptions.Item><Descriptions.Item label="状态">
            <Tag>{{ financeStatus(record.status) }}</Tag>
</Descriptions.Item><Descriptions.Item label="单据金额">
            {{ record.currency || '币种未注明' }}
            {{ record.amount ?? '金额未注明' }}
</Descriptions.Item><Descriptions.Item label="关联合同">
            <RelatedLink :target="contractTarget(record.contractId)">
              {{
                contractReferenceText(
                  record.contractCode,
                  record.contractName,
                  record.contractId,
                )
              }}
            </RelatedLink>
</Descriptions.Item><Descriptions.Item label="关联采购单">
            <RelatedLink
              :target="
                documentTarget('orders', record.contractId, record.orderId)
              "
            >
              {{ record.orderCode ?? '查看采购单' }}
            </RelatedLink>
</Descriptions.Item><Descriptions.Item
            v-if="
              type === 'PAYMENT_PLAN' ||
              record.summary?.availablePaymentAmount !== undefined
            "
            :label="type === 'PAYMENT_PLAN' ? '尚可请款' : '可付余额'"
          >
            {{
              record.summary?.complete === false
                ? '资料待补齐'
                : type === 'PAYMENT_PLAN'
                  ? planAvailable
                  : payableBalance(record)
            }}
</Descriptions.Item><Descriptions.Item
            v-if="type === 'PAYMENT'"
            label="人民币金额 / 实际汇率日期"
          >
            {{
              record.rmbAmount ??
              (record.migration ? '未提供人民币折算依据' : '确认付款后计算')
            }}
            /
            {{
              record.exchange?.rateDate ??
              (record.migration ? '未提供' : '待确认')
            }}
          </Descriptions.Item>
</Descriptions><MigrationSource
          v-if="record"
          :migration="record.migration"
          :block-reasons="record.blockReasons"
          :native-source="{ kind: 'PROC_FINANCE', nativeId: record.id }"
        /><Space v-if="type !== 'REIMBURSEMENT'" wrap>
          <Button
            v-for="action in actions"
            :key="action"
            :loading="saving"
            :disabled="childOpen"
            :danger="['REVERSE', 'CANCEL'].includes(action)"
            @click="openAction(action)"
          >
            {{
              action === 'CONFIRM'
                ? type === 'PAYMENT'
                  ? '确认实际付款'
                  : '确认已保存资料'
                : (actionNames[action] ?? action)
            }}
</Button><Button
            v-if="allowsPayment"
            :disabled="childOpen || saving"
            type="primary"
            @click="pay"
          >
            登记本次付款
          </Button>
        </Space>
        <Alert
          v-if="type === 'REIMBURSEMENT' && record?.status === 'REJECTED'"
          type="warning"
          show-icon
          :message="`待补充资料：${returnReason || '请补齐资料后提交生效。'}`"
        />
        <ReimbursementForm
          v-if="editable && type === 'REIMBURSEMENT'"
          ref="reimbursementRef"
          :record="record"
          :context="context"
          :files="files"
          :saving="busy"
          @save="(payload) => save(payload)"
          @submit="submitDocument"
        />
        <ReimbursementDetail
          v-else-if="record && type === 'REIMBURSEMENT'"
          :record="record"
          :files="files"
          :user-names="userNames"
          :busy="busy || childOpen"
          @action="openAction"
          @pay="pay"
          @allocate="allocateCosts"
          @download="download"
        />
        <FinanceForm
          v-else-if="editable"
          ref="formRef"
          :type="type"
          :record="record"
          :context="context"
          :files="files"
          :saving="busy"
          :pending-files-count="draftFiles.length"
          @save="(payload) => save(payload)"
          @submit="submitDocument"
        >
          <template #attachments>
            <CreationAttachments
              v-model:files="draftFiles"
              :disabled="saving"
            />
          </template>
</FinanceForm><template v-else-if="record">
          <RecordTable
            v-if="type === 'PAYMENT_PLAN'"
            :data="rows(record.periods)"
            :columns="[
              { key: 'name', title: '期次' },
              { key: 'amount', title: '金额' },
              { key: 'payerSnapshot.name', title: '付款主体' },
              { key: 'availableRequestAmount', title: '尚可请款' },
              { key: 'dueDate', title: '到期日' },
              { key: 'condition', title: '付款条件' },
              { key: 'action', title: '办理' },
            ]"
          >
            <template #action="{ record: period }">
              <Button
                v-if="
                  record.status === 'CONFIRMED' &&
                  hasPayableBalance(
                    period.availableRequestAmount ?? period.amount,
                  )
                "
                type="link"
                :disabled="childOpen || saving"
                @click="requestPeriod(period)"
              >
                发起本期请款
              </Button>
            </template>
          </RecordTable>
          <div v-if="type === 'COST_ALLOCATION'">
            <Card
              v-for="(group, index) in rows(record.groups)"
              :key="String(group.id ?? index)"
              :title="`分配组 ${index + 1} · 基数 ${group.baseAmount}`"
              size="small"
            >
              <RecordTable
                :data="rows(group.allocations)"
                :columns="[
                  { key: 'entitySnapshot.name', title: '成本主体' },
                  { key: 'amount', title: '分配金额' },
                  { key: 'percentage', title: '比例' },
                  { key: 'roundingAdjustment', title: '尾差调整' },
                ]"
              />
            </Card>
          </div>
          <Descriptions :column="2" bordered size="small">
            <Descriptions.Item label="付款主体">
              {{
                record.payerSnapshot?.name ?? record.payerEntityId ?? '—'
              }}
</Descriptions.Item><Descriptions.Item label="收款人">
              {{ record.payeeName ?? '—' }}
</Descriptions.Item><Descriptions.Item label="收款账户">
              {{ record.payeeAccount ?? '—' }}
</Descriptions.Item><Descriptions.Item v-if="record.exchange" label="人民币参考汇率">
              1 {{ record.currency }} = {{ record.exchange.rateToCny }} CNY ·
              {{ record.exchange.source }} ·
              {{
                record.exchange.fallback ? '采用此前公布值' : '匹配发生日'
              }}
</Descriptions.Item><Descriptions.Item v-if="type === 'REQUEST'" label="代付说明">
              {{ record.agencyReason || '无代付说明' }}
</Descriptions.Item><Descriptions.Item label="说明">
              {{ record.remark ?? '—' }}
            </Descriptions.Item>
          </Descriptions>
        </template>
        <Space
          v-if="
            type === 'REIMBURSEMENT' &&
            editable &&
            reimbursementDraftActions.length
          "
          wrap
        >
          <Button
            v-for="action in reimbursementDraftActions"
            :key="action"
            :disabled="busy || childOpen"
            :danger="action === 'CANCEL'"
            @click="openAction(action)"
          >
            {{ actionNames[action] ?? action }}
          </Button>
        </Space>
        <Card v-if="record" title="凭证附件" size="small">
          <Space>
            <Button
              v-if="!editable"
              :disabled="!canUpload || !enabled || saving"
              @click="fileInput?.click()"
            >
              上传凭证
</Button><span v-if="!enabled">附件存储未启用</span>
</Space><input ref="fileInput" type="file" hidden @change="upload" /><Table
            :data-source="files"
            row-key="id"
            :columns="[
              { title: '文件', dataIndex: 'name' },
              { title: '大小', dataIndex: 'size' },
              { title: '操作', key: 'action' },
            ]"
          >
            <template #bodyCell="{ column, record: file }">
              <Button
                v-if="column.key === 'action'"
                type="link"
                @click="download(file as ProcurementFinanceFile)"
              >
                下载
              </Button>
            </template>
          </Table>
</Card><Card
          v-if="record?.sourceAttachments?.length"
          title="原付款来源凭据"
          size="small"
        >
          <Table
            :data-source="record.sourceAttachments"
            row-key="id"
            :columns="[
              { title: '原水单 / 凭据', dataIndex: 'name' },
              { title: '大小（字节）', dataIndex: 'size' },
              { title: '操作', key: 'action' },
            ]"
          >
            <template #bodyCell="{ column, record: file }">
              <Button
                v-if="column.key === 'action'"
                type="link"
                @click="downloadSource(file as BusinessDocumentFile)"
              >
                下载
              </Button>
            </template>
          </Table>
</Card><Card
          v-if="record && rows(record.reversals).length"
          title="已登记退款与冲销"
          size="small"
        >
          <RecordTable
            :data="rows(record.reversals)"
            :columns="[
              { key: 'amount', title: '原币退款金额' },
              { key: 'rmbAmount', title: '人民币冲回金额' },
              { key: 'occurredDate', title: '发生日期' },
              { key: 'reason', title: '原因' },
            ]"
          />
</Card><Card v-if="record" title="操作记录" size="small">
          <RecordTable
            :data="
              rows(record.history).map((entry) => ({
                ...entry,
                actorId: userNames[String(entry.actorId)] || entry.actorId,
                at:
                  formatDate(
                    entry.at == null ? undefined : String(entry.at),
                    'YYYY-MM-DD HH:mm',
                  ) || '—',
                action:
                  actionNames[String(entry.action)] ??
                  (entry.action === 'CREATE' ? '新建草稿' : entry.action),
              }))
            "
            :columns="[
              { key: 'action', title: '操作' },
              { key: 'actorId', title: '经办人' },
              { key: 'at', title: '时间' },
              { key: 'reason', title: '原因' },
            ]"
          />
        </Card>
      </template>
</Space><ActionDialog
      :open="actionOpen"
      :definition="actionDefinition"
      :saving="saving"
      :error="pageError"
      :evidence-ready="actionFiles.length > 0"
      @close="closeAction"
      @submit="
        (payload, key) => execute(actionDefinition!.action, payload, key)
      "
    >
      <template #attachments>
        <CreationAttachments
          v-if="supportsActionFiles"
          v-model:files="actionFiles"
          :disabled="saving"
        />
      </template>
    </ActionDialog>
  </Drawer>
  <FinanceDocument
    v-if="related"
    :open="open"
    :type="related.type"
    :context="related.context"
    @close="related = undefined"
    @updated="relatedUpdated"
  />
</template>
