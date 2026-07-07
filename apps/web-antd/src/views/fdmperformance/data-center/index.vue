<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmPerformanceAssessmentApi } from '#/api/fdmperformance/assessment';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Button,
  Card,
  message,
  Progress,
  Space,
  Statistic,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getFdmPerformanceAssessmentBatchPage,
  getFdmPerformanceAssessmentInstancePage,
} from '#/api/fdmperformance/assessment';

import PerformanceShell from '../shared/PerformanceShell.vue';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceDataCenter' });

type PerformanceDataRecord = {
  avgScore: number;
  dept: string;
  gradeA: number;
  gradeAPlus: number;
  gradeB: number;
  gradeC: number;
  gradeCPlus: number;
  headcount: number;
  published: number;
};

const router = useRouter();
const { performancePath } = usePerformancePath();
const loading = ref(false);
const apiInstances = ref<FdmPerformanceAssessmentApi.Instance[]>([]);
const batchTotal = ref(0);
const records = computed(() => buildApiRecords());

const columns: TableColumnsType = [
  { dataIndex: 'dept', title: '部门' },
  { dataIndex: 'headcount', title: '参与人数', width: 120 },
  { dataIndex: 'published', title: '已公示', width: 120 },
  { dataIndex: 'avgScore', title: '平均分', width: 120 },
  { dataIndex: 'gradeAPlus', title: 'A+', width: 80 },
  { dataIndex: 'gradeA', title: 'A', width: 80 },
  { dataIndex: 'gradeB', title: 'B', width: 80 },
  { dataIndex: 'gradeCPlus', title: 'C+', width: 80 },
  { dataIndex: 'gradeC', title: 'C', width: 80 },
  { dataIndex: 'publishedRate', title: '公示进度', width: 240 },
];

const totalHeadcount = computed(() =>
  records.value.reduce((sum, item) => sum + item.headcount, 0),
);
const publishedCount = computed(() =>
  records.value.reduce((sum, item) => sum + item.published, 0),
);
const avgScore = computed(() => {
  const weighted = records.value.reduce(
    (sum, item) => sum + item.avgScore * item.published,
    0,
  );
  return Number((weighted / Math.max(publishedCount.value, 1)).toFixed(1));
});
const publishedRate = computed(() =>
  Math.round((publishedCount.value / Math.max(totalHeadcount.value, 1)) * 100),
);
const gradeDistribution = computed(() => {
  const gradeAPlus = records.value.reduce(
    (sum, item) => sum + item.gradeAPlus,
    0,
  );
  const gradeA = records.value.reduce((sum, item) => sum + item.gradeA, 0);
  const gradeB = records.value.reduce((sum, item) => sum + item.gradeB, 0);
  const gradeCPlus = records.value.reduce(
    (sum, item) => sum + item.gradeCPlus,
    0,
  );
  const gradeC = records.value.reduce((sum, item) => sum + item.gradeC, 0);
  return [
    { color: '#1677ff', label: 'A+', value: gradeAPlus },
    { color: '#52c41a', label: 'A', value: gradeA },
    { color: '#13c2c2', label: 'B', value: gradeB },
    { color: '#faad14', label: 'C+', value: gradeCPlus },
    { color: '#ff4d4f', label: 'C', value: gradeC },
  ];
});

function exportReport() {
  const header = [
    '部门',
    '参与人数',
    '已公示',
    '平均分',
    'A+',
    'A',
    'B',
    'C+',
    'C',
  ];
  const lines = records.value.map((item) =>
    [
      item.dept,
      item.headcount,
      item.published,
      item.avgScore,
      item.gradeAPlus,
      item.gradeA,
      item.gradeB,
      item.gradeCPlus,
      item.gradeC,
    ].join(','),
  );
  const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '绩效数据中心.csv';
  link.click();
  URL.revokeObjectURL(url);
  message.success('已导出绩效报表');
}

