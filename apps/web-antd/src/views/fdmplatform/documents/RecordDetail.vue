<script setup lang="ts">
import type { DocumentKind } from './model';

import type {
  AttachmentView,
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
} from '#/api/fdmplatform';
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';

import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

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

import {
  getAiReviews,
  getAttachments,
  getContract,
  getDirectory,
  refreshAiReview,
} from '#/api/fdmplatform';

import AttachmentPanel from '../components/AttachmentPanel.vue';
import RecordTable from '../components/RecordTable.vue';
import { errorText, label, rows } from '../data';
import { personLabel } from '../directory';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
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
import RelatedLink from './RelatedLink.vue';
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
const router = useRouter();
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
const reviews = ref<BusinessRecord[]>([]);
const reviewLoading = ref(false);
const reviewError = ref('');
let sequence = 0;
const config = computed(() => documentDefinitions[props.kind]);
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
        return ['DRAFT', 'REJECTED', 'RETURNED'].includes(
          String(record.value?.status),
        );
      if (action === 'DECIDE_PLAN') return record.value?.status === 'SUBMITTED';
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
  'evidenceRef|凭证引用',
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
  return (
    migrationCell(record.value ?? {}, key) ??
    receiptFxDisplay(record.value ?? {}, key) ??
    (/UserId$/i.test(key)
      ? personLabel(directory.value, value)
      : Array.isArray(value)
        ? value.map((entry) => label(entry)).join('；')
        : label(value))
  );
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
    if (props.kind === 'plans') void loadReviews();
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
    attachmentBusy.value = false;
    contract.value = undefined;
    record.value = undefined;
    if (props.open) {
      filesOpen.value = true;
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
async function loadReviews(refresh = false) {
  if (!contract.value || !record.value) return;
  const contractId = contract.value.id;
  const recordId = record.value.id;
  const run = sequence;
  reviewLoading.value = true;
  reviewError.value = '';
  try {
    if (refresh)
      for (const review of reviews.value.filter(
        (item) => item.status === 'PENDING',
      ))
        await refreshAiReview(contractId, review.id);
    const results = await getAiReviews(contractId);
    if (run !== sequence || !props.open) return;
    reviews.value = results.filter((review) => review.planId === recordId);
  } catch (error) {
    if (run === sequence) reviewError.value = errorText(error);
  } finally {
    if (run === sequence) reviewLoading.value = false;
  }
}
function openAction(action: string) {
  if (childOpen.value) return;
  selectedAction.value = action;
  actionOpen.value = true;
}
function updated() {
  actionOpen.value = false;
  void load();
  emit('updated');
}
function navigate(kind: DocumentKind) {
  if (!contract.value || childOpen.value) return;
  if (props.embedded) {
    emit('navigate', kind);
    return;
  }
  void router.push({
    path: documentDefinitions[kind].route,
    query: { contractId: contract.value.id },
  });
}
function close() {
  if (!childOpen.value) emit('close');
}
const related = computed<DocumentKind[]>(
  () =>
    ((
      ({
        requests: ['tasks'],
        tasks: ['quotes', 'production'],
        quotes: ['plans'],
        plans: ['orders'],
        orders: ['arrivals'],
        arrivals: ['purchaseReturns'],
        production: ['shipments'],
        shipments: ['salesReturns'],
        receipts: ['allocations', 'refunds'],
        invoices: ['allocations'],
      }) as Partial<Record<DocumentKind, DocumentKind[]>>
    )[props.kind] as DocumentKind[] | undefined) ?? [],
);
</script>
<template>
  <Drawer
    :open="open"
    :title="`${config.title} · ${title}`"
    width="min(1050px,96vw)"
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
      <Descriptions bordered size="small" :column="2">
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
          <Tag>{{ label(record.status) }}</Tag>
        </Descriptions.Item>
</Descriptions><Descriptions
        v-if="sourceContext.length"
        bordered
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
</Descriptions><Space wrap>
        <Button
          v-for="action in actions"
          :key="action"
          type="primary"
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
</Button><Button
          v-for="targetKind in related"
          :key="targetKind"
          @click="navigate(targetKind)"
        >
          {{ embedded ? '办理' : '前往'
          }}{{ documentDefinitions[targetKind].title }}
        </Button>
</Space><Descriptions bordered size="small" :column="2">
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
        v-if="kind === 'plans'"
        title="当前方案审批与 AI 预审"
        size="small"
      >
        <RecordTable
          v-if="rows(record.approvals).length"
          :data="rows(record.approvals)"
          :columns="[
            { key: 'planVersion', title: '审批版本' },
            { key: 'invalidated', title: '已失效' },
            { key: 'approved', title: '审批结果' },
            { key: 'scopes', title: '批准范围' },
            { key: 'reason', title: '意见' },
            { key: 'actorId', title: '审批人' },
            { key: 'occurredAt', title: '时间' },
          ]"
        /><Button :loading="reviewLoading" @click="loadReviews(true)">
          刷新预审结果
</Button><Alert
          v-if="reviewError"
          :message="reviewError"
          type="warning"
        /><RecordTable
          :data="reviews"
          :columns="[
            { key: 'status', title: '预审状态' },
            { key: 'planVersion', title: '方案版本' },
            { key: 'summary', title: '预审结论 / 未完成原因' },
            { key: 'risks', title: '风险' },
            { key: 'evidenceIds', title: '引用证据' },
          ]"
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
    :kind="kind"
    :action="selectedAction"
    :row="row"
    :contract-id="row?.contractId"
    :lock-contract="embedded"
    @close="actionOpen = false"
    @updated="updated"
  />
</template>
