<script setup lang="ts">
import type { BusinessRecord, DocumentRow } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type {
  ProcurementFinanceFile,
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Textarea,
} from 'ant-design-vue';

import {
  getProcurementOrder,
  getProcurementSettings,
} from '#/api/fdmplatform/procurement';
import { getProcurementFinance } from '#/api/fdmplatform/procurement-finance';

import { costCategories, errorText, rows } from '../../../data';
import OrderPicker from '../../../purchase/manage/components/OrderPicker.vue';
import {
  allocationDifference,
  allocationGroupsAfterSourceChange,
  allocationPreview,
  financeDraft,
  financePayload,
  newExpense,
  newGroup,
  procurementLineAmount,
  procurementOrderAmount,
} from '../model';
import SourcePicker from './SourcePicker.vue';
const props = defineProps<{
  context?: Record<string, unknown>;
  files: ProcurementFinanceFile[];
  pendingFilesCount?: number;
  record?: ProcurementFinanceRecord;
  saving: boolean;
  type: ProcurementFinanceType;
}>();
const emit = defineEmits<{ save: [payload: Record<string, unknown>] }>();
const form = reactive(financeDraft());
const entities = ref<ProcurementSetting[]>([]);
const orderPickerOpen = ref(false);
const sourcePickerOpen = ref(false);
const expenseIndex = ref<number>();
const orderLabel = ref('');
const sourceLabel = ref('');
const sourceLines = ref<BusinessRecord[]>([]);
const orderAmount = ref('');
const expenseChoices = ref<Record<string, { label: string; value: string }[]>>(
  {},
);
const expenseLabels = ref<Record<string, string>>({});
const pageError = ref('');
const payerOptions = computed(() =>
  entities.value
    .filter((entry) => entry.active && entry.usages?.includes('PAY'))
    .map((entry) => ({ value: entry.id, label: entry.name })),
);
const costOptions = computed(() =>
  entities.value
    .filter((entry) => entry.active && entry.usages?.includes('COST'))
    .map((entry) => ({ value: entry.id, label: entry.name })),
);
const linkedOrderNeeded = computed(
  () =>
    props.type !== 'REIMBURSEMENT' &&
    props.type !== 'PAYMENT' &&
    !(props.type === 'COST_ALLOCATION' && form.sourceType === 'REIMBURSEMENT'),
);
async function loadSource() {
  if (!form.sourceDocumentId) return;
  const id = form.sourceDocumentId;
  try {
    const value = await getProcurementFinance(id);
    if (form.sourceDocumentId !== id) return;
    sourceLabel.value = `${value.code} · ${value.name}`;
    if (
      props.type === 'COST_ALLOCATION' &&
      form.sourceType === 'REIMBURSEMENT'
    ) {
      sourceLines.value = rows(value.expenses);
      orderAmount.value = String(value.amount);
    }
  } catch (error) {
    pageError.value = errorText(error);
  }
}
async function loadExpenseOrder(contractId: string, orderId: string) {
  if (!contractId || !orderId) return;
  const value = await getProcurementOrder(contractId, orderId);
  expenseLabels.value[orderId] =
    `${value.contractCode} · ${value.order.supplierName}`;
  expenseChoices.value[orderId] = rows(value.order.lines).map((line) => ({
    value: String(line.contractItemId),
    label: String(
      line.skuName ??
        (line.specificationSnapshot as Record<string, unknown>)?.skuName ??
        '采购产品',
    ),
  }));
}
async function loadExpenseOrders() {
  try {
    for (const line of form.expenses)
      if (line.orderId) await loadExpenseOrder(line.contractId, line.orderId);
  } catch (error) {
    pageError.value = errorText(error);
  }
}
async function loadOrder() {
  if (!form.contractId || !form.orderId) return;
  try {
    const selectedContract = form.contractId;
    const selectedOrder = form.orderId;
    const value = await getProcurementOrder(selectedContract, selectedOrder);
    if (selectedContract !== form.contractId || selectedOrder !== form.orderId)
      return;
    orderLabel.value = `${value.contractCode} · ${value.order.supplierName}`;
    if (!props.record && props.type === 'REQUEST' && !form.payeeName)
      form.payeeName = String(value.order.supplierName ?? '');
    sourceLines.value = rows(value.order.lines).map((line) => ({
      ...line,
      name: String(
        line.skuName ??
          (line.specificationSnapshot as Record<string, unknown>)?.skuName ??
          '采购产品',
      ),
      amount: procurementLineAmount(line, String(value.order.currency)),
    }));
    orderAmount.value = procurementOrderAmount(
      rows(value.order.lines),
      String(value.order.currency),
    );
  } catch (error) {
    pageError.value = errorText(error);
  }
}
watch(
  () => [props.record?.id, props.record?.version, props.type, props.context],
  () => {
    orderLabel.value = '';
    sourceLabel.value = '';
    sourceLines.value = [];
    orderAmount.value = '';
    Object.assign(form, financeDraft(props.record ?? props.context));
    if (props.type === 'PAYMENT_PLAN' && form.periods.length === 0)
      form.periods.push({
        name: '首期',
        payerEntityId: '',
        amount: '',
        dueDate: '',
        condition: '',
      });
    if (props.type === 'REIMBURSEMENT' && form.expenses.length === 0)
      form.expenses.push({
        ...newExpense(),
        contractId: form.contractId,
        orderId: form.orderId,
      });
    if (props.type === 'COST_ALLOCATION' && form.groups.length === 0)
      form.groups.push(newGroup());
    if (form.sourceType !== 'REIMBURSEMENT') void loadOrder();
    void loadSource();
    void loadExpenseOrders();
  },
  { immediate: true },
);
onMounted(async () => {
  try {
    entities.value = await getProcurementSettings('entities');
  } catch (error) {
    pageError.value = errorText(error);
  }
});
async function chooseOrder(row: DocumentRow) {
  orderPickerOpen.value = false;
  if (expenseIndex.value !== undefined) {
    const line = form.expenses[expenseIndex.value];
    if (line) {
      line.contractId = row.contractId;
      line.orderId = row.id;
      line.contractItemId = '';
      await loadExpenseOrder(row.contractId, row.id);
      const available = expenseChoices.value[row.id] ?? [];
      if (available.length === 1) line.contractItemId = available[0]!.value;
    }
    expenseIndex.value = undefined;
    return;
  }
  if (props.type === 'COST_ALLOCATION')
    form.groups = allocationGroupsAfterSourceChange(
      form.groups,
      form.orderId,
      row.id,
    );
  form.contractId = row.contractId;
  form.orderId = row.id;
  form.currency = String(row.record.currency ?? form.currency);
  form.payeeName = String(row.record.supplierName ?? '');
  form.planId = '';
  form.periodId = '';
  await loadOrder();
}
function chooseSource(record: ProcurementFinanceRecord) {
  sourcePickerOpen.value = false;
  sourceLabel.value = `${record.code} · ${record.name}`;
  if (props.type === 'COST_ALLOCATION')
    form.groups = allocationGroupsAfterSourceChange(
      form.groups,
      form.sourceDocumentId,
      record.id,
    );
  form.sourceDocumentId = record.id;
  form.contractId = record.contractId ?? '';
  form.orderId = record.orderId ?? '';
  form.currency = record.currency;
  form.payerEntityId = record.payerEntityId ?? '';
  form.payeeName = String(record.payeeName ?? '');
  form.payeeAccount = String(record.payeeAccount ?? '');
  if (props.type === 'PAYMENT')
    form.amount = String(record.summary?.availablePaymentAmount ?? '');
  else {
    sourceLines.value = rows(record.expenses);
    orderAmount.value = String(record.amount);
  }
}
function selectSourceType() {
  form.sourceDocumentId = '';
  sourceLabel.value = '';
  sourceLines.value = [];
  form.groups = [newGroup()];
  if (form.sourceType === 'PURCHASE_ORDER') void loadOrder();
}
function costScopeChanged() {
  form.groups = [newGroup()];
}
function validate() {
  if (linkedOrderNeeded.value && (!form.contractId || !form.orderId))
    return '请选择关联采购单';
  if (props.type === 'PAYMENT' && !form.sourceDocumentId)
    return '请选择付款来源请款或报销单';
  if (
    props.type === 'COST_ALLOCATION' &&
    form.sourceType === 'REIMBURSEMENT' &&
    !form.sourceDocumentId
  )
    return '请选择报销成本来源';
  return '';
}
function payload() {
  return financePayload(props.type, form);
}
function save() {
  if (props.saving) return;
  pageError.value = validate();
  if (!pageError.value) emit('save', payload());
}
defineExpose({ payload });
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="pageError" type="error" :message="pageError" /><Alert
      type="info"
      message="可在本页添加附件并随草稿一起保存。提交或确认时系统会核验余额、版本和必要资料。"
    /><Form layout="vertical" class="finance-grid">
      <Form.Item label="单据名称">
        <Input :disabled="saving" v-model:value="form.name" />
