<script lang="ts" setup>
import type { TableRowSelection } from 'ant-design-vue/es/table/interface';

import type { FdmgongchangFactoryApi as Api } from '#/api/fdmgongchang/factory';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, Input, message, Popconfirm, Result, Select, Table, Tag } from 'ant-design-vue';

import { getWorkerList, getWorkerOptions, removeWorkers } from '#/api/fdmgongchang/factory';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import AddModal from './modules/add-modal.vue';
import AssignModal from './modules/assign-modal.vue';

/**
 * 工厂部门 · 人员岗位：钉钉登录过的本厂人员都会出现在这里，工厂管理员给他们分配岗位。
 * 不在本厂部门下的人可以手动添加，手动添加的可以再移出本厂。
 * 工序单的操作人只能选本厂、在岗、具备该工序岗位的人。
 */
defineOptions({ name: 'FdmGongchangWorker' });

const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() => hasAccessByCodes(['fdmgongchang:worker:update']));

const factory = useFactory();
const options = ref<Api.WorkerOptions>();
const rows = ref<Api.Worker[]>([]);
const loading = ref(false);
const loadError = ref(false);
const noFactory = ref(false);
const selectedKeys = ref<number[]>([]);
const filters = reactive({
  deptId: undefined as number | undefined,
  keyword: '',
  post: undefined as string | undefined,
  state: undefined as 'disabled' | 'enabled' | 'unassigned' | undefined,
});
const pageNo = ref(1);
const pageSize = ref(20);

const addOpen = ref(false);
/** 工厂绑定的钉钉根部门，例如黄石工厂 → 湖北飞德慕。 */
const factoryDeptName = computed(() => {
  const deptId = factory.factories.value.find((f) => f.id === factory.factoryId.value)?.deptId;
  return options.value?.depts.find((d) => d.id === deptId)?.name ?? '本厂部门';
});
const currentFactoryName = computed(
  () => factory.factories.value.find((f) => f.id === factory.factoryId.value)?.name,
);
const modalOpen = ref(false);
const modalWorkers = ref<Api.Worker[]>([]);

const postLabel = (code: string) =>
  options.value?.posts.find((p) => p.code === code)?.label ?? code;
const wageLabel = (code?: null | string) =>
  options.value?.wageModes.find((m) => m.code === code)?.label;
const unassignedCount = computed(() => rows.value.filter((r) => !r.assigned).length);

/** 状态筛选：在岗 / 停用对应岗位记录的 status，待分配按是否有岗位筛。 */
const STATE_STATUS: Record<string, number | undefined> = { disabled: 1, enabled: 0 };

async function loadRows() {
  loading.value = true;
  try {
    rows.value = await getWorkerList({
      assigned: filters.state === 'unassigned' ? false : undefined,
      deptId: filters.deptId,
      keyword: filters.keyword.trim() || undefined,
      post: filters.post,
      status: STATE_STATUS[filters.state ?? ''],
    });
    selectedKeys.value = selectedKeys.value.filter((id) =>
      rows.value.some((r) => r.userId === id),
    );
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  loadError.value = false;
  noFactory.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    options.value = await getWorkerOptions();
    await loadRows();
  } catch {
    loadError.value = true;
  }
}

onMounted(loadAll);

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  filters.deptId = undefined;
  selectedKeys.value = [];
  options.value = undefined;
  await loadAll();
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.deptId, filters.keyword, filters.post, filters.state],
  () => {
    if (!options.value) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      pageNo.value = 1;
      loadRows();
    }, 300);
  },
);
onBeforeUnmount(() => clearTimeout(searchTimer));

const rowSelection = computed<TableRowSelection<Api.Worker>>(() => ({
  onChange: (keys) => (selectedKeys.value = keys as number[]),
  selectedRowKeys: selectedKeys.value,
}));

function openAssign(workers: Api.Worker[]) {
  modalWorkers.value = workers;
  modalOpen.value = true;
}

async function onSaved(text: string) {
  message.success(text);
  selectedKeys.value = [];
  await loadRows();
}

async function onAdded(text: string) {
  message.success(text);
  filters.state = undefined;
  await loadRows();
}

async function removeOne(worker: Api.Worker) {
  await removeWorkers([worker.userId]);
  message.success(`已把 ${worker.nickname} 移出本厂`);
  await loadRows();
}

const columns = [
  { key: 'nickname', title: '姓名' },
  { dataIndex: 'deptName', key: 'deptName', title: '车间 / 部门' },
  { key: 'posts', title: '岗位' },
  { dataIndex: 'team', key: 'team', title: '班组' },
  { key: 'wageMode', title: '计薪' },
  { key: 'status', title: '状态' },
  { align: 'right' as const, key: 'actions', title: '', width: 140 },
];

