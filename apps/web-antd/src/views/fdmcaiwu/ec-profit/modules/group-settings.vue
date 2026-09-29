<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { GroupView, MemberFilter } from '../config-model';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAccess } from '@vben/access';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import {
  deleteFinanceGroup,
  getEcProfitGroupMembers,
  saveEcProfitDefaultGroups,
  saveEcProfitMonthGroups,
} from '#/api/fdmcaiwu/ec-profit';
import {
  filterMembers,
  isAdjusted,
  memberCounts,
  UNCONFIGURED_GROUP,
} from '../config-model';
import ConfigurationHistory from './configuration-history.vue';
import GroupEditor from './group-editor.vue';
import GroupMoveDialog from './group-move-dialog.vue';

/**
 * 电商分组配置：
 * - 默认分组：店铺平时属于哪个组，所有月份都按它汇总；
 * - 按月调整：某个月临时变化（如有人请假，店铺交给别人），只改那个月。
 */
const props = defineProps<{ defaultMonth: string }>();
const emit = defineEmits<{ changed: [] }>();
const { hasAccessByCodes } = useAccess();
const canConfig = computed(() =>
  hasAccessByCodes(['fdmcaiwu:ec-profit:group-config']),
);
const view = ref<GroupView>('default');
const month = ref(props.defaultMonth);
const data = ref<Api.GroupMembers>();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const keyword = ref('');
const filter = ref<MemberFilter>('all');
const groupId = ref<number>();
const selectedKeys = ref<(number | string)[]>([]);
const groupOpen = ref(false);
const editingGroup = ref<Api.Group>();
const moveOpen = ref(false);
const historyRevision = ref(0);
let sequence = 0;
const groups = computed(() => data.value?.groups ?? []);
const shops = computed(() => data.value?.shops ?? []);
const rows = computed(() =>
  filterMembers(shops.value, view.value, filter.value, keyword.value, groupId.value),
);
const selectedShops = computed(() =>
  shops.value.filter((shop) => selectedKeys.value.includes(shop.shopId)),
);
const counts = computed(() => memberCounts(shops.value, view.value));
const unconfiguredCount = computed(
  () => counts.value.get(UNCONFIGURED_GROUP)?.total ?? 0,
);
const adjustedCount = computed(
  () => shops.value.filter((shop) => isAdjusted(shop)).length,
);
const viewOptions = [
  { label: '默认分组', value: 'default' },
  { label: '按月调整', value: 'month' },
];
const filterOptions = computed(() => [
  { label: '全部店铺', value: 'all' },
  { label: view.value === 'default' ? '没有默认分组' : '本月未配置', value: 'unconfigured' },
  ...(view.value === 'month' ? [{ label: '本月有调整', value: 'adjusted' }] : []),
]);
const columns = computed<TableColumnsType<Api.GroupMemberShop>>(() =>
  view.value === 'default'
    ? [
        { title: '店铺 / 编号', key: 'name', width: 260 },
        { title: '平台', dataIndex: 'platformCode', width: 110 },
        { title: '默认分组', key: 'default', width: 240 },
      ]
    : [
        { title: '店铺 / 编号', key: 'name', width: 240 },
        { title: '平台', dataIndex: 'platformCode', width: 100 },
        { title: '默认分组', key: 'defaultName', width: 130 },
        { title: `${month.value} 分组`, key: 'month', width: 300 },
        { title: '调整原因', dataIndex: 'overrideReason', width: 200 },
      ],
);

