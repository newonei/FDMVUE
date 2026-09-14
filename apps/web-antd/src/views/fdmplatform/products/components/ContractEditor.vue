<script setup lang="ts">
import type {
  Access,
  Contract,
  ContractAttachment,
  ContractItem,
  Directory,
  MasterRecord,
} from '#/api/fdmplatform';
import type { Product, TaxBasis } from '#/api/fdmplatform/products';

import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getAccess,
  getAttachments,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { getCustomer, getCustomers } from '#/api/fdmplatform/customers';
import { resolveProducts } from '#/api/fdmplatform/products';
import {
  contractActionWithAttachments,
  createContractWithAttachments,
} from '#/api/fdmplatform/submissions';

import CreationAttachments from '../../components/CreationAttachments.vue';
import {
  productCategoryOptions,
  validProductCategory,
} from '../../contract-categories';
import { errorText, money } from '../../data';
import { personLabel } from '../../directory';
import {
  applyReferencePrices,
  contractCompanyOptions,
  contractHeaderPayload,
  contractLineAmount,
  copyContractLine,
  currencyOptions,
  hasProductVersion,
  invalidateLinePrices,
  taxOptions,
} from '../model';
import ProductPicker from './ProductPicker.vue';

const props = defineProps<{
  contract?: Contract;
  defaultBusinessType?: 'DOMESTIC' | 'FOREIGN';
  directory?: Directory;
  master: MasterRecord[];
  open: boolean;
}>();
const emit = defineEmits<{ close: []; saved: [contract: Contract] }>();
const access = ref<Access>();
const orderCompanies = computed(() =>
  contractCompanyOptions(access.value?.companies ?? [], props.contract),
);
const form = reactive({
  companyId: undefined as number | undefined,
  code: '',
  name: '',
  customerId: '',
  businessType: props.defaultBusinessType ?? 'DOMESTIC',
  productCategory: undefined as string | undefined,
  currency: 'CNY',
  taxBasis: 'TAX_INCLUDED' as TaxBasis,
  ownerUserId: undefined as number | undefined,
  departmentId: undefined as number | undefined,
  signedDate: '',
  alibabaTradeAssuranceNo: '',
  paymentTerms: '',
  deliveryRequirement: '',
  attachmentIds: [] as string[],
});
const lines = ref<ContractItem[]>([]);
const expanded = ref<string[]>([]);
const saving = ref(false);
const resolving = ref(false);
const panelError = ref('');
const priceNotice = ref('');
const pickerOpen = ref(false);
const replacementId = ref<string>();
const key = ref('');
const expectedVersion = ref(0);
const batchDate = ref('');
const attachments = ref<ContractAttachment[]>([]);
const draftFiles = ref<File[]>([]);
const attachmentsError = ref('');
const quantityInputs = new Map<string, { focus: () => void }>();
const customerChoices = ref<MasterRecord[]>([]);
const customerLoading = ref(false);
const customerError = ref('');
const customerKeyword = ref('');
const customerPage = ref(1);
const customerTotal = ref(0);
const customerOptions = computed(() =>
  customerChoices.value.map((customer) => ({
    value: customer.id,
    label: `${customer.code} · ${customer.name}${customer.active ? '' : '（已停用）'}`,
    disabled: !customer.active,
  })),
);
let customerSequence = 0;
let customerTimer: ReturnType<typeof setTimeout> | undefined;

