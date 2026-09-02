<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { CapabilityFormDraft } from './form-model';

import type { FdmFactoryCapabilityApi } from '#/api/fdmfactory/capability';
import type { ProductSelectionValue } from '#/views/fdmproduct/shared';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import {
  createFactoryCapability,
  getFactoryCapability,
  getFactoryCapabilityPage,
  getFactoryList,
  updateFactoryCapability,
} from '#/api/fdmfactory/capability';
import { ProductSelectionModal } from '#/views/fdmproduct/shared';

import {
  buildCapabilityPayload,
  capabilityToDraft,
  createCapabilityDraft,
  normalizeRequirementCodes,
} from './form-model';

defineOptions({ name: 'FdmFactoryCapability' });

type Capability = FdmFactoryCapabilityApi.Capability;
type CapabilityStatus = FdmFactoryCapabilityApi.CapabilityStatus;
type RequirementField =
  | 'supportedCertificationRequirements'
  | 'supportedCountryComplianceRequirements'
  | 'supportedCustomerComplianceRequirements'
  | 'supportedPackagingRequirements';

const { hasAccessByCodes } = useAccess();
const canQuery = computed(() =>
  hasAccessByCodes(['fdmfactory:capability:query']),
);
const canCreate = computed(() =>
  hasAccessByCodes(['fdmfactory:capability:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmfactory:capability:update']),
);
const canQueryFactories = computed(() =>
  hasAccessByCodes(['fdmfactory:factory:query']),
);
const canPickProduct = computed(() =>
  hasAccessByCodes(['fdmproduct:selection:query']),
);

