<script lang="ts" setup>
import type { ActionDefinition } from './data';

import type {
  Access,
  BusinessRecord,
  Contract,
  Grant,
  MasterRecord,
  StockView,
} from '#/api/fdmplatform';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Result,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  createContract,
  createGrant,
  getAccess,
  getContract,
  getContracts,
  getGrants,
  getMasterData,
  getRoutingRules,
  getStock,
  revokeGrant,
  saveMasterData,
  saveRoutingRule,
  stockAction,
} from '#/api/fdmplatform';

import ActionDialog from './components/ActionDialog.vue';
import ContractDetail from './components/ContractDetail.vue';
import ImportPanel from './components/ImportPanel.vue';
import RecordTable from './components/RecordTable.vue';
import {
  contractDraftAction,
  errorText,
  field,
  label,
  masterOptions,
  masterTypes,
  money,
  roles,
  rows,
  selectField,
} from './data';

defineOptions({ name: 'FdmPlatformWorkbench' });
const enabled = import.meta.env.VITE_FDM_PLATFORM_ENABLED === 'true';
const access = ref<Access>();
const companyId = ref<number>();
const activeTab = ref('contracts');
const loading = ref(false);
const initialLoading = ref(true);
const loadError = ref('');
const contracts = ref<Contract[]>([]);
const master = ref<MasterRecord[]>([]);
const stock = ref<StockView>({
  version: 0,
  pools: [],
  events: [],
  reservations: [],
});
const grants = ref<Grant[]>([]);
const routingRules = ref<BusinessRecord[]>([]);
const keyword = ref('');
const typeFilter = ref<string>();
const masterType = ref('CUSTOMER');
const detailOpen = ref(false);
const detailLoading = ref(false);
const selectedContract = ref<Contract>();
const actionOpen = ref(false);
const actionDefinition = ref<ActionDefinition>();
const saving = ref(false);
const actionError = ref('');
const revokingGrantId = ref('');
let loadSequence = 0;
let detailSequence = 0;

const companyRoles = computed(
  () =>
    access.value?.companies.find(
      (company) => company.companyId === companyId.value,
    )?.roles ?? [],
);
const hasRole = (...names: string[]) =>
  names.some((name) => companyRoles.value.includes(name));