</Form.Item><Form.Item v-if="linkedOrderNeeded" label="关联采购单" required>
        <Space>
          <span>{{ orderLabel || '尚未选择' }}</span><Button
            :disabled="saving || !!record"
            @click="
              expenseIndex = undefined;
              orderPickerOpen = true;
            "
          >
            选择采购单
          </Button>
        </Space>
</Form.Item><Form.Item
        v-if="
          type === 'PAYMENT' ||
          (type === 'COST_ALLOCATION' && form.sourceType === 'REIMBURSEMENT')
        "
        label="来源单据"
        required
      >
        <Space>
          <span>{{ sourceLabel || '尚未选择' }}</span><Button
            :disabled="saving || !!record"
            @click="sourcePickerOpen = true"
          >
            选择已批准来源
          </Button>
        </Space>
</Form.Item><Form.Item v-if="type === 'COST_ALLOCATION'" label="成本来源">
        <Select
          v-model:value="form.sourceType"
          :disabled="saving || !!record"
          :options="[
            { value: 'PURCHASE_ORDER', label: '采购货款' },
            { value: 'REIMBURSEMENT', label: '报销费用' },
          ]"
          @change="selectSourceType"
        />
</Form.Item><Form.Item
        v-if="!['PAYMENT_PLAN', 'COST_ALLOCATION'].includes(type)"
        label="付款主体"
      >
        <Select
          v-model:value="form.payerEntityId"
          :disabled="saving || type === 'PAYMENT' || !!form.periodId"
          :options="payerOptions"
          show-search
          option-filter-prop="label"
          placeholder="选择实际付款主体"
        />
