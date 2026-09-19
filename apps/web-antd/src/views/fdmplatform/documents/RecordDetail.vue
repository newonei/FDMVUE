<script setup lang="ts">
import type { DocumentKind } from './model';
import type {
  RelatedCreation,
  RelatedDocumentSource,
} from './related-creation';

import type {
  AttachmentView,
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
} from '#/api/fdmplatform';
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';

import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Tag,
} from 'ant-design-vue';

import { getAttachments, getContract, getDirectory } from '#/api/fdmplatform';

import AttachmentPanel from '../components/AttachmentPanel.vue';
import { errorText, label, rows } from '../data';
import { personLabel } from '../directory';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
import ProcurementStatusBadge from '../purchase/components/ProcurementStatusBadge.vue';
import { documentAttachmentTarget } from './attachment-target';
import DocumentAction from './DocumentAction.vue';
import LinkedRecordTable from './LinkedRecordTable.vue';
import { migrationCell } from './migration-display';
import MigrationSource from './MigrationSource.vue';
import {
  actionTitle,
  allocationKind,
  currentDocument,
  documentActionUnavailableReason,
  documentDefinitions,
  pendingRequestItems,
} from './model';
import {
  contractTarget,
  entityTarget,
  relatedDocumentLinks,
} from './navigation';
import { relatedCreations } from './related-creation';
import RelatedLink from './RelatedLink.vue';

