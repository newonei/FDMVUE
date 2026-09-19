<script setup lang="ts">
import type { SalesCharge } from '../feedback-model';

import type {
  Access,
  Contract,
  ContractAttachment,
  ContractItem,
  Directory,
  MasterRecord,
} from '#/api/fdmplatform';
import type { Customer } from '#/api/fdmplatform/customers';
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
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  contractAction,
  getAccess,
  getAttachments,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { getCustomer, getCustomers } from '#/api/fdmplatform/customers';
import { resolveProducts } from '#/api/fdmplatform/products';
import { submissionFilesError } from '#/api/fdmplatform/submission-files';
import {
  contractActionWithAttachments,
  createContractWithAttachments,
} from '#/api/fdmplatform/submissions';

import CreationAttachments from '../../components/CreationAttachments.vue';
import RemoteMasterSelect from '../../components/RemoteMasterSelect.vue';
import {
  productCategoryOptions,
  validProductCategory,
} from '../../contract-categories';
import { errorText, money } from '../../data';
import { personLabel } from '../../directory';
import CustomerEditor from '../../trade/customers/CustomerEditor.vue';
import {
  attachmentPurposeOptions,
  historicalAdditionalAmount,
  salesChargesTotal,
} from '../feedback-model';
import {
  applyReferencePrices,
  contractCompanyOptions,
  contractHeaderPayload,
  contractItemsTotal,
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
  businessType: (props.defaultBusinessType ?? 'DOMESTIC') as string,
  productCategory: undefined as string | undefined,
  currency: 'CNY',
  taxBasis: 'TAX_INCLUDED' as TaxBasis,
  ownerUserId: undefined as number | undefined,
  departmentId: undefined as number | undefined,
  signedDate: '',
  alibabaTradeAssuranceNo: '',
  useTradeAssurance: false,
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
const customerEditorOpen = ref(false);
const newCustomerName = ref('');
const childOpen = computed(() => pickerOpen.value || customerEditorOpen.value);
const replacementId = ref<string>();
const key = ref('');
const expectedVersion = ref(0);
const batchDate = ref('');
const attachments = ref<ContractAttachment[]>([]);
const draftFiles = ref<File[]>([]);
const lineFiles = ref<Record<string, File[]>>({});
const filePurposes = ref(new Map<File, string>());
const charges = ref<SalesCharge[]>([]);
const historicalCharges = computed(() =>
  historicalAdditionalAmount(props.contract),
);
const chargeTotal = computed(() =>
  salesChargesTotal(charges.value).plus(historicalCharges.value),
);
const attachmentsError = ref('');
const quantityInputs = new Map<string, { focus: () => void }>();
const priceInputs = new Map<string, { focus: () => void }>();
const customerChoices = ref<MasterRecord[]>([]);
const customerLoading = ref(false);
const customerError = ref('');
const customerKeyword = ref('');
const customerPage = ref(1);
const customerTotal = ref(0);
const customerOptions = computed(() =>
  customerChoices.value.map((customer) => ({
    value: customer.id,
    label: `${customer.name}${customer.active ? '' : '（已停用）'}`,
    description: customer.code,
    disabled: !customer.active,
  })),
);
let customerSequence = 0;
let editorSequence = 0;
let productSequence = 0;
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
function createCustomer() {
  if (saving.value || resolving.value || childOpen.value) return;
  newCustomerName.value = customerKeyword.value.trim();
  customerEditorOpen.value = true;
}
function selectCreatedCustomer(customer: Customer) {
  if (!props.open || !customerEditorOpen.value) return;
  clearTimeout(customerTimer);
  ++customerSequence;
  customerLoading.value = false;
  customerError.value = '';
  customerChoices.value = [
    customer,
    ...customerChoices.value.filter((entry) => entry.id !== customer.id),
  ];
  form.customerId = customer.id;
  customerKeyword.value = '';
  customerEditorOpen.value = false;
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
  ++editorSequence;
  ++productSequence;
  clearTimeout(customerTimer);
});
function bindQuantityInput(id: string, input: unknown) {
  if (input && typeof (input as { focus?: unknown }).focus === 'function')
    quantityInputs.set(id, input as { focus: () => void });
  else quantityInputs.delete(id);
}
function bindPriceInput(id: string, input: unknown) {
  if (input && typeof (input as { focus?: unknown }).focus === 'function')
    priceInputs.set(id, input as { focus: () => void });
  else priceInputs.delete(id);
}
async function focusQuantity(id?: string) {
  await nextTick();
  if (props.open && id) quantityInputs.get(id)?.focus();
}
function focusNextLine(id: string) {
  const index = lines.value.findIndex((line) => line.id === id);
  if (index !== -1) void focusQuantity(lines.value[index + 1]?.id);
}
const total = computed(() => contractItemsTotal(lines.value));
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
    const run = ++editorSequence;
    ++productSequence;
    ++customerSequence;
    clearTimeout(customerTimer);
    pickerOpen.value = false;
    customerEditorOpen.value = false;
    resolving.value = false;
    if (!open) return;
    const contract = props.contract;
    panelError.value = '';
    priceNotice.value = '';
    attachmentsError.value = '';
    attachments.value = [];
    draftFiles.value = [];
    lineFiles.value = {};
    filePurposes.value = new Map();
    charges.value = (contract?.salesCharges ?? []).map((charge) => ({
      ...charge,
    }));
    expanded.value = [];
    batchDate.value = '';
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
      useTradeAssurance:
        contract?.useTradeAssurance ??
        Boolean(
          contract?.alibabaTradeAssuranceNo &&
          contract.alibabaTradeAssuranceNo !== '不报关',
        ),
      paymentTerms: contract?.paymentTerms ?? '',
      deliveryRequirement: contract?.deliveryRequirement ?? '',
      attachmentIds: Array.isArray(contract?.attachmentIds)
        ? [...contract.attachmentIds]
        : [],
    });
    lines.value = (contract?.items ?? []).map((line) => ({
      ...line,
      attachmentIds: [...(line.attachmentIds ?? [])],
      attachmentPurposes: { ...line.attachmentPurposes },
    }));
    customerChoices.value = props.master.filter(
      (row) => row.type === 'CUSTOMER' && row.id === form.customerId,
    );
    customerKeyword.value = '';
    void loadCustomers(true);
    try {
      const currentAccess = await getAccess();
      if (run !== editorSequence || !props.open) return;
      access.value = currentAccess;
      if (!contract) {
        form.ownerUserId = access.value.userId;
        form.departmentId = access.value.departmentId;
      }
    } catch (error) {
      if (run !== editorSequence || !props.open) return;
      panelError.value = errorText(error);
    }
    if (contract) {
      try {
        const result = await getAttachments(contract.id);
        if (run !== editorSequence || !props.open) return;
        attachments.value = result.items;
      } catch (error) {
        if (run !== editorSequence || !props.open) return;
        attachmentsError.value = errorText(error);
      }
    }
  },
);
function showPicker(lineId?: string) {
  if (saving.value || resolving.value || childOpen.value) return;
  panelError.value = '';
  replacementId.value = lineId;
  pickerOpen.value = true;
}
function closePicker() {
  if (resolving.value) return;
  ++productSequence;
  pickerOpen.value = false;
}
function changePricing() {
  if (lines.value.length === 0) return;
  lines.value = invalidateLinePrices(lines.value, form.taxBasis);
  priceNotice.value =
    '币种或税费口径已变化，原单价已清空。请重新匹配参考价或填写本次成交价；数量和定制要求已保留。';
}
async function chooseProducts(products: Product[]) {
  if (
    !props.open ||
    !pickerOpen.value ||
    resolving.value ||
    products.length === 0
  )
    return;
  const run = ++productSequence;
  const session = editorSequence;
  const replacement = replacementId.value;
  resolving.value = true;
  panelError.value = '';
  try {
    const selected = replacement ? products.slice(0, 1) : products;
    const resolved = await resolveProducts({
      companyId: 0,
      currency: form.currency,
      taxBasis: form.taxBasis,
      items: selected.map((product) => ({
        productId: product.id,
        productVersion: product.version,
      })),
    });
    if (
      run !== productSequence ||
      session !== editorSequence ||
      !props.open ||
      !pickerOpen.value
    )
      return;
    let focusId: string | undefined;
    const duplicate = resolved.some((line) =>
      lines.value.some((existing) => existing.skuId === line.skuId),
    );
    if (replacement) {
      const id = replacement;
      const original = lines.value.find((line) => line.id === id);
      const first = resolved[0];
      if (original && first) {
        focusId = hasProductVersion(original) ? id : newIdempotencyKey();
        lines.value = lines.value.map((line) =>
          line.id === id
            ? {
                ...first,
                id: focusId!,
                quantity: original.quantity,
                requiredDate: original.requiredDate,
              }
            : line,
        );
      }
    } else {
      const added = resolved.map((line) => ({
        ...line,
        id: newIdempotencyKey(),
        requiredDate: batchDate.value || undefined,
      }));
      lines.value.push(...added);
      focusId = added[0]?.id;
    }
    pickerOpen.value = false;
    if (duplicate)
      message.info('重复 SKU 已保留独立明细，方便分别填写包装、图稿或交期');
    void focusQuantity(focusId);
  } catch (error) {
    if (
      run !== productSequence ||
      session !== editorSequence ||
      !props.open ||
      !pickerOpen.value
    )
      return;
    panelError.value = `${errorText(error)}。请刷新选品列表，核对最新资料后重新选择；当前合同输入已保留。`;
  } finally {
    if (run === productSequence && session === editorSequence)
      resolving.value = false;
  }
}
async function reprice() {
  if (saving.value || resolving.value || childOpen.value || !props.open) return;
  const run = ++productSequence;
  const session = editorSequence;
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
    if (run !== productSequence || session !== editorSequence || !props.open)
      return;
    lines.value = applyReferencePrices(lines.value, resolved);
    priceNotice.value =
      '已按当前币种、税费口径匹配参考价；未匹配的产品仍需定价。';
  } catch (error) {
    if (run !== productSequence || session !== editorSequence || !props.open)
      return;
    panelError.value = errorText(error);
  } finally {
    if (run === productSequence && session === editorSequence)
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
  const copied = copyContractLine(line, newIdempotencyKey());
  lineFiles.value[copied.id] = (lineFiles.value[line.id] ?? []).map((file) => {
    const copy = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    filePurposes.value.set(copy, filePurposes.value.get(file) ?? 'ARTWORK');
    return copy;
  });
  lines.value.push(copied);
  void focusQuantity(copied.id);
}
function toggleCustom(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((value) => value !== id)
    : [...expanded.value, id];
}
function close() {
  if (saving.value || resolving.value || childOpen.value) return;
  const pendingFiles =
    draftFiles.value.length +
    Object.values(lineFiles.value).reduce(
      (sum, files) => sum + files.length,
      0,
    );
  Modal.confirm({
    title: '关闭合同编辑？',
    content:
      pendingFiles > 0
        ? `尚未保存的修改和 ${pendingFiles} 个待上传附件将丢失。`
        : '尚未保存的本次修改将丢失。',
    okText: '关闭',
    onOk: () => emit('close'),
  });
}
async function save(activate = false) {
  if (saving.value || resolving.value || childOpen.value) return;
  if (!validProductCategory(form.productCategory)) {
    panelError.value = '请选择合同产品分类';
    return;
  }
  if (
    form.companyId === undefined ||
    form.companyId <= 0 ||
    !form.customerId ||
    !form.ownerUserId ||
    !form.signedDate
  ) {
    panelError.value = '请补齐订单所属公司、客户、负责人和签订日期';
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
  if (
    charges.value.some(
      (charge) =>
        !charge.name.trim() ||
        !Number.isFinite(Number(charge.amount)) ||
        Number(charge.amount) < 0,
    )
  ) {
    panelError.value = '请填写收费名称及非负金额';
    return;
  }
  if (activate && missingPrices.value) {
    panelError.value = '请先补齐成交单价再生效，或保存草稿';
    return;
  }
  if (
    activate &&
    form.useTradeAssurance &&
    !form.alibabaTradeAssuranceNo.trim()
  ) {
    panelError.value = '阿里信保订单请填写实际信保单号后生效';
    return;
  }
  const files = [...draftFiles.value];
  const itemFileBindings: {
    fileIndex: number;
    itemId: string;
    purpose: string;
  }[] = [];
  for (const line of lines.value)
    for (const file of lineFiles.value[line.id] ?? []) {
      itemFileBindings.push({
        itemId: line.id,
        fileIndex: files.length,
        purpose: filePurposes.value.get(file) ?? 'ARTWORK',
      });
      files.push(file);
    }
  const fileError = submissionFilesError(files);
  if (fileError) {
    panelError.value = fileError;
    return;
  }
  saving.value = true;
  panelError.value = '';
  try {
    const header = contractHeaderPayload(form, props.contract);
    const payload = {
      ...header,
      salesCharges: charges.value,
      ...(itemFileBindings.length > 0 ? { itemFileBindings } : {}),
      companyId: form.companyId,
      customerName:
        customerChoices.value.find((record) => record.id === form.customerId)
          ?.name ??
        props.master.find((record) => record.id === form.customerId)?.name ??
        props.contract?.customerName,
      items: lines.value.map((line) => ({
        ...line,
        attachmentPurposes: Object.fromEntries(
          Object.entries(line.attachmentPurposes ?? {}).filter(([id]) =>
            line.attachmentIds?.includes(id),
          ),
        ),
        taxBasis: line.taxBasis || form.taxBasis,
        unitPrice: line.unitPrice === '' ? null : line.unitPrice,
        requiredDate: line.requiredDate || null,
      })),
    };
    let result = props.contract
      ? await contractActionWithAttachments(
          props.contract.id,
          'UPDATE_CONTRACT',
          expectedVersion.value,
          key.value,
          payload,
          files,
        )
      : await createContractWithAttachments(
          { ...payload, idempotencyKey: key.value },
          files,
        );
    draftFiles.value = [];
    lineFiles.value = {};
    if (activate && (!props.contract || props.contract.status === 'DRAFT')) {
      try {
        result = await contractAction(
          result.id,
          'CONFIRM_CONTRACT',
          result.version,
          newIdempotencyKey(),
          {},
        );
        message.success('合同已保存并生效，可以继续办理后续业务');
      } catch (error) {
        message.warning(
          `合同草稿已保存，尚未生效：${errorText(error)}。请从详情继续办理合同生效。`,
        );
      }
    }
    if (!activate)
      message.success(
        missingPrices.value
          ? '合同草稿已保存，生效前请补齐成交价'
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
    :closable="!saving && !resolving && !childOpen"
    @close="close"
  >
    <div class="editor-stack" :inert="saving || resolving || childOpen">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="contract && contract.status !== 'DRAFT'"
        type="warning"
        show-icon
        message="正在修订已确认合同；已有采购申请的明细规格受保护，关键条件变化会按业务规则重新校验生效和执行范围。"
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
            label="订单号"
            extra="首次保存时由系统自动生成，保存后保持不变。"
          >
            <Input
              :value="form.code"
              readonly
              placeholder="首次保存后自动生成"
            />
</Form.Item><Form.Item label="内部名称（可选）">
            <Input
              v-model:value="form.name"
              placeholder="便于识别的补充说明，订单号由系统生成"
            />
          </Form.Item>
          <Form.Item label="阿里信保订单">
            <Switch v-model:checked="form.useTradeAssurance" />
          </Form.Item>
          <Form.Item
            v-if="form.useTradeAssurance || form.alibabaTradeAssuranceNo"
            label="阿里信保单号"
            :required="form.useTradeAssurance"
            extra="信保订单生效前填写实际单号。报关安排在报关业务中登记。"
          >
            <Input
              v-model:value="form.alibabaTradeAssuranceNo"
              :maxlength="100"
              allow-clear
              placeholder="请输入实际阿里信保单号"
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
            >
              <template #option="option">
                <span>{{ option.label }}</span><small class="muted"> {{ option.description }}</small>
              </template>
            </Select>
            <Button type="link" size="small" @click="createCustomer">
              新增客户并选用
            </Button>
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
          <Form.Item v-if="contract" label="默认税费口径" required>
            <Select
              v-model:value="form.taxBasis"
              :options="taxOptions"
              @change="changePricing"
            />
          </Form.Item>
          <Form.Item label="签订日期" required>
            <Input v-model:value="form.signedDate" type="date" />
</Form.Item><Form.Item v-if="contract" label="付款条件">
            <Input.TextArea
              v-model:value="form.paymentTerms"
              :rows="2"
            />
</Form.Item><Form.Item v-if="contract" label="交付要求">
            <Input.TextArea
              v-model:value="form.deliveryRequirement"
              :rows="2"
            />
          </Form.Item>
        </Form>
      </Card>
      <Card title="产品明细" size="small">
        <div class="editor-stack">
          <span class="muted">可一次选入多个规格；填写数量后按 Enter 填单价，再按 Enter
            进入下一行。</span>
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
                @press-enter="priceInputs.get(record.id)?.focus()"
              />
              <template v-else-if="column.key === 'unitPrice'">
                <InputNumber
                  :ref="(input) => bindPriceInput(record.id, input)"
                  v-model:value="record.unitPrice"
                  :min="0"
                  string-mode
                  placeholder="待定价"
                  style="width: 125px"
                  @press-enter="focusNextLine(record.id)"
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
</Form.Item><Form.Item label="本合同包装 / 唛头 / 箱唛要求">
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
                    />
                    <Space
                      v-for="fileId in record.attachmentIds ?? []"
                      :key="fileId"
                      style="margin-top: 8px"
                    >
                      <span>{{
                        attachments.find((file) => file.id === fileId)?.name ??
                        '已关联历史图稿'
                      }}</span>
                      <Select
                        :value="record.attachmentPurposes?.[fileId]"
                        :options="attachmentPurposeOptions"
                        :disabled="lockedIds.has(record.id)"
                        placeholder="附件用途"
                        style="width: 160px"
                        @change="
                          (purpose) =>
                            (record.attachmentPurposes = {
                              ...record.attachmentPurposes,
                              [fileId]: String(purpose),
                            })
                        "
                      />
                    </Space>
                    <CreationAttachments
                      :files="lineFiles[record.id] ?? []"
                      :disabled="saving || lockedIds.has(record.id)"
                      title="上传本产品定制资料"
                      @update:files="(files) => (lineFiles[record.id] = files)"
                    />
                    <Space
                      v-for="(file, index) in lineFiles[record.id] ?? []"
                      :key="index"
                      style="margin-top: 8px"
                    >
                      <span>{{ file.name }}</span><Select
                        :value="filePurposes.get(file) ?? 'ARTWORK'"
                        :options="attachmentPurposeOptions"
                        style="width: 160px"
                        @change="
                          (purpose) => filePurposes.set(file, String(purpose))
                        "
                      />
                    </Space>
                  </Form.Item>
                  <template v-if="form.businessType === 'SAMPLE'">
                    <Form.Item label="建议采购工厂（可选）">
                      <RemoteMasterSelect
                        v-model:value="record.suggestedSupplierId"
                        type="SUPPLIER"
                        :disabled="lockedIds.has(record.id)"
                        placeholder="选择建议供应商，最终由采购确定"
                      />
                    </Form.Item>
                    <Form.Item label="建议说明">
                      <Input.TextArea
                        v-model:value="record.suggestedSupplierRemark"
                        :disabled="lockedIds.has(record.id)"
                        :rows="2"
                        :maxlength="2000"
                      />
                    </Form.Item>
                  </template>
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
      <Card title="附加收费" size="small">
        <p class="muted">
          向客户收取的运费、模具费等计入合同应收。公司承担的成本在成本业务中登记。
        </p>
        <Space
          v-for="(charge, index) in charges"
          :key="index"
          style="display: flex; margin-bottom: 8px"
        >
          <Input
            v-model:value="charge.name"
            placeholder="费用名称，例如运费、模具费"
            :maxlength="100"
          />
          <InputNumber
            v-model:value="charge.amount"
            string-mode
            :min="0"
            :precision="2"
            placeholder="金额"
          />
          <Button danger @click="charges.splice(index, 1)">移除</Button>
        </Space>
        <Button
          :disabled="charges.length >= 50"
          @click="charges.push({ name: '', amount: '0' })"
        >
          增加收费
        </Button>
        <p v-if="Number(historicalCharges) !== 0">
          保留的历史附加金额：{{ money(historicalCharges, form.currency) }}
        </p>
        <p>
          附加收费 {{ money(chargeTotal.toFixed(2), form.currency) }}，合同合计
          {{ money(chargeTotal.plus(total).toFixed(2), form.currency) }}
        </p>
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
        <Button :disabled="saving || resolving || childOpen" @click="close">
          取消
</Button><Button
          :loading="saving"
          :disabled="resolving || childOpen"
          @click="save(false)"
        >
          {{
            contract && contract.status !== 'DRAFT'
              ? '保存合同修订'
              : '保存草稿'
          }}
</Button><Button
          v-if="!contract || contract.status === 'DRAFT'"
          type="primary"
          :loading="saving"
          :disabled="resolving || childOpen"
          @click="save(true)"
        >
          保存并生效
        </Button>
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
    @close="closePicker"
    @selected="chooseProducts"
  />
  <CustomerEditor
    :open="open && customerEditorOpen"
    :initial-name="newCustomerName"
    select-after-save
    @close="customerEditorOpen = false"
    @saved="selectCreatedCustomer"
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
