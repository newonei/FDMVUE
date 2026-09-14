<script setup lang="ts">
import type { ReceiptConversion } from '#/api/fdmplatform/exchange-rates';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Descriptions, Spin } from 'ant-design-vue';

import { convertReceiptToRmb } from '#/api/fdmplatform/exchange-rates';

import { errorText, money } from '../../data';
import { conversionDateNote, conversionInput } from './model';

const props = defineProps<{
  amount?: number | string;
  currency?: string;
  date?: string;
  open: boolean;
}>();
const emit = defineEmits<{ ready: [value: boolean] }>();
const conversion = ref<ReceiptConversion>();
const loading = ref(false);
const panelError = ref('');
const input = computed(() =>
  conversionInput(props.date, props.currency, props.amount),
);
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [props.open, props.date, props.currency, props.amount],
  () => {
    clearTimeout(timer);
    sequence++;
    emit('ready', false);
    conversion.value = undefined;
    panelError.value = '';
    loading.value = false;
    if (props.open && input.value) {
      loading.value = true;
      timer = setTimeout(() => {
        void load();
      }, 300);
    }
  },
  { immediate: true, flush: 'sync' },
);
async function load() {
  if (!props.open || !input.value) return;
  const request = ++sequence;
  const params = { ...input.value };
  loading.value = true;
  panelError.value = '';
  emit('ready', false);
  try {
    const result = await convertReceiptToRmb(params);
    if (request !== sequence || !props.open) return;
    conversion.value = result;
    emit('ready', true);
  } catch (error) {
    if (request === sequence) panelError.value = errorText(error);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
onBeforeUnmount(() => {
  sequence++;
  clearTimeout(timer);
});
</script>

<template>
  <div class="receipt-fx">
    <strong>按到账日期折算人民币</strong>
    <Alert
      v-if="!input"
      type="info"
      message="填写到账日期、币种和回款金额后，自动查询对应参考汇率。"
    />
    <Spin v-if="loading" tip="正在查询对应日期的参考汇率…" />
    <Alert v-if="panelError" type="error" show-icon :message="panelError">
      <template #description>
        <span>汇率未取得，不能用默认值代替。请核对币种和日期后重试。</span><Button type="link" @click="load">重新查询</Button>
      </template>
    </Alert>
    <template v-if="conversion && !loading">
      <Descriptions :column="2" size="small" bordered>
        <Descriptions.Item label="回款日期">
          {{ conversion.requestedDate }}
        </Descriptions.Item>
        <Descriptions.Item label="实际汇率日期">
          {{ conversion.rateDate }}
        </Descriptions.Item>
        <Descriptions.Item label="人民币参考汇率">
          1 {{ conversion.currency }} = {{ conversion.rateToCny }} CNY
        </Descriptions.Item>
        <Descriptions.Item label="折算人民币">
          {{ money(conversion.rmbAmount, 'CNY') }}
        </Descriptions.Item>
        <Descriptions.Item label="来源">
          {{ conversion.source }}
        </Descriptions.Item>
        <Descriptions.Item label="获取时间">
          {{ conversion.fetchedAt }}
        </Descriptions.Item>
      </Descriptions>
      <Alert
        :type="conversion.fallback ? 'warning' : 'info'"
        :message="conversionDateNote(conversion)"
        show-icon
      />
    </template>
    <p class="muted">
      使用公开参考汇率进行业务折算，不代表银行实际结汇价格。保存时由服务端计算并冻结采用的汇率，确认到账后不随汇率更新改写。
    </p>
  </div>
</template>

<style scoped>
.receipt-fx {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--ant-color-border);
  border-radius: 8px;
}

.muted {
  margin: 0;
  color: var(--ant-color-text-secondary);
}
</style>