const canCreate = computed(() => hasRole('SALES', 'SALES_MANAGER'));
const canMaster = computed(() => hasRole('MASTER_ADMIN'));
const canStock = computed(() =>
  hasRole('WAREHOUSE', 'BUYER', 'PURCHASE_MANAGER', 'MANAGEMENT'),
);
const canGrant = computed(() => hasRole('ACCESS_ADMIN'));
const readableMasterTypes = computed(() =>
  masterTypes.filter((entry) => {
    if (entry.value === 'SUPPLIER')
      return hasRole('MASTER_ADMIN', 'BUYER', 'PURCHASE_MANAGER', 'FINANCE');
    if (entry.value === 'CUSTOMER')
      return hasRole(
        'MASTER_ADMIN',
        'SALES',
        'SALES_MANAGER',
        'FINANCE',
        'MANAGEMENT',
      );
    return hasRole(
      'MASTER_ADMIN',
      'SALES',
      'SALES_MANAGER',
      'BUYER',
      'PURCHASE_MANAGER',
      'FINANCE',
      'WAREHOUSE',
      'MANAGEMENT',
    );
  }),
);
const hasAccess = computed(
  () =>
    (access.value?.companies.length ?? 0) > 0 && companyId.value !== undefined,
);
const companyOptions = computed(
  () =>
    access.value?.companies.map((company) => ({
      value: company.companyId,
      label: company.companyName
        ? `${company.companyName} · #${company.companyId}`
        : `公司 #${company.companyId}`,
    })) ?? [],
);
const filteredContracts = computed(() =>
  contracts.value.filter((contract) => {
    const text =
      `${contract.name} ${contract.code} ${contract.customerName}`.toLowerCase();
    return (
      text.includes(keyword.value.trim().toLowerCase()) &&
      (!typeFilter.value || contract.businessType === typeFilter.value)
    );
  }),
);
const taskStats = computed(() => [
  {
    title: '授权范围内合同',
    value: contracts.value.length,
    note: '仅当前公司与数据范围',
  },
  {
    title: '待确认合同',
    value: contracts.value.filter((contract) => contract.status === 'DRAFT')
      .length,
    note: '确认规格与商业条件',
  },
  {
    title: '待经理决策方案',
    value: contracts.value
      .flatMap((contract) => contract.plans ?? [])
      .filter((plan) => plan.status === 'SUBMITTED').length,
    note: '批准绑定方案版本',
  },
  {
    title: '待确认回款',
    value: contracts.value
      .flatMap((contract) => contract.finance?.receipts ?? [])
      .filter((receipt) => receipt.status === 'PENDING').length,
    note: '仅统计当前可见回款记录',
  },
]);
const masterRows = computed(() =>
  master.value.filter((item) => item.type === masterType.value),
);
const stockEvents = computed(() =>
  stock.value.pools.flatMap((pool) =>
    rows(pool.events).map((event) => ({ ...event, poolId: pool.id })),
  ),
);
const stockReservations = computed(() =>
  stock.value.pools.flatMap((pool) =>
    rows(pool.reservations).map((reservation) => ({
      ...reservation,
      poolId: pool.id,
    })),
  ),
);
const personalGrants = computed(() =>
  (access.value?.grants ?? [])
    .filter((grant) => grant.companyId === companyId.value)
    .map((grant) => ({
      ...grant,
      roleName:
        roles.find((role) => role.value === grant.role)?.label ?? grant.role,
      scopeName: { ALL: '授权公司', DEPARTMENT: '授权部门', OWN: '本人负责' }[
        grant.scope
      ],
    })),
);
const contractColumns = computed(() => [
  { title: '合同 / 样品', dataIndex: 'name', key: 'name', width: 260 },
  { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 190 },
  {
    title: '业务类型',
    dataIndex: 'businessType',
    key: 'businessType',
    width: 130,
  },
  ...(contracts.value.some((contract) => contract.amount !== undefined)
    ? [{ title: '合同金额', dataIndex: 'amount', key: 'amount', width: 160 }]
    : []),
  { title: '状态', dataIndex: 'status', key: 'status', width: 120 },
  { title: '产品明细', key: 'items', width: 95 },
  { title: '负责人', dataIndex: 'ownerUserId', key: 'ownerUserId', width: 100 },
  {
    title: '版本',
    dataIndex: 'businessVersion',
    key: 'businessVersion',
    width: 75,
  },
  { title: '操作', key: 'action', fixed: 'right' as const, width: 105 },
]);
const columns = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title! };
  });