const deptOptions = computed(() =>
  (options.value?.depts ?? []).map((d) => ({ label: d.name, value: d.id })),
);
const postOptions = computed(() =>
  (options.value?.posts ?? []).map((p) => ({ label: p.label, value: p.code })),
);
const stateOptions = [
  { label: '待分配', value: 'unassigned' },
  { label: '在岗', value: 'enabled' },
  { label: '停用', value: 'disabled' },
];
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">人员岗位</h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            钉钉部门「{{ factoryDeptName }}」及下级部门的人登录一次就会出现在这里；不在这个部门下的人，点「添加人员」从系统里搜出来加进来。分配工序岗位后，开工序单时才能选他做操作人。
          </p>
        </div>
        <div v-if="canUpdate && !noFactory && !loadError" class="flex flex-wrap gap-2">
          <Button v-if="selectedKeys.length > 0" @click="openAssign(rows.filter((r) => selectedKeys.includes(r.userId)))">
            批量分配（{{ selectedKeys.length }} 人）
          </Button>
          <Button type="primary" @click="addOpen = true">＋ 添加人员</Button>
        </div>
      </header>

      <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
        <template #subTitle>
          请在钉钉里把你调到所在工厂的部门，或联系管理员分配「查看全部工厂」权限。
        </template>
      </Result>
      <Result v-else-if="loadError" status="warning" title="人员岗位没有加载出来">
        <template #subTitle>可能是网络问题，或者还没有分配「人员岗位」的查看权限。</template>
        <template #extra>
          <Button type="primary" @click="loadAll">重新加载</Button>
        </template>
      </Result>

      <section v-else class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Select
            id="worker-filter-dept"
            v-model:value="filters.deptId"
            :options="deptOptions"
            allow-clear
            class="w-40"
            option-filter-prop="label"
            placeholder="全部车间"
            show-search
            size="small"
          />
          <Select
            id="worker-filter-post"
            v-model:value="filters.post"
            :options="postOptions"
            allow-clear
            class="w-32"
            placeholder="全部岗位"
            size="small"
          />
          <Select
            id="worker-filter-state"
            v-model:value="filters.state"
            :options="stateOptions"
            allow-clear
            class="w-28"
            placeholder="全部状态"
            size="small"
          />
          <Input
            id="worker-filter-keyword"
            v-model:value="filters.keyword"
            allow-clear
            class="w-48"
            placeholder="姓名或手机号"
            size="small"
          />
          <span v-if="unassignedCount > 0" class="text-xs text-warning">
            {{ unassignedCount }} 人待分配岗位
          </span>
        </div>
        <Table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="{
            current: pageNo,
            pageSize,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 人`,
          }"
          :row-selection="canUpdate ? rowSelection : undefined"
          :scroll="{ x: 'max-content' }"
          row-key="userId"
          size="small"
          @change="(p) => ((pageNo = p.current ?? 1), (pageSize = p.pageSize ?? 20))"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'nickname'">
              <div class="flex flex-col">
                <span class="flex items-center gap-1">
                  {{ record.nickname }}
                  <Tag v-if="record.added" class="m-0" color="blue">手动添加</Tag>
                </span>
                <span v-if="record.mobile" class="text-xs text-muted-foreground">{{ record.mobile }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'posts'">
              <span v-if="record.posts.length === 0" class="text-xs text-warning">待分配</span>
              <span v-else class="flex flex-wrap gap-1">
                <Tag v-for="p in record.posts" :key="p" class="m-0">{{ postLabel(p) }}</Tag>
              </span>
            </template>
            <template v-else-if="column.key === 'wageMode'">
              {{ wageLabel(record.wageMode) ?? '—' }}
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag v-if="record.status === 1" class="m-0">停用</Tag>
              <Tag v-else-if="record.assigned" class="m-0" color="green">在岗</Tag>
              <span v-else class="text-xs text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <span v-if="canUpdate" class="inline-flex gap-3 whitespace-nowrap text-xs">
                <button
                  class="text-primary hover:underline"
                  type="button"
                  @click="openAssign([record as Api.Worker])"
                >
                  {{ record.assigned ? '修改' : '分配岗位' }}
                </button>
                <Popconfirm
                  v-if="record.added"
                  :title="`把 ${record.nickname} 移出本厂？岗位会一起清掉`"
                  ok-text="移出"
                  @confirm="removeOne(record as Api.Worker)"
                >
                  <button class="text-destructive hover:underline" type="button">移出本厂</button>
                </Popconfirm>
              </span>
            </template>
          </template>
        </Table>
      </section>

      <AddModal
        v-model:open="addOpen"
        :factory-id="factory.factoryId.value"
        :factory-name="currentFactoryName"
        @added="onAdded"
      />
      <AssignModal
        v-if="options"
        v-model:open="modalOpen"
        :options="options"
        :workers="modalWorkers"
        @saved="onSaved"
      />
    </div>
  </Page>
</template>
