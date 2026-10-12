<script setup lang="ts">
import type { ExchangeRateBundle } from '#/api/fdmplatform/exchange-rates';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  fetchExchangeRates,
  getExchangeRates,
} from '#/api/fdmplatform/exchange-rates';

import { errorText } from '../../data';
import {
  conversionDateNote,
  rateText,
  referenceConvert,
  splitCommonRates,
} from './model';
import RateTrend from './RateTrend.vue';

defineOptions({ name: 'FdmPlatformExchangeRates' });
const date = ref(new Date().toLocaleDateString('sv-SE'));
const keyword = ref('');
const bundle = ref<ExchangeRateBundle>();
const loading = ref(false);
const fetching = ref(false);
const panelError = ref('');
let sequence = 0;
let fetchKey = { date: '', key: '' };
const showOthers = ref(false);
/** 走势与换算共用的币种，点常用币种卡片切换 */
const selected = ref('USD');
const amount = ref<number>(10_000);
const toCny = ref(true);
const currencyOptions = computed(() =>
  [...split.value.common, ...split.value.others].map((row) => ({
    label: row.currency,
    value: row.currency,
  })),
);
const selectedRate = computed(() =>
  bundle.value?.rows.find((row) => row.currency === selected.value),
);
const converted = computed(() =>
  referenceConvert(amount.value, selectedRate.value?.rateToCny, toCny.value),
);
function money(value?: number) {
  return value === undefined
    ? '—'
    : value.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
const split = computed(() => splitCommonRates(bundle.value?.rows ?? []));
/** 输入筛选时在全部币种里找；不筛选时表格只列常用之外的币种 */
const rows = computed(() => {
  const term = keyword.value.trim().toUpperCase();
  if (term)
    return (bundle.value?.rows ?? []).filter((row) =>
      row.currency.includes(term),
    );
  return split.value.others;
});
const fetchedText = computed(() =>
  bundle.value?.fetchedAt
    ? dayjs(bundle.value.fetchedAt).format('YYYY-MM-DD HH:mm')
    : '—',
);
const sourceUrl = computed(() =>
  bundle.value?.sourceUrl.startsWith('https://')
    ? bundle.value.sourceUrl
    : undefined,
);
const columns = [
  { title: '原币种', dataIndex: 'currency', key: 'currency', width: 120 },
  { title: '人民币参考汇率', key: 'rate', width: 260 },
  { title: '查询日期', dataIndex: 'requestedDate', key: 'requestedDate' },
  { title: '实际汇率日期', dataIndex: 'rateDate', key: 'rateDate' },
  { title: '日期匹配', key: 'fallback' },
  { title: '来源', dataIndex: 'source', key: 'source' },
];
async function load(refresh = false) {
  if (!date.value) {
    panelError.value = '请选择查询日期';
    return;
  }
  const run = ++sequence;
  const requested = date.value;
  loading.value = true;
  fetching.value = refresh;
  panelError.value = '';
  bundle.value = undefined;
  try {
    if (refresh && fetchKey.date !== requested)
      fetchKey = { date: requested, key: newIdempotencyKey() };
    const result = refresh
      ? await fetchExchangeRates(requested, fetchKey.key)
      : await getExchangeRates(requested);
    if (run !== sequence) return;
    bundle.value = result;
    if (refresh) {
      fetchKey = { date: '', key: '' };
      message.success('指定日期的参考汇率已抓取并更新');
    }
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) {
      loading.value = false;
      fetching.value = false;
    }
  }
}
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence++;
});
</script>

<template>
  <Page
    title="财务汇率中心"
    description="按日期查询公开参考汇率，用于回款人民币折算，并保留实际采用日期。"
  >
    <div class="fx-stack">
      <Card>
        <Space wrap>
          <span>查询日期</span><Input
            v-model:value="date"
            type="date"
            :disabled="loading"
            style="width: 190px"
            @change="load()"
          />
          <Button
            type="primary"
            :loading="loading && !fetching"
            :disabled="fetching"
            @click="load()"
          >
            查询汇率
          </Button>
          <Button
            :loading="fetching"
            :disabled="loading && !fetching"
            @click="load(true)"
          >
            抓取并更新此日期
          </Button>
        </Space>
      </Card>
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        type="info"
        show-icon
        message="使用欧洲央行公开参考值，每小时自动查询更新。当日尚未公布或休市时采用此前已公布日期；汇率用于业务折算，不代表银行实际结汇价。已确认回款保留原采用快照。"
      />
      <Card :loading="loading">
        <div v-if="bundle" class="fx-stack">
          <Descriptions :column="3" size="small" bordered>
            <Descriptions.Item label="查询日期">
              {{ bundle.requestedDate }}
