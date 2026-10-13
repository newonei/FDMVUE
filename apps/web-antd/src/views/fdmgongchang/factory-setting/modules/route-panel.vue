<script setup lang="ts">
import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';

import { computed, onMounted, ref } from 'vue';

import { Button, Empty, Input, message, Modal, Popconfirm, Spin, Switch, Tag } from 'ant-design-vue';

import {
  deleteFactoryRoute,
  getFactoryRoutes,
  saveFactoryRoute,
} from '#/api/fdmgongchang/factory';

/**
 * 工艺路线：本厂常用的工序组合，例如「双层雕刻垫」「单层散装（不包装）」。
 * 下单人向工厂下单时先选一条，再按产品勾掉或加回工序；改路线不影响已经下的单。
 * 工序按生产链顺序排列，跳过工序后接不上（下一道领不到上一道的产出）时保存会提示。
 */
const props = defineProps<{
  canEdit: boolean;
  processes: Array<{ code: string; enabled: boolean; label: string }>;
}>();

const routes = ref<RouteApi.Route[]>([]);
const loading = ref(false);
const loadError = ref(false);
const editOpen = ref(false);
const saving = ref(false);
type Draft = Omit<RouteApi.Route, 'remark'> & { remark: string };
const draft = ref<Draft>({ name: '', remark: '', steps: [] });
const error = ref('');

const labelOf = (code: string) => props.processes.find((p) => p.code === code)?.label ?? code;
const enabledProcesses = computed(() => props.processes.filter((p) => p.enabled));

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    routes.value = await getFactoryRoutes();
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openEdit(route?: RouteApi.Route) {
  draft.value = route
    ? { ...route, remark: route.remark ?? '', steps: [...route.steps] }
    : { name: '', remark: '', status: 0, steps: [] };
  error.value = '';
  editOpen.value = true;
}

function toggle(code: string) {
  const steps = draft.value.steps.includes(code)
    ? draft.value.steps.filter((s) => s !== code)
    : [...draft.value.steps, code];
  draft.value.steps = props.processes.map((p) => p.code).filter((c) => steps.includes(c));
}

async function save() {
  error.value = '';
  if (!draft.value.name.trim()) {
    error.value = '请填写路线名称';
    return;
  }
  if (draft.value.steps.length === 0) {
    error.value = '请至少选一道工序';
    return;
  }
  saving.value = true;
  try {
    await saveFactoryRoute({
      ...draft.value,
      name: draft.value.name.trim(),
      remark: draft.value.remark.trim() || undefined,
    });
    message.success('已保存工艺路线');
    editOpen.value = false;
    await load();
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}

async function remove(route: RouteApi.Route) {
  if (!route.id) return;
  try {
    await deleteFactoryRoute(route.id);
    message.success('已删除');
    await load();
  } catch {
    // 后端错误已由全局提示展示
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="m-0 text-sm font-semibold">
        工艺路线<span class="ml-2 text-xs font-normal text-muted-foreground">本厂常用的工序组合；下单人选一条后还可以按产品勾掉或加回工序，改路线不影响已经下的单</span>
      </h2>
      <Button v-if="canEdit" size="small" type="primary" @click="openEdit()">＋ 新建路线</Button>
    </div>

    <Spin :spinning="loading">
      <div v-if="loadError" class="py-6 text-center text-sm text-muted-foreground">
        工艺路线没有加载出来。
        <Button size="small" type="link" @click="load">重试</Button>
      </div>
      <Empty v-else-if="routes.length === 0 && !loading" description="还没有工艺路线">
        <template v-if="canEdit" #default>
          <Button size="small" @click="openEdit()">新建第一条路线</Button>
        </template>
      </Empty>
      <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="r in routes"
          :key="r.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex flex-wrap items-center gap-2">
              <b class="text-sm">{{ r.name }}</b>
              <Tag v-if="r.status === 1" class="m-0">停用</Tag>
              <Tag v-else-if="r.invalid" class="m-0" color="orange">含本厂已停用的工序，下单时不显示</Tag>
            </span>
            <span class="flex flex-wrap items-center gap-1 text-xs">
              <template v-for="(code, index) in r.steps" :key="code">
                <span v-if="index > 0" class="text-muted-foreground" aria-hidden="true">›</span>
                <span class="rounded bg-primary/10 px-1.5 leading-5 text-primary">{{ labelOf(code) }}</span>
              </template>
            </span>
            <span v-if="r.remark" class="text-xs text-muted-foreground">{{ r.remark }}</span>
          </div>
          <span v-if="canEdit" class="inline-flex gap-3 text-xs">
            <button class="text-primary hover:underline" type="button" @click="openEdit(r)">编辑</button>
            <Popconfirm :title="`删除「${r.name}」？已经下的单不受影响`" ok-text="删除" @confirm="remove(r)">
              <button class="text-destructive hover:underline" type="button">删除</button>
            </Popconfirm>
          </span>
        </li>
      </ul>
    </Spin>

    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :title="draft.id ? '编辑工艺路线' : '新建工艺路线'"
      ok-text="保存"
      @ok="save"
    >
      <div class="flex flex-col gap-3 text-sm">
        <label for="route-name" class="flex flex-col gap-1 text-xs text-muted-foreground">
          路线名称
          <Input id="route-name" v-model:value="draft.name" :maxlength="64" placeholder="例如 双层雕刻垫、单层散装（不包装）" />
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">要走的工序（按生产链顺序，点一下选中或取消）</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="路线工序">
            <button
              v-for="p in enabledProcesses"
              :key="p.code"
              type="button"
              class="rounded-md border px-2 leading-7"
              :class="draft.steps.includes(p.code) ? 'border-primary bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground'"
              :aria-pressed="draft.steps.includes(p.code)"
              @click="toggle(p.code)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <label for="route-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
          说明
          <Input id="route-remark" v-model:value="draft.remark" :maxlength="255" placeholder="选填，例如 适用哪些产品" />
        </label>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            :checked="draft.status !== 1"
            size="small"
            @change="(v) => (draft.status = v ? 0 : 1)"
          />
          启用（停用后下单时不再显示）
        </label>
        <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
      </div>
    </Modal>
  </section>
</template>