async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const result = await getEcProfitGroupMembers(month.value);
    if (current === sequence) data.value = result;
  } catch {
    if (current === sequence) error.value = '分组配置加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(month, () => void load(), { immediate: true });
watch(view, () => {
  groupId.value = undefined;
  filter.value = 'all';
  selectedKeys.value = [];
});
onBeforeUnmount(() => sequence++);

async function changed() {
  selectedKeys.value = [];
  await load();
  historyRevision.value++;
  emit('changed');
}
function groupName(id?: number) {
  return groups.value.find((group) => group.id === id)?.name ?? '未配置';
}
/** 下拉选项：只能选启用的分组；当前所在的已停用分组也列出（不可选），避免显示成编号。按月视图里默认分组标注「默认」，选它即恢复默认。 */
function groupOptions(current?: number, defaultId?: number) {
  return groups.value
    .filter((group) => group.enabled || group.id === current)
    .map((group) => ({
      label: `${group.name}${group.id === defaultId ? '（默认）' : ''}${group.enabled ? '' : '（已停用）'}`,
      value: group.id,
      disabled: !group.enabled,
    }));
}
async function run(action: () => Promise<number>, done: string) {
  if (saving.value) return;
  saving.value = true;
  try {
    const count = await action();
    message.success(count ? done : '没有变化');
    await changed();
  } catch {
    // 请求层已提示具体原因；重新加载显示真实状态
    await load();
  } finally {
    saving.value = false;
  }
}
function setDefault(shop: Api.GroupMemberShop, target?: number) {
  void run(
    () => saveEcProfitDefaultGroups({ groupId: target, shopIds: [shop.shopId] }),
    target
      ? `「${shop.shopName}」默认分组改为 ${groupName(target)}`
      : `「${shop.shopName}」已移出默认分组`,
  );
}
function setMonth(shop: Api.GroupMemberShop, target?: number) {
  const reset = !target || target === shop.defaultGroupId;
  void run(
    () =>
      saveEcProfitMonthGroups({
        groupId: target,
        month: month.value,
        shopIds: [shop.shopId],
      }),
    reset
      ? `「${shop.shopName}」${month.value} 已恢复默认分组`
      : `「${shop.shopName}」${month.value} 调到 ${groupName(target)}`,
  );
}
function removeSelected() {
  const targets = selectedShops.value;
  if (!targets.length) return;
  const isDefault = view.value === 'default';
  Modal.confirm({
    title: isDefault
      ? `将 ${targets.length} 家店铺移出默认分组？`
      : `${targets.length} 家店铺 ${month.value} 恢复默认分组？`,
    content: isDefault
      ? '移出后这些店铺没有默认分组，月报中归入「未配置」（已单独调整的月份不受影响）。'
      : '取消这些店铺在本月的临时调整，本月改回按默认分组汇总。',
    okText: isDefault ? '移出' : '恢复默认',
    cancelText: '取消',
    onOk: () =>
      run(
        () =>
          isDefault
            ? saveEcProfitDefaultGroups({ shopIds: targets.map((shop) => shop.shopId) })
            : saveEcProfitMonthGroups({
                month: month.value,
                shopIds: targets.map((shop) => shop.shopId),
              }),
        isDefault ? '已移出默认分组' : '已恢复默认分组',
      ),
  });
}
function newGroup() {
  editingGroup.value = undefined;
  groupOpen.value = true;
}
function editGroup(group: Api.Group) {
  editingGroup.value = group;
  groupOpen.value = true;
}
function showUnconfigured() {
  groupId.value = UNCONFIGURED_GROUP;
  filter.value = 'all';
  keyword.value = '';
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
        <Segmented v-model:value="view" :options="viewOptions" />
        <template v-if="view === 'month'"
          ><DatePicker
            v-model:value="month"
            picker="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            :allow-clear="false"
            aria-label="调整月份"
          /><span class="text-xs text-muted-foreground"
            >只改这个月，其他月份仍按默认分组</span
          ></template
        ><span v-else class="text-xs text-muted-foreground"
          >店铺平时属于哪个组；所有月份都按它汇总</span
        >
      </div>
      <Button :loading="loading" @click="load">刷新</Button>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Alert
      v-if="view === 'month' && adjustedCount"
      type="info"
      show-icon
      :message="`${month} 有 ${adjustedCount} 家店铺临时调整了分组，其余按默认分组。`"
      ><template #action
        ><Button size="small" @click="filter = 'adjusted'"
          >只看调整</Button
        ></template
      ></Alert
    >
    <Alert
      v-if="unconfiguredCount"
      type="warning"
      show-icon
      :message="
        view === 'default'
          ? `${unconfiguredCount} 家店铺还没有默认分组，月度毛利和年度对比中归入「未配置」。`
          : `${month} 有 ${unconfiguredCount} 家店铺没有分组，归入「未配置」。`
      "
      ><template #action
        ><Button size="small" @click="showUnconfigured"
          >查看</Button
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
          >全部店铺（{{ shops.length }}）</Button
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
                {{ counts.get(group.id)?.total ?? 0 }} 家店铺<template
                  v-if="view === 'month' && counts.get(group.id)?.in"
                  ><span class="text-orange-500">
                    · 调入 {{ counts.get(group.id)?.in }}</span
                  ></template
                ><template
                  v-if="view === 'month' && counts.get(group.id)?.out"
                  ><span class="text-orange-500">
                    · 调出 {{ counts.get(group.id)?.out }}</span
                  ></template
                >
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
          <button
            class="w-full rounded-lg border border-dashed p-3 text-left"
            :class="
              groupId === UNCONFIGURED_GROUP
                ? 'border-primary bg-primary/5'
                : 'border-border'
            "
            @click="groupId = UNCONFIGURED_GROUP"
          >
            <strong class="text-muted-foreground">未配置</strong>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ unconfiguredCount }} 家店铺
            </div>
          </button>
          <Empty
            v-if="!loading && !groups.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="还没有分组，点「新增分组」选择店铺"
          />
        </div>
        <p class="mb-0 mt-4 text-xs leading-6 text-muted-foreground">
          分组只决定哪些店铺算一个组，月报按分组汇总，与财务核算无关。某月有调整就按调整，没有就按默认分组。
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
              class="w-40"
            />
          </div>
          <div
            v-access:code="['fdmcaiwu:ec-profit:group-config']"
            class="flex flex-wrap gap-2"
          >
            <Button
              :disabled="!selectedKeys.length || loading || saving"
              @click="removeSelected"
              >{{ view === 'default' ? '移出默认分组' : '恢复默认' }}</Button
            ><Button
              type="primary"
              :disabled="!selectedKeys.length || loading || saving"
              @click="moveOpen = true"
              >{{
                view === 'default' ? '设为默认分组' : `${month} 调到…`
              }}（{{ selectedKeys.length }}）</Button
            >
          </div>
        </div>
        <div class="mb-3 text-xs text-muted-foreground">
          共 {{ shops.length }} 家店铺 · 当前筛选 {{ rows.length }} 家 · 已选
          {{ selectedShops.length }} 家（跨筛选保留）<Button
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
          :scroll="{ x: view === 'default' ? 610 : 970 }"
          :row-selection="
            canConfig
              ? {
                  selectedRowKeys: selectedKeys,
                  preserveSelectedRowKeys: true,
                  onChange: (keys) => (selectedKeys = [...keys]),
                }
              : undefined
          "
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
            <template v-else-if="column.key === 'default'"
              ><Select
                v-if="canConfig"
                :value="record.defaultGroupId ?? undefined"
                :options="groupOptions(record.defaultGroupId)"
                :disabled="saving"
                placeholder="未配置"
                allow-clear
                class="w-48"
                size="small"
                @change="
                  (value) =>
                    setDefault(
                      record as Api.GroupMemberShop,
                      value as number | undefined,
                    )
                "
              /><span v-else>{{ record.defaultGroupName || '未配置' }}</span></template
            >
            <template v-else-if="column.key === 'defaultName'">{{
              record.defaultGroupName || '未配置'
            }}</template>
            <div
              v-else-if="column.key === 'month'"
              class="flex flex-wrap items-center gap-2"
            >
              <Select
                v-if="canConfig"
                :value="record.effectiveGroupId ?? undefined"
                :options="
                  groupOptions(record.effectiveGroupId, record.defaultGroupId)
                "
                :disabled="saving"
                placeholder="未配置"
                class="w-44"
                size="small"
                @change="
                  (value) =>
                    setMonth(
                      record as Api.GroupMemberShop,
                      value as number | undefined,
                    )
                "
              /><span v-else>{{ record.effectiveGroupName || '未配置' }}</span
              ><template v-if="isAdjusted(record as Api.GroupMemberShop)"
                ><Tag color="orange" class="!m-0">本月调整</Tag
                ><Button
                  v-if="canConfig"
                  size="small"
                  type="link"
                  class="!px-0"
                  :disabled="saving"
                  @click="setMonth(record as Api.GroupMemberShop)"
                  >恢复默认</Button
                ></template
              >
            </div>
            <template v-else>{{ text || '—' }}</template></template
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
    :shops="shops"
    @saved="changed"
  />
  <GroupMoveDialog
    v-model:open="moveOpen"
    :groups="groups"
    :month="month"
    :shops="selectedShops"
    :view="view"
    @saved="changed"
  />
</template>
