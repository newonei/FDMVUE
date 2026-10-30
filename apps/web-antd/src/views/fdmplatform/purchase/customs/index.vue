<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Alert, Button, Card, Space } from 'ant-design-vue';

import { getCustomsPage } from '#/api/fdmplatform/customs';

import CustomsPanel from '../../components/CustomsPanel.vue';
import { queryContractId } from '../../documents/model';

defineOptions({ name: 'FdmPlatformPurchaseCustoms' });
const route = useRoute();
const router = useRouter();
const contractId = computed(() => queryContractId(route.query.contractId));
/** Statuses a buyer still has to act on, in the order the work happens. */
const OPEN_STATUSES = [
  { value: 'DRAFT', label: '待安排' },
  { value: 'PROCESSING', label: '办理中' },
  { value: 'SUBMITTED', label: '已提交' },
  { value: 'SUPPLEMENTING', label: '补料中' },
  { value: 'RELEASED', label: '已放行' },
];
const counts = ref<Record<string, number>>();
const total = ref<number>();

async function loadCounts() {
  try {
    const [all, ...byStatus] = await Promise.all([
      getCustomsPage({ companyId: 0, pageNo: 1, pageSize: 1 }),
      ...OPEN_STATUSES.map((status) =>
        getCustomsPage({
          companyId: 0,
          pageNo: 1,
          pageSize: 1,
          status: status.value,
        }),
      ),
    ]);
    total.value = all.total;
    counts.value = Object.fromEntries(
      OPEN_STATUSES.map((status, index) => [
        status.value,
        byStatus[index]?.total ?? 0,
      ]),
    );
  } catch {
    counts.value = undefined;
  }
}
onMounted(loadCounts);

function clear() {
  const query = { ...route.query };
  delete query.contractId;
  void router.replace({ query });
}
</script>
<template>
  <Page
    title="报关跟进"
    description="按合同分批整理报关资料，跟进办理与补件，协同处理费用和财务资料。"
  >
    <div v-if="counts" class="customs-counts" aria-label="报关批次状态">
      <div
        v-for="status in OPEN_STATUSES"
        :key="status.value"
        class="customs-count"
        :class="{
          warn: status.value === 'SUPPLEMENTING' && counts[status.value],
        }"
      >
        <span>{{ status.label }}</span>
        <b>{{ counts[status.value] ?? 0 }}</b>
      </div>
      <p v-if="total === 0" class="customs-hint">
        还没有报关批次：打开合同订单，在「报关」里发起第一批，或点下方「新建报关批次」选择合同。
      </p>
    </div>
    <Card>
      <Space direction="vertical" style="width: 100%">
        <Alert
          v-if="contractId"
          type="info"
          message="正在查看关联合同的报关批次"
        >
          <template #action>
            <Button size="small" @click="clear">清除合同筛选</Button>
          </template>
        </Alert>
        <CustomsPanel :company-id="0" :contract-id="contractId" />
      </Space>
    </Card>
  </Page>
</template>

<style scoped>
.customs-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: stretch;
  margin-bottom: 12px;
}

.customs-count {
  display: flex;
  flex-direction: column;
  min-width: 96px;
  padding: 8px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.customs-count span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.customs-count b {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.customs-count.warn b {
  color: hsl(var(--warning));
}

.customs-hint {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
