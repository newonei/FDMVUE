<script setup lang="ts">
import type { OrderLine } from './quick-order';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  message,
  Modal,
  Spin,
  Textarea,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  contractAction,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';

import { errorText } from '../../data';
import { localDate } from './comparison';
import {
  cheaperQuote,
  createdOrders,
  daysBetween,
  formatAmount,
  lineAmount,
  orderLines,
} from './quick-order';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  quoteId?: string;
}>();
const emit = defineEmits<{
  close: [];
  ordered: [contract: Contract, orders: BusinessRecord[]];
}>();

const contract = ref<Contract>();
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const quantity = ref<string>();
const picked = ref<string[]>([]);
const rationale = ref('');
const idempotencyKey = ref('');
let sequence = 0;

const plan = computed(() =>
  contract.value && props.quoteId
    ? orderLines(contract.value, props.quoteId)
    : { companions: [] as OrderLine[] },
);
const primary = computed(() => plan.value.primary);
const selectedLines = computed<OrderLine[]>(() => {
  if (!primary.value) return [];
  return [
    { ...primary.value, quantity: quantity.value ?? primary.value.quantity },
    ...plan.value.companions.filter((line) =>
      picked.value.includes(String(line.quote.id)),
    ),
  ];
});
const total = computed(() => {
  let sum = new BigNumber(0);
  for (const line of selectedLines.value) {
    const amount = lineAmount(line);
    if (!amount) return undefined;
    sum = sum.plus(amount);
  }
  return sum;
});
const currency = computed(() => String(primary.value?.quote.currency ?? ''));
/** Lower comparable prices make the reason compulsory, exactly as the server checks. */
const cheaper = computed(() =>
  contract.value
    ? selectedLines.value
        .map((line) => ({
          line,
          better: cheaperQuote(contract.value!, line.quote, line.quantity),
        }))
        .filter((entry) => entry.better)
    : [],
);
const quantityError = computed(() => {
  if (!primary.value) return '';
  const value = new BigNumber(quantity.value ?? Number.NaN);
  if (!value.isFinite() || !value.isGreaterThan(0)) return '请填写下单数量';
  if (value.isGreaterThan(primary.value.context.plannable))
    return `最多 ${primary.value.context.plannable} ${primary.value.context.unit}`;
  return '';
});
const late = computed(() => {
  const line = primary.value;
  if (
    !line?.context.requiredDate ||
    typeof line.quote.promisedDate !== 'string'
  )
    return undefined;
  const days = daysBetween(line.context.requiredDate, line.quote.promisedDate);
  return days !== undefined && days > 0 ? days : undefined;
});
const canSubmit = computed(
  () =>
    !!primary.value &&
    !quantityError.value &&
    !saving.value &&
    (cheaper.value.length === 0 || rationale.value.trim().length > 0) &&
    !!contract.value?.allowedActions?.includes('ORDER_FROM_QUOTE'),
);
const terms = (quote: BusinessRecord) =>
  [
    quote.taxIncluded ? '含税' : '不含税',
    quote.packagingIncluded ? '含包装' : '不含包装',
    quote.freightIncluded ? '含运费' : '不含运费',
  ].join(' · ');

