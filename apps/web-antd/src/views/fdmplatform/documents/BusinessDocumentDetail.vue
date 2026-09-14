<script setup lang="ts">
import type { ActionDefinition } from '../data';
import type { DocumentKind } from './model';

import type { Contract, Directory } from '#/api/fdmplatform';
import type {
  BusinessDocument,
  BusinessDocumentFile,
} from '#/api/fdmplatform/business-documents';

import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

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
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getContract,
  getDirectory,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  downloadBusinessDocumentFile,
  getBusinessDocument,
  getBusinessDocumentFiles,
  uploadBusinessDocumentFile,
} from '#/api/fdmplatform/business-documents';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import { businessDocumentActionWithAttachments } from '#/api/fdmplatform/submissions';

import ActionDialog from '../components/ActionDialog.vue';
import CreationAttachments from '../components/CreationAttachments.vue';
import RecordTable from '../components/RecordTable.vue';
import { errorText, label, rows } from '../data';
import { downloadBlob } from '../purchase/manage/model';
import {
  businessDocumentActionDefinition,
  businessDocumentActionDisabled,
  businessDocumentActionTitle,
  businessDocumentLines,
  nativeTypeLabels,
  requireBusinessDocumentKind,
} from './business-document-model';
import ContractPicker from './ContractPicker.vue';
import { contractReferenceText, nativeMoney } from './migration-display';
import MigrationSource from './MigrationSource.vue';
import { contractTarget, entityTarget, withoutDetailQuery } from './navigation';
import RelatedLink from './RelatedLink.vue';

