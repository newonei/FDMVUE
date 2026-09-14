<script setup lang="ts">
import type { Contract } from '#/api/fdmplatform';
import type {
  CustomsBatch,
  CustomsDetails,
  CustomsLine,
  CustomsShipment,
  CustomsSource,
} from '#/api/fdmplatform/customs';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import { getBusinessPage } from '#/api/fdmplatform';
import { getCustomsSource } from '#/api/fdmplatform/customs';

import { errorText } from '../data';
import CreationAttachments from './CreationAttachments.vue';
import {
  canSelectCustomsShipment,
  customsSourceSelection,
  validateCustomsMeasurements,
  validateCustomsSelection,
} from './customsEditorModel';

const props = defineProps<{
  batch?: CustomsBatch;
  companyId: number;
  contractId?: string;
  error?: string;
  lockContract?: boolean;
  open: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  save: [
    value: {
      contractId: string;
      contractVersion: number;
      details: CustomsDetails;
      files: File[];
    },
  ];
  'update:open': [value: boolean];
}>();
const selectedContractId = ref<string>();
const contracts = ref<Contract[]>([]);
const source = ref<CustomsSource>();
const loading = ref(false);
const sourceError = ref('');
const draftFiles = ref<File[]>([]);
const name = ref('');
const required = ref(true);
const notRequiredReason = ref('');
const plannedDate = ref('');
const actualDate = ref('');
const destination = ref('');
const transportMode = ref('');
const agentName = ref('');
const externalReference = ref('');
const remark = ref('');
const packageCount = ref('');
const grossWeight = ref('');
const netWeight = ref('');
const volume = ref('');
const purchaseOrderIds = ref<string[]>([]);
const lines = ref<(CustomsLine & { selected: boolean })[]>([]);
const shipments = ref<(CustomsShipment & { selected: boolean })[]>([]);
let sequence = 0;
let searchSequence = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const options = computed(() => {
  const result = contracts.value.map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.name}`,
  }));
  if (
    selectedContractId.value &&
    !result.some((item) => item.value === selectedContractId.value)
  )
    result.unshift({
      value: selectedContractId.value,
      label:
        props.batch?.contractCode ?? source.value?.contractCode ?? '当前合同',
    });
  return result;
});
const lineColumns = [
  { key: 'selected', title: '选择', width: 65 },
  { key: 'product', title: '合同产品与规格', width: 300 },
  { key: 'quantity', title: '本批数量', width: 130 },
  { key: 'unit', title: '单位', dataIndex: 'unit', width: 65 },
];
const shipmentColumns = [
  { key: 'selected', title: '选择', width: 65 },
  { key: 'shipment', title: '发货记录', width: 280 },
  {
    key: 'availableQuantity',
    title: '可关联数量',
    dataIndex: 'availableQuantity',
    width: 120,
  },
  { key: 'quantity', title: '分配数量', width: 130 },
];
async function searchContracts(keyword = '', request = ++searchSequence) {
  try {
    const response = await getBusinessPage<Contract>('contracts', {
      companyId: 0,
      keyword,
      pageNo: 1,
      pageSize: 30,
    });
    if (request !== searchSequence || !props.open) return;
    contracts.value = response.list.filter(
      (contract) => !['CANCELLED', 'CLOSED', 'DRAFT'].includes(contract.status),
    );
  } catch (error) {
    if (request === searchSequence && props.open)
      sourceError.value = errorText(error);
  }
}
function search(keyword: string) {
  clearTimeout(searchTimer);
  const request = ++searchSequence;
  searchTimer = setTimeout(() => {
    void searchContracts(keyword, request);
  }, 250);
}
async function loadSource(value?: string) {
  if (props.lockContract && value !== props.contractId) return;
  const request = ++sequence;
  const previousDefaultName = source.value
    ? `${source.value.contractCode} 报关批次`
    : undefined;
  source.value = undefined;
  purchaseOrderIds.value = [];
  lines.value = [];
  shipments.value = [];
  sourceError.value = '';
  loading.value = false;
  if (!value) return;
  searchSequence++;
  clearTimeout(searchTimer);
  const batch = props.batch?.contractId === value ? props.batch : undefined;
  loading.value = true;
  try {
    const result = await getCustomsSource(value, batch?.id);
    if (
      request !== sequence ||
      !props.open ||
      value !== selectedContractId.value
    )
      return;
    if (result.contractId !== value)
      throw new Error('返回资料不属于当前合同，请重新选择合同。');
    source.value = result;
    const selections = customsSourceSelection(result, batch);
    lines.value = selections.lines;
    shipments.value = selections.shipments;
    purchaseOrderIds.value = selections.purchaseOrderIds;
    if (!name.value || name.value === previousDefaultName)
      name.value = `${result.contractCode} 报关批次`;
  } catch (error) {
    if (request === sequence) sourceError.value = errorText(error);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
function close() {
  if (props.saving) return;
  const finish = () => emit('update:open', false);
  if (draftFiles.value.length > 0)
    Modal.confirm({
      title: '关闭报关编辑？',
      content: `${draftFiles.value.length} 个待上传附件尚未保存。`,
      okText: '关闭',
      onOk: finish,
    });
  else finish();
}
function submit() {
  if (props.saving) return;
  sourceError.value = '';
  if (
    !selectedContractId.value ||
    !source.value ||
    source.value.contractId !== selectedContractId.value ||
    loading.value
  ) {
    sourceError.value = '请先选择合同并等待资料加载完成。';
    return;
  }
  if (!name.value.trim()) {
    sourceError.value = '请填写批次名称。';
    return;
  }
  if (!required.value && !notRequiredReason.value.trim()) {
    sourceError.value = '请说明本次不需报关的原因。';
    return;
  }
  sourceError.value =
    validateCustomsSelection(
      {
        required: required.value,
        purchaseOrderIds: purchaseOrderIds.value,
        lines: lines.value,
        shipments: shipments.value,
      },
      source.value,
    ) ||
    validateCustomsMeasurements({
      packageCount: packageCount.value,
      grossWeight: grossWeight.value,
      netWeight: netWeight.value,
      volume: volume.value,
    });
  if (sourceError.value) return;
  emit('save', {
    files: draftFiles.value,
    contractId: selectedContractId.value,
    contractVersion: source.value.contractVersion,
    details: {
      name: name.value.trim(),
      required: required.value,
      notRequiredReason: notRequiredReason.value,
      plannedDate: plannedDate.value || undefined,
      actualDate: actualDate.value || undefined,
      destination: destination.value,
      transportMode: transportMode.value,
      agentName: agentName.value,
      externalReference: externalReference.value,
      remark: remark.value,
      purchaseOrderIds: purchaseOrderIds.value,
      packageCount: packageCount.value ? Number(packageCount.value) : undefined,
      grossWeight: grossWeight.value || undefined,
      netWeight: netWeight.value || undefined,
      volume: volume.value || undefined,
      lines: lines.value
        .filter((line) => line.selected)
        .map(({ contractItemId, quantity }) => ({ contractItemId, quantity })),
      shipments: shipments.value
        .filter((entry) => entry.selected)
        .map(({ eventId, quantity }) => ({ eventId, quantity })),
    },
  });
}
watch(
  () => [props.open, props.contractId, props.batch?.id],
  () => {
    sequence++;
    searchSequence++;
    clearTimeout(searchTimer);
    if (!props.open) {
      draftFiles.value = [];
      loading.value = false;
      return;
    }
    draftFiles.value = [];
    const data = props.batch?.details ?? props.batch;
    name.value = data?.name ?? '';
    required.value = data?.required ?? true;
    notRequiredReason.value = data?.notRequiredReason ?? '';
    plannedDate.value = data?.plannedDate ?? '';
    actualDate.value = data?.actualDate ?? '';
    destination.value = data?.destination ?? '';
    transportMode.value = data?.transportMode ?? '';
    agentName.value = data?.agentName ?? '';
    externalReference.value = data?.externalReference ?? '';
    remark.value = data?.remark ?? '';
    packageCount.value = String(data?.packageCount ?? '');
    grossWeight.value = String(data?.grossWeight ?? '');
    netWeight.value = String(data?.netWeight ?? '');
    volume.value = String(data?.volume ?? '');
    purchaseOrderIds.value = [...(data?.purchaseOrderIds ?? [])];
    selectedContractId.value = props.batch?.contractId ?? props.contractId;
    contracts.value = [];
    if (!selectedContractId.value) void searchContracts();
    void loadSource(selectedContractId.value);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
  searchSequence++;
  clearTimeout(searchTimer);
});
</script>

<template>
  <Drawer
    :open="open"
    :title="batch ? '编辑报关批次' : '新建报关批次'"
    width="min(1040px, 96vw)"
    :mask-closable="!saving"
    :closable="!saving"
    :keyboard="!saving"
    @close="close"
  >
    <div class="customs-editor">
      <Alert
        v-if="sourceError || error"
        type="error"
        show-icon
        :message="sourceError || error"
      />
      <Form layout="vertical" class="customs-fields">
        <Form.Item label="关联合同" required>
          <Select
            v-model:value="selectedContractId"
            :disabled="!!batch || !!props.contractId || saving"
            show-search
            :filter-option="false"
            :options="options"
            placeholder="搜索合同编号或名称"
            @search="search"
            @change="
              (value) =>
                loadSource(typeof value === 'string' ? value : undefined)
            "
          />
        </Form.Item>
        <Form.Item label="批次名称" required>
          <Input v-model:value="name" :disabled="saving" :maxlength="160" />
        </Form.Item>
        <Form.Item label="本次安排">
          <Checkbox v-model:checked="required" :disabled="saving">
            需要报关
          </Checkbox>
        </Form.Item>
        <Form.Item v-if="!required" label="不需报关原因" required>
          <Input
            v-model:value="notRequiredReason"
            :disabled="saving"
            :maxlength="1000"
          />
        </Form.Item>
        <Form.Item label="计划出运日期">
          <Input v-model:value="plannedDate" type="date" :disabled="saving" />
        </Form.Item>
        <Form.Item label="实际出运日期">
          <Input v-model:value="actualDate" type="date" :disabled="saving" />
        </Form.Item>
        <Form.Item label="目的地">
          <Input v-model:value="destination" :disabled="saving" />
        </Form.Item>
        <Form.Item label="运输方式">
          <Select
            v-model:value="transportMode"
            allow-clear
            :disabled="saving"
            :options="
              ['海运', '空运', '铁路', '公路', '快递', '其他'].map((value) => ({
                value,
                label: value,
              }))
            "
          />
        </Form.Item>
        <Form.Item label="货代 / 报关服务方">
          <Input v-model:value="agentName" :disabled="saving" />
        </Form.Item>
        <Form.Item label="外部参考号 / 报关单号">
          <Input v-model:value="externalReference" :disabled="saving" />
        </Form.Item>
        <Form.Item label="箱数">
          <Input
            v-model:value="packageCount"
            inputmode="numeric"
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="毛重（kg）">
          <Input
            v-model:value="grossWeight"
            inputmode="decimal"
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="净重（kg）">
          <Input
            v-model:value="netWeight"
            inputmode="decimal"
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="体积（m³）">
          <Input
            v-model:value="volume"
            inputmode="decimal"
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="关联采购订单" class="customs-wide">
          <Select
            v-model:value="purchaseOrderIds"
            mode="multiple"
            :disabled="saving"
            :options="
              (source?.purchaseOrders ?? []).map((order) => ({
                value: order.id,
                label: String(
                  order.name ?? order.code ?? order.supplierName ?? order.id,
                ),
              }))
            "
            placeholder="可选择同合同下多张采购订单"
          />
        </Form.Item>
        <Form.Item label="跟进说明" class="customs-wide">
          <Input.TextArea
            v-model:value="remark"
            :disabled="saving"
            :rows="2"
            :maxlength="2000"
          />
        </Form.Item>
      </Form>
      <strong>本批合同产品</strong>
      <Table
        :columns="lineColumns"
        :data-source="lines"
        :loading="loading"
        row-key="contractItemId"
        :pagination="false"
        :scroll="{ x: 560 }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <Checkbox
            v-if="column.key === 'selected'"
            v-model:checked="record.selected"
            :disabled="saving"
          />
          <div v-else-if="column.key === 'product'">
            <div>{{ record.skuName }}</div>
            <span class="customs-muted">{{ record.specification }} · {{ record.specVersion }}</span>
          </div>
          <Input
            v-else-if="column.key === 'quantity'"
            v-model:value="record.quantity"
            inputmode="decimal"
            :disabled="!record.selected || saving"
            aria-label="本批数量"
          />
        </template>
      </Table>
      <strong>关联实际发货</strong>
      <p class="customs-muted">
        资料准备阶段可暂不关联；先选择对应合同产品，再分配有可用余量的发货记录。
      </p>
      <Table
        v-if="shipments.length"
        :columns="shipmentColumns"
        :data-source="shipments"
        row-key="eventId"
        :pagination="false"
        :scroll="{ x: 580 }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <Checkbox
            v-if="column.key === 'selected'"
            v-model:checked="record.selected"
            :disabled="
              saving ||
              (!record.selected &&
                !canSelectCustomsShipment(record as CustomsShipment, lines))
            "
          />
          <div v-else-if="column.key === 'shipment'">
            {{
              source?.items.find(
                (item) => item.contractItemId === record.contractItemId,
              )?.skuName ?? '发货记录'
            }}
            <div class="customs-muted">{{ record.eventId }}</div>
          </div>
          <Input
            v-else-if="column.key === 'quantity'"
            v-model:value="record.quantity"
            inputmode="decimal"
            :disabled="!record.selected || saving"
            aria-label="分配数量"
          />
        </template>
      </Table>
      <Empty
        v-else
        description="当前合同暂无可关联的实际发货记录"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
      />
      <CreationAttachments v-model:files="draftFiles" :disabled="saving" />
      <span class="customs-muted">本次附件随批次保存为补充资料，保存后可在报关资料中管理类别。</span>
    </div>
    <template #footer>
      <Space>
        <Button :disabled="saving" @click="close"> 取消 </Button><Button
          type="primary"
          :loading="saving"
          :disabled="loading || !source"
          @click="submit"
        >
          保存批次
        </Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.customs-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.customs-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.customs-wide {
  grid-column: 1 / -1;
}

.customs-muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .customs-fields {
    grid-template-columns: 1fr;
  }
}
</style>