async function load() {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    if (!props.contractId || !props.quoteId)
      throw new Error('报价来源不完整，请重新打开');
    const loaded = await getContract(props.contractId);
    if (run !== sequence || !props.open) return;
    contract.value = loaded;
    const result = orderLines(loaded, props.quoteId, localDate());
    quantity.value = result.primary?.quantity;
    picked.value = [];
    if (result.reason) pageError.value = result.reason;
    else if (!loaded.allowedActions?.includes('ORDER_FROM_QUOTE'))
      pageError.value = '当前合同状态不能下单，请核对合同是否已生效';
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function submit() {
  const current = contract.value;
  if (!current || !canSubmit.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    const payload = {
      lines: selectedLines.value.map((line, index) =>
        index === 0
          ? { quoteId: line.quote.id, quantity: line.quantity }
          : { quoteId: line.quote.id },
      ),
      rationale: rationale.value.trim() || undefined,
    };
    const updated = await contractAction(
      current.id,
      'ORDER_FROM_QUOTE',
      current.version,
      idempotencyKey.value,
      payload,
    );
    const orders = createdOrders(current, updated);
    message.success(
      orders.length > 0
        ? `已生成采购单 ${orders.map((order) => order.code || order.id).join('、')}`
        : '已生成采购单',
    );
    emit('ordered', updated, orders);
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function close() {
  if (!saving.value) emit('close');
}
watch(
  () => [props.open, props.contractId, props.quoteId],
  () => {
    ++sequence;
    contract.value = undefined;
    rationale.value = '';
    pageError.value = '';
    if (!props.open) return;
    idempotencyKey.value = newIdempotencyKey();
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    title="确认下单"
    width="min(620px, 96vw)"
    :mask-closable="!saving"
    :closable="!saving"
    :destroy-on-close="true"
    @cancel="close"
  >
    <Spin :spinning="loading">
      <div class="order-confirm">
        <Alert v-if="pageError" type="error" show-icon :message="pageError" />
        <template v-if="primary">
          <dl class="order-facts">
            <dt>供应商</dt>
            <dd>
              <b>{{ primary.quote.supplierName || '供应商待补齐' }}</b>
            </dd>
            <dt>产品</dt>
            <dd>
              {{ primary.context.title
              }}<span v-if="primary.context.specification" class="muted">
                · {{ primary.context.specification }}</span>
            </dd>
            <dt>单价</dt>
            <dd class="num">
              {{ primary.quote.currency }} {{ primary.quote.unitPrice }} /
              {{ primary.quote.unit }}
              <span class="muted">（{{ terms(primary.quote) }}）</span>
            </dd>
            <dt>数量</dt>
            <dd>
              <InputNumber
                v-model:value="quantity"
                string-mode
                :min="0.0001"
                :controls="false"
                :disabled="saving"
                aria-label="下单数量"
                style="width: 140px"
              />
              <span class="muted">
                {{ primary.context.unit }} · 任务还可下单
                {{ primary.context.plannable }}</span>
              <p v-if="quantityError" class="field-error">
                {{ quantityError }}
              </p>
            </dd>
            <dt>交期</dt>
            <dd>
              <span class="num">{{
                primary.quote.promisedDate || '未注明'
              }}</span>
              <span v-if="late" class="pill bad">晚于需求交期 {{ late }} 天</span>
              <span v-else-if="primary.context.requiredDate" class="muted">
                需求交期 {{ primary.context.requiredDate }}</span>
            </dd>
          </dl>

          <section v-if="plan.companions.length" class="companions">
            <h4>同一申请里这家供应商还报了价，可以一起下单</h4>
            <label
              v-for="line in plan.companions"
              :key="String(line.quote.id)"
              class="companion"
            >
              <Checkbox
                :checked="picked.includes(String(line.quote.id))"
                :disabled="saving"
                @change="
                  (event: { target: { checked: boolean } }) =>
                    (picked = event.target.checked
                      ? [...picked, String(line.quote.id)]
                      : picked.filter((id) => id !== String(line.quote.id)))
                "
              />
              <span class="companion-main">
                <b>{{ line.context.title }}</b>
                <span class="muted">{{ line.quantity }} {{ line.context.unit }} ×
                  {{ line.quote.currency }} {{ line.quote.unitPrice }}</span>
              </span>
              <span class="num">{{ formatAmount(lineAmount(line)) }}</span>
            </label>
          </section>

          <div class="order-total">
            <span>合计</span>
            <b class="num">{{ currency }} {{ formatAmount(total) }}</b>
          </div>

          <div v-if="cheaper.length" class="reason">
            <Alert
              type="warning"
              show-icon
              :message="`选的不是最低价：${cheaper
                .map(
                  (entry) =>
                    `${entry.better?.supplierName ?? '其他供应商'} ${entry.better?.currency} ${entry.better?.unitPrice} 更低`,
                )
                .join('；')}。请写明选择理由。`"
            />
            <Textarea
              v-model:value="rationale"
              :rows="2"
              :maxlength="500"
              :disabled="saving"
              placeholder="例如：交期更早、质量更稳定、长期合作"
              aria-label="选择理由"
            />
          </div>
          <p class="note">
            系统会自动生成并确认采购方案，然后生成采购单；同供应商、同条件的产品合并成一张。任何一步失败都不会留下半成品。
          </p>
        </template>
      </div>
    </Spin>
    <template #footer>
      <Button :disabled="saving" @click="close">取消</Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="!canSubmit"
        @click="submit"
      >
        生成采购单
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.order-confirm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.order-facts {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px 12px;
  margin: 0;
}

.order-facts dt {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.order-facts dd {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
  margin: 0;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.num {
  font-variant-numeric: tabular-nums;
}

.field-error {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--destructive));
}

.pill {
  padding: 1px 8px;
  font-size: 12px;
  border-radius: 999px;
}

.pill.bad {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 12%);
}

.companions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.companions h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.companion {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  cursor: pointer;
}

.companion-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.order-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px dashed hsl(var(--border));
}

.order-total b {
  font-size: 20px;
}

.reason {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
