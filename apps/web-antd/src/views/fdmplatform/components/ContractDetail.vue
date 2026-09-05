<script setup lang="ts">
import type { ActionDefinition } from '../data';

import type { BusinessRecord, Contract, MasterRecord } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  message,
  Space,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  contractAction,
  getAiReviews,
  getContractAudit,
  refreshAiReview,
  requestAiReview,
} from '#/api/fdmplatform';

import {
  contractActions,
  errorText,
  executionActions,
  field,
  financeActions,
  label,
  money,
  rows,
  selectField,
} from '../data';
import ActionDialog from './ActionDialog.vue';
import RecordTable from './RecordTable.vue';

const props = defineProps<{
  contract?: Contract;
  loading: boolean;
  master: MasterRecord[];
  open: boolean;
  pools: BusinessRecord[];
}>();
const emit = defineEmits<{
  close: [];
  refresh: [];
  updated: [value: Contract];
}>();
const activeTab = ref('overview');
const actionOpen = ref(false);
const saving = ref(false);
const actionError = ref('');
const selectedAction = ref<ActionDefinition>();
const actionVersion = ref(0);
const aiReviews = ref<BusinessRecord[]>([]);
const aiLoading = ref(false);
const aiError = ref('');
const auditRows = ref<BusinessRecord[]>([]);
const auditLoading = ref(false);
const auditError = ref('');
const definitions = computed(() =>
  props.contract
    ? {
        ...contractActions(props.contract, props.master),
        ...financeActions(props.contract),
        ...executionActions(props.contract, props.pools, props.master),
      }
    : {},
);
const allowed = (action: string) =>
  props.contract?.allowedActions?.includes(action) ?? false;
const canFinance = computed(
  () =>
    props.contract?.finance !== undefined ||
    props.contract?.financeSummary !== undefined,
);
const requestItems = computed<BusinessRecord[]>(() =>
  (props.contract?.requests ?? []).flatMap((request) =>
    rows(request.items).map((item) => ({
      ...item,
      requestName: request.name,
      requestId: request.id,
    })),
  ),
);
const planLines = computed(() =>
  (props.contract?.plans ?? []).flatMap((plan) =>
    rows(plan.lines).map((line) => ({
      ...line,
      planName: plan.name,
      planVersion: plan.version,
      planStatus: plan.status,
    })),
  ),
);
const approvals = computed(() =>
  (props.contract?.plans ?? []).flatMap((plan) =>
    rows(plan.approvals).map((decision) => ({
      ...decision,
      planName: plan.name,
    })),
  ),
);
const orderLines = computed(() =>
  (props.contract?.purchaseOrders ?? []).flatMap((order) =>
    rows(order.lines).map((line) => ({
      ...line,
      orderId: order.id,
      supplierName: order.supplierName,
    })),
  ),
);
const progress = computed(
  () =>
    props.contract?.items.map((item) => {
      const requests = requestItems.value.filter(
        (request) => request.contractItemId === item.id,
      );
      const requested = requests.reduce(
        (sum, request) => sum + Number(request.quantity),
        0,
      );
      const shipped = (props.contract?.shipments ?? [])
        .filter((shipment) => shipment.contractItemId === item.id)
        .reduce(
          (sum, shipment) =>
            sum +
            Number(shipment.quantity) * (shipment.kind === 'RETURN' ? -1 : 1),
          0,
        );
      return {
        ...item,
        requestedQuantity: requested,
        excessQuantity: Math.max(0, requested - Number(item.quantity)),
        shippedQuantity: shipped,
      };
    }) ?? [],
);
const profit = computed(
  () => props.contract?.profit as Record<string, unknown> | undefined,
);
const estimated = computed(
  () => profit.value?.estimated as Record<string, unknown> | undefined,
);
const collected = computed(
  () => profit.value?.collected as Record<string, unknown> | undefined,
);
const columns = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title! };
  });
