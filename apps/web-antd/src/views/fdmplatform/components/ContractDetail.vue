<script setup lang="ts">
import type { DocumentKind } from '../documents/model';
import type { DetailTab, WorkspaceKey } from '../workspaces';
import type { ContractDocumentKind } from './contract-document-launcher';

import type {
  AttachmentView,
  BusinessRecord,
  Contract,
  Directory,
  MasterRecord,
  PageResource,
} from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  message,
  Space,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  contractAction,
  getAttachments,
  getContractAudit,
} from '#/api/fdmplatform';
import { getContractRelatedSummary } from '#/api/fdmplatform/contract-progress';
import { getCustomsSummary } from '#/api/fdmplatform/customs';
import { downloadContractProductAttachment } from '#/api/fdmplatform/products';

import { productCategoryLabel } from '../contract-categories';
import { contractActions, errorText, label } from '../data';
import { personLabel } from '../directory';
import ImportedContractCompletion from '../documents/ImportedContractCompletion.vue';
import LinkedRecordTable from '../documents/LinkedRecordTable.vue';
import { nativeMoney } from '../documents/migration-display';
import MigrationSource from '../documents/MigrationSource.vue';
import { documentDefinitions } from '../documents/model';
import { entityTarget } from '../documents/navigation';
import RelatedLink from '../documents/RelatedLink.vue';
import ContractEditor from '../products/components/ContractEditor.vue';
import { detailTabFor } from '../workspaces';
import ActionDialog from './ActionDialog.vue';
import AttachmentPanel from './AttachmentPanel.vue';
import {
  contractItemProgress,
  contractRelatedStages,
} from './contract-progress';
import ContractDocumentDialog from './ContractDocumentDialog.vue';
import RecordTable from './RecordTable.vue';
const props = defineProps<{
  contract?: Contract;
  directory?: Directory;
  initialTab: DetailTab;
  loading: boolean;
  master: MasterRecord[];
  open: boolean;
  pools: BusinessRecord[];
  recordContext?: { record: BusinessRecord; resource: PageResource };
  workspace: WorkspaceKey;
}>();
const emit = defineEmits<{
  close: [];
  refresh: [];
  updated: [value: Contract];
}>();
const documentKind = ref<ContractDocumentKind>();
const documentsOpen = ref(false);
const attachmentBusy = ref(false);
const childOpen = computed(
  () =>
    documentsOpen.value ||
    editorOpen.value ||
    completionOpen.value ||
    confirmOpen.value ||
    attachmentBusy.value ||
    saving.value,
);
const navigationGroups: { items: DocumentKind[]; title: string }[] = [
  { title: '外贸部门', items: ['requests', 'shipments', 'salesReturns'] },
  {
    title: '采购部门',
    items: [
      'tasks',
      'quotes',
      'plans',
      'orders',
      'arrivals',
      'purchaseReturns',
      'production',
    ],
  },
  {
    title: '财务部门',
    items: ['receipts', 'refunds', 'invoices', 'allocations', 'costs'],
  },
];
const activeTab = ref('overview');
const editorOpen = ref(false);
const completionOpen = ref(false);
const confirmOpen = ref(false);
const saving = ref(false);
const pageError = ref('');
const attachments = ref<AttachmentView>();
const attachmentError = ref('');
const attachmentLoading = ref(false);
const audit = ref<BusinessRecord[]>([]);
const auditError = ref('');
const customs = ref<Awaited<ReturnType<typeof getCustomsSummary>>>();
const customsError = ref('');
const related = ref<Awaited<ReturnType<typeof getContractRelatedSummary>>>();
const relatedError = ref('');
let summarySequence = 0;
const company = computed(
  () =>
    props.directory?.companies.find(
      (item) => item.companyId === props.contract?.companyId,
    )?.companyName ??
    props.contract?.companyName ??
    '',
);
const confirmation = computed(() =>
  props.contract
    ? contractActions(props.contract, props.master).CONFIRM_CONTRACT
    : undefined,
);
const standardFiles = computed(() => [
  ...new Map(
    (props.contract?.items ?? []).flatMap((item) =>
      (item.productAttachmentRefs ?? []).map(
        (file) => [file.id, { ...file, skuName: item.skuName }] as const,
      ),
    ),
  ).values(),
]);
const progress = computed(() => contractItemProgress(props.contract));
const stages = computed(() => [
  ...contractRelatedStages(related.value, props.contract),
  {
    name: '产品交付',
    value: `${progress.value.filter((item) => item.deliveryComplete).length} / ${progress.value.length} 项完成（${progress.value.filter((item) => !item.quantityProgressKnown).length} 项数量待核对）`,
    description: '原已发货量与后续已匹配发货明细合计',
  },
  {
    name: '报关',
    value: customs.value
      ? `${customs.value.completed} / ${customs.value.total} 批完成`
      : '暂未读取',
  },
]);
const columns = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title! };
  });
