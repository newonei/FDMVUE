<script setup lang="ts">
import type { FdmgongchangFactoryApi as Api } from '#/api/fdmgongchang/factory';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Input, Modal, Spin } from 'ant-design-vue';

import { addWorkers, searchWorkerCandidates } from '#/api/fdmgongchang/factory';

/**
 * 添加人员：按姓名搜全部系统用户，把不在本厂钉钉部门下的人加进本厂。
 * 加进来后是待分配，再给他分配岗位。已经在别的工厂的人不能选。
 */
const props = defineProps<{ factoryId: null | number; factoryName?: string }>();
const emit = defineEmits<{ added: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const keyword = ref('');
const results = ref<Api.Candidate[]>([]);
const picked = ref<Api.Candidate[]>([]);
const searching = ref(false);
const submitting = ref(false);
const searched = ref(false);

watch(open, (value) => {
  if (!value) return;
  keyword.value = '';
  results.value = [];
  picked.value = [];
  searched.value = false;
});

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
watch(keyword, (value) => {
  clearTimeout(timer);
  const k = value.trim();
  if (!k) {
    results.value = [];
    searched.value = false;
    return;
  }
  timer = setTimeout(async () => {
    const mine = ++seq;
    searching.value = true;
    try {
      const list = await searchWorkerCandidates(k);
      if (mine === seq) {
        results.value = list;
        searched.value = true;
      }
    } finally {
      if (mine === seq) searching.value = false;
    }
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

const pickedIds = computed(() => new Set(picked.value.map((p) => p.userId)));
const inThisFactory = (c: Api.Candidate) =>
  c.factoryId !== null && c.factoryId !== undefined && c.factoryId === props.factoryId;
const inOtherFactory = (c: Api.Candidate) =>
  c.factoryId !== null && c.factoryId !== undefined && c.factoryId !== props.factoryId;

function toggle(c: Api.Candidate) {
  if (inThisFactory(c) || inOtherFactory(c)) return;
  picked.value = pickedIds.value.has(c.userId)
    ? picked.value.filter((p) => p.userId !== c.userId)
    : [...picked.value, c];
}

async function submit() {
  if (picked.value.length === 0) return;
  submitting.value = true;
  try {
    await addWorkers(picked.value.map((p) => p.userId));
    emit('added', `已添加 ${picked.value.length} 人，请给他们分配岗位`);
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: picked.length === 0 }"
    :ok-text="picked.length > 0 ? `添加 ${picked.length} 人` : '添加'"
    :title="`添加人员到${factoryName ?? '本厂'}`"
    :width="560"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <Alert
        message="不在本厂钉钉部门下的人（例如借调、总部的人）可以在这里加进来。系统里所有用户都能搜到，对方需要用钉钉登录过一次。"
        show-icon
        type="info"
      />
      <Input
        id="worker-add-keyword"
        v-model:value="keyword"
        allow-clear
        placeholder="输入姓名搜索"
      />
      <div v-if="picked.length > 0" class="flex flex-wrap gap-1">
        <button
          v-for="p in picked"
          :key="p.userId"
          class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
          type="button"
          @click="toggle(p)"
        >
          {{ p.nickname }} ×
        </button>
      </div>
      <Spin :spinning="searching">
        <ul class="m-0 flex max-h-72 list-none flex-col overflow-auto p-0">
          <li v-for="c in results" :key="c.userId">
            <button
              :aria-pressed="pickedIds.has(c.userId)"
              class="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left" :class="[
                inThisFactory(c) || inOtherFactory(c)
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-accent',
                pickedIds.has(c.userId) ? 'bg-primary/10' : '',
              ]"
              :disabled="inThisFactory(c) || inOtherFactory(c)"
              type="button"
              @click="toggle(c)"
            >
              <span class="flex flex-col">
                <span>{{ c.nickname }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ [c.deptName, c.mobile].filter(Boolean).join(' · ') || '没有部门' }}
                </span>
              </span>
              <span class="shrink-0 text-xs">
                <span v-if="inThisFactory(c)" class="text-muted-foreground">已在本厂</span>
                <span v-else-if="inOtherFactory(c)" class="text-warning">在{{ c.factoryName }}</span>
                <span v-else-if="pickedIds.has(c.userId)" class="text-primary">已选</span>
              </span>
            </button>
          </li>
        </ul>
        <p
          v-if="searched && results.length === 0"
          class="m-0 py-4 text-center text-xs text-muted-foreground"
        >
          没有找到「{{ keyword.trim() }}」，请确认对方已经用钉钉登录过
        </p>
      </Spin>
    </div>
  </Modal>
</template>