function missingCostsDescription(value: unknown) {
  return rows(value)
    .map((item) => `${item.contractItemId} / ${label(item.category)}`)
    .join('；');
}
watch(
  () => props.contract?.id,
  () => {
    aiReviews.value = [];
    aiError.value = '';
    auditRows.value = [];
    auditError.value = '';
    if (activeTab.value === 'ai') void loadAi();
    if (activeTab.value === 'audit') void loadAudit();
  },
);
watch(activeTab, (tab) => {
  if (tab === 'ai') void loadAi();
  if (tab === 'audit') void loadAudit();
});
async function loadAudit() {
  const contractId = props.contract?.id;
  if (!contractId) return;
  auditLoading.value = true;
  auditError.value = '';
  try {
    const result = await getContractAudit(contractId);
    if (props.contract?.id === contractId)
      auditRows.value = result.map((row, index) => ({
        ...row,
        id: String(index),
      }));
  } catch (error) {
    auditError.value = errorText(error);
  } finally {
    auditLoading.value = false;
  }
}
async function loadAi(refreshPending = false) {
  const contractId = props.contract?.id;
  if (!contractId) return;
  aiLoading.value = true;
  aiError.value = '';
  try {
    if (refreshPending) {
      for (const review of aiReviews.value.filter(
        (entry) => entry.status === 'PENDING',
      ))
        await refreshAiReview(contractId, review.id);
    }
    const results = await getAiReviews(contractId);
    if (props.contract?.id === contractId) aiReviews.value = results;
  } catch (error) {
    aiError.value = errorText(error);
  } finally {
    aiLoading.value = false;
  }
}
function openAi() {
  if (!props.contract || !allowed('REQUEST_AI_REVIEW')) return;
  selectedAction.value = {
    action: 'REQUEST_AI_REVIEW',
    title: '发起采购 AI 预审',
    description:
      '预审仅处理本方案已授权的资料与证据，结果绑定指定版本；不可自动批准或下单。',
    fields: [
      selectField(
        'planId',
        '采购方案',
        (props.contract.plans ?? []).map((plan) => ({
          value: plan.id,
          label: `${plan.name} · 版本 ${plan.version}`,
          fill: { planVersion: plan.version ?? 1 },
        })),
      ),
      field('planVersion', '方案版本', 'number', { min: 1 }),
    ],
  };
  actionVersion.value = props.contract.version;
  actionError.value = '';
  actionOpen.value = true;
}
function openAction(action: string) {
  if (!props.contract || !allowed(action) || !definitions.value[action]) return;
  selectedAction.value = definitions.value[action];
  actionVersion.value = props.contract.version;
  actionError.value = '';
  actionOpen.value = true;
}
function split(value: unknown) {
  return String(value ?? '')
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
async function execute(
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  const contract = props.contract;
  const action = selectedAction.value?.action;
  if (!contract || !action) return;
  saving.value = true;
  actionError.value = '';
  try {
    if (action === 'CREATE_QUOTE') {
      payload.evidenceIds = split(payload.evidenceIds);
      payload.confirmed = true;
      payload.supplierName = props.master.find(
        (item) => item.id === payload.supplierId,
      )?.name;
    }
    if (action === 'UPDATE_CONTRACT') {
      payload.companyId = contract.companyId;
      payload.customerName = props.master.find(
        (item) => item.id === payload.customerId,
      )?.name;
      payload.attachmentIds = split(payload.attachmentIds);
      payload.items = rows(payload.items).map((item) => ({
        ...item,
        skuName: props.master.find((sku) => sku.id === item.skuId)?.name,
        attachmentIds: split(item.attachmentIds),
      }));
    }
    if (action === 'SAVE_PLAN') {
      payload.risks = String(payload.riskNotes ?? '')
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean);
      delete payload.riskNotes;
    }
    if (action === 'CREATE_COST') {
      payload.includesCategories ??= [];
    }
    if (action.startsWith('STOCK_')) {
      const pool = props.pools.find((item) => item.id === payload.poolId);
      if (!pool || pool.version === undefined)
        throw new Error('库存池版本未加载，请刷新后重新操作');
      const { poolId, planId, planVersion, planLineId, ...command } = payload;
      if (action === 'STOCK_RECEIVE' || action === 'STOCK_RESERVE')
        command.contractId = contract.id;
      if (action === 'STOCK_RECEIVE') {
        command.sourceType = 'PRODUCTION';
        command.sourceId = command.assignmentId;
        command.sourceLineId = command.contractItemId;
        delete command.assignmentId;
      }
      payload = {
        poolId,
        poolVersion: pool.version,
        command,
        ...(action === 'STOCK_RESERVE'
          ? { planId, planVersion, planLineId }
          : {}),
      };
    }
    if (action === 'REQUEST_AI_REVIEW') {
      await requestAiReview(contract.id, {
        ...payload,
        expectedVersion: actionVersion.value,
        idempotencyKey,
      });
      actionOpen.value = false;
      await loadAi();
      message.success('已登记预审请求，请查看实际处理状态');
      return;
    }
    const result = await contractAction(
      contract.id,
      action,
      actionVersion.value,
      idempotencyKey,
      payload,
    );
    actionOpen.value = false;
    emit('updated', result);
    message.success(`${selectedAction.value?.title}成功`);
  } catch (error) {
    actionError.value = errorText(error);
    emit('refresh');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="contract ? `${contract.code} · ${contract.name}` : '合同详情'"
    width="min(1280px, 96vw)"
    :destroy-on-close="true"
    @close="emit('close')"
  >
    <template #extra>
      <Button :loading="loading" @click="emit('refresh')"> 刷新单据 </Button>
    </template>
    <div v-if="contract" class="contract-detail">
      <div class="contract-strip">
        <div>
          <span>客户</span><strong>{{ contract.customerName }}</strong>
        </div>
        <div>
          <span>合同类型</span><strong>{{ label(contract.businessType) }}</strong>
        </div>
        <div v-if="contract.amount !== undefined">
          <span>合同金额</span><strong>{{ money(contract.amount, contract.currency) }}</strong>
        </div>
        <div>
          <span>商业状态</span><Tag color="blue">{{ label(contract.status) }}</Tag>
        </div>
        <div>
          <span>当前版本</span><strong>{{ contract.businessVersion }} / 数据
            {{ contract.version }}</strong>
        </div>
      </div>
      <Tabs v-model:active-key="activeTab">
        <TabPane key="overview" tab="合同与履约">
          <div class="stack">
            <Space wrap>
              <Button
                v-if="
                  allowed('CONFIRM_CONTRACT') && contract.status === 'DRAFT'
                "
                type="primary"
                @click="openAction('CONFIRM_CONTRACT')"
              >
                确认合同
</Button><Button
                v-if="allowed('UPDATE_CONTRACT')"
                @click="openAction('UPDATE_CONTRACT')"
              >
                修订合同与规格
</Button><Button
                v-if="allowed('CREATE_REQUEST')"
                @click="openAction('CREATE_REQUEST')"
              >
                新建采购申请
              </Button>
            </Space>
            <Descriptions bordered size="small" :column="2">
              <Descriptions.Item label="签约公司">
                {{ contract.companyId }}
</Descriptions.Item><Descriptions.Item label="业务部门">
                {{ contract.departmentId }}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                用户 #{{ contract.ownerUserId }}
</Descriptions.Item><Descriptions.Item label="签订日期">
                {{ label(contract.signedDate) }}
              </Descriptions.Item>
              <Descriptions.Item label="付款条件" :span="2">
                {{ label(contract.paymentTerms) }}
</Descriptions.Item><Descriptions.Item label="交付要求" :span="2">
                {{ label(contract.deliveryRequirement) }}
              </Descriptions.Item>
            </Descriptions>
            <Card title="产品规格与履约数量" size="small">
              <RecordTable
                :data="progress"
                :columns="
                  columns(
                    'skuName|产品 / SKU',
                    'specVersion|规格版本',
                    'specification|冻结规格',
                    'quantity|合同数量',
                    'unit|单位',
                    ...(contract.amount !== undefined
                      ? ['unitPrice|销售单价']
                      : []),
                    'requiredDate|交期',
                    'requestedQuantity|累计申请',
                    'excessQuantity|超合同数量',
                    'shippedQuantity|净发货数量',
                  )
                "
              />
            </Card>
            <Alert
              message="回款、开票与发货分别统计；样品可为零收入，成本仍按真实业务归集。"
              type="info"
              show-icon
            />
            <Card title="申请明细 / 分批与超量" size="small">
              <RecordTable
                :data="requestItems"
                :columns="
                  columns(
                    'requestName|采购申请',
                    'id|申请明细 ID',
                    'contractItemId|合同明细',
                    'quantity|本次申请',
                    'cumulativeRequestedQuantity|提交时累计',
                    'excessQuantity|超量提示',
                    'ownerUserId|匹配经办人',
                    'assignmentStatus|分派状态',
                    'missingReason|待分派原因',
                    'requiredDate|要求到货日',
                    'remark|说明',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane key="purchase" tab="采购协同">
          <div class="stack">
            <Space wrap>
              <template
                v-for="action in [
                  'ASSIGN_FULFILLMENT',
                  'TRANSFER_ASSIGNMENT',
                  'CREATE_QUOTE',
                  'SAVE_PLAN',
                  'SUBMIT_PLAN',
                  'DECIDE_PLAN',
                  'GENERATE_ORDERS',
                ]"
                :key="action"
              >
                <Button
                  v-if="allowed(action)"
                  :type="action === 'DECIDE_PLAN' ? 'primary' : 'default'"
                  @click="openAction(action)"
                >
                  {{ definitions[action]?.title }}
                </Button>
              </template>
            </Space>
            <Card title="履约任务 · 库存 / 自产 / 外采" size="small">
              <RecordTable
                :data="contract.assignments ?? []"
                :columns="
                  columns(
                    'id|任务 ID',
                    'requestId|来源申请',
                    'contractItemId|合同明细',
                    'method|履约方式',
                    'quantity|分派数量',
                    'ownerUserId|经办人',
                    'factoryId|承接工厂',
                    'status|状态',
                  )
                "
              />
            </Card>
            <Card
              v-if="contract.quotes"
              title="报价版本与同口径证据"
              size="small"
            >
              <RecordTable
                :data="contract.quotes"
                :columns="
                  columns(
                    'id|报价 ID',
                    'version|报价版本',
                    'assignmentId|任务',
                    'supplierName|供应商',
                    'currency|币种',
                    'unitPrice|报价单价',
                    'unit|单位',
                    'taxIncluded|含税',
                    'packagingIncluded|含包装',
                    'freightIncluded|含运费',
                    'promisedDate|承诺到货',
                    'validUntil|有效期',
                    'evidenceIds|证据引用',
                  )
                "
              />
            </Card>
            <Card title="采购方案" size="small">
              <RecordTable
                :data="contract.plans ?? []"
                :columns="
                  columns(
                    'id|方案 ID',
                    'name|方案名称',
                    'version|版本',
                    'status|状态',
                    'ownerUserId|编制人',
                    'sharedConditions|共享约束',
                    'rationale|推荐依据',
                    'facts|单一报价 / 超量事实',
                    'risks|待判断风险',
                  )
                "
              />
            </Card>
            <Card title="方案明细 · 批准范围与执行来源" size="small">
              <RecordTable
                :data="planLines"
                :columns="
                  columns(
                    'planName|方案',
                    'id|方案明细 ID',
                    'planVersion|版本',
                    'assignmentId|任务',
                    'method|履约方式',
                    'quantity|方案数量',
                    'quoteId|引用报价',
                    'supplierName|供应商',
                    ...(contract.quotes
                      ? ['unitPrice|采购单价', 'currency|币种']
                      : []),
                    'promisedDate|承诺日',
                  )
                "
              />
            </Card>
            <Card title="经理决策记录" size="small">
              <RecordTable
                :data="approvals"
                :columns="
                  columns(
                    'planName|采购方案',
                    'planVersion|决定版本',
                    'actorId|决策人',
                    'approved|批准',
                    'invalidated|已经失效',
                    'reason|风险处理 / 决策依据',
                    'occurredAt|决策时间',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane key="delivery" tab="到货、自产与发货">
          <div class="stack">
            <Space wrap>
              <template
                v-for="action in [
                  'RECORD_ARRIVAL',
                  'RETURN_ARRIVAL',
                  'CANCEL_ORDER',
                  'UPDATE_PRODUCTION',
                  'STOCK_RECEIVE',
                  'STOCK_RESERVE',
                  'STOCK_RELEASE',
                  'STOCK_SHIP',
                  'STOCK_RETURN',
                ]"
                :key="action"
              >
                <Button v-if="allowed(action)" @click="openAction(action)">
                  {{ definitions[action]?.title }}
                </Button>
              </template>
            </Space>
            <Card title="采购订单" size="small">
              <RecordTable
                :data="contract.purchaseOrders ?? []"
                :columns="
                  columns(
                    'id|采购单 ID',
                    'supplierName|供应商',
                    'planId|采购方案',
                    'approvedPlanVersion|批准版本',
                    ...(contract.quotes
                      ? ['amount|采购金额', 'currency|币种']
                      : []),
                    'status|状态',
                  )
                "
              />
            </Card>
            <Card title="采购订单执行明细" size="small">
              <RecordTable
                :data="orderLines"
                :columns="
                  columns(
                    'id|采购明细 ID',
                    'orderId|采购单',
                    'skuId|SKU',
                    'quantity|下单数量',
                    'arrivedQuantity|已到货',
                    'acceptedQuantity|已验收合格',
                    'returnedQuantity|已退货',
                    'cancelledQuantity|已取消',
                  )
                "
              />
            </Card>
            <Card title="分批到货与差异" size="small">
              <RecordTable
                :data="rows(contract.arrivals)"
                :columns="
                  columns(
                    'id|到货 ID',
                    'orderId|采购单',
                    'batchNo|批次',
                    'quantity|实到数量',
                    'acceptedQuantity|合格数量',
                    'exceptionQuantity|异常数量',
                    'exceptionReason|异常说明',
                    'stockPoolId|库存池',
                    'evidenceRef|凭证',
                  )
                "
              />
            </Card>
            <Card title="自产人工进度" size="small">
              <RecordTable
                :data="rows(contract.productionProgress)"
                :columns="
                  columns(
                    'id|记录 ID',
                    'assignmentId|自产任务',
                    'completedQuantity|累计完成',
                    'status|人工进度',
                    'remark|说明',
                    'occurredAt|登记时间',
                  )
                "
              />
            </Card>
            <Card title="分批发货与客户退货" size="small">
              <RecordTable
                :data="contract.shipments ?? []"
                :columns="
                  columns(
                    'id|发货记录',
                    'contractItemId|合同明细',
                    'poolId|库存池',
                    'kind|类型',
                    'quantity|数量',
                    'eventId|库存流水',
                    'evidenceRef|物流凭证',
                    'occurredAt|发生时间',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane v-if="canFinance" key="finance" tab="回款与发票">
          <div class="stack">
            <div v-if="contract.financeSummary" class="metrics">
              <div
                v-for="metric in [
                  { key: 'confirmedReceipts', title: '已确认回款' },
                  { key: 'unpaidAmount', title: '合同未回款' },
                  { key: 'effectiveInvoices', title: '有效开票' },
                  { key: 'unboundInvoiceAmount', title: '发票未绑定' },
                  { key: 'availableReceiptAmount', title: '可分配回款' },
                  { key: 'overpaidAmount', title: '多收待处理' },
                ]"
                :key="metric.key"
              >
                <span>{{ metric.title }}</span><strong>{{
                  money(contract.financeSummary[metric.key], contract.currency)
                }}</strong>
              </div>
            </div>
            <Space wrap>
              <template
                v-for="action in [
                  'CREATE_RECEIPT',
                  'CONFIRM_RECEIPT',
                  'REVERSE_RECEIPT',
                  'CREATE_INVOICE',
                  'VOID_INVOICE',
                  'BIND_ALLOCATION',
                  'UNBIND_ALLOCATION',
                ]"
                :key="action"
              >
                <Button
                  v-if="allowed(action)"
                  :type="action === 'BIND_ALLOCATION' ? 'primary' : 'default'"
                  @click="openAction(action)"
                >
                  {{ definitions[action]?.title }}
                </Button>
              </template>
            </Space>
            <Alert
              type="info"
              show-icon
              message="绑定只建立回款与发票之间的金额关系，不增加合同已回款。未绑定发票金额不等于新增应收。"
            />
            <Card title="统一回款记录" size="small">
              <RecordTable
                :data="contract.finance?.receipts ?? []"
                :columns="
                  columns(
                    'id|回款 ID',
                    'kind|类型',
                    'receivedAt|到账日期',
                    'amount|金额',
                    'currency|币种',
                    'status|状态',
                    'evidenceRef|凭证',
                    'confirmedBy|确认人',
                    'originalReceiptId|原回款引用',
                  )
                "
              />
            </Card>
            <Card title="真实开票记录" size="small">
              <RecordTable
                :data="contract.finance?.invoices ?? []"
                :columns="
                  columns(
                    'id|发票 ID',
                    'invoiceNumber|发票号',
                    'type|发票类型',
                    'issuedAt|开票日期',
                    'amount|价税金额',
                    'currency|币种',
                    'status|有效状态',
                    'originalInvoiceId|原发票引用',
                  )
                "
              />
            </Card>
            <Card title="部分金额绑定 / 解绑流水" size="small">
              <RecordTable
                :data="contract.finance?.allocations ?? []"
                :columns="
                  columns(
                    'id|绑定 ID',
                    'receiptId|回款 ID',
                    'invoiceId|发票 ID',
                    'amount|分配金额',
                    'originalAllocationId|原分配引用',
                    'reason|说明',
                    'createdAt|发生时间',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane
          v-if="profit || contract.finance?.costs"
          key="cost"
          tab="成本与订单贡献"
        >
          <div class="stack">
            <Space wrap>
              <template
                v-for="action in [
                  'CREATE_COST',
                  'REVERSE_COST',
                  'SET_PROFIT_POLICY',
                ]"
                :key="action"
              >
                <Button v-if="allowed(action)" @click="openAction(action)">
                  {{ definitions[action]?.title }}
                </Button>
              </template>
            </Space>
            <Alert
              type="warning"
              show-icon
              :message="
                String(
                  profit?.notice ||
                    '订单贡献为业务口径，不是最终净利润。收入与成本口径需财务确认，缺项不补零。',
                )
              "
            />
            <div class="profit-grid">
              <Card
                v-for="entry in [
                  { name: '预计订单贡献', value: estimated },
                  { name: '已归集订单贡献', value: collected },
                ]"
                :key="entry.name"
                :title="entry.name"
                size="small"
              >
                <div v-if="entry.value" class="stack">
                  <strong class="profit-value">{{
                    money(entry.value.contribution, contract.currency)
                  }}</strong>
                  <div>
                    业务收入
                    {{ money(entry.value.revenue, contract.currency) }} ·
                    已知成本
                    {{ money(entry.value.knownCost, contract.currency) }}
                  </div>
                  <Tag :color="entry.value.complete ? 'green' : 'orange'">
                    {{
                      entry.value.complete ? '当前口径成本已完整' : '成本未完整'
                    }}
                  </Tag>
                  <div
                    v-if="
                      Array.isArray(entry.value.missingCosts) &&
                      entry.value.missingCosts.length
                    "
                  >
                    待归集：{{
                      missingCostsDescription(entry.value.missingCosts)
                    }}
                  </div>
                </div>
                <Empty
                  v-else
                  description="尚未确认财务口径"
                  :image="Empty.PRESENTED_IMAGE_SIMPLE"
                />
              </Card>
            </div>
            <p v-if="profit">
              口径版本：{{ label(profit.policyVersion) }} · 已承诺成本：{{
                money(profit.committedCost, contract.currency)
              }}
            </p>
            <Card title="成本台账与反向更正" size="small">
              <RecordTable
                :data="contract.finance?.costs ?? []"
                :columns="
                  columns(
                    'id|成本 ID',
                    'sourceKey|来源唯一编号',
                    'contractItemId|合同明细',
                    'category|成本要素',
                    'stage|归集阶段',
                    'amount|原币金额',
                    'currency|原币种',
                    'exchangeRate|汇率',
                    'contractCurrencyAmount|合同币种金额',
                    'taxTreatment|税费口径',
                    'policyVersion|口径版本',
                    'originalCostId|原成本引用',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane v-if="allowed('READ_AI_REVIEWS')" key="ai" tab="AI 预审与证据">
          <div class="stack">
            <Space>
              <Button
                v-if="allowed('REQUEST_AI_REVIEW')"
                type="primary"
                @click="openAi"
              >
                发起 AI 预审
</Button><Button :loading="aiLoading" @click="loadAi(true)">
                刷新处理结果
              </Button>
</Space><Alert
              v-if="aiError"
              :message="aiError"
              type="error"
              show-icon
            /><Alert
              type="info"
              show-icon
              message="AI 仅对指定输入版本提供证据与风险建议。预审失败或数据不足可转人工，批准和下单仍由授权人员完成。"
            /><Card title="采购预审记录" size="small">
              <RecordTable
                :data="aiReviews"
                :loading="aiLoading"
                empty="暂无预审结果；可先按确定性规则完成人工经理决策"
                :columns="
                  columns(
                    'id|预审 ID',
                    'planId|采购方案',
                    'planVersion|方案版本',
                    'inputVersion|输入版本',
                    'status|预审状态',
                    'ruleVersion|规则版本',
                    'modelId|模型',
                    'summary|结论与缺项',
                    'risks|证据与风险',
                    'evidenceIds|依据',
                    'createdAt|时间',
                  )
                "
              />
            </Card>
          </div>
        </TabPane>
        <TabPane key="audit" tab="操作审计">
          <div class="stack">
            <Space>
              <Button :loading="auditLoading" @click="loadAudit">
                刷新操作记录
</Button><span>最近 200 条合同操作，记录版本与经办人。</span>
</Space><Alert
              v-if="auditError"
              :message="auditError"
              type="error"
              show-icon
            /><RecordTable
              :data="auditRows"
              :loading="auditLoading"
              :columns="
                columns(
                  'actor_id|操作人',
                  'document_version|操作后版本',
                  'action|业务动作',
                  'created_at|发生时间',
                )
              "
            />
          </div>
        </TabPane>
      </Tabs>
    </div>
    <Empty
      v-else
      :description="loading ? '正在读取已授权单据…' : '未加载合同或无权访问'"
    />
  </Drawer>
  <ActionDialog
    :open="actionOpen"
    :definition="selectedAction"
    :saving="saving"
    :error="actionError"
    @close="actionOpen = false"
    @submit="execute"
  />
</template>

<style scoped>
.contract-detail,
.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contract-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  padding: 16px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
  border-radius: 10px;
}

.contract-strip > div,
.metrics > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.contract-strip span,
.metrics span {
  font-size: 12px;
  color: #64748b;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metrics > div {
  padding: 14px;
  border: 1px solid var(--ant-color-border, #e2e8f0);
  border-radius: 10px;
}

.metrics strong {
  font-size: 18px;
}

.profit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.profit-value {
  font-size: 26px;
}

@media (max-width: 720px) {
  .metrics,
  .profit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
