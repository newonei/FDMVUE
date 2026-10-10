<script setup lang="ts">
import type { FdmgongchangFactoryApi as Api } from '#/api/fdmgongchang/factory';

import { computed, reactive, ref, watch } from 'vue';

import { Alert, Checkbox, Input, Modal, Radio } from 'ant-design-vue';

import { saveWorkers } from '#/api/fdmgongchang/factory';

/**
 * 分配岗位：单人时带出现有岗位；批量时整体覆盖所选人员的岗位、班组、计薪方式。
 */
const props = defineProps<{ options: Api.WorkerOptions; workers: Api.Worker[] }>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const form = reactive({
  posts: [] as string[],
  remark: '',
  status: 0,
  team: '',
  wageMode: undefined as string | undefined,
});
const submitting = ref(false);
const error = ref('');

const processPosts = computed(() =>
  props.options.posts.filter((p) => p.process),
);
const managePosts = computed(() =>
  props.options.posts.filter((p) => !p.process),
);
const batch = computed(() => props.workers.length > 1);
const title = computed(() =>
  batch.value
    ? `批量分配岗位（${props.workers.length} 人）`
    : `分配岗位 · ${props.workers[0]?.nickname ?? ''}`,
);

watch(open, (value) => {
  if (!value) return;
  error.value = '';
  const one = props.workers.length === 1 ? props.workers[0] : undefined;
  Object.assign(form, {
    posts: one ? [...one.posts] : [],
    remark: one?.remark ?? '',
    status: one?.status ?? 0,
    team: one?.team ?? '',
    wageMode: one?.wageMode ?? undefined,
  });
});

async function submit() {
  if (props.workers.length === 0) return;
  if (form.posts.length === 0 && form.status === 0) {
    error.value = '在岗人员请至少选一个岗位；不再做工厂工作的人请选「停用」。';
    return;
  }
  submitting.value = true;
  try {
    await saveWorkers({
      posts: form.posts,
      remark: form.remark.trim() || undefined,
      status: form.status,
      team: form.team.trim() || undefined,
      userIds: props.workers.map((w) => w.userId),
      wageMode: form.wageMode,
    });
    emit(
      'saved',
      batch.value
        ? `已给 ${props.workers.length} 人分配岗位`
        : `已保存 ${props.workers[0]?.nickname} 的岗位`,
    );
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
    :title="title"
    :width="620"
    ok-text="保存"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 text-sm">
      <Alert
        v-if="batch"
        message="批量保存会覆盖所选人员原来的岗位、班组、计薪方式和备注。"
        show-icon
        type="info"
      />
      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">
          工序岗位<span class="ml-2 text-xs font-normal text-muted-foreground">能开哪道工序的工序单</span>
        </h3>
        <Checkbox.Group v-model:value="form.posts" class="flex flex-wrap gap-y-2">
          <Checkbox v-for="p in processPosts" :key="p.code" :value="p.code">
            {{ p.label }}
          </Checkbox>
        </Checkbox.Group>
      </section>
      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">
          管理岗位<span class="ml-2 text-xs font-normal text-muted-foreground">班组长可以替本班组成员开单</span>
        </h3>
        <Checkbox.Group v-model:value="form.posts" class="flex flex-wrap gap-y-2">
          <Checkbox v-for="p in managePosts" :key="p.code" :value="p.code">
            {{ p.label }}
          </Checkbox>
        </Checkbox.Group>
      </section>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="worker-team" class="flex flex-col gap-1 text-xs text-muted-foreground">
          班组
          <Input id="worker-team" v-model:value="form.team" :maxlength="64" placeholder="例如 开片一组" />
        </label>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          计薪方式
          <Radio.Group v-model:value="form.wageMode" size="small" button-style="solid">
            <Radio.Button v-for="m in options.wageModes" :key="m.code" :value="m.code">
              {{ m.label }}
            </Radio.Button>
          </Radio.Group>
        </div>
        <label for="worker-remark" class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          技能备注
          <Input
            id="worker-remark"
            v-model:value="form.remark"
            :maxlength="255"
            placeholder="选填，例如 只会开 6mm 以下、会操作 2 号压花机；AI 排单时会参考"
          />
        </label>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          状态
          <Radio.Group v-model:value="form.status" size="small">
            <Radio :value="0">在岗</Radio>
            <Radio :value="1">停用</Radio>
          </Radio.Group>
        </div>
      </div>
      <Alert v-if="error" :message="error" show-icon type="error" />
    </div>
  </Modal>
</template>
