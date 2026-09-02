<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoExchangeRateApi } from '#/api/fdmwaimao/exchange-rate';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  DatePicker,
  Input,
  message,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getExchangeRateList,
  refreshExchangeRates,
} from '#/api/fdmwaimao/exchange-rate';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import TradeListShell from '#/views/fdm-trade-shared/components/TradeListShell.vue';
import { formatAmount } from '#/views/fdmwaimao/receipt-record/calculation';
import { normalizeRecordDate } from '#/views/fdmwaimao/receipt-record/form-model';

defineOptions({ name: 'FdmWaimaoExchangeRate' });

const { hasAccessByCodes } = useAccess();

const columns: ColumnsType<FdmWaimaoExchangeRateApi.RateItem> = [
  {
    dataIndex: 'currencyCode',
    fixed: 'left',
    key: 'currencyCode',
    title: '币种',
    width: 100,
  },
  {
    dataIndex: 'currencyName',
    key: 'currencyName',
    title: '币种名称',
    width: 170,
  },
  { key: 'rate', title: '兑人民币汇率', width: 220 },
  { key: 'requestedDate', title: '请求日期', width: 120 },
  { key: 'rateDate', title: '实际汇率日期', width: 135 },
  { key: 'fallback', title: '日期口径', width: 145 },
  { dataIndex: 'provider', key: 'provider', title: '来源', width: 150 },
  { key: 'retrievedAt', title: '获取时间', width: 170 },
];

const selectedDate = ref(dayjs());
const keyword = ref('');
const rows = ref<FdmWaimaoExchangeRateApi.RateItem[]>([]);
const loading = ref(false);
const syncing = ref(false);
let requestId = 0;

useFdmWaimaoAiContext(() => ({
  context: {
    keyword: keyword.value,
    rates: rows.value,
    selectedDate: selectedDate.value.format('YYYY-MM-DD'),
  },
  contextMode: 'list',
  entityLabel: selectedDate.value.format('YYYY-MM-DD'),
  surfaceKey: 'exchange-rate',
}));

const canSync = computed(() =>
  hasAccessByCodes(['fdmwaimao:exchange-rate:sync']),
);

function localDate(value: FdmWaimaoExchangeRateApi.LocalDateValue) {
  return normalizeRecordDate(value) ?? String(value);
}

function formatDateTime(value: null | number | string | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm:ss')
    : String(value);
}

async function load() {
  const current = ++requestId;
  loading.value = true;
  try {
    const result = await getExchangeRateList({
      date: selectedDate.value.format('YYYY-MM-DD'),
      keyword: keyword.value.trim() || undefined,
    });
    if (current === requestId) rows.value = result ?? [];
  } finally {
    if (current === requestId) loading.value = false;
  }
}

function changeDate(value: Dayjs | null | string) {
  const normalized = normalizeRecordDate(value);
  selectedDate.value = normalized ? dayjs(normalized) : dayjs();
  void load();
}

function disableFutureDate(value: Dayjs) {
  return value.isAfter(dayjs(), 'day');
}

async function refresh() {
  syncing.value = true;
  try {
    const result = await refreshExchangeRates(
      selectedDate.value.format('YYYY-MM-DD'),
    );
    message.success(
      `已更新 ${result.currencyCount} 个币种；汇率日 ${localDate(result.rateDate)}${result.fetchedFromRemote ? '，本次从远端获取' : '，使用已有快照'}`,
    );
    await load();
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <TradeListShell
    description="按日期查询所有可用币种的兑人民币统计汇率，为回款与消费记录提供不可变快照。"
    :loading="loading"
    title="汇率中心"
  >
    <template #actions>
      <Button v-if="canSync" :loading="syncing" type="primary" @click="refresh">
        <template #icon>
          <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
        </template>
        同步该日期汇率
      </Button>
    </template>

    <template #filters>
      <DatePicker
        :disabled-date="disableFutureDate"
        :value="selectedDate"
        @change="changeDate"
      />
      <Input
        v-model:value="keyword"
        allow-clear
        placeholder="币种代码或名称"
        @press-enter="load"
      />
    </template>
    <template #filter-actions>
      <Button type="primary" @click="load">查询</Button>
      <Button
        @click="
          keyword = '';
          selectedDate = dayjs();
          load();
        "
      >
        重置
      </Button>
    </template>

    <Alert
      class="exchange-rate-page__notice"
      description="ECB 不直接发布人民币交叉盘时，服务端通过同一基准货币做统计折算。汇率仅用于内部统计，不代表银行实际结售汇价格。"
      message="统一口径：1 单位外币 = X CNY"
      show-icon
      type="info"
    />

    <div class="exchange-rate-page__table">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="currencyCode"
        :scroll="{ x: 1210, y: 'calc(100vh - 390px)' }"
        size="middle"
      >
        <template #emptyText>
          <div class="exchange-rate-page__empty">
            <IconifyIcon icon="lucide:badge-dollar-sign" aria-hidden="true" />
            <strong>该日期暂无汇率</strong>
            <p>请检查日期，或由有权限的用户同步该日期汇率。</p>
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'currencyCode'">
            <strong>{{ record.currencyCode }}</strong>
          </template>
          <template v-else-if="column.key === 'rate'">
            <strong class="exchange-rate-page__rate">
              1 {{ record.currencyCode }} =
              {{ formatAmount(record.currencyToCnyRate, 6) }} CNY
            </strong>
          </template>
          <template v-else-if="column.key === 'requestedDate'">
            {{ localDate(record.requestedDate) }}
          </template>
          <template v-else-if="column.key === 'rateDate'">
            {{ localDate(record.rateDate) }}
          </template>
          <template v-else-if="column.key === 'fallback'">
            <Tag :color="record.fallbackUsed ? 'warning' : 'success'">
              {{ record.fallbackUsed ? '沿用最近交易日' : '当日汇率' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'retrievedAt'">
            {{ formatDateTime(record.retrievedAt) }}
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <span class="exchange-rate-page__summary">
        {{ selectedDate.format('YYYY-MM-DD') }} · 共 {{ rows.length }} 个币种
      </span>
    </template>
  </TradeListShell>
</template>

<style scoped>
.exchange-rate-page__notice {
  margin-bottom: 12px;
}

.exchange-rate-page__table {
  min-height: 260px;
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.exchange-rate-page__rate {
  font-variant-numeric: tabular-nums;
  color: #0f4c81;
  white-space: nowrap;
}

.exchange-rate-page__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #94a3b8;
}

.exchange-rate-page__empty > :first-child {
  font-size: 34px;
}

.exchange-rate-page__empty strong {
  color: #475569;
}

.exchange-rate-page__empty p {
  margin: 0;
}

.exchange-rate-page__summary {
  color: #64748b;
}
</style>