async function initialize() {
  if (!enabled) return;
  initialLoading.value = true;
  loadError.value = '';
  try {
    access.value = await getAccess();
    companyId.value = access.value.companies.some(
      (company) => company.companyId === companyId.value,
    )
      ? companyId.value
      : access.value.companies[0]?.companyId;
    if (hasAccess.value) await loadCompany();
  } catch (error) {
    access.value = undefined;
    companyId.value = undefined;
    clearData();
    loadError.value = errorText(error);
  } finally {
    initialLoading.value = false;
  }
}
function clearData() {
  contracts.value = [];
  master.value = [];
  stock.value = { version: 0, pools: [], events: [], reservations: [] };
  grants.value = [];
  routingRules.value = [];
  selectedContract.value = undefined;
  detailOpen.value = false;
  detailSequence += 1;
}
async function loadCompany() {
  const company = companyId.value;
  if (!company || !hasAccess.value) return;
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  if (
    !readableMasterTypes.value.some((entry) => entry.value === masterType.value)
  )
    masterType.value = String(readableMasterTypes.value[0]?.value ?? 'SKU');
  const results = await Promise.allSettled([
    getContracts(company),
    loadMasterData(company),
    canStock.value
      ? getStock(company)
      : Promise.resolve({
          version: 0,
          pools: [],
          events: [],
          reservations: [],
        } as StockView),
    canGrant.value ? getGrants(company) : Promise.resolve([] as Grant[]),
    hasRole('PURCHASE_MANAGER')
      ? getRoutingRules(company)
      : Promise.resolve([] as BusinessRecord[]),
  ]);
  if (sequence !== loadSequence || companyId.value !== company) return;
  const [
    contractResult,
    masterResult,
    stockResult,
    grantResult,
    routingResult,
  ] = results;
  contracts.value =
    contractResult.status === 'fulfilled' ? contractResult.value : [];
  master.value = masterResult.status === 'fulfilled' ? masterResult.value : [];
  stock.value =
    stockResult.status === 'fulfilled'
      ? stockResult.value
      : { version: 0, pools: [], events: [], reservations: [] };
  grants.value = grantResult.status === 'fulfilled' ? grantResult.value : [];
  routingRules.value =
    routingResult.status === 'fulfilled' ? routingResult.value : [];
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          `${['合同', '主数据', '库存', '授权', '分派规则'][index]}：${errorText(result.reason)}`,
        ]
      : [],
  );
  loadError.value = errors.join('；');
  loading.value = false;
}
async function loadMasterData(company: number) {
  const result = await Promise.allSettled(
    readableMasterTypes.value.map((entry) =>
      getMasterData(company, String(entry.value)),
    ),
  );
  const failed = result.find((entry) => entry.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return result.flatMap((entry) =>
    entry.status === 'fulfilled' ? entry.value : [],
  );
}
async function changeCompany() {
  clearData();
  actionOpen.value = false;
  await loadCompany();
}
async function openContract(contract: Contract) {
  detailOpen.value = true;
  selectedContract.value = undefined;
  detailLoading.value = true;
  const sequence = ++detailSequence;
  try {
    const result = await getContract(contract.id);
    if (sequence === detailSequence && result.companyId === companyId.value)
      selectedContract.value = result;
  } catch (error) {
    if (sequence === detailSequence) message.error(errorText(error));
  } finally {
    if (sequence === detailSequence) detailLoading.value = false;
  }
}
async function refreshDetail() {
  const contract = selectedContract.value;
  if (contract) await openContract(contract);
}
async function onContractUpdated(contract: Contract) {
  selectedContract.value = contract;
  await loadCompany();
}
function showAction(definition: ActionDefinition) {
  actionDefinition.value = definition;
  actionError.value = '';
  actionOpen.value = true;
}
function openCreateContract() {
  const department = personalGrants.value.find(
    (grant) => grant.departmentId,
  )?.departmentId;
  showAction(
    contractDraftAction(master.value, access.value?.userId, department),
  );
}
function openMaster() {
  showAction({
    action: 'CREATE_MASTER',
    title: `新增${masterTypes.find((type) => type.value === masterType.value)?.label ?? '主数据'}`,
    description:
      '主数据以内部 ID 关联，外部编号保留来源命名空间。同名记录不会自动合并。',
    fields: [
      selectField('type', '主数据类型', masterTypes, {
        default: masterType.value,
      }),
      field('code', '稳定业务编号'),
      field('name', '名称'),
      selectField(
        'sourceSystem',
        '来源系统',
        [
          { value: 'LOCAL', label: '本平台维护' },
          { value: 'FDM_DATA', label: '现有 FDM 主数据映射' },
          { value: 'JINZHI', label: '金智历史资料' },
          { value: 'OKKI', label: 'OKKI 外贸客户' },
          { value: 'JUSHUITAN', label: '聚水潭库存 / 产品' },
        ],
        { default: 'LOCAL' },
      ),
      field('externalId', '外部系统原始 ID（外部来源必填）', undefined, {
        required: false,
      }),
      field('unit', '产品计量单位', undefined, { required: false }),
      field('specification', '规格说明', 'textarea', { required: false }),
    ],
  });
}
function openGrant() {
  showAction({
    action: 'CREATE_GRANT',
    title: '新增显式业务授权',
    description:
      '技术管理员不自动获得业务数据。授权绑定公司、岗位与数据范围；敏感财务角色按实际职责授予。',
    fields: [
      field('userId', '系统用户 ID', 'number', { min: 1 }),
      selectField('role', '岗位角色', roles),
      selectField(
        'scope',
        '数据范围',
        [
          { value: 'OWN', label: '本人负责' },
          { value: 'DEPARTMENT', label: '指定部门' },
          { value: 'ALL', label: '授权公司全部' },
        ],
        { default: 'OWN' },
      ),
      field('departmentId', '指定部门 ID（部门范围必填）', 'number', {
        required: false,
        min: 1,
      }),
      field('expiresAt', '有效期至（ISO 8601 时间）', undefined, {
        required: false,
        hint: '例如 2026-12-31T15:59:59Z；留空代表没有预设到期时间。',
      }),
      field('reason', '授权依据', 'textarea'),
    ],
  });
}
function openRevoke(grant: Grant) {
  revokingGrantId.value = grant.id;
  showAction({
    action: 'REVOKE_GRANT',
    title: `撤销用户 #${grant.userId} 的业务授权`,
    description: `撤销 ${roles.find((role) => role.value === grant.role)?.label ?? grant.role} 在公司 #${grant.companyId} 的授权，保留历史审计。`,
    fields: [field('reason', '撤销原因', 'textarea')],
  });
}
function openPool() {
  showAction({
    action: 'CREATE_POOL',
    title: '建立库存池',
    description:
      '按货权、仓库、SKU 与规格版本建立唯一库存池。平台接管必须有盘点和主账切换依据，未移交库存保持外部主账。',
    fields: [
      selectField(
        'stockOwnerId',
        '货权主体',
        masterOptions(master.value, 'STOCK_OWNER'),
      ),
      selectField(
        'warehouseId',
        '仓库',
        masterOptions(master.value, 'WAREHOUSE'),
      ),
      selectField('skuId', '产品 / SKU', masterOptions(master.value, 'SKU')),
      field('specVersion', '规格版本', undefined, { default: '1' }),
      selectField(
        'authority',
        '库存权威主账',
        [
          { value: 'EXTERNAL', label: '外部系统（只读影子池）' },
          { value: 'PLATFORM', label: '本平台（已确认接管）' },
        ],
        { default: 'EXTERNAL' },
      ),
      field('takeoverEvidence', '盘点 / 切换依据', 'textarea'),
    ],
  });
}
function openStockAction(action: 'CONFIGURE_AVAILABILITY' | 'OPENING') {
  const poolField = selectField(
    'poolId',
    '库存池',
    stock.value.pools.map((pool) => ({
      value: pool.id,
      label: `${pool.warehouseId} / ${pool.skuId} / ${pool.specVersion} · ${pool.id}`,
    })),
  );
  const sourceField = field('sourceKey', '业务事件唯一编号');
  showAction(
    action === 'OPENING'
      ? {
          action,
          title: '导入已盘点期初库存',
          description:
            '仅允许从未产生任何库存流水的新池导入一次期初。凭证与数量应来自已确认盘点，不会写入外部库存主账。',
          fields: [
            poolField,
            sourceField,
            field('sourceId', '盘点单编号'),
            field('sourceLineId', '盘点明细编号'),
            field('quantity', '期初实存数量', 'decimal', { min: 0.000001 }),
            field('unavailableQuantity', '其中不可售数量', 'decimal', {
              default: '0',
              min: 0,
            }),
            field('evidenceRef', '盘点及接管凭证引用'),
          ],
        }
      : {
          action,
          title: '设置不可售与安全缓冲',
          description:
            '记录变更原因并产生库存事件；不能侵占已经预留给合同的数量。',
          fields: [
            poolField,
            sourceField,
            field('unavailable', '当前不可售数量', 'decimal', { min: 0 }),
            field('safetyStock', '安全缓冲数量', 'decimal', { min: 0 }),
            field('reason', '设置依据', 'textarea'),
          ],
        },
  );
}
function openRoutingRule() {
  showAction({
    action: 'SAVE_ROUTING_RULE',
    title: '维护采购分派规则',
    description:
      '匹配授权公司与 SKU，兼顾在岗、连续负责人及工作量。无法明确匹配时留在经理待分派池。',
    fields: [
      selectField(
        'id',
        '修改已有规则（新建留空）',
        routingRules.value.map((rule) => ({
          value: rule.id,
          label: `${rule.skuId || '公司兜底'} → 用户 #${rule.buyerUserId} · 版本 ${rule.version}`,
          fill: {
            expectedVersion: rule.version ?? 1,
            buyerUserId: Number(rule.buyerUserId),
            priority: Number(rule.priority),
            skuId: String(rule.skuId ?? ''),
            enabled: Boolean(rule.enabled),
            available: Boolean(rule.available),
          },
        })),
        { required: false },
      ),
      field('expectedVersion', '规则预期版本（新建为 0）', 'number', {
        default: 0,
        min: 0,
      }),
      selectField(
        'skuId',
        '匹配 SKU（留空作为公司兜底）',
        masterOptions(master.value, 'SKU'),
        { required: false },
      ),
      field('buyerUserId', '采购员系统用户 ID', 'number', {
        min: 1,
        hint: '使用系统用户编号，不是手机号；用户必须持有当前公司的有效采购权限。',
      }),
      field('enabled', '启用规则', 'boolean', { default: true }),
      field('available', '经办人当前在岗可接单', 'boolean', { default: true }),
      field('priority', '规则优先级', 'number', { default: 100, min: 0 }),
      field('reason', '规则变更原因', 'textarea'),
    ],
  });
}
function split(value: unknown) {
  return String(value ?? '')
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
async function saveAction(
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  if (!companyId.value || !actionDefinition.value) return;
  saving.value = true;
  actionError.value = '';
  try {
    const action = actionDefinition.value.action;
    if (action === 'CREATE_CONTRACT') {
      payload.companyId = companyId.value;
      payload.customerName = master.value.find(
        (item) => item.id === payload.customerId,
      )?.name;
      payload.attachmentIds = split(payload.attachmentIds);
      payload.items = rows(payload.items).map((item) => ({
        ...item,
        skuName: master.value.find((sku) => sku.id === item.skuId)?.name,
        attachmentIds: split(item.attachmentIds),
      }));
      const result = await createContract({ ...payload, idempotencyKey });
      selectedContract.value = result;
      detailOpen.value = true;
    } else if (action === 'CREATE_MASTER') {
      await saveMasterData({
        ...payload,
        companyId: companyId.value,
        idempotencyKey,
      });
    } else if (action === 'CREATE_GRANT') {
      if (payload.scope === 'DEPARTMENT' && !payload.departmentId)
        throw new Error('部门数据范围必须填写部门 ID');
      await createGrant({
        ...payload,
        companyId: companyId.value,
        idempotencyKey,
      });
    } else if (action === 'REVOKE_GRANT') {
      await revokeGrant(revokingGrantId.value, {
        ...payload,
        companyId: companyId.value,
        idempotencyKey,
      });
    } else if (action === 'CREATE_POOL') {
      await stockAction({
        companyId: companyId.value,
        action,
        idempotencyKey,
        payload: { ...payload, companyId: companyId.value },
      });
    } else if (action === 'OPENING' || action === 'CONFIGURE_AVAILABILITY') {
      const pool = stock.value.pools.find(
        (entry) => entry.id === payload.poolId,
      );
      if (!pool || pool.version === undefined)
        throw new Error('库存池版本未加载，请刷新后重新操作');
      const { poolId, ...command } = payload;
      if (action === 'OPENING') {
        command.sourceType = 'OPENING';
        command.contractId = null;
        command.contractItemId = null;
      }
      await stockAction({
        companyId: companyId.value,
        action,
        idempotencyKey,
        payload: { poolId, poolVersion: pool.version, command },
      });
    } else if (action === 'SAVE_ROUTING_RULE') {
      await saveRoutingRule({
        ...payload,
        companyId: companyId.value,
        idempotencyKey,
      });
    }
    actionOpen.value = false;
    message.success('业务操作已保存');
    await (action === 'CREATE_GRANT' || action === 'REVOKE_GRANT'
      ? initialize()
      : loadCompany());
  } catch (error) {
    actionError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  if (enabled) void initialize();
  else initialLoading.value = false;
});
</script>

<template>
  <Page auto-content-height>
    <div class="platform-workbench">
      <header class="platform-header">
        <div>
          <span class="eyebrow">飞德慕 · 合同履约协同</span>
          <h1>业务工作台</h1>
          <p>围绕一份合同，协同采购、交付、资金与订单贡献。</p>
        </div>
        <Space v-if="enabled" wrap>
          <Select
            v-if="hasAccess"
            v-model:value="companyId"
            :options="companyOptions"
            style="min-width: 140px"
            aria-label="授权公司"
            @change="changeCompany"
          /><Button :loading="initialLoading || loading" @click="initialize">
            刷新授权与数据
</Button><Button
            v-if="hasAccess && canCreate"
            type="primary"
            @click="openCreateContract"
          >
            新建合同 / 样品
          </Button>
        </Space>
      </header>
      <Alert v-if="loadError" :message="loadError" type="error" show-icon />
      <Result
        v-if="!enabled"
        status="info"
        title="业务协同平台尚未启用"
        sub-title="当前前端构建未启用平台扩展。由部署管理员显式开启前后端模块并配置授权后使用。"
      />
      <div v-else-if="initialLoading && !access" class="empty-state">
        <Card :loading="true" />
      </div>
      <Result
        v-else-if="!hasAccess"
        status="403"
        title="尚未取得平台业务授权"
        sub-title="请由平台授权管理员为当前用户配置公司、岗位与数据范围。授权生效后刷新本页。"
      >
        <template #extra>
          <Button :loading="initialLoading" @click="initialize">
            重新读取授权
          </Button>
        </template>
      </Result>
      <template v-else>
        <div class="metrics-grid">
          <div v-for="stat in taskStats" :key="stat.title" class="metric">
            <span>{{ stat.title }}</span><strong>{{ stat.value }}</strong><small>{{ stat.note }}</small>
          </div>
        </div>
        <div class="scope-line">
          <span>当前用户 #{{ access?.userId }} ·</span><Tag v-for="role in companyRoles" :key="role">
            {{ roles.find((item) => item.value === role)?.label ?? role }}
</Tag><span class="scope-note">数据由服务端按授权范围返回</span>
        </div>
        <Card class="workspace-card" :bordered="false">
          <Tabs v-model:active-key="activeTab">
            <TabPane key="contracts" tab="合同与待办">
              <div class="tab-stack">
                <div class="toolbar">
                  <Space wrap>
                    <Input
                      v-model:value="keyword"
                      placeholder="搜索合同编号、名称、客户"
                      allow-clear
                      style="width: 300px"
                    /><Select
                      v-model:value="typeFilter"
                      :options="[
                        { value: 'FOREIGN', label: '外贸 B2B' },
                        { value: 'DOMESTIC', label: '国内 B2B' },
                        { value: 'GOVERNMENT', label: '政府客户' },
                        { value: 'SAMPLE', label: '样品' },
                      ]"
                      placeholder="全部业务类型"
                      allow-clear
                      style="width: 150px"
                    />
</Space><span class="muted">{{ filteredContracts.length }} 份合同</span>
                </div>
                <Table
                  :columns="contractColumns"
                  :data-source="filteredContracts"
                  row-key="id"
                  :loading="loading"
                  :scroll="{ x: 1050 }"
                  :pagination="{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total: number) => `共 ${total} 份合同`,
                  }"
                >
                  <template #emptyText>
                    <Empty description="当前授权范围内暂无合同">
                      <Button
                        v-if="canCreate"
                        type="primary"
                        @click="openCreateContract"
                      >
                        创建第一份合同或样品
                      </Button>
                    </Empty>
                  </template>
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'name'">
                      <Button
                        type="link"
                        class="contract-title"
                        @click="openContract(record as Contract)"
                      >
                        {{ record.name }}
                      </Button>
                      <div class="contract-code">
                        {{ record.code }}
                      </div>
                    </template>
                    <Tag
                      v-else-if="column.key === 'status'"
                      :color="record.status === 'DRAFT' ? 'default' : 'blue'"
                    >
                      {{ label(record.status) }}
                    </Tag>
                    <span v-else-if="column.key === 'businessType'">{{
                      label(record.businessType)
                    }}</span>
                    <span v-else-if="column.key === 'amount'">{{
                      money(record.amount, record.currency)
                    }}</span>
                    <span v-else-if="column.key === 'items'">{{ record.items?.length ?? 0 }} 项</span>
                    <Button
                      v-else-if="column.key === 'action'"
                      type="link"
                      @click="openContract(record as Contract)"
                    >
                      进入办理
                    </Button>
                  </template>
                </Table>
              </div>
            </TabPane>
            <TabPane v-if="canMaster" key="imports" tab="主数据迁移">
              <ImportPanel
                v-if="activeTab === 'imports'"
                :company-id="companyId!"
                @imported="loadCompany"
              />
            </TabPane>
            <TabPane
              v-if="readableMasterTypes.length"
              key="master"
              tab="统一主数据"
            >
              <div class="tab-stack">
                <div class="toolbar">
                  <Select
                    v-model:value="masterType"
                    :options="readableMasterTypes"
                    style="width: 180px"
                  /><Button v-if="canMaster" type="primary" @click="openMaster">
                    新增主数据
                  </Button>
                </div>
                <Alert
                  type="info"
                  show-icon
                  message="此处保存平台主数据与现有 / 外部系统映射。名称相同不会自动合并，历史合同保留创建时的规格快照。"
                /><RecordTable
                  :data="masterRows"
                  :loading="loading"
                  :columns="
                    columns(
                      'id|内部 ID',
                      'code|业务编号',
                      'name|名称',
                      'sourceSystem|来源系统',
                      'externalId|原系统 ID',
                      'specification|规格说明',
                      'unit|单位',
                      'active|启用',
                      'version|版本',
                    )
                  "
                />
              </div>
            </TabPane>
            <TabPane v-if="canStock" key="stock" tab="库存主账">
              <div class="tab-stack">
                <div class="toolbar">
                  <span class="muted">货权 · 仓库 · SKU · 规格版本</span><Space v-if="hasRole('WAREHOUSE')" wrap>
                    <Button type="primary" @click="openPool">建立库存池</Button><Button @click="openStockAction('OPENING')">
                      导入期初