</Form.Item><Form.Item
        v-if="
          !['PAYMENT_PLAN', 'COST_ALLOCATION', 'REIMBURSEMENT'].includes(type)
        "
        label="金额"
      >
        <InputNumber
          :disabled="saving"
          v-model:value="form.amount"
          string-mode
          :min="0"
          style="width: 100%"
        />
</Form.Item><Form.Item label="币种">
        <Input
          v-model:value="form.currency"
          :disabled="saving || type === 'PAYMENT' || !!form.orderId"
        />
</Form.Item><template v-if="type === 'REQUEST'">
        <Form.Item label="要求付款日期">
          <Input
            :disabled="saving"
            v-model:value="form.dueDate"
            type="date"
          />
</Form.Item><Form.Item label="代付说明（付款主体与签约公司不一致时必填）">
          <Input
            :disabled="saving"
            v-model:value="form.agencyReason"
            placeholder="付款主体与签约主体不同时说明"
          />
        </Form.Item>
</template><template v-if="['REQUEST', 'PAYMENT', 'REIMBURSEMENT'].includes(type)">
        <Form.Item label="收款人 / 收款单位">
          <Input
            :disabled="saving"
            v-model:value="form.payeeName"
          />
</Form.Item><Form.Item label="收款账户">
          <Input :disabled="saving" v-model:value="form.payeeAccount" />
        </Form.Item>
</template><template v-if="type === 'PAYMENT'">
        <Form.Item label="实际付款日期">
          <Input
            :disabled="saving"
            v-model:value="form.paidAt"
            type="date"
          />
</Form.Item><Form.Item label="付款账户">
          <Input :disabled="saving" v-model:value="form.payerAccount" />
        </Form.Item>
</template><Form.Item v-if="type === 'REIMBURSEMENT'" label="垫付人">
        <Input
          :disabled="saving"
          v-model:value="form.advanceUserName"
        />
</Form.Item><template v-if="type === 'COST_ALLOCATION'">
        <Form.Item label="归集范围">
          <Select
            :disabled="saving"
            v-model:value="form.costScope"
            :options="[
              { value: 'ORDER', label: '按整单分配' },
              { value: 'PRODUCT', label: '按产品 / 费用明细分配' },
            ]"
            @change="costScopeChanged"
          />
</Form.Item><Form.Item label="成本归集日期">
          <Input
            :disabled="saving"
            v-model:value="form.costDate"
            type="date"
          />
</Form.Item><Form.Item label="税费口径">
          <Input
            :disabled="saving"
            v-model:value="form.taxTreatment"
            placeholder="例如按有效含税凭据归集"
          />
</Form.Item><Form.Item label="管理口径版本">
          <Input
            :disabled="saving"
            v-model:value="form.policyVersion"
            placeholder="填写已确认的成本口径"
          />
        </Form.Item>
