<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { Directory } from '#/api/fdmplatform';
import type {
  ContractMargins,
  MarginRow,
} from '#/api/fdmplatform/contract-board';

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  DatePicker,
  Input,
  Table,
  Tooltip,
} from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getContractMargins } from '#/api/fdmplatform/contract-board';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { amountText, plain } from '../../trade/contracts/model';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformContractMargins' });

const router = useRouter();
const data = ref<ContractMargins>();
const directory = ref<Directory>();
const keyword = ref('');
const mine = ref(false);
const signedRange = ref<[Dayjs, Dayjs]>();
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const error = ref('');
let sequence = 0;

const columns = [
  { title: '合同 / 客户', key: 'contract', width: 230 },
  { title: '签订', key: 'signed', width: 100 },
  {
    title: '合同额（原币）',
    key: 'amount',
    width: 150,
    align: 'right' as const,
  },
  {
    title: '收入（折人民币）',
    key: 'revenue',
    width: 140,
    align: 'right' as const,
  },
  { title: '采购成本', key: 'purchase', width: 120, align: 'right' as const },
  { title: '其他费用', key: 'other', width: 110, align: 'right' as const },
  { title: '毛利', key: 'margin', width: 130, align: 'right' as const },
  { title: '毛利率', key: 'rate', width: 80, align: 'right' as const },
  { title: '说明', key: 'notes', width: 200 },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  loading.value = true;
  error.value = '';
  const range = signedRange.value;
  try {
    const result = await getContractMargins({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      mine: mine.value || undefined,
      signedFrom: range?.[0].format('YYYY-MM-DD'),
      signedTo: range?.[1].format('YYYY-MM-DD'),
    });
    if (run === sequence) data.value = result;
  } catch (error_) {
    if (run === sequence) error.value = errorText(error_);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function rmb(value: unknown) {
  return value === null || value === undefined ? '—' : `¥${plain(value)}`;
}
function rateTone(value: unknown) {
  if (value === null || value === undefined) return '';
  const rate = Number(value);
  if (rate < 0) return 'loss';
  return rate < 10 ? 'thin' : '';
}
function openContract(row: MarginRow) {
  void router.push({
    path: '/fdmwaimao/platform-contracts',
    query: { contractId: row.id, tab: 'finance' },
  });
}
onMounted(async () => {
  void load();
  try {
    directory.value = await getDirectory(0);
  } catch {
    // 只影响负责人显示
  }
});
</script>

<template>
  <div class="margins">
    <p class="intro">
      收入 − 采购单金额 − 已归集的其他成本 −
      报销费用。外币合同已收部分按回款时冻结的汇率折人民币，未收部分按今天的汇率估算；自制产品的工厂成本暂未计入。金智迁入还没补齐（没有币种）的合同不算。
    </p>
    <Alert v-if="error" :message="error" type="error" show-icon />
    <section class="cards" aria-label="毛利汇总">
      <div class="card">
        <span>计入合同</span>
        <b>{{ data?.summary.contracts ?? '—' }}<small>份</small></b>
        <small>{{
          data?.summary.incomplete
            ? `另有 ${data.summary.incomplete} 份还没有采购单或缺汇率，未计入`
            : '全部计入'
        }}</small>
      </div>
      <div class="card">
        <span>收入（折人民币）</span>
        <b>{{ rmb(data?.summary.revenueCny) }}</b>
      </div>
      <div class="card">
        <span>采购成本 + 其他费用</span>
        <b>{{
          data
            ? rmb(
                Number(data.summary.purchaseCny) +
                  Number(data.summary.otherCny),
              )
            : '—'
        }}</b>
        <small>采购 {{ rmb(data?.summary.purchaseCny) }} · 其他
          {{ rmb(data?.summary.otherCny) }}</small>
      </div>
      <div class="card">
        <span>毛利 · 毛利率</span>
        <b :class="rateTone(data?.summary.marginRate)">{{
          rmb(data?.summary.marginCny)
        }}</b>
        <small>{{
          data?.summary.marginRate === null ||
          data?.summary.marginRate === undefined
            ? '—'
            : `${data.summary.marginRate}%`
        }}</small>
      </div>
    </section>
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        placeholder="合同号 / 客户 / 产品"
        allow-clear
        style="width: 260px"
        @search="load(true)"
      />
      <DatePicker.RangePicker
        v-model:value="signedRange"
        :placeholder="['签订从', '到']"
        style="width: 230px"
        @change="load(true)"
      />
      <div class="seg" role="group" aria-label="查看范围">
        <button
          type="button"
          :class="{ on: !mine }"
          @click="
            mine = false;
            load(true);
          "
        >
          全部
        </button>
        <button
          type="button"
          :class="{ on: mine }"
          @click="
            mine = true;
            load(true);
          "
        >
          我负责的
        </button>
      </div>
      <span class="grow"></span>
      <Button :loading="loading" @click="load()">刷新</Button>
    </div>
    <Table
      class="fdm-business-table"
      size="small"
      table-layout="fixed"
      row-key="id"
      :columns="columns"
      :data-source="data?.list ?? []"
      :loading="loading"
      :scroll="{ x: 1260 }"
      :pagination="{
        current: pageNo,
        pageSize,
        total: data?.total ?? 0,
        showSizeChanger: true,
        showTotal: (count: number) => `共 ${count} 份合同`,
      }"
      @change="
        (pagination) => {
          pageNo = pagination.current ?? 1;
          pageSize = pagination.pageSize ?? 20;
          load();
        }
      "
    >
      <template #emptyText>
        <span class="muted">{{
          loading ? '正在计算' : '当前条件下没有可计算毛利的合同'
        }}</span>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'contract'" class="cell">
          <button
            type="button"
            class="code"
            @click="openContract(record as MarginRow)"
          >
            {{ record.code }}
          </button>
          <span class="sub" :title="record.customerName">{{ record.customerName }} ·
            {{ personName(directory, record.ownerUserId) }}</span>
        </div>
        <span v-else-if="column.key === 'signed'" class="num">{{
          record.signedDate ?? '—'
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          amountText(record.amount, record.currency)
        }}</span>
        <span v-else-if="column.key === 'revenue'" class="num">{{
          rmb(record.revenueCny)
        }}</span>
        <span v-else-if="column.key === 'purchase'" class="num">{{
          rmb(record.purchaseCny)
        }}</span>
        <span v-else-if="column.key === 'other'" class="num">{{
          rmb(record.otherCny)
        }}</span>
        <b
          v-else-if="column.key === 'margin'"
          class="num"
          :class="rateTone(record.marginRate)"
          >{{ rmb(record.marginCny) }}</b>
        <span
          v-else-if="column.key === 'rate'"
          class="num"
          :class="rateTone(record.marginRate)"
          >{{
            record.marginRate === null || record.marginRate === undefined
              ? '—'
              : `${record.marginRate}%`
          }}</span>
        <Tooltip
          v-else-if="column.key === 'notes' && record.notes.length"
          :title="record.notes.join('；')"
        >
          <span class="sub" tabindex="0">{{ record.notes.join('；') }}</span>
        </Tooltip>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.margins {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.intro {
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.card span,
.card small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.card b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.card b small {
  margin-left: 3px;
  font-size: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.grow {
  flex: 1;
}

.seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.seg button {
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.seg button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.seg button:focus-visible,
.code:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.code {
  padding: 0;
  font: inherit;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.sub {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.num {
  font-variant-numeric: tabular-nums;
}

.loss {
  color: hsl(var(--destructive));
}

.thin {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.muted {
  color: hsl(var(--muted-foreground));
}

@media (max-width: 900px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