import '../purchase/components/procurement.css';
const props = defineProps<{
  embedded?: boolean;
  kind: DocumentKind;
  open: boolean;
  row?: DocumentRow;
}>();
const emit = defineEmits<{
  close: [];
  navigate: [kind: DocumentKind];
  updated: [];
}>();
const contract = ref<Contract>();
const record = ref<BusinessRecord>();
const migration = computed(
  () => record.value?.migration as MigrationInfo | undefined,
);
const loading = ref(false);
const pageError = ref('');
const directory = ref<Directory>();
provide('fdmPlatformDirectory', directory);
const attachments = ref<AttachmentView>();
const attachmentError = ref('');
const filesOpen = ref(false);
const allContractFiles = ref(false);
const attachmentTarget = computed(() =>
  record.value
    ? documentAttachmentTarget(props.kind, record.value.id)
    : undefined,
);
const actionOpen = ref(false);
const attachmentBusy = ref(false);
const childOpen = computed(() => actionOpen.value || attachmentBusy.value);
const selectedAction = ref<string>();
const selectedKind = ref<DocumentKind>(props.kind);
const relatedSource = ref<RelatedDocumentSource>();
let sequence = 0;
const config = computed(() => documentDefinitions[props.kind]);
const procurement = computed(() =>
  [
    'arrivals',
    'orders',
    'plans',
    'production',
    'purchaseReturns',
    'quotes',
    'requests',
    'tasks',
  ].includes(props.kind),
);
const title = computed(
  () =>
    record.value?.name ??
    record.value?.invoiceNumber ??
    record.value?.batchNo ??
    config.value.title,
);
const company = computed(
  () =>
    directory.value?.companies.find(
      (item) => item.companyId === contract.value?.companyId,
    )?.companyName ??
    contract.value?.companyName ??
    '',
);
const drawerTitle = computed(() =>
  title.value === config.value.title
    ? config.value.title
    : `${config.value.title} · ${title.value}`,
);
const actions = computed(() =>
  config.value.actions
    .filter((action) => contract.value?.allowedActions.includes(action))
    .filter((action) => {
      if (action === 'ASSIGN_FULFILLMENT')
        return (
          !!contract.value &&
          !!record.value &&
          pendingRequestItems(contract.value, record.value).length > 0
        );
      if (action === 'CONFIRM_RECEIPT')
        return record.value?.status === 'PENDING';
      if (action === 'VOID_INVOICE') return record.value?.status === 'VALID';
      if (action === 'SUBMIT_PLAN')
        return [
          'DRAFT',
          'PARTIALLY_APPROVED',
          'REJECTED',
          'RETURNED',
          'SUBMITTED',
        ].includes(String(record.value?.status));
      if (action === 'UNBIND_ALLOCATION')
        return !record.value?.originalAllocationId;
      if (action === 'REVERSE_COST')
        return (
          !record.value?.originalCostId &&
          !contract.value?.finance?.costs?.some(
            (cost) => cost.originalCostId === record.value?.id,
          )
        );
      return true;
    }),
);
const extraFields = [
  'currency|币种',
  'unit|单位',
  'requiredDate|需求日期',
  'taxIncluded|含税',
  'packagingIncluded|含包装',
  'freightIncluded|含运费',
  'minQuantity|最低数量',
  'maxQuantity|最高数量',
  'confirmed|已核实',
  'remark|说明',
  'reason|原因',
  'rationale|推荐理由',
  'risks|风险',
  'sharedConditions|共同约束',
  'evidenceRef|历史凭证',
  'accountRef|收款账户',
  'exchangeRateToCny|人民币参考汇率',
  'exchangeRateDate|实际汇率日期',
  'exchangeRateSource|汇率来源',
  'exchangeRateFallback|汇率日期匹配',
  'exchangeRateFetchedAt|汇率抓取时间',
  'occurredAt|登记时间',
  'createdAt|创建时间',
];
const fields = computed(() =>
  [
    ...new Map(
      [...config.value.fields, ...extraFields].map((pair) => {
        const [key, name] = pair.split('|');
        return [key!, { key: key!, title: name! }] as const;
      }),
    ).values(),
  ].filter(
    (item) =>
      record.value?.[item.key] !== undefined ||
      (item.key.startsWith('exchangeRate') &&
        ['receipts', 'refunds'].includes(props.kind)),
  ),
);
function display(key: string) {
  if (key === 'allocationType') return allocationKind(record.value!);
  const value = record.value?.[key];
  const formatted =
    migrationCell(record.value ?? {}, key) ??
    receiptFxDisplay(record.value ?? {}, key);
  if (formatted !== undefined && formatted !== null) return formatted;
  if (
    /UserId$/i.test(key) ||
    ['actorId', 'confirmedBy', 'createdBy'].includes(key)
  )
    return personLabel(directory.value, value);
  if (Array.isArray(value))
    return value.map((entry) => label(entry)).join('；');
  return label(value);
}
const lines = computed(() =>
  rows(record.value?.items ?? record.value?.lines).map((line) => ({
    ...line,
    productName: contract.value?.items.find(
      (item) => item.id === line.contractItemId,
    )?.skuName,
    shape:
      (line.specificationSnapshot as undefined | { shape?: string })?.shape ??
      contract.value?.items.find((item) => item.id === line.contractItemId)
        ?.shape ??
      '未维护',
    suggestedSupplier:
      (
        line.specificationSnapshot as
          | undefined
          | { suggestedSupplierName?: string }
      )?.suggestedSupplierName ??
      contract.value?.items.find((item) => item.id === line.contractItemId)
        ?.suggestedSupplierName,
    assignmentName: contract.value?.assignments?.find(
      (item) => item.id === line.assignmentId,
    )?.method,
    supplierName: contract.value?.quotes?.find(
      (item) => item.id === line.quoteId,
    )?.supplierName,
  })),
);
const sourceContext = computed(() =>
  contract.value && record.value
    ? relatedDocumentLinks(contract.value, props.kind, record.value).filter(
        (link) => !['contract', 'customer'].includes(link.target.type),
      )
    : [],
);
function contributionValue(key: string) {
  const value = contribution.value?.[key];
  return value && typeof value === 'object'
    ? ((value as Record<string, unknown>).contribution ?? '未完整')
    : '未完整';
}
const contribution = computed(
  () => contract.value?.profit as Record<string, unknown> | undefined,
);
const lineColumns = computed(() =>
  [
    'productName|产品',
    'shape|形状',
    'suggestedSupplier|建议采购工厂',
    'quantity|数量',
    'requiredDate|需求日期',
    'assignmentName|履约方式',
    'supplierName|供应商',
    'unitPrice|单价',
    'arrivedQuantity|已到数量',
    'acceptedQuantity|合格数量',
    'cancelledQuantity|已取消数量',
    'remark|说明',
  ]
    .map((pair) => {
      const [key, title] = pair.split('|');
      return { key: key!, title: title! };
    })
    .filter((column) =>
      lines.value.some(
        (line) => (line as BusinessRecord)[column.key] !== undefined,
      ),
    ),
);
async function load() {
  if (!props.open || !props.row || childOpen.value) return;
  const current = ++sequence;
  loading.value = true;
  pageError.value = '';
  record.value = undefined;
  try {
    const [value, people] = await Promise.all([
      getContract(props.row.contractId),
      getDirectory(0),
    ]);
    if (current !== sequence || !props.open) return;
    contract.value = value;
    directory.value = people;
    record.value = currentDocument(value, props.kind, props.row.id);
    void loadFiles();
  } catch (error) {
    if (current === sequence) pageError.value = errorText(error);
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [props.open, props.row?.id, props.row?.contractId, props.kind],
  () => {
    ++sequence;
    actionOpen.value = false;
    selectedAction.value = undefined;
    selectedKind.value = props.kind;
    relatedSource.value = undefined;
    attachmentBusy.value = false;
    contract.value = undefined;
    record.value = undefined;
    if (props.open) {
      filesOpen.value = !procurement.value;
      allContractFiles.value = false;
      attachments.value = undefined;
      attachmentError.value = '';
      void load();
    } else {
      ++sequence;
      actionOpen.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
async function loadFiles() {
  if (!contract.value || !record.value) return;
  const contractId = contract.value.id;
  const recordId = record.value.id;
  const allFiles = allContractFiles.value;
  attachmentError.value = '';
  try {
    const response = await getAttachments(
      contractId,
      allFiles ? undefined : attachmentTarget.value,
    );
    if (
      props.open &&
      contract.value?.id === contractId &&
      record.value?.id === recordId &&
      allContractFiles.value === allFiles
    )
      attachments.value = response;
  } catch (error) {
    if (
      props.open &&
      contract.value?.id === contractId &&
      record.value?.id === recordId &&
      allContractFiles.value === allFiles
    )
      attachmentError.value = errorText(error);
  }
}
function openAction(action: string) {
  if (childOpen.value) return;
  selectedKind.value = props.kind;
  relatedSource.value = undefined;
  selectedAction.value = action;
  actionOpen.value = true;
}
function updated() {
  actionOpen.value = false;
  void load();
  emit('updated');
}
function openRelated(launch: RelatedCreation) {
  if (!contract.value || !record.value || childOpen.value) return;
  relatedSource.value = { kind: props.kind, id: record.value.id };
  selectedKind.value = launch.kind;
  selectedAction.value = launch.action;
  actionOpen.value = true;
}
function close() {
  if (!childOpen.value) emit('close');
}
const related = computed(() =>
  record.value
    ? relatedCreations(props.kind, record.value).filter(
        (entry) =>
          contract.value?.allowedActions.includes(entry.action) &&
          !actions.value.includes(entry.action),
      )
    : [],
);
const mainAction = computed(() => {
  const candidates = new Set([
    ...actions.value.filter(
      (action) =>
        contract.value &&
        record.value &&
        !documentActionUnavailableReason(contract.value, action, record.value),
    ),
    ...related.value.map((entry) => entry.action),
  ]);
  return [
    'ASSIGN_FULFILLMENT',
    'SUBMIT_PLAN',
    'GENERATE_ORDERS',
    'RECORD_ARRIVAL',
    'UPDATE_PRODUCTION',
    'SAVE_PLAN',
    'CREATE_QUOTE',
    'TRANSFER_ASSIGNMENT',
  ].find((action) => candidates.has(action));
});
</script>
<template>
  <Drawer
    :open="open"
    :title="drawerTitle"
    :root-class-name="procurement ? 'procurement-record-drawer' : undefined"
    :width="procurement ? 'min(920px,96vw)' : 'min(1050px,96vw)'"
    :closable="!childOpen"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    @close="close"
  >
    <template #extra>
      <Button :loading="loading" :disabled="childOpen" @click="load">
        刷新当前单据
      </Button>
</template><Spin v-if="loading" /><Alert
      v-if="pageError"
      :message="pageError"
      type="error"
      show-icon
    /><Space
      v-if="record && contract"
      direction="vertical"
      size="large"
      style="width: 100%"
    >
      <Descriptions
        :bordered="!procurement"
        size="small"
        :column="{ xs: 1, sm: 2 }"
      >
        <Descriptions.Item label="关联合同">
          <RelatedLink :target="contractTarget(contract.id)">
            {{ contract.code }} · {{ contract.name }}
          </RelatedLink>
</Descriptions.Item><Descriptions.Item label="客户">
          <RelatedLink :target="entityTarget('customer', contract.customerId)">
            {{ contract.customerName }}
          </RelatedLink>
</Descriptions.Item><Descriptions.Item label="订单所属公司">
          {{ company }}
</Descriptions.Item><Descriptions.Item label="当前状态">
          <ProcurementStatusBadge v-if="procurement" :status="record.status" />
          <Tag v-else>{{ label(record.status) }}</Tag>
        </Descriptions.Item>
</Descriptions><Descriptions
        v-if="sourceContext.length"
        :bordered="!procurement"
        size="small"
        :column="2"
      >
        <Descriptions.Item
          v-for="item in sourceContext"
          :key="JSON.stringify(item.target)"
          :label="item.label"
        >
          <RelatedLink :target="item.target">
            {{ item.value }}
          </RelatedLink>
        </Descriptions.Item>
</Descriptions><Space wrap :class="{ 'procurement-record-actions': procurement }">
        <Button
          v-for="launch in related"
          :key="launch.action"
          :type="
            procurement && launch.action === mainAction ? 'primary' : 'default'
          "
          :disabled="childOpen"
          @click="openRelated(launch)"
        >
          {{ launch.title }}
        </Button>
        <Button
          v-for="action in actions"
          :key="action"
          :type="!procurement || action === mainAction ? 'primary' : 'default'"
          :danger="procurement && /^(CANCEL|VOID|REVERSE|UNBIND)/.test(action)"
          :disabled="
            !!documentActionUnavailableReason(contract, action, record!)
          "
          :title="documentActionUnavailableReason(contract, action, record!)"
          @click="openAction(action)"
        >
          {{
            action === 'CREATE_QUOTE' ? '修订当前报价' : actionTitle(action)
          }}
</Button><Button
          @click="
            filesOpen = !filesOpen;
            filesOpen && loadFiles();
          "
        >
          {{ filesOpen ? '收起附件' : '凭证附件' }}
        </Button>
</Space><Descriptions
        :bordered="!procurement"
        size="small"
        :column="{ xs: 1, sm: 2 }"
      >
        <Descriptions.Item
          v-for="item in fields"
          :key="item.key"
          :label="item.title"
        >
          {{ display(item.key) }}
        </Descriptions.Item>
</Descriptions><MigrationSource
        v-if="contract && record"
        :migration="migration"
        :native-source="{
          kind: 'CONTRACT',
          nativeId: contract.id,
          recordId: record.id,
        }"
      /><Card v-if="lines.length" title="当前单据明细" size="small">
        <LinkedRecordTable
          :contract="contract"
          :data="lines"
          :columns="lineColumns"
        />
</Card><Card
        v-if="kind === 'costs' && contribution"
        title="当前合同成本与贡献口径"
        size="small"
      >
        <Descriptions bordered size="small" :column="2">
          <Descriptions.Item label="口径版本">
            {{ contribution.policyVersion }}
</Descriptions.Item><Descriptions.Item label="币种">
            {{ contribution.currency }}
</Descriptions.Item><Descriptions.Item label="预计贡献">
            {{ contributionValue('estimated') }}
</Descriptions.Item><Descriptions.Item label="归集贡献">
            {{ contributionValue('collected') }}
</Descriptions.Item><Descriptions.Item label="口径说明" :span="2">
            {{ contribution.notice }}
          </Descriptions.Item>
        </Descriptions>
</Card><Card
        v-if="filesOpen"
        :title="allContractFiles ? '合同全部附件' : '当前单据附件'"
        size="small"
      >
        <template #extra>
          <Button
            type="link"
            @click="
              allContractFiles = !allContractFiles;
              loadFiles();
            "
          >
            {{ allContractFiles ? '返回当前单据附件' : '查看合同全部附件' }}
          </Button>
        </template>
        <AttachmentPanel
          :contract-id="contract.id"
          :target="attachmentTarget"
          :view="attachments"
          :loading="false"
          :error="attachmentError"
          :categories="attachments?.uploadCategories ?? []"
          @refresh="loadFiles"
          @busy="(value) => (attachmentBusy = value)"
        />
      </Card>
      <details>
        <summary>单据追溯信息</summary>
        <p>单据引用：{{ record.id }} · 合同数据版本：{{ contract.version }}</p>
      </details>
</Space><Empty
      v-else-if="!loading && !pageError"
      description="请重新选择单据"
    />
</Drawer><DocumentAction
    :open="open && actionOpen"
    :kind="selectedKind"
    :action="selectedAction"
    :row="relatedSource ? undefined : row"
    :source="relatedSource"
    :contract-id="row?.contractId"
    :lock-contract="true"
    @close="actionOpen = false"
    @updated="updated"
  />
</template>
