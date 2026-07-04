<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'ant-design-vue';

import {
  createFdmPerformanceIndicator,
  createFdmPerformanceIndicatorTag,
  deleteFdmPerformanceIndicator,
  getFdmPerformanceIndicatorPage,
  getFdmPerformanceIndicatorTagList,
  updateFdmPerformanceIndicator,
  type FdmPerformanceIndicatorApi,
} from '#/api/fdmperformance/indicator';

import PerformanceShell from '../shared/PerformanceShell.vue';
import type { Indicator } from '../shared/model';

defineOptions({ name: 'FdmPerformanceIndicators' });

const keyword = ref('');
const modalOpen = ref(false);
const tagManagerOpen = ref(false);
const tagKeyword = ref('');
const newTagName = ref('');
const loading = ref(false);
const apiIndicators = ref<Indicator[]>([]);
const apiTags = ref<FdmPerformanceIndicatorApi.IndicatorTag[]>([]);
const editingIndicator = reactive<Indicator>({
  dimension: '业绩指标',
  id: 0,
  name: '',
  scoreMode: '手动评分',
  standard: '',
  status: 'enabled',
  tags: [],
  weight: 0,
});

const dimensions = ['业绩指标', '过程指标', '自我管理', '加分项', '扣分项', '一票否决'];
const indicators = computed(() => apiIndicators.value);
const allTags = computed(() =>
  Array.from(
    new Set([
      ...apiTags.value.map((item) => item.name || ''),
      ...indicators.value.flatMap((item) => item.tags),
    ]),
  ).filter(Boolean),
);
const tagOptions = computed(() => allTags.value.map((value) => ({ label: value, value })));
const filteredTags = computed(() => {
  const text = tagKeyword.value.trim();
  return allTags.value.filter((item) => !text || item.includes(text));
});
const columns: TableColumnsType = [
  { dataIndex: 'name', title: '指标名称', width: 220 },
  { dataIndex: 'dimension', title: '指标类型', width: 140 },
  { dataIndex: 'standard', title: '考核标准' },
  { dataIndex: 'weight', title: '权重', width: 100 },
  { dataIndex: 'scoreMode', title: '评分方式', width: 120 },
  { dataIndex: 'tags', title: '标签', width: 220 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 140 },
];

const filteredIndicators = computed(() => {
  const text = keyword.value.trim();
  if (!text) return indicators.value;
  return indicators.value.filter((item) =>
    [item.name, item.dimension, item.standard, item.tags.join(',')].some((value) => value.includes(text)),
  );
});

function openCreate() {
  Object.assign(editingIndicator, {
    dimension: '业绩指标',
    id: 0,
    name: '',
    scoreMode: '手动评分',
    standard: '',
    status: 'enabled',
    tags: [],
    weight: 0,
  });
  modalOpen.value = true;
}

function openEdit(record: Indicator) {
  Object.assign(editingIndicator, JSON.parse(JSON.stringify(record)));
  modalOpen.value = true;
}

async function save() {
  if (!editingIndicator.name.trim() || !editingIndicator.standard.trim()) {
    message.warning('请填写指标名称和考核标准');
    return;
  }
  const tagIds = await ensureTagIds(editingIndicator.tags);
  const payload = {
    id: editingIndicator.id || undefined,
    name: editingIndicator.name,
    remark: JSON.stringify({
      dimension: editingIndicator.dimension,
      scoreMode: editingIndicator.scoreMode,
      weight: editingIndicator.weight,
    }),
    sourceType: 1,
    standard: editingIndicator.standard,
    status: editingIndicator.status === 'enabled' ? 0 : 1,
    tagIds,
  };
  if (payload.id) {
    await updateFdmPerformanceIndicator(payload);
  } else {
    await createFdmPerformanceIndicator(payload);
  }
  await loadIndicators();
  modalOpen.value = false;
  message.success('指标已保存');
}

async function addTag() {
  const tag = newTagName.value.trim();
  if (!tag) {
    message.warning('请填写标签名称');
    return;
  }
  if (!apiTags.value.some((item) => item.name === tag)) {
    await createFdmPerformanceIndicatorTag({
      name: tag,
      sort: apiTags.value.length * 10,
      status: 0,
      tagType: 1,
    });
    await loadTags();
  }
  newTagName.value = '';
  message.success('标签已添加');
}

async function removeIndicator(id: number) {
  await deleteFdmPerformanceIndicator(id);
  await loadIndicators();
  message.success('指标已删除');
}

function parseIndicatorRemark(remark?: string) {
  try {
    return remark ? JSON.parse(remark) as Partial<Indicator> : {};
  } catch {
    return {};
  }
}