</Button><Button @click="openStockAction('CONFIGURE_AVAILABILITY')">
                      不可售 / 安全缓冲
                    </Button>
                  </Space>
                </div>
                <Alert
                  type="info"
                  show-icon
                  message="可用库存 = 现存量 − 不可售量 − 已预留量 − 安全缓冲。收发与预留从合同详情办理，不直接修改余额。"
                /><RecordTable
                  :data="stock.pools"
                  :loading="loading"
                  :columns="
                    columns(
                      'id|库存池 ID',
                      'stockOwnerId|货权主体',
                      'warehouseId|仓库',
                      'skuId|SKU',
                      'specVersion|规格版本',
                      'authority|主账',
                      'onHand|现存量',
                      'unavailable|不可售',
                      'reserved|已预留',
                      'safetyStock|安全缓冲',
                      'available|可用库存',
                      'version|数据版本',
                    )
                  "
                /><Card title="预留与释放余额" size="small">
                  <RecordTable
                    :data="stockReservations"
                    :columns="
                      columns(
                        'id|预留 ID',
                        'poolId|库存池',
                        'contractId|合同',
                        'contractItemId|合同明细',
                        'quantity|原预留数量',
                        'releasedQuantity|已释放',
                        'shippedQuantity|已发货',
                        'remainingQuantity|未执行预留',
                      )
                    "
                  />