async function loadFiles() {
  if (!props.contract) return;
  const id = props.contract.id;
  attachmentLoading.value = true;
  attachmentError.value = '';
  try {
    const result = await getAttachments(id);
    if (id === props.contract?.id) attachments.value = result;
  } catch (error) {
    attachmentError.value = errorText(error);
  } finally {
    attachmentLoading.value = false;
  }
}
async function loadSummary() {
  if (!props.contract) return;
  const id = props.contract.id;
  const run = ++summarySequence;
  customsError.value = '';
  relatedError.value = '';
  related.value = undefined;
  customs.value = undefined;
  const [customsResult, relatedResult] = await Promise.allSettled([
    getCustomsSummary(id),
    getContractRelatedSummary(id),
  ]);
  if (run !== summarySequence || id !== props.contract?.id || !props.open)
    return;
  if (customsResult.status === 'fulfilled') customs.value = customsResult.value;
  else customsError.value = errorText(customsResult.reason);
  if (relatedResult.status === 'fulfilled') related.value = relatedResult.value;
  else
    relatedError.value = `关联单据统计未读取：${errorText(relatedResult.reason)}`;
}
async function loadAudit() {
  if (!props.contract) return;
  const id = props.contract.id;
  auditError.value = '';
  try {
    const result = await getContractAudit(id);
    if (id === props.contract?.id)
      audit.value = result.map((item, index) => ({
        ...item,
        id: String(index),
      }));
  } catch (error) {
    auditError.value = errorText(error);
  }
}
watch(
  () => [props.open, props.contract?.id],
  () => {
    ++summarySequence;
    documentsOpen.value = false;
    editorOpen.value = false;
    completionOpen.value = false;
    confirmOpen.value = false;
    related.value = undefined;
    if (props.open && props.contract) {
      activeTab.value = detailTabFor(props.workspace, props.initialTab);
      confirmOpen.value = false;
      attachments.value = undefined;
      audit.value = [];
      customs.value = undefined;
      void loadFiles();
      void loadSummary();
      if (activeTab.value === 'audit') void loadAudit();
    }
  },
  { immediate: true },
);
watch(
  () => props.contract?.version,
  () => {
    if (props.open) void loadSummary();
  },
);
watch(activeTab, (tab) => {
  if (tab === 'audit') void loadAudit();
});
function openDocuments(kind: ContractDocumentKind) {
  if (!props.contract || childOpen.value) return;
  documentKind.value = kind;
  documentsOpen.value = true;
}
function documentUpdated(value: Contract) {
  if (value.id !== props.contract?.id) return;
  emit('updated', value);
  void loadSummary();
  void loadFiles();
  if (activeTab.value === 'audit') void loadAudit();
}
function close() {
  if (!childOpen.value) emit('close');
}
async function confirm(payload: Record<string, unknown>, key: string) {
  if (!props.contract) return;
  saving.value = true;
  pageError.value = '';
  try {
    emit(
      'updated',
      await contractAction(
        props.contract.id,
        'CONFIRM_CONTRACT',
        props.contract.version,
        key,
        payload,
      ),
    );
    confirmOpen.value = false;
    message.success('合同已确认');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
async function download(file: { id: string; name: string }) {
  if (!props.contract) return;
  try {
    const blob = await downloadContractProductAttachment(
      props.contract.id,
      file.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    message.error(errorText(error));
  }
}
</script>
<template>
  <Drawer
    :open="open"
    :title="contract ? `${contract.code} · ${contract.name}` : '合同详情'"
    width="min(1150px,96vw)"
    :closable="!childOpen"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    @close="close"
  >
    <template #extra>
      <Button :loading="loading" :disabled="childOpen" @click="emit('refresh')">
        刷新合同
      </Button>
    </template>
    <div v-if="contract" class="contract-detail">
      <Space wrap>
        <Tag color="blue">{{ label(contract.status) }}</Tag><RelatedLink :target="entityTarget('customer', contract.customerId)">
          {{ contract.customerName }}
</RelatedLink><span>{{ nativeMoney(contract.amount, contract.currency) }}</span><span v-if="contract.additionalAmount != null">附加金额：{{
            nativeMoney(contract.additionalAmount, contract.currency)
          }}</span><Button
          v-if="contract.allowedActions.includes('UPDATE_CONTRACT')"
          @click="editorOpen = true"
        >
          编辑合同与产品
</Button><Button
          v-if="
            contract.status === 'DRAFT' &&
            contract.allowedActions.includes('CONFIRM_CONTRACT')
          "
          type="primary"
          @click="confirmOpen = true"
        >
          确认合同
        </Button>
</Space><Button
        v-if="contract.allowedActions.includes('COMPLETE_IMPORTED_CONTRACT')"
        type="primary"
        @click="completionOpen = true"
      >
        补齐办理资料
</Button><MigrationSource
        :migration="contract.migration"
        :block-reasons="contract.blockReasons"
        :native-source="{ kind: 'CONTRACT', nativeId: contract.id }"
      /><Tabs v-model:active-key="activeTab">
        <TabPane key="overview" tab="合同概要">
          <Descriptions bordered size="small" :column="2">
            <Descriptions.Item label="订单所属公司">
              {{ company || '待补齐' }}
</Descriptions.Item><Descriptions.Item label="业务类型">
              {{ label(contract.businessType) }}
</Descriptions.Item><Descriptions.Item label="产品分类">
              {{
                productCategoryLabel(contract.productCategory)
              }}
</Descriptions.Item><Descriptions.Item label="负责人">
              {{
                personLabel(directory, contract.ownerUserId)
              }}
</Descriptions.Item><Descriptions.Item label="业务部门">
              {{
                directory?.departments.find(
                  (item) => item.id === contract?.departmentId,
                )?.name ?? '未指定'
              }}
</Descriptions.Item><Descriptions.Item label="签订日期">
              {{ label(contract.signedDate) }}
</Descriptions.Item><Descriptions.Item label="数据版本">
              {{ contract.version }}
</Descriptions.Item><Descriptions.Item label="阿里信保单号" :span="2">
              {{
                contract.alibabaTradeAssuranceNo || '未填写'
              }}
</Descriptions.Item><Descriptions.Item label="付款条件" :span="2">
              {{ label(contract.paymentTerms) }}
</Descriptions.Item><Descriptions.Item label="交付要求" :span="2">
              {{ label(contract.deliveryRequirement) }}
            </Descriptions.Item>
          </Descriptions>
</TabPane><TabPane key="products" tab="产品明细">
          <LinkedRecordTable
            :contract="contract"
            :data="progress"
            :columns="
              columns(
                'skuName|产品',
                'specification|冻结规格',
                'shape|形状',
                'quantity|合同数量',
                'unit|单位',
                'unitPrice|销售单价',
                'requiredDate|交期',
                'requestedQuantity|已匹配申请数量',
                'remainingRequestQuantity|未匹配申请数量（参考）',
                'shippedQuantity|净发货数量',
              )
            "
          />
          <p class="navigation-note">
            数量仅统计当前合同快照中已匹配的明细；未匹配或独立单据仍计入关联总数。未匹配申请数量仅供参考，不是全量可采购额度，不作为自动下单或结案依据。数量缺失时保持待核对，不按零判定完成。
          </p>
          <Card
            v-if="standardFiles.length"
            title="合同引用的产品标准资料"
            size="small"
          >
            <Space wrap>
              <Button
                v-for="file in standardFiles"
                :key="file.id"
                @click="download(file)"
              >
                {{ file.skuName }} · {{ file.name }}
              </Button>
            </Space>
          </Card>
</TabPane><TabPane key="progress" tab="流程进度与关联单据">
          <div class="progress-grid">
            <Card
              v-for="stage in stages"
              :key="stage.name"
              size="small"
              :title="stage.name"
            >
              {{ stage.value }}
              <p
                v-if="'description' in stage && stage.description"
                class="navigation-note"
              >
                {{ stage.description }}
              </p>
            </Card>
          </div>
          <Alert v-if="customsError" :message="customsError" type="warning" />
          <Alert v-if="relatedError" :message="relatedError" type="warning">
            <template #action>
              <Button size="small" @click="loadSummary"> 重新读取 </Button>
            </template>
          </Alert>
          <p class="navigation-note">
            点击下方单据可直接在弹窗中建单或办理，自动关联本合同，保存后刷新流程进度。
          </p>
          <Card
            v-for="group in navigationGroups"
            :key="group.title"
            :title="group.title"
            size="small"
          >
            <div class="document-links">
              <Button
                v-for="kind in group.items"
                :key="kind"
                @click="openDocuments(kind)"
              >
                {{ documentDefinitions[kind].title }}
</Button><Button
                v-if="group.title === '采购部门'"
                @click="openDocuments('customs')"
              >
                报关跟进
              </Button>
            </div>
          </Card>
</TabPane><TabPane key="attachments" tab="合同附件">
          <AttachmentPanel
            :contract-id="contract.id"
            :view="attachments"
            :categories="attachments?.uploadCategories ?? []"
            :error="attachmentError"
            :loading="attachmentLoading"
            @refresh="loadFiles"
            @busy="(value) => (attachmentBusy = value)"
          />
</TabPane><TabPane key="audit" tab="操作记录">
          <Alert
            v-if="auditError"
            :message="auditError"
            type="error"
          /><RecordTable
            :data="audit"
            :columns="
              columns(
                'action|业务动作',
                'actor_id|操作人',
                'created_at|时间',
                'document_version|保存版本',
              )
            "
          />
        </TabPane>
</Tabs><Card v-if="activeTab === 'overview'" title="后续业务" size="small">
        <Space wrap>
          <Button type="primary" @click="openDocuments('requests')">
            采购申请
</Button><Button @click="activeTab = 'progress'">
            查看流程进度与全部关联单据
</Button><Button @click="activeTab = 'products'">查看产品明细</Button>
        </Space>
      </Card>
    </div>
</Drawer><ContractDocumentDialog
    :open="open && documentsOpen"
    :kind="documentKind"
    :contract="contract"
    @close="documentsOpen = false"
    @updated="documentUpdated"
  /><ContractEditor
    :open="editorOpen"
    :contract="contract"
    :directory="directory"
    :master="master"
    @close="editorOpen = false"
    @saved="
      (value) => {
        editorOpen = false;
        emit('updated', value);
      }
    "
  /><ImportedContractCompletion
    :open="completionOpen && open"
    :contract="contract"
    :directory="directory"
    @close="completionOpen = false"
    @saved="(value) => emit('updated', value)"
  /><ActionDialog
    :open="confirmOpen"
    :definition="confirmation"
    :saving="saving"
    :error="pageError"
    @close="confirmOpen = false"
    @submit="confirm"
  />
</template>
<style scoped>
.contract-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.document-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.navigation-note {
  margin-top: 20px;
}
</style>