const props = defineProps<{
  contractId?: string;
  embedded?: boolean;
  id?: string;
  kind?: DocumentKind;
  open: boolean;
}>();
const emit = defineEmits<{ close: []; updated: [BusinessDocument] }>();
const route = useRoute();
const router = useRouter();
const view = ref<BusinessDocument>();
const directory = ref<Directory>();
provide('fdmPlatformDirectory', directory);
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const actionError = ref('');
const actionOpen = ref(false);
const pickerOpen = ref(false);
const childOpen = computed(
  () => saving.value || actionOpen.value || pickerOpen.value,
);
const selectedContract = ref<Contract>();
const definition = ref<ActionDefinition>();
const draftFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement>();
const attachments = ref<Awaited<ReturnType<typeof getBusinessDocumentFiles>>>();
const fileError = ref('');
const uploadKeys = new WeakMap<File, string>();
const supportsAttachments = computed(() =>
  [
    'CONFIRM_INVOICE',
    'CONFIRM_PAYMENT_SOURCE',
    'CONFIRM_REFUND_SOURCE',
    'MATCH_SOURCE',
    'RECORD_ARRIVAL',
    'SAVE_DETAILS',
    'VOID_INVOICE',
  ].includes(definition.value?.action ?? ''),
);
let sequence = 0;
let actionSequence = 0;
const lines = computed(() =>
  view.value ? businessDocumentLines(view.value) : [],
);
const title = computed(() =>
  view.value
    ? `${nativeTypeLabels[view.value.type] ?? '业务单据'} · ${view.value.code || view.value.name || view.value.record.name || ''}`
    : '单据详情',
);
const actions = computed(
  () =>
    view.value?.allowedActions.filter((action) =>
      businessDocumentActionTitle(action),
    ) ?? [],
);
const record = computed(() => view.value?.record);
async function load() {
  const run = ++sequence;
  view.value = undefined;
  attachments.value = undefined;
  fileError.value = '';
  draftFiles.value = [];
  pageError.value = '';
  actionOpen.value = false;
  pickerOpen.value = false;
  ++actionSequence;
  if (!props.open || !props.id) return;
  loading.value = true;
  try {
    const [value, people] = await Promise.all([
      getBusinessDocument(props.id),
      getDirectory(0),
    ]);
    if (run !== sequence || !props.open) return;
    if (
      props.embedded &&
      props.contractId &&
      value.contractId !== props.contractId
    )
      throw new Error('此单据不属于当前合同，请刷新后重新选择');
    view.value = requireBusinessDocumentKind(value, props.kind);
    directory.value = people;
    await loadFiles();
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function loadFiles() {
  const id = view.value?.id;
  if (!id) return;
  fileError.value = '';
  try {
    const value = await getBusinessDocumentFiles(id);
    if (view.value?.id === id) attachments.value = value;
  } catch (error) {
    if (view.value?.id === id) fileError.value = errorText(error);
  }
}
async function download(file: BusinessDocumentFile) {
  if (!view.value) return;
  try {
    downloadBlob(
      await downloadBusinessDocumentFile(view.value.id, file.id),
      file.name,
    );
  } catch (error) {
    fileError.value = errorText(error);
  }
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  const current = view.value;
  if (!file || !current) return;
  saving.value = true;
  fileError.value = '';
  try {
    let key = uploadKeys.get(file);
    if (!key) {
      key = newIdempotencyKey();
      uploadKeys.set(file, key);
    }
    const result = await uploadBusinessDocumentFile(current.id, file, {
      expectedVersion: current.version,
      idempotencyKey: key,
    });
    if (view.value?.id === current.id) {
      view.value = { ...current, version: result.version };
      emit('updated', view.value);
      await loadFiles();
    }
  } catch (error) {
    fileError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
watch(
  () => [props.open, props.id, props.kind, props.contractId, props.embedded],
  () => {
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
  ++actionSequence;
});
function discardFiles(done: () => void) {
  if (saving.value) return;
  if (draftFiles.value.length > 0)
    Modal.confirm({
      title: '关闭当前办理？',
      content: `${draftFiles.value.length} 个附件尚未提交，关闭后将清除。`,
      okText: '关闭',
      onOk: () => {
        draftFiles.value = [];
        done();
      },
    });
  else done();
}
function closeAction() {
  discardFiles(() => {
    actionOpen.value = false;
  });
}
function close() {
  if (!childOpen.value) {
    discardFiles(() => {
      ++sequence;
      ++actionSequence;
      actionOpen.value = false;
      pickerOpen.value = false;
      emit('close');
    });
  }
}
async function openAction(action: string) {
  if (!view.value || childOpen.value) return;
  actionError.value = '';
  selectedContract.value = undefined;
  draftFiles.value = [];
  if (action === 'MATCH_SOURCE') {
    if (view.value.contractId) {
      void chooseContract({ id: view.value.contractId } as Contract);
      return;
    }
    if (props.embedded) {
      pageError.value = '此单据未关联当前合同，请刷新后重新选择';
      return;
    }
    pickerOpen.value = true;
    return;
  }
  if (action === 'CONFIRM_REFUND_SOURCE') {
    const id = view.value.id;
    const run = ++actionSequence;
    if (!view.value.contractId) {
      pageError.value = '请先关联此退款的真实合同';
      return;
    }
    try {
      const value = await getContract(view.value.contractId);
      if (run !== actionSequence || view.value?.id !== id || !props.open)
        return;
      selectedContract.value = value;
    } catch (error) {
      pageError.value = errorText(error);
      return;
    }
  }
  definition.value = businessDocumentActionDefinition(
    view.value,
    action,
    directory.value,
    selectedContract.value,
  );
  if (action === 'CONFIRM_PAYMENT_SOURCE' && definition.value) {
    const id = view.value.id;
    const run = ++actionSequence;
    try {
      const entities = await getProcurementSettings('entities', {
        active: true,
        usage: 'PAY',
      });
      if (run !== actionSequence || view.value?.id !== id || !props.open)
        return;
      definition.value.fields = definition.value.fields.map((field) =>
        field.key === 'payerEntityId'
          ? {
              ...field,
              options: entities.map((entity) => ({
                value: entity.id,
                label: entity.name,
              })),
            }
          : field,
      );
    } catch (error) {
      pageError.value = errorText(error);
      return;
    }
  }
  if (definition.value) {
    definition.value = {
      ...definition.value,
      fields: definition.value.fields.map((field) =>
        field.key === 'evidenceRef'
          ? {
              ...field,
              options: (attachments.value?.items ?? []).map((file) => ({
                value: file.id,
                label: file.name,
              })),
              hint: '选择本单已上传凭据，或在下方添加本次附件。',
            }
          : field,
      ),
    };
  }
  actionOpen.value = Boolean(definition.value);
}
async function chooseContract(row: Contract) {
  if (props.embedded && row.id !== props.contractId) return;
  const run = ++actionSequence;
  pickerOpen.value = false;
  loading.value = true;
  pageError.value = '';
  try {
    const contract = await getContract(row.id);
    if (run !== actionSequence || !view.value || !props.open) return;
    selectedContract.value = contract;
    definition.value = businessDocumentActionDefinition(
      view.value,
      'MATCH_SOURCE',
      directory.value,
      contract,
    );
    actionOpen.value = Boolean(definition.value);
  } catch (error) {
    if (run === actionSequence) pageError.value = errorText(error);
  } finally {
    if (run === actionSequence) loading.value = false;
  }
}
async function submit(
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  if (!view.value || !definition.value) return;
  const id = view.value.id;
  saving.value = true;
  actionError.value = '';
  try {
    if (
      ['CONFIRM_PAYMENT_SOURCE', 'CONFIRM_REFUND_SOURCE'].includes(
        definition.value.action,
      ) &&
      payload.confirmExecuted !== true
    )
      throw new Error('请先核实款项确已实际付出，再勾选确认');
    if (
      definition.value.action === 'RECORD_ARRIVAL' &&
      new BigNumber(String(payload.acceptedQuantity ?? 0)).isPositive() &&
      !payload.stockPoolId
    )
      throw new Error('有合格入库数量时请选择对应库存池');
    const clean = { ...payload };
    delete clean.selectedSkuId;
    delete clean.selectedSpecVersion;
    const value = await businessDocumentActionWithAttachments(
      id,
      {
        action: definition.value.action,
        expectedVersion: view.value.version,
        idempotencyKey,
        payload: clean,
      },
      draftFiles.value,
    );
    if (view.value?.id !== id) return;
    view.value = value;
    actionOpen.value = false;
    draftFiles.value = [];
    emit('updated', value);
    void loadFiles();
    if (
      !props.embedded &&
      (value.status === 'LINKED' || value.record.status === 'LINKED') &&
      value.type === 'PURCHASE_PAYMENT'
    ) {
      await router.replace({
        path: '/caiwu/platform-procurement-payments',
        query: { financeId: value.id },
      });
    } else if (
      !props.embedded &&
      (value.status === 'LINKED' || value.record.status === 'LINKED') &&
      value.contractId
    ) {
      await router.replace({
        query: {
          ...withoutDetailQuery(route.query),
          contractId: value.contractId,
          documentId: value.record.id,
        },
      });
    }
    message.success('单据已更新');
  } catch (error) {
    actionError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <Drawer
    :open="open"
    :title="title"
    :width="1140"
    :closable="!childOpen"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    @close="close"
  >
    <Spin :spinning="loading">
      <Space direction="vertical" size="middle" style="width: 100%">
        <Alert v-if="pageError" type="error" show-icon :message="pageError" />
        <template v-if="view">
          <Space wrap>
            <Button
              v-for="action in actions"
              :key="action"
              :disabled="
                saving || Boolean(businessDocumentActionDisabled(view, action))
              "
              :title="businessDocumentActionDisabled(view, action)"
              @click="openAction(action)"
            >
              {{ businessDocumentActionTitle(action) }}
</Button><Button :disabled="childOpen" @click="load">刷新</Button>
          </Space>
          <Card size="small" title="单据概要">
            <Descriptions :column="3" size="small">
              <Descriptions.Item label="单号">
                {{ view.code || record?.code || '未注明' }}
              </Descriptions.Item>
              <Descriptions.Item label="单据名称">
                {{ view.name || record?.name || '未注明' }}
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag>{{ label(record?.status) }}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="公司">
                {{
                  directory?.companies.find(
                    (item) => item.companyId === view?.companyId,
                  )?.companyName ||
                  view.companyName ||
                  '待补齐'
                }}
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                {{ view.amount ?? record?.amount ?? '未注明' }}
                {{ view.currency || record?.currency || '（币种待补齐）' }}
              </Descriptions.Item>
              <Descriptions.Item label="关联合同">
                <RelatedLink :target="contractTarget(view.contractId)">
                  {{
                    contractReferenceText(
                      view.contractCode,
                      view.contractName,
                      view.contractId,
                    )
                  }}
                </RelatedLink>
              </Descriptions.Item>
              <Descriptions.Item
                v-if="record?.sourceBookAmount != null"
                label="原账面金额"
              >
                {{
                  nativeMoney(
                    record.sourceBookAmount,
                    record.sourceBookCurrency,
                  )
                }}
              </Descriptions.Item>
              <Descriptions.Item label="客户">
                <RelatedLink
                  :target="
                    entityTarget(
                      'customer',
                      view.customerId ?? record?.customerId,
                    )
                  "
                >
                  {{ view.customerName || record?.customerName || '未注明' }}
                </RelatedLink>
              </Descriptions.Item>
              <Descriptions.Item label="供应商">
                <RelatedLink
                  :target="
                    entityTarget(
                      'supplier',
                      view.supplierId ?? record?.supplierId,
                    )
                  "
                >
                  {{ view.supplierName || record?.supplierName || '未注明' }}
                </RelatedLink>
              </Descriptions.Item>
              <Descriptions.Item
                v-if="record?.invoiceNumber || record?.invoiceNo"
                label="发票号码"
              >
                {{ record.invoiceNumber || record.invoiceNo }}
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <MigrationSource
            :native-source="{ kind: 'BUSINESS_DOCUMENT', nativeId: view.id }"
            :migration="view.migration"
            :block-reasons="view.blockReasons"
          />
          <Card v-if="lines.length" size="small" title="产品明细">
            <Table
              :data-source="lines"
              row-key="id"
              size="small"
              :pagination="{ pageSize: 20 }"
              :scroll="{ x: 1100 }"
              :columns="[
                { title: '产品', key: 'product' },
                { title: '规格', key: 'specification' },
                { title: '单位', dataIndex: 'unit' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '单价', dataIndex: 'unitPrice' },
                { title: '金额', dataIndex: 'amount' },
                { title: '已到货', dataIndex: 'arrivedQuantity' },
                { title: '已退货', dataIndex: 'returnedQuantity' },
                { title: '已取消', dataIndex: 'cancelledQuantity' },
              ]"
            >
              <template #bodyCell="{ column, record: line }">
                <RelatedLink
                  v-if="column.key === 'product'"
                  :target="entityTarget('product', line.skuId)"
                >
                  {{
                    line.skuName ||
                    line.productName ||
                    line.name ||
                    '待关联产品'
                  }}
</RelatedLink><span v-else-if="column.key === 'specification'">{{
                  line.specification ||
                  line.specificationSnapshot?.specification ||
                  '未注明'
                }}</span>
              </template>
            </Table>
          </Card>
          <Card
            v-if="rows(record?.arrivals).length"
            size="small"
            title="到货记录"
          >
            <RecordTable
              :data="rows(record?.arrivals)"
              :columns="[
                { key: 'quantity', title: '到货数量' },
                { key: 'acceptedQuantity', title: '合格数量' },
                { key: 'batchNo', title: '批次' },
                { key: 'evidenceRef', title: '凭证' },
                { key: 'occurredAt', title: '登记时间' },
              ]"
            />
          </Card>
          <Card v-if="view.history?.length" title="办理记录" size="small">
            <RecordTable
              :data="
                view.history.map((entry, index) => ({
                  ...entry,
                  id: entry.id ?? String(index),
                  action:
                    businessDocumentActionTitle(String(entry.action)) ??
                    label(entry.action),
                  occurredAt: entry.occurredAt
                    ? formatDate(String(entry.occurredAt), 'YYYY-MM-DD HH:mm')
                    : '未记录',
                }))
              "
              :columns="[
                { key: 'action', title: '操作' },
                { key: 'reason', title: '原因 / 依据' },
                { key: 'actorId', title: '操作人' },
                { key: 'occurredAt', title: '时间' },
              ]"
            />
          </Card>
          <Card title="单据附件" size="small">
            <Alert v-if="fileError" type="error" :message="fileError" /><Button
              v-if="attachments?.canUpload"
              :disabled="saving || !attachments.enabled"
              @click="fileInput?.click()"
            >
              上传附件
</Button><input ref="fileInput" type="file" hidden @change="upload" /><Table
              :data-source="attachments?.items ?? []"
              row-key="id"
              size="small"
              :columns="[
                { title: '文件', dataIndex: 'name' },
                { title: '大小（字节）', dataIndex: 'size' },
                { title: '操作', key: 'action' },
              ]"
            >
              <template #bodyCell="{ column, record: file }">
                <Button
                  v-if="column.key === 'action'"
                  type="link"
                  @click="download(file as BusinessDocumentFile)"
                >
                  下载
                </Button>
              </template>
            </Table>
          </Card>
        </template>
      </Space>
    </Spin>
  </Drawer>
  <ContractPicker
    :open="pickerOpen && open"
    @close="pickerOpen = false"
    @select="chooseContract"
  />
  <ActionDialog
    :open="actionOpen && open"
    :definition="definition"
    :saving="saving"
    :error="actionError"
    :evidence-ready="draftFiles.length > 0"
    @close="closeAction"
    @submit="submit"
  >
    <template #context>
      <Alert
        v-if="selectedContract"
        type="info"
        :message="`将关联 ${selectedContract.code} · ${selectedContract.name}，请逐项核对对应产品。`"
      />
</template><template #attachments>
      <CreationAttachments
        v-if="supportsAttachments"
        v-model:files="draftFiles"
        :disabled="saving"
      />
    </template>
  </ActionDialog>
</template>