</Card><Card title="不可覆写的库存事件" size="small">
                  <RecordTable
                    :data="stockEvents"
                    :columns="
                      columns(
                        'id|事件 ID',
                        'poolId|库存池',
                        'type|业务动作',
                        'contractId|合同',
                        'sourceKey|来源唯一编号',
                        'deltaOnHand|现存变动',
                        'deltaReserved|预留变动',
                        'evidenceRef|业务凭证',
                        'occurredAt|发生时间',
                      )
                    "
                  />
                </Card>
              </div>
            </TabPane>
            <TabPane
              v-if="hasRole('PURCHASE_MANAGER')"
              key="routing"
              tab="采购分派规则"
            >
              <div class="tab-stack">
                <div class="toolbar">
                  <span class="muted">常规规则自动匹配，异常由经理处理</span><Button type="primary" @click="openRoutingRule">
                    新增 / 调整规则
                  </Button>
                </div>
                <Alert
                  type="info"
                  show-icon
                  message="申请明细没有匹配经办人时保留明确原因。经办人离岗或停用规则不应使任务消失，经理仍可在合同详情转派。"
                /><RecordTable
                  :data="routingRules"
                  :columns="
                    columns(
                      'id|规则 ID',
                      'skuId|匹配 SKU（空为兜底）',
                      'buyerUserId|采购员用户 ID',
                      'priority|优先级',
                      'enabled|启用',
                      'available|在岗可接单',
                      'version|版本',
                      'reason|变更依据',
                    )
                  "
                />
              </div>
            </TabPane>
            <TabPane key="access" tab="身份与业务授权">
              <div class="tab-stack">
                <Alert
                  type="info"
                  show-icon
                  message="沿用当前系统登录身份；本平台额外要求显式公司与岗位授权。财务、采购底价和库存操作由后端独立校验。"
                /><Card title="我的有效授权范围" size="small">
                  <RecordTable
                    :data="personalGrants as unknown as BusinessRecord[]"
                    :columns="
                      columns(
                        'companyId|公司',
                        'roleName|岗位',
                        'scopeName|数据范围',
                        'departmentId|部门',
                        'expiresAt|到期时间',
                        'reason|授权依据',
                      )
                    "
                  />