const companyId = ref('');
const factoryId = ref('');
const productId = ref('');
const skuId = ref('');
const status = ref<CapabilityStatus>();
const effectiveDate = ref('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const rows = ref<Capability[]>([]);
const loading = ref(false);
const loadError = ref('');
const companyOptions = ref<Array<{ label: string; value: string }>>([]);
const factoryOptions = ref<
  Array<{
    factory: FdmFactoryCapabilityApi.Factory;
    label: string;
    value: string;
  }>
>([]);
const factoryOptionsCompanyId = ref('');

const modalOpen = ref(false);
const saving = ref(false);
const editLoading = ref(false);
const editing = ref<Capability>();
const form = reactive<CapabilityFormDraft>(createCapabilityDraft());
const validationErrors = ref<string[]>([]);
const productPickerOpen = ref(false);
const selectedProductLabel = ref('');

let requestVersion = 0;

const statusOptions = [
  { label: '可生产', value: 'ELIGIBLE' },
  { label: '不可生产', value: 'INELIGIBLE' },
  { label: '未知', value: 'UNKNOWN' },
] satisfies Array<{ label: string; value: CapabilityStatus }>;

const evidenceModeOptions = [
  { label: '权威系统证据', value: 'AUTHORITATIVE' },
  { label: '人工确认', value: 'HUMAN_CONFIRMED' },
] satisfies Array<{
  label: string;
  value: FdmFactoryCapabilityApi.EvidenceMode;
}>;

const columns: TableColumnsType<Capability> = [
  { key: 'identity', title: '工厂 / 产品版本', width: 285 },
  { key: 'state', title: '能力状态', width: 150 },
  { key: 'requirements', title: '支持的合规代码', width: 390 },
  { key: 'validity', title: '能力有效期', width: 185 },
  { key: 'evidence', title: '证据', width: 350 },
  { key: 'audit', title: '权威版本', width: 260 },
  { fixed: 'right', key: 'actions', title: '操作', width: 90 },
];

function statusMeta(value?: null | string) {
  if (value === 'ELIGIBLE') return { color: 'green', label: '可生产' };
  if (value === 'INELIGIBLE') return { color: 'red', label: '不可生产' };
  return { color: 'default', label: '未知' };
}

function evidenceModeLabel(value: FdmFactoryCapabilityApi.EvidenceMode) {
  return value === 'AUTHORITATIVE' ? '权威系统证据' : '人工确认';
}

function factoryLabel(id: string) {
  const option = factoryOptions.value.find((item) => item.value === id);
  return option?.label || `工厂 ID ${id}`;
}

function asCapability(record: Record<string, unknown>) {
  return record as unknown as Capability;
}

function clearRowsForCompanyChange() {
  rows.value = [];
  total.value = 0;
  pageNo.value = 1;
  factoryId.value = '';
  productId.value = '';
  skuId.value = '';
  factoryOptions.value = [];
  factoryOptionsCompanyId.value = '';
}

async function loadCompanies() {
  try {
    const result = await getDataCompanySimpleList();
    companyOptions.value = (result || [])
      .filter((item) => item.id !== undefined && item.id !== null)
      .map((item) => ({
        label:
          item.companyShortName ||
          item.companyName ||
          `公司 ${String(item.id)}`,
        value: String(item.id),
      }));
    if (!companyId.value && companyOptions.value.length === 1) {
      companyId.value = companyOptions.value[0]!.value;
      await changeCompany();
    }
  } catch {
    companyOptions.value = [];
  }
}

async function loadFactories() {
  if (
    !companyId.value ||
    !canQueryFactories.value ||
    factoryOptionsCompanyId.value === companyId.value
  ) {
    return;
  }
  try {
    const result = await getFactoryList({ companyId: companyId.value });
    factoryOptions.value = result.map((factory) => ({
      factory,
      label: `${factory.factoryCode} · ${factory.factoryName} · ID ${factory.factoryId}`,
      value: factory.factoryId,
    }));
    factoryOptionsCompanyId.value = companyId.value;
  } catch {
    factoryOptions.value = [];
    factoryOptionsCompanyId.value = companyId.value;
  }
}

async function changeCompany() {
  clearRowsForCompanyChange();
  await loadFactories();
  if (companyId.value) await load(true);
}

async function load(resetPage = false) {
  if (!canQuery.value) return;
  if (!/^[1-9]\d*$/.test(companyId.value.trim())) {
    message.warning('请先选择或输入有效的公司 ID');
    return;
  }
  if (resetPage) pageNo.value = 1;
  if (factoryOptionsCompanyId.value !== companyId.value) {
    void loadFactories();
  }
  const version = ++requestVersion;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getFactoryCapabilityPage({
      companyId: companyId.value.trim(),
      effectiveDate: effectiveDate.value || undefined,
      factoryId: factoryId.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      productId: productId.value.trim() || undefined,
      skuId: skuId.value.trim() || undefined,
      status: status.value,
    });
    if (version !== requestVersion) return;
    rows.value = result.list || [];
    total.value = result.total || 0;
  } catch {
    if (version !== requestVersion) return;
    rows.value = [];
    total.value = 0;
    loadError.value = '工厂产品能力读取失败，请核对公司配置和查询条件。';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function resetFilters() {
  factoryId.value = '';
  productId.value = '';
  skuId.value = '';
  status.value = undefined;
  effectiveDate.value = '';
  void load(true);
}

function changePage(nextPage: number, nextPageSize: number) {
  pageNo.value = nextPageSize === pageSize.value ? nextPage : 1;
  pageSize.value = nextPageSize;
  void load();
}

async function openCreate() {
  if (!canCreate.value || !/^[1-9]\d*$/.test(companyId.value.trim())) {
    message.warning('请先选择公司再新增能力');
    return;
  }
  await loadFactories();
  editing.value = undefined;
  selectedProductLabel.value = '';
  validationErrors.value = [];
  Object.assign(form, createCapabilityDraft(companyId.value.trim()));
  modalOpen.value = true;
}

async function openEdit(row: Capability) {
  if (!canUpdate.value || editLoading.value) return;
  editLoading.value = true;
  try {
    const current = await getFactoryCapability({
      companyId: row.companyId,
      id: row.id,
    });
    editing.value = current;
    selectedProductLabel.value = '';
    validationErrors.value = [];
    Object.assign(form, capabilityToDraft(current));
    modalOpen.value = true;
  } catch {
    message.error('能力详情读取失败，记录可能已更新或不再可见。');
  } finally {
    editLoading.value = false;
  }
}

function chooseProduct(value: ProductSelectionValue) {
  form.productId = value.productId;
  form.skuId = value.skuId;
  form.productVersionToken = value.versionToken;
  selectedProductLabel.value = `${value.productName} · ${value.skuName} (${value.skuCode})`;
}

function normalizeCodes(field: RequirementField) {
  form[field] = normalizeRequirementCodes(form[field]);
}

async function save() {
  const result = buildCapabilityPayload(form);
  validationErrors.value = result.errors;
  if (!result.data) {
    message.warning(result.errors[0] || '请检查能力表单');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateFactoryCapability({
        ...result.data,
        id: editing.value.id,
        version: editing.value.version,
      });
      message.success(`能力已更新为下一版本（基于 v${editing.value.version}）`);
    } else {
      const id = await createFactoryCapability(result.data);
      message.success(`能力已创建，ID ${id}`);
    }
    modalOpen.value = false;
    await load();
  } catch {
    message.error(
      editing.value
        ? '保存失败；若能力已被他人更新，请关闭表单、刷新后再编辑。'
        : '创建失败，请核对工厂、SKU 当前版本及证据有效性。',
    );
  } finally {
    saving.value = false;
  }
}

function requirementGroups(row: Capability) {
  return [
    ['包装', row.supportedPackagingRequirements],
    ['认证', row.supportedCertificationRequirements],
    ['国家', row.supportedCountryComplianceRequirements],
    ['客户', row.supportedCustomerComplianceRequirements],
  ] as const;
}

void loadCompanies();
</script>

<template>
  <Page
    description="维护内部工厂对产品 SKU 当前版本的生产、直发和合规能力权威；更新采用 CAS 版本控制。"
    title="工厂产品能力"
  >
    <template #extra>
      <Button
        v-if="canCreate"
        type="primary"
        :disabled="!companyId"
        @click="openCreate"
      >
        <template #icon>
          <IconifyIcon icon="lucide:plus" aria-hidden="true" />
        </template>
        新增能力
      </Button>
    </template>

    <Alert
      v-if="!canQuery"
      description="缺少 fdmfactory:capability:query 权限，页面不会读取任何能力数据。"
      message="无权查看工厂产品能力"
      show-icon
      type="error"
    />

    <div v-else class="capability-page">
      <Alert
        description="公司、工厂、产品 SKU 等 Java Long 在浏览器中始终按字符串传递；产品版本 Token 与证据会随能力版本一并形成权威 Hash。"
        message="能力权威与精确 ID"
        show-icon
        type="info"
      />

      <Card size="small" title="查询条件">
        <Space wrap>
          <AutoComplete
            v-model:value="companyId"
            :options="companyOptions"
            placeholder="公司 ID（必填）"
            style="width: 240px"
            @change="clearRowsForCompanyChange"
            @select="changeCompany"
          />
          <AutoComplete
            v-model:value="factoryId"
            allow-clear
            :options="factoryOptions"
            placeholder="工厂 ID"
            style="width: 300px"
          />
          <Input
            v-model:value="productId"
            allow-clear
            placeholder="产品 ID"
            style="width: 170px"
            @press-enter="load(true)"
          />
          <Input
            v-model:value="skuId"
            allow-clear
            placeholder="产品 SKU ID"
            style="width: 190px"
            @press-enter="load(true)"
          />
          <Select
            v-model:value="status"
            allow-clear
            :options="statusOptions"
            placeholder="全部能力状态"
            style="width: 160px"
          />
          <Input
            v-model:value="effectiveDate"
            aria-label="指定有效日期"
            type="date"
            style="width: 170px"
          />
          <Button :loading="loading" type="primary" @click="load(true)">
            查询
          </Button>
          <Button @click="resetFilters">重置</Button>
        </Space>
        <p class="capability-page__hint">
          工厂下拉需要 fdmfactory:factory:query；无该权限时仍可直接输入工厂 ID。
        </p>
      </Card>

      <Alert v-if="loadError" :message="loadError" show-icon type="error">
        <template #action>
          <Button size="small" @click="load()">重试</Button>
        </template>
      </Alert>

      <Card size="small" title="能力权威记录">
        <Table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 1710 }"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'identity'">
              <div class="capability-page__stack">
                <strong>{{ factoryLabel(record.factoryId) }}</strong>
                <span>公司 ID {{ record.companyId }}</span>
                <span>产品 ID {{ record.productId }}</span>
                <span>产品 SKU ID {{ record.skuId }}</span>
                <span class="capability-page__token">
                  产品版本 {{ record.productVersionToken }}
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'state'">
              <div class="capability-page__stack">
                <Tag :color="statusMeta(record.status).color">
                  {{ statusMeta(record.status).label }}
                </Tag>
                <Tag :color="record.directShipSupported ? 'blue' : 'default'">
                  {{ record.directShipSupported ? '支持直发' : '不支持直发' }}
                </Tag>
              </div>
            </template>
            <template v-else-if="column.key === 'requirements'">
              <div class="capability-page__requirements">
                <div
                  v-for="([label, values], groupIndex) in requirementGroups(
                    asCapability(record),
                  )"
                  :key="label"
                >
                  <small>{{ label }}</small>
                  <span v-if="!values.length">—</span>
                  <template v-else>
                    <Tag
                      v-for="(value, valueIndex) in values"
                      :key="`${groupIndex}-${valueIndex}-${value}`"
                      color="blue"
                    >
                      {{ value }}
                    </Tag>
                  </template>
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'validity'">
              <div class="capability-page__stack">
                <strong>{{ record.validFrom }}</strong>
                <span>至 {{ record.validUntil || '长期有效' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'evidence'">
              <div class="capability-page__stack">
                <Tag
                  :color="
                    record.evidenceMode === 'AUTHORITATIVE' ? 'purple' : 'cyan'
                  "
                >
                  {{ evidenceModeLabel(record.evidenceMode) }}
                </Tag>
                <template v-if="record.evidenceMode === 'AUTHORITATIVE'">
                  <strong>{{
                    record.evidenceSourceName || '来源名称缺失'
                  }}</strong>
                  <span>
                    {{ record.evidenceSourceSystem || '来源系统缺失' }} /
                    {{ record.evidenceSourceVersion || '版本缺失' }}
                  </span>
                  <span>引用 {{ record.evidenceSourceRefId || '缺失' }}</span>
                </template>
                <template v-else>
                  <span>确认人 {{ record.evidenceByUserId || '未提供' }}</span>
                  <span>{{ record.evidenceNote || '确认说明缺失' }}</span>
                </template>
                <span>证据时间 {{ record.evidenceTime }}</span>
                <span>证据有效至 {{ record.evidenceValidUntil }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'audit'">
              <div class="capability-page__stack">
                <strong>能力 ID {{ record.id }} · v{{ record.version }}</strong>
                <span class="capability-page__hash">
                  {{ record.authorityHash }}
                </span>
                <span>创建 {{ record.createTime || '未提供' }}</span>
                <span>更新 {{ record.updateTime || '未提供' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Button
                v-if="canUpdate"
                :loading="editLoading"
                type="link"
                @click="openEdit(asCapability(record))"
              >
                编辑
              </Button>
              <span v-else>—</span>
            </template>
          </template>
          <template #emptyText>
            <Empty
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              description="请选择公司并查询能力记录"
            />
          </template>
        </Table>
        <Pagination
          class="capability-page__pagination"
          :current="pageNo"
          :page-size="pageSize"
          :page-size-options="['10', '20', '50']"
          show-size-changer
          :total="total"
          @change="changePage"
        />
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="editing ? `编辑能力 · v${editing.version}` : '新增工厂产品能力'"
      width="min(1080px, calc(100vw - 32px))"
      @ok="save"
    >
      <div class="capability-form">
        <Alert
          v-if="editing"
          :description="`本次保存携带 CAS version=${editing.version}；若服务端版本已变化，更新会失败且不会覆盖他人修改。`"
          :message="`能力 ID ${editing.id} · 权威 Hash ${editing.authorityHash}`"
          show-icon
          type="warning"
        />
        <Alert v-if="validationErrors.length" show-icon type="error">
          <template #message>请修正以下表单问题</template>
          <template #description>
            <ul class="capability-form__errors">
              <li v-for="error in validationErrors" :key="error">
                {{ error }}
              </li>
            </ul>
          </template>
        </Alert>

        <section>
          <h3>能力身份</h3>
          <div class="capability-form__grid">
            <label>
              公司 ID
              <Input v-model:value="form.companyId" disabled />
            </label>
            <label>
              工厂 ID
              <AutoComplete
                v-model:value="form.factoryId"
                :options="factoryOptions"
                placeholder="选择工厂或直接输入 ID"
              />
            </label>
            <label>
              产品 ID
              <Input v-model:value="form.productId" placeholder="正整数 ID" />
            </label>
            <label>
              产品 SKU ID
              <Input v-model:value="form.skuId" placeholder="正整数 ID">
                <template v-if="canPickProduct" #addonAfter>
                  <Button type="link" @click="productPickerOpen = true">
                    选择 SKU
                  </Button>
                </template>
              </Input>
            </label>
            <label>
              产品版本 Token
              <Input
                v-model:value="form.productVersionToken"
                :maxlength="128"
                placeholder="必须与产品中心当前可售快照一致"
              />
            </label>
          </div>
          <p v-if="selectedProductLabel" class="capability-form__selection">
            已从产品中心选择：{{ selectedProductLabel }}
          </p>
          <p v-else class="capability-page__hint">
            {{
              canPickProduct
                ? '可从产品中心选择并校验 SKU，也可以直接输入 SKU ID 与版本 Token。'
                : '没有产品选择权限时，请直接输入 SKU ID 与版本 Token。'
            }}
          </p>
        </section>

        <section>
          <h3>生产与有效期</h3>
          <div class="capability-form__grid">
            <label>
              能力状态
              <Select v-model:value="form.status" :options="statusOptions" />
            </label>
            <label class="capability-form__switch">
              支持直发
              <Switch v-model:checked="form.directShipSupported" />
            </label>
            <label>
              有效开始
              <Input v-model:value="form.validFrom" type="date" />
            </label>
            <label>
              有效结束
              <Input v-model:value="form.validUntil" type="date" />
            </label>
          </div>
        </section>

        <section>
          <h3>支持的合规代码</h3>
          <p class="capability-page__hint">
            每类最多 50
            项；输入后按回车确认。保存时会转为大写、去重并按服务端格式校验。
          </p>
          <div class="capability-form__grid capability-form__codes">
            <label>
              包装要求
              <Select
                v-model:value="form.supportedPackagingRequirements"
                mode="tags"
                placeholder="例如 CARTON"
                :token-separators="[',', ' ']"
                @blur="normalizeCodes('supportedPackagingRequirements')"
              />
            </label>
            <label>
              认证要求
              <Select
                v-model:value="form.supportedCertificationRequirements"
                mode="tags"
                placeholder="例如 CE"
                :token-separators="[',', ' ']"
                @blur="normalizeCodes('supportedCertificationRequirements')"
              />
            </label>
            <label>
              国家合规要求
              <Select
                v-model:value="form.supportedCountryComplianceRequirements"
                mode="tags"
                placeholder="例如 EU.REACH"
                :token-separators="[',', ' ']"
                @blur="normalizeCodes('supportedCountryComplianceRequirements')"
              />
            </label>
            <label>
              客户合规要求
              <Select
                v-model:value="form.supportedCustomerComplianceRequirements"
                mode="tags"
                placeholder="例如 CUSTOMER:A"
                :token-separators="[',', ' ']"
                @blur="
                  normalizeCodes('supportedCustomerComplianceRequirements')
                "
              />
            </label>
          </div>
        </section>

        <section>
          <h3>证据</h3>
          <div class="capability-form__grid">
            <label>
              证据模式
              <Select
                v-model:value="form.evidenceMode"
                :options="evidenceModeOptions"
              />
            </label>
            <label>
              证据时间
              <Input v-model:value="form.evidenceTime" type="datetime-local" />
            </label>
            <label>
              证据有效截止
              <Input
                v-model:value="form.evidenceValidUntil"
                type="datetime-local"
              />
            </label>
          </div>

          <Alert
            v-if="form.evidenceMode === 'AUTHORITATIVE'"
            class="capability-form__evidence-alert"
            description="四个来源字段均为必填；服务端会清除人工确认人与说明。"
            message="权威系统证据"
            show-icon
            type="info"
          />
          <div
            v-if="form.evidenceMode === 'AUTHORITATIVE'"
            class="capability-form__grid"
          >
            <label>
              来源系统
              <Input
                v-model:value="form.evidenceSourceSystem"
                :maxlength="64"
                placeholder="例如 FDM_FACTORY"
              />
            </label>
            <label>
              来源版本
              <Input
                v-model:value="form.evidenceSourceVersion"
                :maxlength="128"
              />
            </label>
            <label>
              来源引用 ID
              <Input
                v-model:value="form.evidenceSourceRefId"
                :maxlength="128"
              />
            </label>
            <label>
              来源名称
              <Input v-model:value="form.evidenceSourceName" :maxlength="128" />
            </label>
          </div>
          <template v-else>
            <Alert
              class="capability-form__evidence-alert"
              description="确认人由服务端绑定为当前登录用户；服务端会清除权威来源字段。"
              message="人工确认责任边界"
              show-icon
              type="warning"
            />
            <label class="capability-form__note">
              人工确认说明
              <Input.TextArea
                v-model:value="form.evidenceNote"
                :auto-size="{ minRows: 3, maxRows: 7 }"
                :maxlength="1000"
                show-count
              />
            </label>
          </template>
        </section>
      </div>
    </Modal>

    <ProductSelectionModal
      v-model:open="productPickerOpen"
      :company-id="form.companyId"
      :disabled="!canPickProduct"
      title="选择能力对应的产品 SKU"
      @select="chooseProduct"
    />
  </Page>
</template>

<style scoped>
.capability-page,
.capability-form {
  display: grid;
  gap: 14px;
}

.capability-page__hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.capability-page__stack {
  display: grid;
  gap: 5px;
}

.capability-page__stack span,
.capability-page__requirements small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.capability-page__requirements {
  display: grid;
  gap: 7px;
}

.capability-page__requirements > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.capability-page__requirements small {
  width: 34px;
}

.capability-page__hash,
.capability-page__token {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}

.capability-page__hash {
  font-size: 11px !important;
}

.capability-page__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.capability-form section {
  padding: 14px;
  background: hsl(var(--muted) / 25%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.capability-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}

.capability-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.capability-form__grid label,
.capability-form__note {
  display: grid;
  gap: 6px;
}

.capability-form__switch {
  align-content: start;
}

.capability-form__codes label {
  min-width: 0;
}

.capability-form__selection {
  margin: 10px 0 0;
  font-size: 12px;
  color: #1677ff;
}

.capability-form__evidence-alert {
  margin: 12px 0;
}

.capability-form__errors {
  padding-left: 20px;
  margin: 4px 0 0;
}

@media (max-width: 760px) {
  .capability-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
