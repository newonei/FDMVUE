<script lang="ts" setup>
import type { ActionDefinition } from './data';
import type { DetailTab, WorkspaceKey } from './workspaces';

import type {
  Access,
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
  MasterRecord,
  StockView,
} from '#/api/fdmplatform';

import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Pagination,
  Result,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getAccess,
  getBusinessPage,
  getContract,
  getDirectory,
  getMasterData,
  getRoutingRules,
  saveMasterData,
  saveRoutingRule,
  stockAction,
  updateMasterData,
} from '#/api/fdmplatform';
import { getStockPage, getStockPool } from '#/api/fdmplatform/stock';

import ActionDialog from './components/ActionDialog.vue';
import ContractDetail from './components/ContractDetail.vue';
import ImportPanel from './components/ImportPanel.vue';
import MasterSourcePicker from './components/MasterSourcePicker.vue';
import RecordTable from './components/RecordTable.vue';
import { productCategoryLabel } from './contract-categories';
import {
  errorText,
  field,
  label,
  masterOptions,
  masterTypes,
  money,
  selectField,
} from './data';
import { personLabel, withDirectory } from './directory';
import BusinessDocumentList from './documents/BusinessDocumentList.vue';
import { nativeMoney } from './documents/migration-display';
import { referenceId, withoutDetailQuery } from './documents/navigation';
import {
  stockLocation,
  stockNavigationView,
  withoutStockQuery,
} from './documents/stock-navigation';
import { useRouteOwner } from './documents/useRouteOwner';
import { receiptFxDisplay } from './finance/exchange-rates/model';
import ContractEditor from './products/components/ContractEditor.vue';
import { detailTabFor, workspaces } from './workspaces';

import './components/compact-tables.css';

defineOptions({ name: 'FdmPlatformWorkbench' });
const props = withDefaults(defineProps<{ workspace?: WorkspaceKey }>(), {
  workspace: 'trade-contracts',
});
const route = useRoute();
const router = useRouter();
const routeActive = useRouteOwner();
const contractEditorOpen = ref(false);
const workspaceDefinition = computed(() => workspaces[props.workspace]);
const access = ref<Access>();
const companyId = ref(0);
const activeTab = ref<string>(workspaceDefinition.value.section);
const recordResource = ref(workspaceDefinition.value.groups?.[0]?.resource);
const recordGroup = computed(() =>
  workspaceDefinition.value.groups?.find(
    (group) => group.resource === recordResource.value,
  ),
);
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const statusFilter = ref<string>();
const requestStateFilter = ref<string>();
const ownerFilter = ref<number>();
const documents = ref<DocumentRow[]>([]);
const directory = ref<Directory>();
provide('fdmPlatformDirectory', directory);
const detailTab = ref<DetailTab>(workspaceDefinition.value.defaultTab);
const detailContext = ref<{
  record: BusinessRecord;
  resource: NonNullable<typeof recordResource.value>;
}>();
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
const stockLoadError = ref('');
const stockDocumentTitles = {
  'stock-ins': '入库单',
  'stock-outs': '出库单',
  stocktakes: '库存盘点',
} as const;
const inventoryType = computed<'pools' | keyof typeof stockDocumentTitles>({
  get: () =>
    typeof route.query.inventoryType === 'string' &&
    Object.hasOwn(stockDocumentTitles, route.query.inventoryType)
      ? (route.query.inventoryType as keyof typeof stockDocumentTitles)
      : 'pools',
  set: (inventoryType) => {
    void router.replace({
      query: {
        ...withoutDetailQuery(withoutStockQuery(route.query)),
        inventoryType,
      },
    });
  },
});
const routingRules = ref<BusinessRecord[]>([]);
const keyword = ref('');
const masterType = ref('CUSTOMER');
const detailOpen = ref(false);
const detailLoading = ref(false);
const selectedContract = ref<Contract>();
const actionOpen = ref(false);
const actionDefinition = ref<ActionDefinition>();
const saving = ref(false);
const actionError = ref('');
const editingMaster = ref<MasterRecord>();
let loadSequence = 0;
let detailSequence = 0;

const canCreate = computed(() => props.workspace === 'trade-contracts');
const readableMasterTypes = computed(() => masterTypes);
const hasAccess = computed(() => Boolean(access.value));
const companyName = (id: number) =>
  access.value?.companies.find((company) => company.companyId === id)
    ?.companyName ?? (id ? `公司 #${id}` : '待补齐');