</Card><template v-if="canGrant">
                  <div class="toolbar">
                    <strong>当前公司授权管理</strong><Button type="primary" @click="openGrant">
                      新增业务授权
                    </Button>
                  </div>
                  <Table
                    :data-source="grants"
                    row-key="id"
                    :loading="loading"
                    :columns="[
                      { title: '用户 ID', dataIndex: 'userId' },
                      { title: '岗位角色', key: 'role' },
                      { title: '数据范围', dataIndex: 'scope' },
                      { title: '部门', dataIndex: 'departmentId' },
                      { title: '到期时间', dataIndex: 'expiresAt' },
                      { title: '操作', key: 'action' },
                    ]"
                    :scroll="{ x: 780 }"
                  >
                    <template #bodyCell="{ column, record }">
                      <span v-if="column.key === 'role'">{{
                        roles.find((role) => role.value === record.role)
                          ?.label ?? record.role
                      }}</span><Button
                        v-else-if="column.key === 'action' && !record.revoked"
                        type="link"
                        danger
                        @click="openRevoke(record as Grant)"
                      >
                        撤销授权
                      </Button>
                    </template>
                  </Table>
                </template>
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </template>
    </div>
    <ContractDetail
      :contract="selectedContract"
      :loading="detailLoading"
      :master="master"
      :open="detailOpen"
      :pools="stock.pools"
      @close="
        detailOpen = false;
        detailSequence += 1;
      "
      @refresh="refreshDetail"
      @updated="onContractUpdated"
    />
    <ActionDialog
      :definition="actionDefinition"
      :error="actionError"
      :open="actionOpen"
      :saving="saving"
      @close="actionOpen = false"
      @submit="saveAction"
    />
  </Page>