function mapApiIndicator(item: FdmPerformanceIndicatorApi.Indicator): Indicator {
  const extra = parseIndicatorRemark(item.remark);
  const tags = (item.tagIds || [])
    .map((id) => apiTags.value.find((tag) => tag.id === id)?.name)
    .filter((tag): tag is string => Boolean(tag));
  return {
    dimension: extra.dimension || tags[0] || '业绩指标',
    id: Number(item.id || 0),
    name: item.name || '未命名指标',
    scoreMode: extra.scoreMode || '手动评分',
    standard: item.standard || '',
    status: item.status === 1 ? 'stopped' : 'enabled',
    tags,
    weight: Number(extra.weight || 0),
  };
}

async function ensureTagIds(tags: string[]) {
  const ids: number[] = [];
  for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
    const existed = apiTags.value.find((item) => item.name === tag);
    if (existed?.id) {
      ids.push(existed.id);
      continue;
    }
    const id = await createFdmPerformanceIndicatorTag({
      name: tag,
      sort: apiTags.value.length * 10,
      status: 0,
      tagType: 1,
    });
    ids.push(id);
    apiTags.value.push({ id, name: tag, status: 0, tagType: 1 });
  }
  return ids;
}

async function loadTags() {
  apiTags.value = await getFdmPerformanceIndicatorTagList({ status: 0 });
}

async function loadIndicators() {
  loading.value = true;
  try {
    await loadTags();
    const page = await getFdmPerformanceIndicatorPage({
      name: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 200,
    });
    apiIndicators.value = (page.list || []).map(mapApiIndicator);
  } finally {
    loading.value = false;
  }
}

onMounted(loadIndicators);
</script>

<template>
  <PerformanceShell
    description="管理可被考评表复用的绩效指标，支持按维度、标签和评分方式维护。"
    title="指标库"
  >
    <template #actions>
      <Button @click="tagManagerOpen = true">标签管理</Button>
      <Button type="primary" @click="openCreate">新增指标</Button>
    </template>

    <Card>
      <div class="toolbar">
        <Input v-model:value="keyword" allow-clear placeholder="搜索指标名称、类型、标签" />
      </div>
      <Table
        :columns="columns"
        :data-source="filteredIndicators"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'weight'">
            {{ record.weight }}%
          </template>
          <template v-else-if="column.dataIndex === 'tags'">
            <Space :size="4" wrap>
              <Tag v-for="tag in record.tags" :key="tag">{{ tag }}</Tag>
            </Space>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 'enabled' ? 'green' : 'default'">
              {{ record.status === 'enabled' ? '启用中' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button size="small" type="link" @click="openEdit(record as Indicator)">编辑</Button>
              <Button danger size="small" type="link" @click="removeIndicator(record.id)">删除</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal v-model:open="modalOpen" title="指标设置" width="720px" @ok="save">
      <Form layout="vertical">
        <Form.Item label="指标名称" required>
          <Input v-model:value="editingIndicator.name" placeholder="请输入指标名称" />
        </Form.Item>
        <Form.Item label="指标类型" required>
          <Select v-model:value="editingIndicator.dimension" :options="dimensions.map((value) => ({ label: value, value }))" />
        </Form.Item>
        <Form.Item label="权重">
          <InputNumber v-model:value="editingIndicator.weight" :max="100" :min="0" addon-after="%" class="full" />
        </Form.Item>
        <Form.Item label="评分方式">
          <Select
            v-model:value="editingIndicator.scoreMode"
            :options="['手动评分', '按分数区间对应', '输入框手动输入', '设置评分组'].map((value) => ({ label: value, value }))"
          />
        </Form.Item>
        <Form.Item label="考核标准" required>
          <Input.TextArea v-model:value="editingIndicator.standard" :rows="5" placeholder="请输入考核标准" />
        </Form.Item>
        <Form.Item label="标签">
          <Select
            v-model:value="editingIndicator.tags"
            :options="tagOptions"
            mode="tags"
            placeholder="输入标签后回车"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal v-model:open="tagManagerOpen" title="标签管理" width="680px" @ok="tagManagerOpen = false">
      <div class="tag-manager">
        <div class="tag-create-row">
          <Input v-model:value="newTagName" placeholder="填写岗位或部门标签名称" />
          <Button type="primary" @click="addTag">添加标签</Button>
        </div>
        <Input v-model:value="tagKeyword" allow-clear placeholder="搜索标签" />
        <div class="tag-cloud">
          <Tag v-for="tag in filteredTags" :key="tag" color="blue">{{ tag }}</Tag>
        </div>
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  max-width: 360px;
  margin-bottom: 14px;
}

.full {
  width: 100%;
}

.tag-manager {
  display: grid;
  gap: 12px;
}

.tag-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 10px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 120px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
</style>