const filteredContracts = computed(() => contracts.value);
const recordColumns = computed(() => [
  { title: '关联合同', key: 'contract', width: 210 },
  { title: '订单所属公司', key: 'company', width: 220, ellipsis: true },
  ...(recordGroup.value?.fields ?? []).map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title!, width: 160 };
  }),
  { title: '操作', key: 'action', fixed: 'right' as const, width: 110 },
]);
const isBusinessPage = computed(() =>
  ['contracts', 'records', 'stock'].includes(workspaceDefinition.value.section),
);
const hasContractTab = computed(
  () => workspaceDefinition.value.section === 'contracts',
);
const taskStats = computed(() =>
  props.workspace === 'inventory-stock'
    ? [
        {
          title: '库存池总数',
          value: stock.value.total ?? 0,
          note: '来源数量与平台可用量分别显示',
        },
        {
          title: '本页库存池',
          value: stock.value.pools.length,
          note: '原出入库、盘点按单据类型查询',
        },
      ]
    : [
        {
          title: isBusinessPage.value ? '当前筛选单据' : '共享资料',
          value: isBusinessPage.value ? total.value : master.value.length,
          note: '按筛选条件查看全部记录',
        },
        {
          title: '本页单据',
          value:
            activeTab.value === 'records'
              ? documents.value.length
              : contracts.value.length,
          note: '金额按各单据币种展示',
        },
      ],
);
const masterRows = computed(() =>
  master.value.filter((item) => item.type === masterType.value),
);
const displayedStock = computed(() =>
  stockNavigationView(
    stock.value.pools,
    props.workspace,
    routeActive.value ? route.query : {},
    {
      loading: initialLoading.value || loading.value,
      error: stockLoadError.value,
    },
  ),
);
const stockTableKey = computed(() =>
  JSON.stringify([routeActive.value, route.query.poolId, route.query.eventId]),
);
async function clearStockLocation() {
  if (props.workspace !== 'inventory-stock' || !routeActive.value) return;
  await router.replace({ query: withoutStockQuery(route.query) });
}
const contractColumns = computed(() => [
  { title: '订单所属公司', key: 'company', width: 220, ellipsis: true },
  { title: '合同 / 样品', dataIndex: 'name', key: 'name', width: 260 },
  {
    title: '客户',
    dataIndex: 'customerName',
    key: 'customerName',
    width: 190,
    ellipsis: true,
  },
  {
    title: '产品分类',
    dataIndex: 'productCategory',
    key: 'productCategory',
    width: 170,
  },
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
    title: '业务版本',
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
  initialLoading.value = true;
  loadError.value = '';
  try {
    access.value = await getAccess();
    await loadCompany();
  } catch (error) {
    access.value = undefined;
    clearData();
    loadError.value = errorText(error);
  } finally {
    initialLoading.value = false;
  }
}
function clearData() {
  loading.value = false;
  contracts.value = [];
  documents.value = [];
  total.value = 0;
  master.value = [];
  directory.value = undefined;
  stock.value = { version: 0, pools: [], events: [], reservations: [] };
  stockLoadError.value = '';
  routingRules.value = [];
  selectedContract.value = undefined;
  detailOpen.value = false;
  detailSequence += 1;
  loadSequence += 1;
}
async function loadCompany() {
  const company = companyId.value;
  if (!hasAccess.value) return;
  const sequence = ++loadSequence;
  const isContractList = activeTab.value === 'contracts';
  const isRecordList = activeTab.value === 'records';
  const resource = isContractList ? 'contracts' : recordResource.value;
  loading.value = true;
  loadError.value = '';
  if (
    !readableMasterTypes.value.some((entry) => entry.value === masterType.value)
  )
    masterType.value = String(readableMasterTypes.value[0]?.value ?? 'SKU');
  const results = await Promise.allSettled([
    (isContractList || isRecordList) && resource
      ? getBusinessPage<Contract | DocumentRow>(resource, {
          companyId: company,
          pageNo: pageNo.value,
          pageSize: pageSize.value,
          keyword: keyword.value.trim() || undefined,
          ownerUserId: ownerFilter.value,
          ...(resource === 'purchase-requests'
            ? {
                status: requestStateFilter.value,
                assignmentStatus: statusFilter.value,
              }
            : { status: statusFilter.value }),
        })
      : Promise.resolve({ list: [] as (Contract | DocumentRow)[], total: 0 }),
    loadMasterData(company),
    props.workspace === 'inventory-stock' && inventoryType.value === 'pools'
      ? loadStockPage()
      : Promise.resolve({
          version: 0,
          pools: [],
          events: [],
          reservations: [],
        } as StockView),
    props.workspace === 'purchase-routing'
      ? getRoutingRules(company)
      : Promise.resolve([] as BusinessRecord[]),
    getDirectory(company),
  ]);
  if (sequence !== loadSequence || companyId.value !== company) return;
  const [
    pageResult,
    masterResult,
    stockResult,
    routingResult,
    directoryResult,
  ] = results;
  contracts.value =
    isContractList && pageResult.status === 'fulfilled'
      ? (pageResult.value.list as Contract[])
      : [];
  documents.value =
    isRecordList && pageResult.status === 'fulfilled'
      ? (pageResult.value.list as DocumentRow[])
      : [];
  total.value = pageResult.status === 'fulfilled' ? pageResult.value.total : 0;
  master.value = masterResult.status === 'fulfilled' ? masterResult.value : [];
  stockLoadError.value =
    stockResult.status === 'rejected' ? errorText(stockResult.reason) : '';
  stock.value =
    stockResult.status === 'fulfilled'
      ? stockResult.value
      : { version: 0, pools: [], events: [], reservations: [] };
  routingRules.value =
    routingResult.status === 'fulfilled' ? routingResult.value : [];
  directory.value =
    directoryResult.status === 'fulfilled' ? directoryResult.value : undefined;
  loadError.value = results
    .flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `${['业务列表', '主数据', '库存', '分派规则', '人员目录'][index]}：${errorText(result.reason)}`,
          ]
        : [],
    )
    .join('；');
  loading.value = false;
}
async function reloadList() {
  pageNo.value = 1;
  await loadCompany();
}
async function switchSection() {
  statusFilter.value = undefined;
  requestStateFilter.value =
    props.workspace === 'purchase-tasks' ? 'ACTIVE' : undefined;
  keyword.value = '';
  ownerFilter.value = undefined;
  await reloadList();
}
async function changePage(pagination: { current?: number; pageSize?: number }) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 10;
  await loadCompany();
}
function recordValue(row: DocumentRow, key: string) {
  const fxValue = receiptFxDisplay(row.record, key);
  if (fxValue !== undefined) return fxValue;
  const value = row.record[key];
  if (/userId$/i.test(key)) return personLabel(directory.value, value);
  if (Array.isArray(value)) {
    if (key === 'items' || key === 'lines') return `${value.length} 项明细`;
    return (
      value
        .map((item) =>
          typeof item === 'string'
            ? label(item)
            : String(item?.message ?? item?.name ?? ''),
        )
        .join('；') || '—'
    );
  }
  if (['amount', 'contractCurrencyAmount', 'unitPrice'].includes(key))
    return money(
      value,
      typeof row.record.currency === 'string' ? row.record.currency : undefined,
    );
  return label(value);
}
async function openContractFromList(contract: Contract) {
  detailContext.value = undefined;
  detailTab.value = workspaceDefinition.value.defaultTab;
  await router.push({ query: { ...route.query, contractId: contract.id } });
}
async function openDocument(row: DocumentRow) {
  if (!recordResource.value) return;
  detailContext.value = { resource: recordResource.value, record: row.record };
  detailTab.value =
    recordGroup.value?.tab ?? workspaceDefinition.value.defaultTab;
  await openContract({ id: row.contractId });
}
async function loadMasterData(company: number) {
  if (['inventory-stock', 'purchase-routing'].includes(props.workspace))
    return [];
  if (['contracts', 'records'].includes(workspaceDefinition.value.section))
    return [];
  const result = await Promise.allSettled(
    readableMasterTypes.value
      .filter((entry) => entry.value !== 'SKU')
      .map((entry) => getMasterData(company, String(entry.value))),
  );
  const failed = result.find((entry) => entry.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return result.flatMap((entry) =>
    entry.status === 'fulfilled' ? entry.value : [],
  );
}
async function loadStockPage(): Promise<StockView> {
  const location = stockLocation(
    props.workspace,
    routeActive.value ? route.query : {},
  );
  if (location) {
    const pool = await getStockPool(location.poolId);
    return {
      version: 0,
      pools: [pool],
      events: [],
      reservations: [],
      total: 1,
    };
  }
  const value = await getStockPage({
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    keyword: keyword.value.trim() || undefined,
  });
  return {
    version: 0,
    pools: value.list,
    events: [],
    reservations: [],
    total: value.total,
  };
}
function locateStockPool(pool: BusinessRecord) {
  void router.push({ query: { ...route.query, poolId: pool.id } });
}
async function openContract(contract: { id: string }) {
  detailOpen.value = true;
  selectedContract.value = undefined;
  detailLoading.value = true;
  const sequence = ++detailSequence;
  try {
    const result = await getContract(contract.id);
    if (sequence === detailSequence) selectedContract.value = result;
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
  actionDefinition.value = withDirectory(definition, directory.value);
  actionError.value = '';
  actionOpen.value = true;
}
function openCreateContract() {
  contractEditorOpen.value = true;
}
async function onNewContractSaved(contract: Contract) {
  contractEditorOpen.value = false;
  selectedContract.value = contract;
  detailOpen.value = true;
  await loadCompany();
}
function openMaster() {
  if (masterType.value === 'CUSTOMER') {
    void router.push('/fdmwaimao/platform-customers');
    return;
  }
  showAction({
    action: 'CREATE_MASTER',
    title: `新增${masterTypes.find((type) => type.value === masterType.value)?.label ?? '主数据'}`,
    description:
      '主数据以内部 ID 关联，外部编号保留来源命名空间。同名记录不会自动合并。',
    fields: [
      selectField(
        'type',
        '主数据类型',
        masterTypes.filter(
          (type) => !['CUSTOMER', 'SKU'].includes(String(type.value)),
        ),
        {
          default: masterType.value,
        },
      ),
      field('code', '稳定业务编号'),
      field('name', '名称'),
      selectField(
        'sourceSystem',
        '来源系统',
        [
          { value: 'LOCAL', label: '本平台维护' },
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
function openEditMaster(record: MasterRecord) {
  if (record.type === 'CUSTOMER') {
    void router.push({
      path: '/fdmwaimao/platform-customers',
      query: { customerId: record.id },
    });
    return;
  }
  if (record.version === undefined) return;
  editingMaster.value = record;
  const fixedSource = record.sourceSystem === 'FDM_DATA';
  showAction({
    action: 'UPDATE_MASTER',
    title: '编辑或停用主数据',
    description: fixedSource
      ? '保留原有来源身份。名称、编码和规格由真实来源校验；可补充单位、备注或停用。旧合同快照保持不变。'
      : '编辑平台主数据；停用后不可在新业务中选取，已有合同和历史凭证保持原快照。',
    fields: [
      field('name', '名称', undefined, { disabled: fixedSource }),
      field('code', '业务编码', undefined, { disabled: fixedSource }),
      field('specification', '规格说明', 'textarea', {
        required: false,
        disabled: fixedSource,
      }),
      field('unit', '计量单位', undefined, { required: false }),
      field('remark', '备注', 'textarea', { required: false }),
      field('active', '允许新业务选择', 'boolean'),
    ],
    initialValues: { ...record },
  });
}
function openPool() {
  showAction({
    action: 'CREATE_POOL',
    title: '建立库存池',
    description:
      '按货权、仓库、SKU 与规格版本建立唯一库存池。平台接管必须有盘点和主账切换依据，未移交库存保持外部主账。',
    fields: [
      field('stockOwnerId', '货权主体', undefined, {
        masterType: 'STOCK_OWNER',
      }),
      field('warehouseId', '仓库', undefined, { masterType: 'WAREHOUSE' }),
      field('skuId', '产品 / SKU', undefined, { masterType: 'SKU' }),
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
      label: `${pool.warehouseName ?? '仓库未注明'} / ${pool.skuName ?? '产品未关联'} / ${pool.specVersion ?? '规格待核实'}`,
    })),
  );
  const sourceField = field('sourceKey', '业务事件唯一编号', undefined, {
    hidden: true,
  });
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
      '匹配 SKU，兼顾在岗、连续负责人及工作量。无法明确匹配时保留在待分派池。',
    fields: [
      selectField(
        'id',
        '修改已有规则（新建留空）',
        routingRules.value.map((rule) => ({
          value: rule.id,
          label: `${rule.skuId || '通用兜底'} → 用户 #${rule.buyerUserId} · 版本 ${rule.version}`,
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
        '匹配 SKU（留空作为通用兜底）',
        masterOptions(master.value, 'SKU'),
        { required: false, masterType: 'SKU' },
      ),
      field('buyerUserId', '采购员系统用户 ID', 'number', {
        min: 1,
        hint: '使用系统用户编号，不是手机号；选择当前系统中的启用用户。',
      }),
      field('enabled', '启用规则', 'boolean', { default: true }),
      field('available', '经办人当前在岗可接单', 'boolean', { default: true }),
      field('priority', '规则优先级', 'number', { default: 100, min: 0 }),
      field('reason', '规则变更原因', 'textarea'),
    ],
  });
}
function openTakeover(pool: BusinessRecord) {
  showAction({
    action: 'TAKEOVER',
    title: '核实盘点并接管库存',
    description:
      '按实际盘点数量建立平台库存主账。请核实仓库、货权及产品身份，来源历史余额仅供核对，不自动当作今天可用库存。',
    fields: [
      field('poolId', '库存池', undefined, { hidden: true }),
      field('sourceKey', '业务事件', undefined, { hidden: true }),
      field('stockOwnerId', '实际货权主体', undefined, {
        masterType: 'STOCK_OWNER',
      }),
      field('warehouseId', '实际仓库', undefined, { masterType: 'WAREHOUSE' }),
      field('skuId', '对应产品', undefined, { masterType: 'SKU' }),
      field('specVersion', '规格版本'),
      field('onHand', '实际盘点现存数量', 'decimal', { min: 0 }),
      field('unavailable', '其中不可售数量', 'decimal', { min: 0 }),
      field('safetyStock', '安全缓冲数量', 'decimal', { min: 0 }),
      field('evidenceRef', '实际盘点凭证或记录编号'),
    ],
    initialValues: {
      poolId: pool.id,
      stockOwnerId: pool.stockOwnerId,
      warehouseId: pool.warehouseId,
      skuId: pool.skuId,
      specVersion: pool.specVersion,
    },
  });
}
async function saveAction(
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  if (!actionDefinition.value) return;
  saving.value = true;
  actionError.value = '';
  try {
    const action = actionDefinition.value.action;
    if (action === 'CREATE_MASTER') {
      await saveMasterData({
        ...payload,
        companyId: companyId.value,
        idempotencyKey,
      });
    } else if (action === 'UPDATE_MASTER') {
      const record = editingMaster.value;
      if (!record || record.version === undefined)
        throw new Error('主数据版本未加载，请刷新后重试');
      await updateMasterData(record.type, record.id, {
        ...payload,
        companyId: companyId.value,
        expectedVersion: record.version,
        specification: payload.specification ?? null,
        unit: payload.unit ?? null,
        remark: payload.remark ?? null,
        idempotencyKey,
      });
    } else if (action === 'CREATE_POOL') {
      await stockAction({
        companyId: companyId.value,
        action,
        idempotencyKey,
        payload: { ...payload, companyId: companyId.value },
      });
    } else if (
      ['CONFIGURE_AVAILABILITY', 'OPENING', 'TAKEOVER'].includes(action)
    ) {
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
    await loadCompany();
  } catch (error) {
    actionError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
const initialized = ref(false);
async function locateContract() {
  if (!initialized.value || !isBusinessPage.value) return;
  const id = referenceId(route.query.contractId);
  detailSequence++;
  detailOpen.value = false;
  if (!id || !routeActive.value) return;
  detailContext.value = undefined;
  detailTab.value = detailTabFor(props.workspace, route.query.tab);
  await openContract({ id });
}
function closeContractDetail() {
  detailSequence++;
  detailOpen.value = false;
  if (routeActive.value)
    void router.replace({
      query: withoutDetailQuery(route.query, 'contractId'),
    });
}
watch(
  () => [route.query.contractId, route.query.tab, routeActive.value],
  () => {
    void locateContract();
  },
  { flush: 'post' },
);
watch(
  () => [
    route.query.poolId,
    route.query.eventId,
    inventoryType.value,
    routeActive.value,
  ],
  () => {
    if (
      initialized.value &&
      props.workspace === 'inventory-stock' &&
      routeActive.value
    )
      void loadCompany();
  },
);
onMounted(async () => {
  await initialize();
  initialized.value = true;
  await locateContract();
});
</script>

<template>
  <Page auto-content-height>
    <div class="platform-workbench">
      <header class="platform-header">
        <div>
          <span class="eyebrow">{{ workspaceDefinition.department }} · 业务协同</span>
          <h1>{{ workspaceDefinition.title }}</h1>
          <p>{{ workspaceDefinition.description }}</p>
        </div>
        <Space wrap>
          <Button
            v-if="workspace === 'inventory-stock'"
            @click="router.push('/fdmwaimao/platform-shipments')"
          >
            预留与发货
</Button><Button
            v-if="workspace === 'inventory-stock'"
            @click="router.push('/fdmprocurement/platform-arrivals')"
          >
            采购到货
</Button><Button
            v-if="workspace === 'inventory-stock'"
            @click="router.push('/fdmprocurement/platform-production')"
          >
            自产入库
</Button><Button :loading="initialLoading || loading" @click="initialize">
            刷新数据
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
      <div v-if="initialLoading && !access" class="empty-state">
        <Card :loading="true" />
      </div>
      <Result
        v-else-if="!hasAccess"
        status="error"
        title="业务数据加载失败"
        sub-title="请检查登录状态后重新加载。"
      >
        <template #extra>
          <Button :loading="initialLoading" @click="initialize">
            重新加载
          </Button>
        </template>
      </Result>
      <template v-else>
        <div class="metrics-grid">
          <div v-for="stat in taskStats" :key="stat.title" class="metric">
            <span>{{ stat.title }}</span><strong>{{ stat.value }}</strong><small>{{ stat.note }}</small>
          </div>
        </div>
        <Card class="workspace-card" :bordered="false">
          <Tabs v-model:active-key="activeTab" @change="switchSection">
            <TabPane
              v-if="hasContractTab"
              key="contracts"
              :tab="
                workspaceDefinition.section === 'contracts'
                  ? '合同订单'
                  : '按合同办理 / 新增记录'
              "
            >
              <div class="tab-stack">
                <div class="toolbar">
                  <Space wrap>
                    <Input
                      v-model:value="keyword"
                      placeholder="合同编号、名称或客户"
                      allow-clear
                      style="width: 260px"
                      @press-enter="reloadList"
                    />
                    <Select
                      v-model:value="statusFilter"
                      :options="
                        ['DRAFT', 'CONFIRMED', 'EXECUTING'].map((value) => ({
                          value,
                          label: label(value),
                        }))
                      "
                      placeholder="合同状态"
                      allow-clear
                      style="width: 150px"
                      @change="reloadList"
                    />
                    <Button type="primary" @click="reloadList">
                      查询
                    </Button>
</Space><span class="muted">共 {{ total }} 份合同</span>
                </div>
                <Table
                  class="fdm-business-table contract-list-table"
                  size="small"
                  table-layout="fixed"
                  :columns="contractColumns"
                  :data-source="filteredContracts"
                  row-key="id"
                  :loading="loading"
                  :scroll="{ x: 1660 }"
                  :pagination="{
                    current: pageNo,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (count: number) => `共 ${count} 份合同`,
                  }"
                  @change="changePage"
                >
                  <template #emptyText>
                    <Empty description="暂无合同">
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
                        :title="record.name"
                        @click="openContractFromList(record as Contract)"
                      >
                        {{ record.name }}
                      </Button>
                      <div
                        class="contract-code fdm-cell-line"
                        :title="record.code"
                      >
                        {{ record.code }}
                      </div>
                    </template>
                    <Tag
                      v-else-if="column.key === 'status'"
                      :color="record.status === 'DRAFT' ? 'default' : 'blue'"
                    >
                      {{ label(record.status) }}
                    </Tag>
                    <span
                      v-else-if="column.key === 'company'"
                      class="fdm-cell-line"
                      :title="companyName(record.companyId)"
                      >{{ companyName(record.companyId) }}</span><span
                      v-else-if="column.key === 'customerName'"
                      class="fdm-cell-line"
                      :title="record.customerName"
                      >{{ record.customerName || '未注明' }}</span><span
                      v-else-if="column.key === 'businessType'"
                      class="fdm-cell-line"
                      :title="label(record.businessType)"
                      >{{ label(record.businessType) }}</span>
                    <span
                      v-else-if="column.key === 'productCategory'"
                      class="fdm-cell-line"
                      :title="productCategoryLabel(record.productCategory)"
                      >{{ productCategoryLabel(record.productCategory) }}</span>
                    <span
                      v-else-if="column.key === 'amount'"
                      class="fdm-cell-line"
                      :title="nativeMoney(record.amount, record.currency)"
                      >{{ nativeMoney(record.amount, record.currency) }}</span>
                    <span
                      v-else-if="column.key === 'ownerUserId'"
                      class="fdm-cell-line"
                      :title="personLabel(directory, record.ownerUserId)"
                      >{{ personLabel(directory, record.ownerUserId) }}</span>
                    <span v-else-if="column.key === 'items'">{{ record.items?.length ?? 0 }} 项</span>
                    <Button
                      v-else-if="column.key === 'action'"
                      type="link"
                      @click="openContractFromList(record as Contract)"
                    >
                      进入办理
                    </Button>
                  </template>
                </Table>
              </div>
            </TabPane>
            <TabPane
              v-if="workspaceDefinition.groups"
              key="records"
              :tab="workspaceDefinition.title"
            >
              <div class="tab-stack">
                <div class="toolbar">
                  <Space wrap>
                    <Select
                      v-if="workspaceDefinition.groups.length > 1"
                      v-model:value="recordResource"
                      :options="
                        workspaceDefinition.groups.map((group) => ({
                          value: group.resource,
                          label: group.title,
                        }))
                      "
                      style="width: 190px"
                      @change="switchSection"
                    />
                    <Input
                      v-model:value="keyword"
                      placeholder="合同或当前单据可见字段"
                      allow-clear
                      style="width: 250px"
                      @press-enter="reloadList"
                    />
                    <Select
                      v-if="recordGroup?.statuses.length"
                      v-model:value="statusFilter"
                      :options="
                        recordGroup.statuses.map((value) => ({
                          value,
                          label: label(value),
                        }))
                      "
                      placeholder="全部状态"
                      allow-clear
                      style="width: 150px"
                      @change="reloadList"
                    />
                    <Select
                      v-if="recordResource === 'purchase-requests'"
                      v-model:value="requestStateFilter"
                      :options="[
                        { value: 'ACTIVE', label: '有效申请' },
                        { value: 'CANCELLED', label: '已取消' },
                      ]"
                      placeholder="申请有效状态"
                      allow-clear
                      style="width: 150px"
                      @change="reloadList"
                    />
                    <Select
                      v-model:value="ownerFilter"
                      :options="
                        directory?.users.map((user) => ({
                          value: user.id,
                          label: personLabel(directory, user.id),
                        }))
                      "
                      placeholder="单据经办 / 登记人"
                      show-search
                      option-filter-prop="label"
                      allow-clear
                      style="width: 190px"
                      @change="reloadList"
                    />
                    <Button type="primary" @click="reloadList">查询</Button>
                  </Space>
                </div>
                <Alert
                  type="info"
                  show-icon
                  message="列表直接按服务端分页。已有记录点击办理；首次登记请切换“按合同办理 / 新增记录”，选择关联合同。"
                />
                <Table
                  class="fdm-business-table"
                  size="small"
                  table-layout="fixed"
                  :columns="recordColumns"
                  :data-source="documents"
                  row-key="id"
                  :loading="loading"
                  :scroll="{ x: 1250 }"
                  :pagination="{
                    current: pageNo,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (count: number) => `共 ${count} 条`,
                  }"
                  @change="changePage"
                >
                  <template #emptyText>
                    <Empty
                      :description="
                        loading ? '正在读取单据' : '当前筛选范围暂无记录'
                      "
                    />
                  </template>
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'contract'">
                      <Button
                        type="link"
                        @click="openDocument(record as DocumentRow)"
                      >
                        {{ record.contractName }}
                      </Button>
                      <div
                        class="contract-code fdm-cell-line"
                        :title="record.code"
                      >
                        {{ record.contractCode }}
                      </div>
                    </template>
                    <span v-else-if="column.key === 'company'">{{
                      companyName(record.companyId)
                    }}</span><Button
                      v-else-if="column.key === 'action'"
                      type="link"
                      @click="openDocument(record as DocumentRow)"
                    >
                      查看 / 办理
                    </Button>
                    <Tag
                      v-else-if="
                        ['status', 'assignmentStatus', 'stage'].includes(
                          String(column.key),
                        )
                      "
                    >
                      {{
                        recordValue(record as DocumentRow, String(column.key))
                      }}
                    </Tag>
                    <span v-else>{{
                      recordValue(record as DocumentRow, String(column.key))
                    }}</span>
                  </template>
                </Table>
              </div>
            </TabPane>
            <TabPane
              v-if="workspaceDefinition.section === 'master'"
              key="imports"
              tab="主数据迁移"
            >
              <ImportPanel
                v-if="activeTab === 'imports'"
                :company-id="companyId"
                @imported="loadCompany"
              />
            </TabPane>
            <TabPane
              v-if="
                workspaceDefinition.section === 'master' &&
                readableMasterTypes.length
              "
              key="master"
              tab="统一主数据"
            >
              <div class="tab-stack">
                <div class="toolbar">
                  <Select
                    v-model:value="masterType"
                    :options="readableMasterTypes"
                    style="width: 180px"
                  /><Button
                    v-if="masterType !== 'SKU'"
                    type="primary"
                    @click="openMaster"
                  >
                    {{
                      masterType === 'CUSTOMER' ? '打开客户管理' : '新增主数据'
                    }}
                  </Button>
                  <MasterSourcePicker
                    v-if="!['SKU', 'CUSTOMER'].includes(masterType)"
                    :company-id="companyId"
                    :type="masterType"
                    @saved="loadCompany"
                  />
                </div>
                <Alert
                  v-if="masterType === 'SKU'"
                  type="info"
                  show-icon
                  message="产品 / SKU 已统一在产品中心维护，历史主数据映射保持不变。"
                >
                  <template #action>
                    <Button
                      type="primary"
                      @click="router.push('/fdmproducts/catalog')"
                    >
                      打开产品档案
                    </Button>
                  </template>
                </Alert>
                <Alert
                  type="info"
                  show-icon
                  message="此处保存平台主数据与现有 / 外部系统映射。名称相同不会自动合并，历史合同保留创建时的规格快照。"
                /><RecordTable
                  v-if="masterType !== 'SKU'"
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
                      'remark|备注',
                      'action|操作',
                    )
                  "
                >
                  <template #action="{ record }">
                    <Button
                      type="link"
                      @click="openEditMaster(record as MasterRecord)"
                    >
                      编辑 / 停用
                    </Button>
                  </template>
                </RecordTable>
              </div>
            </TabPane>
            <TabPane
              v-if="workspaceDefinition.section === 'stock'"
              key="stock"
              tab="库存主账"
            >
              <div class="tab-stack">
                <Tabs v-model:active-key="inventoryType">
                  <TabPane key="pools" tab="库存台账" /><TabPane
                    key="stock-ins"
                    tab="入库单"
                  /><TabPane key="stock-outs" tab="出库单" /><TabPane
                    key="stocktakes"
                    tab="库存盘点"
                  />
                </Tabs>
                <BusinessDocumentList
                  v-if="inventoryType !== 'pools'"
                  :resource="inventoryType"
                  :title="stockDocumentTitles[inventoryType]"
                />
                <template v-else>
                  <div class="toolbar">
                    <span class="muted">货权 · 仓库 · SKU · 规格版本</span><Space wrap>
                      <Input.Search
                        v-model:value="keyword"
                        placeholder="搜索产品、仓库或货权"
                        allow-clear
                        @search="reloadList"
                      />
                      <Button type="primary" @click="openPool">
                        建立库存池
</Button><Button @click="openStockAction('OPENING')">
                        导入期初
</Button><Button
                        @click="openStockAction('CONFIGURE_AVAILABILITY')"
                      >
                        不可售 / 安全缓冲
                      </Button>
                    </Space>
                  </div>
                  <Alert
                    type="info"
                    show-icon
                    message="可用库存 = 现存量 − 不可售量 − 已预留量 − 安全缓冲。收发与预留从合同详情办理，不直接修改余额。"
                  />
                  <Alert
                    v-if="displayedStock.filtered"
                    :type="
                      ['invalid', 'missing', 'unavailable'].includes(
                        displayedStock.status,
                      )
                        ? 'error'
                        : 'info'
                    "
                    show-icon
                    :message="displayedStock.message"
                  >
                    <template #action>
                      <Button size="small" @click="clearStockLocation">
                        清除库存定位
                      </Button>
                    </template>
                  </Alert>
                  <RecordTable
                    :key="`pools-${stockTableKey}`"
                    :data="displayedStock.pools"
                    :loading="loading"
                    :columns="
                      columns(
                        'skuName|产品',
                        'stockOwnerName|货权主体',
                        'warehouseName|仓库',
                        'skuCode|SKU',
                        'specVersion|规格版本',
                        'authority|主账',
                        'sourceOnHandQuantity|原记录现存',
                        'sourceAvailableQuantity|原记录可用',
                        'sourceUnit|原记录单位',
                        'onHand|平台现存量',
                        'unavailable|不可售',
                        'reserved|已预留',
                        'safetyStock|安全缓冲',
                        'available|可用库存',
                        'version|数据版本',
                        'action|查看 / 办理',
                      )
                    "
                  >
                    <template #action="{ record: pool }">
                      <Button
                        type="link"
                        @click="locateStockPool(pool as BusinessRecord)"
                      >
                        流水与预留
</Button><Button
                        v-if="pool.authority === 'EXTERNAL'"
                        type="link"
                        @click="openTakeover(pool as BusinessRecord)"
                      >
                        盘点接管
                      </Button>
                    </template>
                  </RecordTable>
                  <Pagination
                    v-if="!displayedStock.filtered"
                    v-model:current="pageNo"
                    v-model:page-size="pageSize"
                    :total="stock.total ?? 0"
                    show-size-changer
                    @change="loadCompany"
                  />
                  <Alert
                    v-if="!displayedStock.filtered"
                    type="info"
                    message="列表按服务端分页；点击库存池的“流水与预留”查看该池明细。外部主账库存需先核实盘点并接管，不能直接用于新业务扣减。"
                  />
                  <Card
                    v-if="displayedStock.filtered"
                    title="预留与释放余额"
                    size="small"
                  >
                    <RecordTable
                      :key="`reservations-${stockTableKey}`"
                      :data="displayedStock.reservations"
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
</Card><Card
                    v-if="displayedStock.filtered"
                    title="不可覆写的库存事件"
                    size="small"
                  >
                    <RecordTable
                      :key="`events-${stockTableKey}`"
                      :data="displayedStock.events"
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
                </template>
              </div>
            </TabPane>
            <TabPane
              v-if="workspaceDefinition.section === 'routing'"
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
            <TabPane
              v-if="workspaceDefinition.section === 'access'"
              key="access"
              tab="业务入口"
            >
              <Alert type="info" message="业务统一使用当前登录身份。">
                <template #action>
                  <Button
                    type="primary"
                    @click="router.push('/fdmwaimao/platform-contracts')"
                  >
                    打开合同订单
                  </Button>
                </template>
              </Alert>
            </TabPane>
          </Tabs>
        </Card>
      </template>
    </div>
    <ContractEditor
      :default-business-type="
        props.workspace.startsWith('trade-') ? 'FOREIGN' : 'DOMESTIC'
      "
      :open="contractEditorOpen"
      :directory="directory"
      :master="master"
      @close="contractEditorOpen = false"
      @saved="onNewContractSaved"
    />
    <ContractDetail
      :contract="selectedContract"
      :workspace="props.workspace"
      :initial-tab="detailTab"
      :record-context="detailContext"
      :directory="directory"
      :loading="detailLoading"
      :master="master"
      :open="detailOpen && routeActive"
      :pools="stock.pools"
      @close="closeContractDetail"
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

.contract-list-table :deep(.contract-title.ant-btn-link) {
  display: block;
  max-width: 100%;
  height: 24px;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  line-height: 24px;
  text-align: left;
  white-space: nowrap;
}

.contract-code {
  margin-top: 0;
  font-size: 12px;
  line-height: 18px;
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