</template>

<style scoped>
.platform-workbench {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
  padding-bottom: 24px;
}

.platform-header {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 26px 28px;
  background: linear-gradient(115deg, #10263e, #173c53);
  border-radius: 14px;
}

.eyebrow {
  font-size: 12px;
  color: #99d5d0;
  letter-spacing: 0.12em;
}

h1 {
  margin: 7px 0;
  font-size: 27px;
  font-weight: 650;
  color: #fff;
}

.platform-header p {
  margin: 0;
  font-size: 13px;
  color: #bed0dc;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 18px 22px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #e7ecf1);
  border-radius: 12px;
}

.metric span {
  font-size: 13px;
  color: #64748b;
}

.metric strong {
  font-size: 29px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.metric small {
  font-size: 11px;
  color: #94a3b8;
}

.scope-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

.scope-note {
  margin-left: auto;
}

.workspace-card {
  border-radius: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.tab-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 6px;
}

.muted {
  font-size: 12px;
  color: #64748b;
}

.contract-title {
  height: auto;
  padding: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  white-space: normal;
}

.contract-code {
  margin-top: 3px;
  font-size: 12px;
  color: #94a3b8;
}

.empty-state {
  min-height: 240px;
}

@media (max-width: 1000px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .platform-header {
    padding: 20px;
  }

  .scope-note {
    margin-left: 0;
  }
}
</style>
