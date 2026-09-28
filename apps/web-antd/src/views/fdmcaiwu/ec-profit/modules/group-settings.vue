<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { AssignmentFilter } from '../config-model';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import {
  deleteFinanceGroup,
  getShopAssignments,
} from '#/api/fdmcaiwu/ec-profit';
import { assignmentLabel, filterAssignments } from '../config-model';
import AssignmentDialog from './assignment-dialog.vue';
import GroupEditor from './group-editor.vue';
import ConfigurationHistory from './configuration-history.vue';

const props = defineProps<{ defaultMonth: string }>();
const emit = defineEmits<{ changed: [] }>();
const month = ref(props.defaultMonth);
const data = ref<Api.AssignmentList>();
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const filter = ref<AssignmentFilter>('all');
const groupId = ref<number>();
const selectedKeys = ref<(number | string)[]>([]);
const groupOpen = ref(false);
const editingGroup = ref<Api.Group>();
const assignOpen = ref(false);
const assignedShops = ref<Api.AssignmentShop[]>([]);
const historyRevision = ref(0);
let sequence = 0;
const groups = computed(() => data.value?.groups ?? []);
const shops = computed(() => data.value?.shops ?? []);
const rows = computed(() =>
  filterAssignments(shops.value, filter.value, keyword.value, groupId.value),
);
const selectedShops = computed(() =>
  shops.value.filter((shop) => selectedKeys.value.includes(shop.shopId)),
);
const unconfiguredCount = computed(
  () => shops.value.filter((shop) => !shop.configured).length,
);
/** 各分组在所选月份的店铺数 */
const memberCount = computed(() => {
  const counts = new Map<number, number>();
  for (const shop of shops.value)
    if (shop.included && shop.groupId)
      counts.set(shop.groupId, (counts.get(shop.groupId) ?? 0) + 1);
  return counts;
});
const columns: TableColumnsType<Api.AssignmentShop> = [
  { title: '店铺 / 编号', key: 'name', width: 230 },
  { title: '平台', dataIndex: 'platformCode', width: 100 },
  { title: '所属分组', key: 'assignment', width: 220 },
  { title: '范围', key: 'scope', width: 110 },
  { title: '生效月份', dataIndex: 'effectiveMonth', width: 110 },
  { title: '备注 / 原因', dataIndex: 'reason', width: 200 },
];
const filterOptions = [
  { label: '全部店铺', value: 'all' },
  { label: '未配置待核实', value: 'unconfigured' },
  { label: '纳入但未分组', value: 'unassigned' },
  { label: '已纳入毛利', value: 'included' },
  { label: '已排除', value: 'excluded' },
];
async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  data.value = undefined;
  selectedKeys.value = [];
  try {
    const result = await getShopAssignments(month.value);
    if (current === sequence) data.value = result;
  } catch {
    if (current === sequence) error.value = '分组配置加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  month,
  () => {
    groupId.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => sequence++);
function newGroup() {
  editingGroup.value = undefined;
  groupOpen.value = true;
}
function editGroup(group: Api.Group) {
  editingGroup.value = group;
  groupOpen.value = true;
}
function assign() {
  if (!selectedShops.value.length) return;
  assignedShops.value = [...selectedShops.value];
  assignOpen.value = true;
}
function selectUnconfigured() {
  filter.value = 'unconfigured';
  groupId.value = undefined;
  keyword.value = '';
  selectedKeys.value = [];
}
async function changed() {
  await load();
  historyRevision.value++;
  emit('changed');
}
function removeGroup(group: Api.Group) {
  Modal.confirm({
    title: `删除分组「${group.name}」？`,
    content:
      '仅从未放过店铺、也未被月报引用的分组可删除；已有历史记录的分组请编辑后停用。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteFinanceGroup(group.id, group.version);
      message.success('分组已删除');
      await changed();
    },
  });
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-sm">生效月份</span
        ><DatePicker
          v-model:value="month"
          picker="month"
          value-format="YYYY-MM"
          format="YYYY 年 MM 月"
          :allow-clear="false"
          aria-label="归属生效月份"
        /><span class="text-xs text-muted-foreground"
          >调整从该月起生效；店铺第一次配置的分组也用于之前的月份</span
        >
      </div>
      <Button :loading="loading" @click="load">刷新配置</Button>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Alert
      v-if="unconfiguredCount"
      type="warning"
      show-icon
      :message="`${unconfiguredCount} 家店铺尚未配置，请确认纳入范围或填写排除原因。`"
      ><template #action
        ><Button size="small" @click="selectUnconfigured"
          >查看未配置</Button
        ></template
      ></Alert
    >
    <div class="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <section class="rounded-xl border border-border bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <strong>电商分组</strong
          ><Button
            v-access:code="['fdmcaiwu:ec-profit:group-config']"
            size="small"
            type="primary"
            @click="newGroup"
            >新增分组</Button
          >
        </div>
        <Button
          block
          :type="groupId === undefined ? 'primary' : 'default'"
          ghost
          @click="groupId = undefined"
          >全部店铺</Button
        >
        <div class="mt-3 max-h-[600px] space-y-2 overflow-auto">
          <div
            v-for="group in groups"
            :key="group.id"
            class="rounded-lg border p-3"
            :class="
              groupId === group.id
                ? 'border-primary bg-primary/5'
                : 'border-border'
            "
          >
            <button class="w-full text-left" @click="groupId = group.id">
              <div class="flex items-center justify-between">
                <strong>{{ group.name }}</strong
                ><Tag v-if="!group.enabled">已停用</Tag>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ memberCount.get(group.id) ?? 0 }} 家店铺
              </div>
            </button>
            <div
              v-access:code="['fdmcaiwu:ec-profit:group-config']"
              class="mt-2 flex justify-end gap-2"
            >
              <Button size="small" type="link" @click="editGroup(group)"
                >编辑</Button
              ><Button
                size="small"
                type="link"
                danger
                @click="removeGroup(group)"
                >删除</Button
              >
            </div>
          </div>
          <Empty
            v-if="!loading && !groups.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="还没有分组，点「新增分组」选择店铺"
          />
        </div>
        <p class="mb-0 mt-4 text-xs leading-6 text-muted-foreground">
          分组只决定哪些店铺算一个组，月报按分组汇总，与财务核算无关。
        </p>
      </section>
      <section class="min-w-0 rounded-xl border border-border bg-card p-4">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap gap-2">
            <Input
              v-model:value="keyword"
              placeholder="店铺名称、编号或平台"
              allow-clear
              class="!w-56"
            /><Select
              v-model:value="filter"
              :options="filterOptions"
              class="w-44"
            />
          </div>
          <Button
            v-access:code="['fdmcaiwu:ec-profit:group-config']"
            type="primary"
            :disabled="!selectedKeys.length || loading"
            @click="assign"
            >批量调整分组（{{ selectedKeys.length }}）</Button
          >
        </div>
        <div class="mb-3 text-xs text-muted-foreground">
          共 {{ shops.length }} 家目录店铺 · 当前筛选 {{ rows.length }} 家 ·
          已选 {{ selectedShops.length }} 家（跨筛选保留）<Button
            v-if="selectedKeys.length"
            size="small"
            type="link"
            @click="selectedKeys = []"
            >清空选择</Button
          >
        </div>
        <Table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="{ pageSize: 20, showSizeChanger: false }"
          :scroll="{ x: 1010 }"
          :row-selection="{
            selectedRowKeys: selectedKeys,
            preserveSelectedRowKeys: true,
            onChange: (keys) => (selectedKeys = [...keys]),
          }"
          row-key="shopId"
          size="small"
          ><template #bodyCell="{ column, record, text }"
            ><div v-if="column.key === 'name'">
              <strong>{{ record.shopName }}</strong
              ><Tag v-if="!record.enabled" class="ml-2">店铺停用</Tag>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ record.shopId }}
              </div>
            </div>
            <template v-else-if="column.key === 'assignment'">{{
              assignmentLabel(record as Api.AssignmentShop)
            }}</template
            ><Tag
              v-else-if="column.key === 'scope'"
              :color="
                !record.configured
                  ? 'orange'
                  : record.included
                    ? 'success'
                    : 'default'
              "
              >{{
                !record.configured
                  ? '未配置'
                  : record.included
                    ? '纳入毛利'
                    : '已排除'
              }}</Tag
            ><template v-else>{{ text || '—' }}</template></template
          ></Table
        >
      </section>
    </div>
  </div>
  <ConfigurationHistory :revision="historyRevision" />
  <GroupEditor
    v-model:open="groupOpen"
    :group="editingGroup"
    :groups="groups"
    :month="month"
    :shops="shops"
    @saved="changed"
  />
  <AssignmentDialog
    v-model:open="assignOpen"
    :month="month"
    :shops="assignedShops"
    :groups="groups"
    @saved="changed"
  />
</template>