function buildApiRecords(): PerformanceDataRecord[] {
  const grouped = new Map<
    string,
    PerformanceDataRecord & { scoreTotal: number }
  >();
  apiInstances.value.forEach((instance) => {
    const dept = instance.deptName || '未分配部门';
    const current = grouped.get(dept) || {
      avgScore: 0,
      dept,
      gradeAPlus: 0,
      gradeA: 0,
      gradeB: 0,
      gradeCPlus: 0,
      gradeC: 0,
      headcount: 0,
      published: 0,
      scoreTotal: 0,
    };
    current.headcount += 1;
    if (instance.resultVisible && typeof instance.finalScore === 'number') {
      current.published += 1;
      current.scoreTotal += Number(instance.finalScore);
      if (['A+', '卓越'].includes(instance.gradeName || '')) {
        current.gradeAPlus += 1;
      } else if (['A', '优秀'].includes(instance.gradeName || '')) {
        current.gradeA += 1;
      } else if (['B', '平均'].includes(instance.gradeName || '')) {
        current.gradeB += 1;
      } else if (['C+', '及格'].includes(instance.gradeName || '')) {
        current.gradeCPlus += 1;
      } else {
        current.gradeC += 1;
      }
    }
    current.avgScore = Number(
      (current.scoreTotal / Math.max(current.published, 1)).toFixed(1),
    );
    grouped.set(dept, current);
  });
  return [...grouped.values()].map(({ scoreTotal, ...item }) => item);
}

async function loadDataCenter() {
  loading.value = true;
  try {
    const [instances, batches] = await Promise.all([
      getFdmPerformanceAssessmentInstancePage({ pageNo: 1, pageSize: -1 }),
      getFdmPerformanceAssessmentBatchPage({ pageNo: 1, pageSize: 1 }),
    ]);
    apiInstances.value = instances.list || [];
    batchTotal.value = batches.total || 0;
  } finally {
    loading.value = false;
  }
}

onMounted(loadDataCenter);
</script>

<template>
  <PerformanceShell
    description="汇总绩效批次、部门分布、等级分布和结果公示情况。"
    title="数据中心"
  >
    <template #actions>
      <Button @click="loadDataCenter">刷新</Button>
      <Button @click="exportReport">导出</Button>
      <Button type="primary" @click="router.push(performancePath('/batches'))">
查看考核批次
</Button>
    </template>

    <div class="metric-grid">
      <Card><Statistic :value="totalHeadcount" title="参与人数" /></Card>
      <Card><Statistic :value="avgScore" title="平均分" /></Card>
      <Card>
<Statistic :value="publishedRate" suffix="%" title="结果公示率" />
</Card>
      <Card><Statistic :value="batchTotal" title="考核批次" /></Card>
    </div>

    <div class="content-grid">
      <Card title="等级分布">
        <div class="grade-bars">
          <div v-for="item in gradeDistribution" :key="item.label">
            <span>{{ item.label }}</span>
            <div class="bar-track">
              <i
                :style="{
                  background: item.color,
                  width: `${Math.min(item.value * 4, 100)}%`,
                }"
              ></i>
            </div>
            <strong>{{ item.value }}人</strong>
          </div>
        </div>
      </Card>

      <Card title="结果状态">
        <Space direction="vertical" size="large" style="width: 100%">
          <div>
            <Tag color="green">已公示 {{ publishedCount }}人</Tag>
            <Tag>待处理 {{ totalHeadcount - publishedCount }}人</Tag>
          </div>
          <Progress :percent="publishedRate" />
        </Space>
      </Card>
    </div>

    <Card title="部门绩效分析">
      <Table
        :columns="columns"
        :data-source="records"
        :loading="loading"
        :pagination="false"
        row-key="dept"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'avgScore'">
            <strong>{{ record.avgScore }}</strong>
          </template>
          <template v-else-if="column.dataIndex === 'publishedRate'">
            <Progress
              :percent="
                Math.round(
                  (record.published / Math.max(record.headcount, 1)) * 100,
                )
              "
              size="small"
            />
          </template>
        </template>
      </Table>
    </Card>
  </PerformanceShell>
</template>

<style scoped>
.metric-grid,
.content-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.content-grid {
  grid-template-columns: 1.4fr 1fr;
}

.grade-bars {
  display: grid;
  gap: 16px;
}

.grade-bars > div {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) 70px;
  gap: 12px;
  align-items: center;
}

.bar-track {
  height: 10px;
  overflow: hidden;
  background: #eef2f7;
  border-radius: 999px;
}

.bar-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

@media (max-width: 960px) {
  .metric-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
