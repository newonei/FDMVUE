<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';

import type { ErpFinancePaymentApi } from '#/api/erp/finance/payment';

import { computed, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  message,
  Row,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

import { getAccountSimpleList } from '#/api/erp/finance/account';
import {
  createAllocatedV2Payment,
  getAllocatedV2Payment,
  previewFinancePaymentAllocation,
  updateAllocatedV2Payment,
} from '#/api/erp/finance/payment';
import { getSupplierSimpleList } from '#/api/erp/purchase/supplier';
import { getSimpleUserList } from '#/api/system/user';

defineOptions({ name: 'ErpFinanceAllocatedV2Form' });

const emit = defineEmits<{
  success: [payment: ErpFinancePaymentApi.AllocatedPayment];
}>();

type V2FormType = 'create' | 'detail' | 'edit';

export interface AllocatedV2ModalSeed {
  accountId?: number | string;
  allocationHash?: string;
  allocationKind?: string;
  allocationRevision?: number;
  currency?: string;
  currencyCode?: string;
  direction?: ErpFinancePaymentApi.AllocatedPaymentDirection;
  exchangeRateToCny?: string;
  financeUserId?: number | string;
  id?: number | string;
  lastReverseReason?: string;
  no?: string;
  obligationLineId?: number | string;
  paymentTime?: Date | string;
  postingVersion?: number;
  rateEffectiveDate?: string;
  rateFallbackUsed?: boolean;
  rateProvider?: string;
  rateRequestedDate?: string;
  rateRetrievedAt?: string;
  remark?: string;
  settlementDirection?: ErpFinancePaymentApi.AllocatedPaymentDirection;
  status?: number;
  supplierId?: number | string;
  transactionAmount?: number | string;
  transactionAmountCny?: number | string;
  version?: number;
}

interface ModalData {
  formType: V2FormType;
  payment?: AllocatedV2ModalSeed;
}

interface SelectOption {
  label: string;
  value: string;
}

interface FormModel {
  accountId?: string;
  currency: string;
  direction: ErpFinancePaymentApi.AllocatedPaymentDirection;
  financeUserId?: string;
  obligationLineId: string;
  paymentTime: Dayjs;
  remark: string;
  supplierId?: string;
  transactionAmount: string;
}

const formType = ref<V2FormType>('create');
const formRef = ref<FormInstance>();
const previewLoading = ref(false);
const preview = ref<ErpFinancePaymentApi.AllocationPreview>();
const previewInputKey = ref('');
const existingSnapshot = ref<AllocatedV2ModalSeed>();
const supplierOptions = ref<SelectOption[]>([]);
const accountOptions = ref<SelectOption[]>([]);
const financeUserOptions = ref<SelectOption[]>([]);

const form = reactive<FormModel>({
  accountId: undefined,
  currency: 'CNY',
  direction: 'PAYMENT',
  financeUserId: undefined,
  obligationLineId: '',
  paymentTime: dayjs(),
  remark: '',
  supplierId: undefined,
  transactionAmount: '',
});

const currencyOptions = [
  'CNY',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'HKD',
  'AUD',
  'CAD',
  'CHF',
  'SGD',
  'NZD',
  'KRW',
  'THB',
  'AED',
  'SAR',
  'MXN',
].map((value) => ({ label: value, value }));

const directionOptions: Array<{
  label: string;
  value: ErpFinancePaymentApi.AllocatedPaymentDirection;
}> = [
  { label: '付款（核销应付）', value: 'PAYMENT' },
  { label: '退款（核销退货应收）', value: 'REFUND' },
];

const candidateColumns: TableColumnsType<ErpFinancePaymentApi.AllocationCandidateLine> =
  [
    { key: 'document', title: '来源单据', width: 210 },
    { key: 'line', title: '义务行', width: 190 },
    { key: 'type', title: '义务类型', width: 110 },
    { key: 'net', title: '义务净额（CNY）', width: 145 },
    { key: 'settled', title: '已结算（CNY）', width: 135 },
    { key: 'open', title: '可结算（CNY）', width: 145 },
    { fixed: 'right', key: 'action', title: '选择', width: 88 },
  ];

const isDetail = computed(() => formType.value === 'detail');
const title = computed(() => {
  if (formType.value === 'create') return '新建供应商结算 V2';
  if (formType.value === 'edit') return '编辑供应商结算 V2';
  return '供应商结算 V2 详情';
});

const currentInputKey = computed(() =>
  JSON.stringify({
    currencyCode: canonicalCurrency(form.currency),
    obligationLineId: form.obligationLineId.trim(),
    paymentDate: form.paymentTime?.format('YYYY-MM-DD') || '',
    settlementDirection: form.direction,
    supplierId: form.supplierId || '',
    transactionAmount: canonicalAmount(form.transactionAmount),
  }),
);

const previewIsCurrent = computed(
  () =>
    Boolean(preview.value?.previewHash) &&
    previewInputKey.value === currentInputKey.value,
);

const editIdentityReady = computed(
  () =>
    formType.value !== 'edit' ||
    (Boolean(existingSnapshot.value?.id) &&
      Number.isInteger(existingSnapshot.value?.version) &&
      Number(existingSnapshot.value?.version) >= 0),
);

const confirmDisabled = computed(
  () => !previewIsCurrent.value || !editIdentityReady.value,
);

const rules = {
  accountId: [{ required: true, message: '请选择付款账户' }],
  currency: [
    { required: true, message: '请输入币种' },
    {
      validator: async (_rule: unknown, value: string) => {
        if (!/^[A-Z]{3}$/.test(canonicalCurrency(value))) {
          throw new Error('币种必须是 3 位大写 ISO 代码');
        }
      },
    },
  ],
  direction: [{ required: true, message: '请选择结算方向' }],
  obligationLineId: [
    { required: true, message: '请输入或选择义务行' },
    {
      validator: async (_rule: unknown, value: string) => {
        if (!/^[1-9]\d*$/.test(String(value || '').trim())) {
          throw new Error('义务行 ID 必须是正整数');
        }
      },
    },
  ],
  paymentTime: [{ required: true, message: '请选择付款时间' }],
  supplierId: [{ required: true, message: '请选择供应商' }],
  transactionAmount: [
    { required: true, message: '请输入原币金额' },
    {
      validator: async (_rule: unknown, value: string) => {
        const amount = canonicalAmount(value);
        if (!/^\d{1,16}(?:\.\d{1,8})?$/.test(amount)) {
          throw new Error('原币金额最多 16 位整数、8 位小数');
        }
        if (!new BigNumber(amount).isGreaterThan(0)) {
          throw new Error('原币金额必须大于 0');
        }
      },
    },
  ],
};

function canonicalCurrency(value?: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function canonicalAmount(value?: number | string) {
  return String(value ?? '').trim();
}

function formatAmount(value?: number | string) {
  if (value === undefined || value === null || value === '') return '—';
  const amount = new BigNumber(value);
  return amount.isFinite() ? amount.toFormat() : String(value);
}

function allocationKindLabel(value?: string) {
  if (value === 'DIRECT_PAY') return '应付直接核销';
  if (value === 'RETURN_REFUND') return '退货退款核销';
  return value || '—';
}

function obligationTypeLabel(value?: string) {
  if (value === 'PAYABLE') return '应付';
  if (value === 'CREDIT') return '贷项/应收';
  return value || '—';
}

function reset() {
  Object.assign(form, {
    accountId: undefined,
    currency: 'CNY',
    direction: 'PAYMENT',
    financeUserId: undefined,
    obligationLineId: '',
    paymentTime: dayjs(),
    remark: '',
    supplierId: undefined,
    transactionAmount: '',
  } satisfies FormModel);
  preview.value = undefined;
  previewInputKey.value = '';
  existingSnapshot.value = undefined;
  formRef.value?.clearValidate();
}

async function loadOptions() {
  const [suppliers, accounts, users] = await Promise.all([
    getSupplierSimpleList(),
    getAccountSimpleList(),
    getSimpleUserList(),
  ]);
  supplierOptions.value = suppliers.map((item) => ({
    label: item.name,
    value: String(item.id),
  }));
  accountOptions.value = accounts.map((item) => ({
    label: item.name,
    value: String(item.id),
  }));
  financeUserOptions.value = users.map((item) => ({
    label: item.nickname,
    value: String(item.id),
  }));
  return accounts;
}

function hydrate(seed: AllocatedV2ModalSeed) {
  existingSnapshot.value = seed;
  form.accountId = seed.accountId ? String(seed.accountId) : undefined;
  form.currency = canonicalCurrency(
    seed.currency || seed.currencyCode || 'CNY',
  );
  form.direction =
    seed.direction || seed.settlementDirection || ('PAYMENT' as const);
  form.financeUserId = seed.financeUserId
    ? String(seed.financeUserId)
    : undefined;
  form.obligationLineId = seed.obligationLineId
    ? String(seed.obligationLineId)
    : '';
  form.paymentTime = seed.paymentTime ? dayjs(seed.paymentTime) : dayjs();
  form.remark = seed.remark || '';
  form.supplierId = seed.supplierId ? String(seed.supplierId) : undefined;
  form.transactionAmount = canonicalAmount(seed.transactionAmount);
}

function buildPreviewRequest(): ErpFinancePaymentApi.AllocationPreviewRequest {
  return {
    currencyCode: canonicalCurrency(form.currency),
    obligationLineId: form.obligationLineId.trim(),
    paymentDate: form.paymentTime.format('YYYY-MM-DD'),
    settlementDirection: form.direction,
    supplierId: String(form.supplierId),
    transactionAmount: canonicalAmount(form.transactionAmount),
  };
}

async function handlePreview() {
  if (isDetail.value) return;
  await formRef.value?.validateFields([
    'currency',
    'direction',
    'obligationLineId',
    'paymentTime',
    'supplierId',
    'transactionAmount',
  ]);
  previewLoading.value = true;
  const key = currentInputKey.value;
  try {
    const result = await previewFinancePaymentAllocation(buildPreviewRequest());
    preview.value = result;
    previewInputKey.value = key;
    if (result.proposedAllocation.obligationLineId !== form.obligationLineId) {
      preview.value = undefined;
      previewInputKey.value = '';
      message.error('服务端预览返回的义务行与当前选择不一致');
      return;
    }
    message.success('分摊、义务余额与汇率已由服务端重新校验');
  } finally {
    previewLoading.value = false;
  }
}

async function handleSelectCandidate(candidate: Record<string, any>) {
  const obligationLineId = String(candidate.obligationLineId || '');
  if (!obligationLineId || obligationLineId === form.obligationLineId) return;
  form.obligationLineId = obligationLineId;
  await handlePreview();
}

function buildSaveRequest(): ErpFinancePaymentApi.AllocatedPaymentSaveRequest {
  const request: ErpFinancePaymentApi.AllocatedPaymentSaveRequest = {
    accountId: String(form.accountId),
    currency: canonicalCurrency(form.currency),
    direction: form.direction,
    financeUserId: form.financeUserId || undefined,
    obligationLineId: form.obligationLineId.trim(),
    paymentTime: form.paymentTime.format('YYYY-MM-DDTHH:mm:ss'),
    previewHash: preview.value!.previewHash,
    remark: form.remark.trim() || undefined,
    supplierId: String(form.supplierId),
    transactionAmount: canonicalAmount(form.transactionAmount),
  };
  if (formType.value === 'edit') {
    request.id = String(existingSnapshot.value!.id);
    request.expectedVersion = Number(existingSnapshot.value!.version);
  }
  return request;
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    await formRef.value?.validate();
    if (!previewIsCurrent.value || !preview.value) {
      message.warning('请先根据当前输入重新生成分摊预览');
      return;
    }
    if (!editIdentityReady.value) {
      message.error('当前详情数据缺少 V2 付款头 version，不能安全修改');
      return;
    }
    modalApi.lock();
    try {
      const saved = await (formType.value === 'create'
        ? createAllocatedV2Payment(buildSaveRequest())
        : updateAllocatedV2Payment(buildSaveRequest()));
      await modalApi.close();
      emit('success', saved);
      message.success(
        formType.value === 'create'
          ? '供应商结算 V2 草稿已创建'
          : '供应商结算 V2 草稿已更新',
      );
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      reset();
      return;
    }
    reset();
    const data = modalApi.getData<ModalData>();
    formType.value = data?.formType || 'create';
    modalApi.lock();
    try {
      const [accounts, authoritativePayment] = await Promise.all([
        loadOptions(),
        data?.payment?.id
          ? getAllocatedV2Payment(String(data.payment.id))
          : Promise.resolve(undefined),
      ]);
      if (authoritativePayment) {
        hydrate(authoritativePayment);
      } else if (data?.payment) {
        hydrate(data.payment);
      } else {
        const defaultAccount = accounts.find((item) => item.defaultStatus);
        form.accountId = defaultAccount ? String(defaultAccount.id) : undefined;
      }
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal
    :close-on-click-modal="false"
    :confirm-disabled="confirmDisabled"
    confirm-text="保存 V2 草稿"
    class="w-4/5"
    :description="
      isDetail
        ? '查看真实冻结汇率和分摊证据'
        : '预览只读；保存时后端会再次锁定义务并校验 previewHash'
    "
    :show-confirm-button="!isDetail"
    :title="title"
  >
    <div class="allocated-v2-form">
      <Alert
        v-if="!isDetail"
        description="当前后端还没有独立的“可结算义务行查询”接口。从采购来源单据进入时可预填义务行 ID；从本页新建时，先输入一条已知义务行 ID 并预览，服务端会返回该供应商同方向的真实候选行。"
        message="义务行入口说明"
        show-icon
        type="info"
      />

      <Alert
        v-if="formType === 'edit' && !editIdentityReady"
        description="列表/详情接口尚未返回 V2 付款头 version。为避免覆盖并发修改，前端已禁止保存，不会伪造版本号。"
        message="缺少并发版本"
        show-icon
        type="error"
      />

      <Form
        ref="formRef"
        :disabled="isDetail"
        :model="form"
        :rules="rules"
        layout="vertical"
      >
        <Card size="small" title="结算基本信息">
          <Row :gutter="16">
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="供应商" name="supplierId">
                <Select
                  v-model:value="form.supplierId"
                  allow-clear
                  :filter-option="
                    (input: string, option: any) =>
                      String(option?.label || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                  "
                  :options="supplierOptions"
                  placeholder="选择供应商"
                  show-search
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="付款账户" name="accountId">
                <Select
                  v-model:value="form.accountId"
                  allow-clear
                  :filter-option="
                    (input: string, option: any) =>
                      String(option?.label || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                  "
                  :options="accountOptions"
                  placeholder="选择付款账户"
                  show-search
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="财务人员" name="financeUserId">
                <Select
                  v-model:value="form.financeUserId"
                  allow-clear
                  :filter-option="
                    (input: string, option: any) =>
                      String(option?.label || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                  "
                  :options="financeUserOptions"
                  placeholder="留空时使用当前操作人"
                  show-search
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="结算方向" name="direction">
                <Select
                  v-model:value="form.direction"
                  :options="directionOptions"
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="付款时间" name="paymentTime">
                <DatePicker
                  v-model:value="form.paymentTime"
                  format="YYYY-MM-DD HH:mm:ss"
                  show-time
                  style="width: 100%"
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="币种" name="currency">
                <AutoComplete
                  v-model:value="form.currency"
                  :options="currencyOptions"
                  placeholder="如 USD，可直接输入 ISO 代码"
                  @blur="form.currency = canonicalCurrency(form.currency)"
                >
                  <Input :maxlength="3" />
                </AutoComplete>
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="原币金额" name="transactionAmount">
                <Input
                  v-model:value="form.transactionAmount"
                  autocomplete="off"
                  placeholder="最多 8 位小数"
                />
              </Form.Item>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <Form.Item label="供应商义务行 ID" name="obligationLineId">
                <Input
                  v-model:value="form.obligationLineId"
                  autocomplete="off"
                  placeholder="从来源单据带入或输入已知 ID"
                />
              </Form.Item>
            </Col>
            <Col
              :lg="8"
              :md="12"
              :xs="24"
              class="allocated-v2-form__preview-action"
            >
              <Button
                :loading="previewLoading"
                type="primary"
                @click="handlePreview"
              >
                校验义务并生成分摊预览
              </Button>
            </Col>
            <Col :span="24">
              <Form.Item label="备注" name="remark">
                <Input.TextArea
                  v-model:value="form.remark"
                  :maxlength="500"
                  placeholder="可选，最多 500 字"
                  :rows="2"
                  show-count
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>

      <Alert
        v-if="preview && !previewIsCurrent"
        description="供应商、方向、日期、币种、金额或义务行已变更，旧 previewHash 已失效。请重新预览后再保存。"
        message="分摊预览已过期"
        show-icon
        type="warning"
      />

      <template v-if="preview">
        <Card size="small" title="冻结汇率与本次分摊">
          <Descriptions :column="4" size="small">
            <Descriptions.Item label="结算类型">
              <Tag color="blue">
                {{ allocationKindLabel(preview.allocationKind) }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="原币金额">
              {{ preview.currencyCode }}
              {{ formatAmount(preview.transactionAmount) }}
            </Descriptions.Item>
            <Descriptions.Item label="兑人民币">
              <strong class="allocated-v2-form__amount">
                ¥ {{ formatAmount(preview.transactionAmountCny) }}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="本次核销">
              ¥
              {{ formatAmount(preview.proposedAllocation.settlementAmountCny) }}
            </Descriptions.Item>
            <Descriptions.Item label="汇率">
              1 {{ preview.currencyCode }} = {{ preview.rate.rateToCny }} CNY
            </Descriptions.Item>
            <Descriptions.Item label="请求 / 生效日">
              {{ preview.rate.requestedDate }} /
              {{ preview.rate.effectiveDate }}
            </Descriptions.Item>
            <Descriptions.Item label="汇率提供方">
              {{ preview.rate.provider }}
            </Descriptions.Item>
            <Descriptions.Item label="回退业务日">
              <Tag :color="preview.rate.fallbackUsed ? 'orange' : 'green'">
                {{ preview.rate.fallbackUsed ? '是' : '否' }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="previewHash" :span="4">
              <code class="allocated-v2-form__hash">{{
                preview.previewHash
              }}</code>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card size="small" title="可结算义务行">
          <Table
            :columns="candidateColumns"
            :data-source="preview.candidates"
            :pagination="false"
            row-key="obligationLineId"
            :scroll="{ x: 1020 }"
            size="small"
          >
            <template #emptyText>
              <Empty description="当前供应商和方向没有可结算义务" />
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'document'">
                <div class="allocated-v2-form__stack">
                  <strong>{{ record.sourceDocumentNo }}</strong>
                  <span>{{ record.sourceDocumentType }} v{{
                      record.sourceDocumentVersion
                    }}</span>
                  <span>采购单 {{ record.purchaseOrderNo }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'line'">
                <div class="allocated-v2-form__stack">
                  <strong>{{
                    record.lineRef || `义务行 ${record.obligationLineId}`
                  }}</strong>
                  <span>ID {{ record.obligationLineId }}</span>
                  <span>余额版本 v{{ record.balanceVersion }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'type'">
                <Tag
                  :color="
                    record.obligationType === 'PAYABLE' ? 'blue' : 'purple'
                  "
                >
                  {{ obligationTypeLabel(record.obligationType) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'net'">
                {{ formatAmount(record.netObligationCny) }}
              </template>
              <template v-else-if="column.key === 'settled'">
                {{ formatAmount(record.settledCny) }}
              </template>
              <template v-else-if="column.key === 'open'">
                <strong class="allocated-v2-form__amount">
                  {{ formatAmount(record.openBalanceCny) }}
                </strong>
              </template>
              <template v-else-if="column.key === 'action'">
                <Tag
                  v-if="record.obligationLineId === form.obligationLineId"
                  color="green"
                >
                  已选
                </Tag>
                <Button
                  v-else
                  :disabled="isDetail"
                  size="small"
                  type="link"
                  @click="handleSelectCandidate(record)"
                >
                  选择
                </Button>
              </template>
            </template>
          </Table>
        </Card>
      </template>

      <Card
        v-else-if="isDetail && existingSnapshot"
        size="small"
        title="已冻结的 V2 证据"
      >
        <Descriptions :column="3" size="small">
          <Descriptions.Item label="付款单号">
            {{ existingSnapshot.no || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="付款头版本">
            {{ existingSnapshot.version ?? '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="过账版本">
            {{ existingSnapshot.postingVersion ?? '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="分摊版本">
            {{ existingSnapshot.allocationRevision ?? '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="义务行">
            {{ existingSnapshot.obligationLineId ?? '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="分摊类型">
            {{ allocationKindLabel(existingSnapshot.allocationKind) }}
          </Descriptions.Item>
          <Descriptions.Item label="原币 / 人民币">
            {{
              existingSnapshot.currency || existingSnapshot.currencyCode || '—'
            }}
            {{ formatAmount(existingSnapshot.transactionAmount) }} / ¥
            {{ formatAmount(existingSnapshot.transactionAmountCny) }}
          </Descriptions.Item>
          <Descriptions.Item label="冻结汇率">
            {{ existingSnapshot.exchangeRateToCny || '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="提供方">
            {{ existingSnapshot.rateProvider || '未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="allocationHash" :span="3">
            <code class="allocated-v2-form__hash">
              {{ existingSnapshot.allocationHash || '详情接口未返回' }}
            </code>
          </Descriptions.Item>
          <Descriptions.Item
            v-if="existingSnapshot.lastReverseReason"
            label="最近冲销原因"
            :span="3"
          >
            {{ existingSnapshot.lastReverseReason }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Alert
        v-else
        description="当前还没有服务端分摊预览。前端不会本地计算汇率、可结算余额或 previewHash。"
        message="等待真实预览"
        show-icon
        type="warning"
      />
    </div>
  </Modal>
</template>

<style scoped>
.allocated-v2-form {
  display: grid;
  gap: 14px;
  padding: 0 4px 8px;
}

.allocated-v2-form__preview-action {
  display: flex;
  align-items: center;
  padding-top: 7px;
}

.allocated-v2-form__preview-action :deep(.ant-btn) {
  width: 100%;
}

.allocated-v2-form__amount {
  color: #1677ff;
}

.allocated-v2-form__hash {
  display: block;
  padding: 6px 8px;
  color: #475569;
  overflow-wrap: anywhere;
  background: #f8fafc;
  border-radius: 4px;
}

.allocated-v2-form__stack {
  display: grid;
  gap: 3px;
}

.allocated-v2-form__stack span {
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 700px) {
  .allocated-v2-form__preview-action {
    padding-top: 0;
    padding-bottom: 20px;
  }
}
</style>