async function loadCustomers(reset = false) {
  if (!props.open) return;
  const run = ++customerSequence;
  if (reset) customerPage.value = 1;
  customerLoading.value = true;
  customerError.value = '';
  try {
    const result = await getCustomers({
      keyword: customerKeyword.value.trim() || undefined,
      active: true,
      pageNo: customerPage.value,
      pageSize: 30,
    });
    if (run !== customerSequence || !props.open) return;
    const previous = reset
      ? customerChoices.value.filter((row) => row.id === form.customerId)
      : customerChoices.value;
    customerChoices.value = [
      ...new Map(
        [...previous, ...result.list].map((row) => [row.id, row]),
      ).values(),
    ];
    customerTotal.value = result.total;
    if (
      form.customerId &&
      !customerChoices.value.some((row) => row.id === form.customerId)
    ) {
      const selectedId = form.customerId;
      const selected = await getCustomer(selectedId);
      if (
        run === customerSequence &&
        props.open &&
        selectedId === form.customerId
      )
        customerChoices.value.unshift(selected);
    }
  } catch (error) {
    if (run === customerSequence) customerError.value = errorText(error);
  } finally {
    if (run === customerSequence) customerLoading.value = false;
  }
}
function searchCustomers(value: string) {
  clearTimeout(customerTimer);
  ++customerSequence;
  customerKeyword.value = value;
  customerTimer = setTimeout(() => {
    void loadCustomers(true);
  }, 200);
}
function moreCustomers(event: Event) {
  const element = event.target as HTMLElement;
  if (
    customerLoading.value ||
    customerPage.value * 30 >= customerTotal.value ||
    element.scrollHeight - element.scrollTop - element.clientHeight > 24
  )
    return;
  customerPage.value++;
  void loadCustomers();
}
onBeforeUnmount(() => {
  ++customerSequence;
  clearTimeout(customerTimer);
});
function bindQuantityInput(id: string, input: unknown) {
  if (input && typeof (input as { focus?: unknown }).focus === 'function')
    quantityInputs.set(id, input as { focus: () => void });
  else quantityInputs.delete(id);
}
const total = computed(() =>
  lines.value.reduce((sum, line) => sum + (contractLineAmount(line) ?? 0), 0),
);
const missingPrices = computed(
  () =>
    lines.value.filter((line) => contractLineAmount(line) === undefined).length,
);
const lockedIds = computed(
  () =>
    new Set(
      (props.contract?.requests ?? [])
        .filter((request) => request.status !== 'CANCELLED')
        .flatMap((request) =>
          Array.isArray(request.items)
            ? request.items.map((item) =>
                String((item as Record<string, unknown>).contractItemId),
              )
            : [],
        ),
    ),
);
const columns = [
  { title: '产品与规格', key: 'product', width: 320 },
  { title: '单位', dataIndex: 'unit', width: 60 },
  { title: '数量', key: 'quantity', width: 130 },
  { title: '成交单价', key: 'unitPrice', width: 150 },
  { title: '金额', key: 'amount', width: 130 },
  { title: '交期', key: 'date', width: 165 },
  { title: '操作', key: 'action', width: 150 },
];
watch(
  () => props.open,
  async (open) => {
    ++customerSequence;
    clearTimeout(customerTimer);
    if (!open) return;
    const contract = props.contract;
    panelError.value = '';
    priceNotice.value = '';
    attachmentsError.value = '';
    attachments.value = [];
    draftFiles.value = [];
    expanded.value = [];
    pickerOpen.value = false;
    key.value = newIdempotencyKey();
    expectedVersion.value = contract?.version ?? 0;
    Object.assign(form, {
      companyId: contract?.companyId,
      code: contract?.code ?? '',
      name: contract?.name ?? '',
      customerId: contract?.customerId ?? '',
      businessType:
        contract?.businessType ?? props.defaultBusinessType ?? 'DOMESTIC',
      productCategory: contract?.productCategory || undefined,
      currency: contract?.currency ?? 'CNY',
      taxBasis:
        contract?.items[0]?.taxBasis === 'TAX_EXCLUDED'
          ? 'TAX_EXCLUDED'
          : 'TAX_INCLUDED',
      ownerUserId: contract?.ownerUserId,
      departmentId: contract?.departmentId,
      signedDate:
        contract?.signedDate ?? new Date().toLocaleDateString('sv-SE'),
      alibabaTradeAssuranceNo: contract?.alibabaTradeAssuranceNo ?? '',
      paymentTerms: contract?.paymentTerms ?? '',
      deliveryRequirement: contract?.deliveryRequirement ?? '',
      attachmentIds: Array.isArray(contract?.attachmentIds)
        ? [...contract.attachmentIds]
        : [],
    });
    lines.value = (contract?.items ?? []).map((line) => ({
      ...line,
      attachmentIds: [...(line.attachmentIds ?? [])],
    }));
    customerChoices.value = props.master.filter(
      (row) => row.type === 'CUSTOMER' && row.id === form.customerId,
    );
    customerKeyword.value = '';
    void loadCustomers(true);
    try {
      access.value = await getAccess();
      if (!contract) {
        form.ownerUserId = access.value.userId;
        form.departmentId = access.value.departmentId;
      }
    } catch (error) {
      panelError.value = errorText(error);
    }
    if (contract) {
      try {
        const result = await getAttachments(contract.id);
        attachments.value = result.items;
      } catch (error) {
        attachmentsError.value = errorText(error);
      }
    }
  },
);
function showPicker(lineId?: string) {
  panelError.value = '';
  replacementId.value = lineId;
  pickerOpen.value = true;
}
function changePricing() {
  if (lines.value.length === 0) return;
  lines.value = invalidateLinePrices(lines.value, form.taxBasis);
  priceNotice.value =
    '币种或税费口径已变化，原单价已清空。请重新匹配参考价或填写本次成交价；数量和定制要求已保留。';
}
async function chooseProducts(products: Product[]) {
  resolving.value = true;
  panelError.value = '';
  try {
    const selected = replacementId.value ? products.slice(0, 1) : products;
    const resolved = await resolveProducts({
      companyId: 0,
      currency: form.currency,
      taxBasis: form.taxBasis,
      items: selected.map((product) => ({
        productId: product.id,
        productVersion: product.version,
      })),
    });
    const duplicate = resolved.some((line) =>
      lines.value.some((existing) => existing.skuId === line.skuId),
    );
    if (replacementId.value) {
      const id = replacementId.value;
      const original = lines.value.find((line) => line.id === id);
      const first = resolved[0];
      if (original && first)
        lines.value = lines.value.map((line) =>
          line.id === id
            ? {
                ...first,
                id: hasProductVersion(original) ? id : newIdempotencyKey(),
                quantity: original.quantity,
                requiredDate: original.requiredDate,
              }
            : line,
        );
    } else
      lines.value.push(
        ...resolved.map((line) => ({
          ...line,
          id: newIdempotencyKey(),
          requiredDate: batchDate.value || undefined,
        })),
      );
    pickerOpen.value = false;
    if (duplicate)
      message.info('重复 SKU 已保留独立明细，方便分别填写包装、图稿或交期');
    await nextTick();
    quantityInputs
      .get(
        lines.value.find((line) => line.skuId === resolved[0]?.skuId)?.id ?? '',
      )
      ?.focus();
  } catch (error) {
    panelError.value = `${errorText(error)}。请刷新选品列表，核对最新资料后重新选择；当前合同输入已保留。`;
  } finally {
    resolving.value = false;
  }
}
async function reprice() {
  const available = lines.value.filter((line) => hasProductVersion(line));
  if (available.length === 0) {
    message.info('历史合同明细需手动确认成交价，或重新选择产品中心规格');
    return;
  }
  resolving.value = true;
  panelError.value = '';
  try {
    const resolved = await resolveProducts({
      companyId: 0,
      currency: form.currency,
      taxBasis: form.taxBasis,
      items: [
        ...new Map(
          available.map((line) => [
            line.skuId,
            { productId: line.skuId, productVersion: line.productVersion! },
          ]),
        ).values(),
      ],
    });
    lines.value = applyReferencePrices(lines.value, resolved);
    priceNotice.value =
      '已按当前币种、税费口径匹配参考价；未匹配的产品仍需定价。';
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    resolving.value = false;
  }
}
function requestReprice() {
  Modal.confirm({
    title: '按当前参考价重新定价？',
    content:
      '所有产品中心明细的成交单价将替换为最新匹配参考价。没有参考价的产品会标记为待定价；数量和定制要求保留。',
    okText: '重新匹配',
    onOk: reprice,
  });
}
function copyLine(line: ContractItem) {
  if (!hasProductVersion(line)) {
    message.info('历史规格请先从产品中心重新选择，再复制为独立明细');
    return;
  }
  lines.value.push(copyContractLine(line, newIdempotencyKey()));
}
function toggleCustom(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((value) => value !== id)
    : [...expanded.value, id];
}
function close() {
  if (saving.value) return;
  Modal.confirm({
    title: '关闭合同编辑？',
    content:
      draftFiles.value.length > 0
        ? `尚未保存的修改和 ${draftFiles.value.length} 个待上传附件将丢失。`
        : '尚未保存的本次修改将丢失。',
    okText: '关闭',
    onOk: () => emit('close'),
  });
}
async function save() {
  if (saving.value) return;
  if (!validProductCategory(form.productCategory)) {
    panelError.value = '请选择合同产品分类';
    return;
  }
  if (
    form.companyId === undefined ||
    form.companyId <= 0 ||
    !form.name.trim() ||
    !form.customerId ||
    !form.ownerUserId ||
    !form.signedDate
  ) {
    panelError.value = '请补齐订单所属公司、合同名称、客户、负责人和签订日期';
    return;
  }
  if (lines.value.length === 0) {
    panelError.value = '请至少从产品中心选择一个具体规格';
    return;
  }
  const invalid = lines.value.findIndex(
    (line) =>
      !Number.isFinite(Number(line.quantity)) ||
      Number(line.quantity) <= 0 ||
      (line.unitPrice !== null &&
        line.unitPrice !== undefined &&
        (!Number.isFinite(Number(line.unitPrice)) ||
          Number(line.unitPrice) < 0)),
  );
  if (invalid !== -1) {
    panelError.value = `第 ${invalid + 1} 行数量应大于零，成交单价应为非负金额或留空待定价`;
    return;
  }
  saving.value = true;
  panelError.value = '';
  try {
    const header = contractHeaderPayload(form, props.contract);
    const payload = {
      ...header,
      companyId: form.companyId,
      customerName:
        customerChoices.value.find((record) => record.id === form.customerId)
          ?.name ??
        props.master.find((record) => record.id === form.customerId)?.name ??
        props.contract?.customerName,
      items: lines.value.map((line) => ({
        ...line,
        unitPrice: line.unitPrice === '' ? null : line.unitPrice,
        requiredDate: line.requiredDate || null,
      })),
    };
    const result = props.contract
      ? await contractActionWithAttachments(
          props.contract.id,
          'UPDATE_CONTRACT',
          expectedVersion.value,
          key.value,
          payload,
          draftFiles.value,
        )
      : await createContractWithAttachments(
          { ...payload, idempotencyKey: key.value },
          draftFiles.value,
        );
    draftFiles.value = [];
    message.success(
      missingPrices.value
        ? '合同草稿已保存，确认合同前请补齐成交价'
        : '合同已保存',
    );
    emit('saved', result);
    emit('close');
  } catch (error) {
    panelError.value = `${errorText(error)}。当前输入已保留，请核对提示中的产品或单据版本后再保存。`;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="contract ? `编辑合同 · ${contract.code}` : '新建合同 / 样品'"
    width="min(1480px, 98vw)"
    :mask-closable="false"
    :keyboard="false"
    :closable="!saving"
    @close="close"
  >
    <div class="editor-stack" :inert="saving">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="contract && contract.status !== 'DRAFT'"
        type="warning"
        show-icon
        message="正在修订已确认合同；已有采购申请的明细规格受保护，关键条件变化会按业务规则重新校验批准和执行范围。"
      />
      <Card title="合同基本信息" size="small">
        <Form layout="vertical" class="header-fields">
          <Form.Item label="订单所属公司" required>
            <Select
              v-model:value="form.companyId"
              :options="orderCompanies"
              :disabled="Boolean(contract)"
              placeholder="请选择订单所属公司"
              show-search
              option-filter-prop="label"
            />
          </Form.Item>
          <Form.Item
            label="合同编号"
            extra="首次保存时由系统自动生成，保存后保持不变。"
          >
            <Input
              :value="form.code"
              readonly
              placeholder="首次保存后自动生成"
            />
</Form.Item><Form.Item label="合同名称" required>
            <Input v-model:value="form.name" />
          </Form.Item>
          <Form.Item label="阿里信保单号" extra="不做正式报关可填写“不报关”。">
            <Input
              v-model:value="form.alibabaTradeAssuranceNo"
              :maxlength="100"
              allow-clear
              placeholder="请输入阿里信保单号或“不报关”"
            />
          </Form.Item>
          <Form.Item label="客户" required>
            <Select
              v-model:value="form.customerId"
              :options="customerOptions"
              :loading="customerLoading"
              :filter-option="false"
              show-search
              placeholder="搜索客户名称或编号"
              @search="searchCustomers"
              @popup-scroll="moreCustomers"
            />
            <Alert v-if="customerError" type="error" :message="customerError" />
          </Form.Item>
          <Form.Item label="业务类型">
            <Select
              v-model:value="form.businessType"
              :options="[
                { value: 'FOREIGN', label: '外贸 B2B' },
                { value: 'DOMESTIC', label: '国内 B2B' },
                { value: 'GOVERNMENT', label: '政府客户' },
                { value: 'SAMPLE', label: '样品（允许零价）' },
              ]"
            />
          </Form.Item>
          <Form.Item
            label="产品分类"
            required
            :extra="
              contract && !contract.productCategory
                ? '原合同未注明分类，请按实际业务选择后保存。'
                : undefined
            "
          >
            <Select
              v-model:value="form.productCategory"
              :options="productCategoryOptions"
              placeholder="请选择产品分类"
            />
          </Form.Item>
          <Form.Item label="负责人" required>
            <Select
              v-model:value="form.ownerUserId"
              :options="
                directory?.users.map((user) => ({
                  value: user.id,
                  label: personLabel(directory, user.id),
                }))
              "
              show-search
              option-filter-prop="label"
            />
          </Form.Item>
          <Form.Item label="业务部门（可选）">
            <Select
              v-model:value="form.departmentId"
              allow-clear
              placeholder="可留空"
              :options="
                directory?.departments.map((department) => ({
                  value: department.id,
                  label: department.name,
                }))
              "
              show-search
              option-filter-prop="label"
            />
          </Form.Item>
          <Form.Item label="合同币种" required>
            <Select
              v-model:value="form.currency"
              :options="currencyOptions"
              @change="changePricing"
            />
          </Form.Item>
          <Form.Item label="默认税费口径" required>
            <Select
              v-model:value="form.taxBasis"
              :options="taxOptions"
              @change="changePricing"
            />
          </Form.Item>
          <Form.Item label="签订日期" required>
            <Input v-model:value="form.signedDate" type="date" />
</Form.Item><Form.Item label="付款条件">
            <Input.TextArea
              v-model:value="form.paymentTerms"
              :rows="2"
            />
</Form.Item><Form.Item label="交付要求">
            <Input.TextArea
              v-model:value="form.deliveryRequirement"
              :rows="2"
            />
          </Form.Item>
        </Form>
      </Card>
      <Card title="产品明细" size="small">
        <div class="editor-stack">
          <Space wrap>
            <Button type="primary" :loading="resolving" @click="showPicker()">
              从产品中心选择
</Button><Input
              v-model:value="batchDate"
              type="date"
              style="width: 170px"
            /><Button
              :disabled="!batchDate || !lines.length"
              @click="lines.forEach((line) => (line.requiredDate = batchDate))"
            >
              统一设置交期
</Button><Button
              :disabled="!lines.length"
              :loading="resolving"
              @click="requestReprice"
            >
              重新匹配参考价
</Button><Tag color="blue">
              {{ form.currency }} ·
              {{ form.taxBasis === 'TAX_INCLUDED' ? '含税' : '未税' }}
            </Tag>
          </Space>
          <Alert
            v-if="priceNotice"
            type="warning"
            show-icon
            :message="priceNotice"
          />
          <Table
            :columns="columns"
            :data-source="lines"
            row-key="id"
            :pagination="false"
            :scroll="{ x: 1250 }"
            :expanded-row-keys="expanded"
            :show-expand-column="false"
          >
            <template #emptyText>
              <Empty
                description="从产品中心批量选择，自动带入规格、单位、标准包装和参考价"
              />
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'product'">
                <strong>{{ record.skuName }}</strong>
                <div class="muted">{{ record.skuCode || record.skuId }}</div>
                <div>
                  {{
                    [
                      record.specification,
                      record.material,
                      record.size,
                      record.color,
                      record.shape,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </div>
                <Tag v-if="lockedIds.has(record.id)">
                  已有采购申请，规格已锁定
</Tag><Tag v-else-if="!hasProductVersion(record as ContractItem)">
                  历史合同规格
                </Tag>
              </template>
              <InputNumber
                v-else-if="column.key === 'quantity'"
                :ref="(input) => bindQuantityInput(record.id, input)"
                v-model:value="record.quantity"
                :min="0.000001"
                string-mode
                style="width: 110px"
              />
              <template v-else-if="column.key === 'unitPrice'">
                <InputNumber
                  v-model:value="record.unitPrice"
                  :min="0"
                  string-mode
                  placeholder="待定价"
                  style="width: 125px"
                />
                <div class="muted">
                  {{
                    record.priceSourceId
                      ? '已带入销售参考价，可调整'
                      : record.unitPrice == null
                        ? '待定价 · 可先存草稿'
                        : '本合同成交价'
                  }}
                </div>
              </template>
              <span v-else-if="column.key === 'amount'">{{
                contractLineAmount(record as ContractItem) === undefined
                  ? '待定价'
                  : money(contractLineAmount(record as ContractItem))
              }}</span>
              <Input
                v-else-if="column.key === 'date'"
                v-model:value="record.requiredDate"
                type="date"
              />
              <Space v-else-if="column.key === 'action'" :size="0" wrap>
                <Button
                  type="link"
                  size="small"
                  @click="toggleCustom(record.id)"
                >
                  定制要求
</Button><Button
                  type="link"
                  size="small"
                  @click="copyLine(record as ContractItem)"
                >
                  复制行
</Button><Button
                  type="link"
                  size="small"
                  :disabled="lockedIds.has(record.id)"
                  @click="showPicker(record.id)"
                >
                  更换规格
</Button><Button
                  type="link"
                  size="small"
                  danger
                  :disabled="lockedIds.has(record.id)"
                  @click="lines = lines.filter((line) => line.id !== record.id)"
                >
                  移除
                </Button>
              </Space>
            </template>
            <template #expandedRowRender="{ record }">
              <div class="custom-fields">
                <Form layout="vertical">
                  <Form.Item label="本合同印刷 / LOGO 要求">
                    <Input.TextArea
                      v-model:value="record.printing"
                      :disabled="lockedIds.has(record.id)"
                      :rows="2"
                    />
</Form.Item><Form.Item label="本合同包装要求">
                    <Input.TextArea
                      v-model:value="record.packaging"
                      :disabled="lockedIds.has(record.id)"
                      :rows="2"
                    />
</Form.Item><Form.Item label="本合同规格图稿">
                    <Select
                      v-if="contract"
                      v-model:value="record.attachmentIds"
                      mode="multiple"
                      :disabled="lockedIds.has(record.id)"
                      :options="
                        attachments
                          .filter(
                            (attachment) =>
                              attachment.category === 'SPECIFICATION',
                          )
                          .map((attachment) => ({
                            value: attachment.id,
                            label: attachment.name,
                          }))
                      "
                      placeholder="从已上传的规格图稿中选择"
                    /><span v-else class="muted">先保存草稿，再在合同附件中上传图稿；返回编辑即可关联。</span>
                  </Form.Item>
</Form><Alert
                  type="info"
                  show-icon
                  message="本次印刷、包装、图稿独立保存在合同中，不修改产品档案；系统自动生成实际规格标识。"
                />
              </div>
            </template>
          </Table>
          <Alert
            v-if="missingPrices"
            type="warning"
            show-icon
            :message="`${missingPrices} 条产品明细待定价，可先保存草稿；确认合同前需补齐。明确的免费样品可填写 0。`"
          />
          <div class="total-line">
            <span>共 {{ lines.length }} 条产品明细</span><strong>已定价小计 {{ money(total, form.currency) }}</strong>
          </div>
        </div>
      </Card>
      <CreationAttachments v-model:files="draftFiles" :disabled="saving" />
      <Alert
        v-if="attachmentsError"
        type="warning"
        show-icon
        :message="`附件未加载：${attachmentsError}。已有引用保留，请刷新后再修改附件。`"
      />
    </div>
    <template #footer>
      <Space>
        <Button :disabled="saving" @click="close">取消</Button><Button type="primary" :loading="saving" @click="save">
          {{
            contract && contract.status !== 'DRAFT'
              ? '保存合同修订'
              : '保存草稿'
          }}
</Button><span class="muted">产品版本与单据版本由服务端复验</span>
      </Space>
    </template>
  </Drawer>
  <ProductPicker
    :single="Boolean(replacementId)"
    :busy="resolving"
    :selection-error="panelError"
    :company-id="0"
    :open="pickerOpen"
    :currency="form.currency"
    :tax-basis="form.taxBasis"
    @close="pickerOpen = false"
    @selected="chooseProducts"
  />
</template>

<style scoped>
.editor-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.header-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 18px;
}

.muted {
  font-size: 12px;
  color: #64748b;
}

.custom-fields {
  padding: 12px 20px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
}

.custom-fields form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.total-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.total-line strong {
  font-size: 20px;
}

@media (max-width: 800px) {
  .header-fields,
  .custom-fields form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 500px) {
  .header-fields,
  .custom-fields form {
    grid-template-columns: 1fr;
  }
}
</style>
