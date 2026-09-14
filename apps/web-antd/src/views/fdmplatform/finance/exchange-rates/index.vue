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
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  fetchExchangeRates,
  getExchangeRates,
} from '#/api/fdmplatform/exchange-rates';

import { errorText } from '../../data';
import { conversionDateNote } from './model';

defineOptions({ name: 'FdmPlatformExchangeRates' });
const date = ref(new Date().toLocaleDateString('sv-SE'));
const keyword = ref('');
const bundle = ref<ExchangeRateBundle>();
const loading = ref(false);
const fetching = ref(false);
const panelError = ref('');
let sequence = 0;
let fetchKey = { date: '', key: '' };
const rows = computed(() =>
  (bundle.value?.rows ?? []).filter((row) =>
    row.currency.includes(keyword.value.trim().toUpperCase()),
  ),
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
              {{ bundle.fetchedAt }}
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
          <Input
            v-model:value="keyword"
            placeholder="筛选币种，例如 USD、EUR"
            allow-clear
            style="max-width: 280px"
          />
          <Table
            :columns="columns"
            :data-source="rows"
            row-key="currency"
            :pagination="{ pageSize: 20, showSizeChanger: true }"
            :scroll="{ x: 920 }"
          >
            <template #bodyCell="{ column, record }">
              <strong v-if="column.key === 'rate'">1 {{ record.currency }} = {{ record.rateToCny }} CNY</strong><Tag
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
</style>