</template><Form.Item
        v-if="type !== 'COST_ALLOCATION'"
        label="已有凭证附件"
        :extra="
          pendingFilesCount
            ? '新选附件将随草稿保存，可继续保留已有凭据选择。'
            : undefined
        "
        class="wide"
      >
        <Select
          :disabled="saving"
          v-model:value="form.evidenceRefs"
          mode="multiple"
          :options="files.map((file) => ({ value: file.id, label: file.name }))"
          placeholder="选择已有凭据，或在下方添加本次附件"
        />
</Form.Item><Form.Item label="说明" class="wide">
        <Textarea :disabled="saving" v-model:value="form.remark" />
      </Form.Item>
    </Form>
    <Card v-if="type === 'PAYMENT_PLAN'" title="分期付款安排" size="small">
      <Space direction="vertical" style="width: 100%">
        <div
          v-for="(period, index) in form.periods"
          :key="period.id ?? index"
          class="line-grid"
        >
          <Input
            :disabled="saving"
            v-model:value="period.name"
            placeholder="期次 / 用途"
          /><Select
            :disabled="saving"
            v-model:value="period.payerEntityId"
            :options="payerOptions"
            placeholder="付款主体"
          /><InputNumber
            :disabled="saving"
            v-model:value="period.amount"
            string-mode
            :min="0"
            placeholder="金额"
          /><Input
            :disabled="saving"
            v-model:value="period.dueDate"
            type="date"
          /><Input
            :disabled="saving"
            v-model:value="period.condition"
            placeholder="付款条件"
          /><Button
            :disabled="saving"
            danger
            @click="form.periods.splice(index, 1)"
          >
            移除
          </Button>
        </div>
        <Button
          :disabled="saving"
          @click="
            form.periods.push({
              name: `第${form.periods.length + 1}期`,
              payerEntityId: '',
              amount: '',
              dueDate: '',
              condition: '',
            })
          "
        >
          添加一期
</Button><span>采购货款基数：{{ form.currency }}
          {{
            orderAmount || '待来源计算'
          }}；确认时分期总额必须与应付金额一致。</span>
      </Space>
    </Card>
    <Card v-if="type === 'REIMBURSEMENT'" title="实际费用明细" size="small">
      <Alert
        type="info"
        message="可先添加附件并保存草稿，再为每条费用选择对应票据；多条费用不会自动套用同一个附件。"
      />
      <Space direction="vertical" style="width: 100%">
        <Card
          v-for="(expense, index) in form.expenses"
          :key="expense.id ?? index"
          size="small"
          :title="`费用 ${index + 1}`"
        >
          <div class="finance-grid">
            <Select
              :disabled="saving"
              v-model:value="expense.category"
              :options="
                costCategories.filter((option) => option.value !== 'PURCHASE')
              "
              placeholder="费用类型"
            /><InputNumber
              :disabled="saving"
              v-model:value="expense.amount"
              string-mode
              :min="0"
              placeholder="费用金额"
            /><Input
              :disabled="saving"
              v-model:value="expense.expenseDate"
              type="date"
            /><Select
              :disabled="saving"
              v-model:value="expense.evidenceRef"
              :options="
                files.map((file) => ({ value: file.id, label: file.name }))
              "
              placeholder="选择本笔票据"
            /><Space>
              <span>{{
                expense.orderId
                  ? (expenseLabels[expense.orderId] ?? '已关联采购单')
                  : '独立费用'
              }}</span><Button
                :disabled="saving"
                @click="
                  expenseIndex = index;
                  orderPickerOpen = true;
                "
              >
                关联采购单
</Button><Button
                :disabled="saving"
                v-if="expense.orderId"
                @click="
                  expense.contractId = '';
                  expense.orderId = '';
                  expense.contractItemId = '';
                "
              >
                清除
              </Button>
</Space><Select
              :disabled="saving"
              v-if="expense.orderId"
              v-model:value="expense.contractItemId"
              :options="expenseChoices[expense.orderId] ?? []"
              placeholder="选择归属合同产品（必填）"
            /><Input
              :disabled="saving"
              v-model:value="expense.remark"
              placeholder="费用说明"
            />
          </div>
          <Button
            :disabled="saving"
            danger
            @click="form.expenses.splice(index, 1)"
          >
            移除此费用
          </Button>
