<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Form,
  FormItem,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
  message,
} from 'ant-design-vue';

import { createRequirement, listRequirements } from '#/api/fdmreq';

import {
  FDMREQ_GROUPS,
  FDMREQ_STATUS_OPTIONS,
  filterRequirements,
  formatFdmReqTime,
  getFdmReqStatusHint,
  getFdmReqStatusMeta,
} from '../status';

defineOptions({ name: 'FdmReqRequirement' });

const router = useRouter();
const { hasAccessByCodes } = useAccess();
const canCreate = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:create']),
);
const loading = ref(false);
const loadError = ref(false);
const rows = ref<FdmReqApi.Requirement[]>([]);
const group = ref('all');
const search = ref('');
const statusFilter = ref<string>();
const createOpen = ref(false);
const creating = ref(false);
const pagination = reactive({
  current: 1,
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个需求`,
});
const form = reactive({
  title: '',
  problem: '',
  expected: '',
  acceptance: '',
  context: '',
});
const filteredRows = computed(() =>
  filterRequirements(rows.value, group.value, search.value, statusFilter.value),
);
const counts = computed(() =>
  Object.fromEntries(
    FDMREQ_GROUPS.map((item) => [
      item.key,
      filterRequirements(rows.value, item.key, '').length,
    ]),
  ),
);
const statCards = [
  {
    key: 'review',
    title: '等待审核',
    note: '确认方案后进入实现队列',
    accent: '#d97706',
  },
  {
    key: 'queued',
    title: '待实现',
    note: '已审核，等待自动任务领取',
    accent: '#0891b2',
  },
  {
    key: 'working',
    title: '正在执行',
    note: '实现、测试与交付检查',
    accent: '#4f46e5',
  },
  {
    key: 'acceptance',
    title: '待验收',
    note: '检查交付结果与测试报告',
    accent: '#059669',
  },
];
const columns = [
  { title: '需求', key: 'requirement', width: 380 },
  { title: '当前进度', key: 'status', width: 300 },
  {
    title: '提交时间（北京时间）',
    dataIndex: 'createTime',
    key: 'createTime',
    width: 180,
  },
  { title: '操作', key: 'actions', width: 100, fixed: 'right' as const },
];
watch([group, search, statusFilter], () => {
  pagination.current = 1;
});

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    rows.value = (await listRequirements()) ?? [];
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function selectGroup(key: string) {
  group.value = key;
  statusFilter.value = undefined;
}

function openDetail(reqNo: string) {
  router.push({ path: '/fdmreq/requirements/detail', query: { reqNo } });
}

function resetForm() {
  Object.assign(form, {
    title: '',
    problem: '',
    expected: '',
    acceptance: '',
    context: '',
  });
}

async function submitCreate() {
  if (!form.title.trim() || !form.problem.trim()) {
    message.warning('请填写标题和当前问题');
    return;
  }
  creating.value = true;
  try {
    const rawDescription = [
      `【当前问题】\n${form.problem.trim()}`,
      ...(form.expected.trim()
        ? [`【预期效果】\n${form.expected.trim()}`]
        : []),
      ...(form.acceptance.trim()
        ? [`【验收标准】\n${form.acceptance.trim()}`]
        : []),
      ...(form.context.trim() ? [`【补充背景】\n${form.context.trim()}`] : []),
    ].join('\n\n');
    const created = await createRequirement({
      title: form.title.trim(),
      rawDescription,
    });
    message.success('需求已提交，等待 AI 生成方案');
    createOpen.value = false;
    resetForm();
    await load();
    if (created?.reqNo) openDetail(created.reqNo);
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page auto-content-height>
    <section class="req-hero mb-5">
      <div>
        <div class="req-eyebrow">FDM · REQUIREMENTS</div>
        <h1>需求中心</h1>
        <p>把一个想法，推进为可审核、可追踪、可验收的改进。</p>
        <div class="req-flow">
          <span>01 提交需求</span><i>→</i><span>02 AI 设计方案</span><i>→</i
          ><span>03 人工审核</span><i>→</i><span>04 自动实现</span><i>→</i
          ><span>05 验收完成</span>
        </div>
      </div>
      <Button
        v-if="canCreate"
        size="large"
        type="primary"
        @click="createOpen = true"
        >＋ 提交需求</Button
      >
    </section>

    <div class="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <button
        v-for="stat in statCards"
        :key="stat.key"
        class="req-stat text-left"
        :class="{ 'req-stat-selected': group === stat.key }"
        :style="{ '--stat-accent': stat.accent }"
        @click="selectGroup(group === stat.key ? 'all' : stat.key)"
      >
        <div class="req-stat-title">{{ stat.title }}</div>
        <strong>{{ counts[stat.key] ?? 0 }}</strong>
        <div class="text-muted-foreground text-xs">{{ stat.note }}</div>
      </button>
    </div>

    <Alert
      v-if="loadError"
      class="mb-4"
      type="error"
      show-icon
      message="需求列表加载失败，请刷新重试。"
    />
    <Card :body-style="{ padding: '0' }">
      <div class="req-toolbar">
        <div class="req-groups" aria-label="按流程筛选">
          <button
            v-for="item in FDMREQ_GROUPS"
            :key="item.key"
            :class="{ active: group === item.key }"
            @click="selectGroup(item.key)"
          >
            {{ item.label }} <span>{{ counts[item.key] ?? 0 }}</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 pt-4">
          <Input
            v-model:value="search"
            allow-clear
            placeholder="搜索需求编号、标题或描述"
            class="req-search"
            aria-label="搜索需求"
          />
          <Space wrap>
            <Select
              v-model:value="statusFilter"
              allow-clear
              placeholder="全部状态"
              :options="
                FDMREQ_STATUS_OPTIONS.filter(
                  (item) => item.value !== 'ACCEPTED',
                )
              "
              style="width: 160px"
              aria-label="筛选状态"
            />
            <Button :loading="loading" @click="load">刷新</Button>
          </Space>
        </div>
      </div>
      <Table
        :columns="columns"
        :data-source="filteredRows"
        :loading="loading"
        row-key="reqNo"
        :pagination="pagination"
        :scroll="{ x: 1000 }"
        :locale="{
          emptyText:
            search || group !== 'all' || statusFilter
              ? '没有匹配的需求，试试调整筛选条件'
              : '还没有需求，提交第一个想法吧',
        }"
        @change="
          (page) => {
            pagination.current = page.current ?? 1;
            pagination.pageSize = page.pageSize ?? 10;
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'requirement'">
            <button class="req-title" @click="openDetail(record.reqNo)">
              {{ record.title }}
            </button>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ record.reqNo }}
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getFdmReqStatusMeta(record.status).color">{{
              getFdmReqStatusMeta(record.status).label
            }}</Tag>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ getFdmReqStatusHint(record.status) }}
            </div>
          </template>
          <template v-else-if="column.key === 'createTime'"
            ><span class="text-sm text-muted-foreground">{{
              formatFdmReqTime(record.createTime)
            }}</span></template
          >
          <template v-else-if="column.key === 'actions'"
            ><Button type="link" @click="openDetail(record.reqNo)"
              >查看详情</Button
            ></template
          >
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="createOpen"
      title="提交一个需求"
      :width="720"
      :confirm-loading="creating"
      :mask-closable="false"
      ok-text="提交并等待分析"
      cancel-text="暂不提交"
      @ok="submitCreate"
      @cancel="resetForm"
    >
      <Alert
        class="mb-5 mt-4"
        type="info"
        show-icon
        message="先描述清楚问题，AI 会整理方案供审核。审核通过后才会进入自动实现队列。"
      />
      <Form layout="vertical">
        <FormItem label="一句话概括需求" required
          ><Input
            v-model:value="form.title"
            :maxlength="200"
            show-count
            placeholder="例如：客户列表增加按跟进状态筛选"
        /></FormItem>
        <FormItem label="当前遇到了什么问题？" required
          ><Textarea
            v-model:value="form.problem"
            :rows="3"
            :maxlength="8000"
            show-count
            placeholder="在哪个页面？做了什么操作？现在的结果是什么？"
        /></FormItem>
        <FormItem label="希望修改成什么样？（选填）"
          ><Textarea
            v-model:value="form.expected"
            :rows="3"
            :maxlength="8000"
            show-count
            placeholder="描述期望的操作方式和展示结果，尽量一次聚焦一个小改动。"
        /></FormItem>
        <FormItem label="怎样判断已经做好？（选填）"
          ><Textarea
            v-model:value="form.acceptance"
            :rows="3"
            :maxlength="4000"
            show-count
            placeholder="例如：选择“待跟进”后只显示对应客户；清空条件后恢复全部列表。"
        /></FormItem>
        <FormItem label="补充背景（选填）"
          ><Textarea
            v-model:value="form.context"
            :rows="2"
            :maxlength="4000"
            placeholder="相关页面地址、数据样例、需要保留的现有行为……"
        /></FormItem>
      </Form>
      <div class="text-xs text-muted-foreground">
        提交人由当前登录账号记录。原始描述保留，后续补充会记录到需求时间线。
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.req-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 32px;
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  background: linear-gradient(
    120deg,
    hsl(var(--card)),
    hsl(var(--primary) / 0.07)
  );
}
.req-eyebrow {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  color: hsl(var(--primary));
}
.req-hero h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.5px;
}
.req-hero p {
  margin: 8px 0 18px;
  color: hsl(var(--muted-foreground));
}
.req-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.req-flow i {
  opacity: 0.45;
  font-style: normal;
}
.req-stat {
  padding: 20px;
  border: 1px solid hsl(var(--border));
  border-top: 3px solid var(--stat-accent);
  border-radius: 10px;
  background: hsl(var(--card));
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.req-stat:hover,
.req-stat-selected {
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
}
.req-stat-title {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.req-stat strong {
  display: block;
  margin: 7px 0;
  font-size: 30px;
  line-height: 1.2;
}
.req-toolbar {
  padding: 20px 24px;
}
.req-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}
.req-groups button {
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.req-groups button span {
  margin-left: 3px;
  opacity: 0.65;
  font-size: 11px;
}
.req-groups button.active {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.09);
  font-weight: 600;
}
.req-search {
  width: min(360px, 100%);
}
.req-title {
  font-size: 14px;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
}
.req-title:hover {
  color: hsl(var(--primary));
}
@media (max-width: 640px) {
  .req-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 22px;
  }
  .req-stat {
    padding: 14px;
  }
  .req-flow {
    gap: 8px;
  }
  .req-toolbar {
    padding: 16px;
  }
}
</style>