</Descriptions.Item><Descriptions.Item label="实际来源日期">
              {{ bundle.rateDate }}
</Descriptions.Item><Descriptions.Item label="获取时间">
              {{ fetchedText }}
            </Descriptions.Item>
            <Descriptions.Item label="来源">
              <a
                v-if="sourceUrl"
                :href="sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
                >{{ bundle.source }} 公开参考汇率</a><span v-else>{{ bundle.source }}</span>
            </Descriptions.Item>
          </Descriptions>
          <Alert
            :type="bundle.fallback ? 'warning' : 'success'"
            :message="conversionDateNote(bundle)"
            show-icon
          />
          <div v-if="split.common.length" class="pinned" aria-label="常用币种">
            <button
              v-for="rate in split.common"
              :key="rate.currency"
              type="button"
              class="pin"
              :class="{ on: selected === rate.currency }"
              :aria-pressed="selected === rate.currency"
              @click="selected = rate.currency"
            >
              <span>{{ rate.currency }}</span>
              <b :title="`1 ${rate.currency} = ${rate.rateToCny} CNY`">{{
                rateText(rate.rateToCny)
              }}</b>
              <small>1 {{ rate.currency }} 折人民币</small>
            </button>
          </div>
          <div class="tools">
            <section class="tool">
              <RateTrend :currency="selected" />
            </section>
            <section class="tool converter" aria-label="参考换算">
              <b>参考换算</b>
              <Space wrap>
                <InputNumber
                  v-model:value="amount"
                  :min="0"
                  :precision="2"
                  style="width: 160px"
                />
                <Select
                  v-if="toCny"
                  v-model:value="selected"
                  :options="currencyOptions"
                  show-search
                  style="width: 100px"
                />
                <span v-else>CNY</span>
                <Button
                  size="small"
                  aria-label="交换换算方向"
                  @click="toCny = !toCny"
                >
                  ⇄
                </Button>
                <span v-if="toCny">CNY</span>
                <Select
                  v-else
                  v-model:value="selected"
                  :options="currencyOptions"
                  show-search
                  style="width: 100px"
                />
              </Space>
              <div class="result">
                <span>{{ money(amount) }} {{ toCny ? selected : 'CNY' }} ≈</span>
                <strong>{{ money(converted) }} {{ toCny ? 'CNY' : selected }}</strong>
              </div>
              <small>
                按 {{ bundle.rateDate }} 参考汇率 1 {{ selected }} =
                {{ rateText(selectedRate?.rateToCny) }} CNY
                估算；回款折算以登记时冻结的汇率为准，不代表银行结汇价。
              </small>
            </section>
          </div>
          <Space wrap>
            <Input
              v-model:value="keyword"
              placeholder="筛选币种，例如 THB、SGD"
              allow-clear
              style="width: 240px"
            />
            <Button
              v-if="!keyword"
              type="link"
              @click="showOthers = !showOthers"
            >
              {{
                showOthers
                  ? '收起其他币种'
                  : `其他 ${split.others.length} 种币种`
              }}
            </Button>
          </Space>
          <Table
            v-if="showOthers || keyword"
            :columns="columns"
            :data-source="rows"
            row-key="currency"
            :pagination="{ pageSize: 20, showSizeChanger: true }"
            :scroll="{ x: 920 }"
          >
            <template #bodyCell="{ column, record }">
              <strong
                v-if="column.key === 'rate'"
                :title="`1 ${record.currency} = ${record.rateToCny} CNY`"
                >1 {{ record.currency }} =
                {{ rateText(record.rateToCny) }} CNY</strong><Tag
                v-else-if="column.key === 'fallback'"
                :color="record.fallback ? 'orange' : 'green'"
              >
                {{ record.fallback ? '此前公布日' : '所选日期' }}
              </Tag>
            </template>
          </Table>
        </div>
        <Empty v-else description="尚未读取参考汇率" />
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.fx-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pinned {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.pin {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  padding: 10px 14px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.pin:hover,
.pin:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.pin.on {
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary));
}

.tools {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
}

.tool {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.converter {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.converter small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.result {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.result strong {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1100px) {
  .tools {
    grid-template-columns: minmax(0, 1fr);
  }
}

.pin span,
.pin small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.pin span {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.pin b {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