</Card><Button :disabled="saving" @click="form.expenses.push(newExpense())">
          添加费用明细
        </Button>
      </Space>
    </Card>
    <Card
      v-if="type === 'COST_ALLOCATION'"
      title="独立成本归属分配"
      size="small"
    >
      <Alert
        type="info"
        message="付款主体不会随成本归属变化。每组只输入金额或比例；精确金额及分币尾差由服务端计算，确认前必须分配平衡。"
      /><Card
        v-for="(group, index) in form.groups"
        :key="index"
        size="small"
        class="group-card"
      >
        <Space wrap>
          <Select
            :disabled="saving"
            v-if="form.costScope === 'PRODUCT'"
            v-model:value="group.sourceLineId"
            @change="
              (value) => {
                group.baseAmount = String(
                  sourceLines.find((line) => line.id === value)?.amount ?? '0',
                );
              }
            "
            :options="
              sourceLines.map((line) => ({
                value: line.id,
                label: String(
                  line.name ?? line.skuName ?? line.category ?? '来源明细',
                ),
              }))
            "
            placeholder="选择采购产品 / 费用来源"
            style="width: 260px"
          /><Select
            :disabled="saving"
            v-model:value="group.mode"
            :options="[
              { value: 'AMOUNT', label: '按金额' },
              { value: 'PERCENT', label: '按比例' },
            ]"
            style="width: 140px"
          /><span>尚差：{{
              allocationDifference(
                group,
                form.costScope === 'ORDER' ? orderAmount : group.baseAmount,
              )
            }}
            {{ group.mode === 'PERCENT' ? '%' : form.currency }}</span><Button
            :disabled="saving"
            v-if="form.groups.length > 1"
            danger
            @click="form.groups.splice(index, 1)"
          >
            删除分配组
          </Button>
        </Space>
        <div
          v-for="(allocation, rowIndex) in group.allocations"
          :key="rowIndex"
          class="allocation-row"
        >
          <Select
            :disabled="saving"
            v-model:value="allocation.entityId"
            :options="costOptions"
            placeholder="成本归属主体"
            style="min-width: 200px"
          /><InputNumber
            :disabled="saving"
            v-if="group.mode === 'AMOUNT'"
            v-model:value="allocation.amount"
            string-mode
            placeholder="分配金额"
          /><InputNumber
            :disabled="saving"
            v-else
            v-model:value="allocation.percentage"
            string-mode
            placeholder="比例 %"
          /><span>{{ group.mode === 'AMOUNT' ? '比例' : '折算金额' }}：{{
              group.mode === 'AMOUNT'
                ? allocationPreview(
                    group,
                    form.costScope === 'ORDER' ? orderAmount : group.baseAmount,
                    form.currency,
                  )[rowIndex]?.percentage
                : allocationPreview(
                    group,
                    form.costScope === 'ORDER' ? orderAmount : group.baseAmount,
                    form.currency,
                  )[rowIndex]?.amount
            }}
            {{ group.mode === 'AMOUNT' ? '%' : form.currency }}</span><span
            v-if="
              Number(
                allocationPreview(
                  group,
                  form.costScope === 'ORDER' ? orderAmount : group.baseAmount,
                  form.currency,
                )[rowIndex]?.roundingAdjustment,
              )
            "
            >尾差调整：{{
              allocationPreview(
                group,
                form.costScope === 'ORDER' ? orderAmount : group.baseAmount,
                form.currency,
              )[rowIndex]?.roundingAdjustment
            }}</span><Button
            :disabled="saving"
            danger
            @click="group.allocations.splice(rowIndex, 1)"
          >
            移除
          </Button>
        </div>
        <Button
          :disabled="saving"
          @click="
            group.allocations.push({ entityId: '', amount: '', percentage: '' })
          "
        >
          添加成本主体
        </Button>
</Card><Button
        :disabled="saving"
        v-if="form.costScope === 'PRODUCT'"
        @click="form.groups.push(newGroup())"
      >
        添加产品分配组
      </Button>
</Card><slot name="attachments"></slot><Button :disabled="saving" type="primary" :loading="saving" @click="save">
      保存草稿
</Button><OrderPicker
      :open="orderPickerOpen"
      @close="orderPickerOpen = false"
      @selected="chooseOrder"
    /><SourcePicker
      :open="sourcePickerOpen"
      :reimbursement-only="type === 'COST_ALLOCATION'"
      @close="sourcePickerOpen = false"
      @selected="chooseSource"
    />
  </Space>
</template>
<style scoped>
.finance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}

.wide {
  grid-column: 1/-1;
}

.line-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr 1fr 1.5fr auto;
  gap: 8px;
}

.allocation-row {
  display: flex;
  gap: 10px;
  margin: 12px 0;
}

.group-card {
  margin: 12px 0;
}

@media (max-width: 800px) {
  .finance-grid,
  .line-grid {
    grid-template-columns: 1fr;
  }

  .allocation-row {
    flex-wrap: wrap;
  }
}
</style>
