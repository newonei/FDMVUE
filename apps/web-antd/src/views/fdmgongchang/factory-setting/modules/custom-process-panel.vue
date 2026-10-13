<script setup lang="ts">
import type { FdmgongchangCustomProcess } from '#/api/fdmgongchang/factory';

import { computed, ref } from 'vue';

import { Button, Input, message, Modal, Select, Switch, Tag } from 'ant-design-vue';

import { saveCustomProcess } from '#/api/fdmgongchang/factory';

/**
 * 附加工序：打孔、全检、丝印等工厂自己的工序，不改变产品规格。
 * 挂在某个库存阶段之后：从这个阶段领、良品留在这个阶段，残次从这个阶段扣掉。
 * 建好后可以放进工艺路线和订单工艺，在工序库存里登记；只停用不删除，已下的单仍显示名称。
 */
const props = defineProps<{
  canEdit: boolean;
  list: FdmgongchangCustomProcess[];
  stages: Array<{ code: string; label: string }>;
}>();
const emit = defineEmits<{ changed: [] }>();

const editOpen = ref(false);
const saving = ref(false);
const error = ref('');
type Draft = Omit<FdmgongchangCustomProcess, 'remark'> & { remark: string };
const draft = ref<Draft>({ name: '', remark: '', stage: '' });
const stageOptions = computed(() => props.stages.map((s) => ({ label: s.label, value: s.code })));

function openEdit(item?: FdmgongchangCustomProcess) {
  draft.value = item
    ? { ...item, remark: item.remark ?? '' }
    : { name: '', remark: '', stage: props.stages[props.stages.length - 1]?.code ?? '', status: 0 };
  error.value = '';
  editOpen.value = true;
}

async function save() {
  error.value = '';
  if (!draft.value.name.trim()) {
    error.value = '请填写工序名称';
    return;
  }
  if (!draft.value.stage) {
    error.value = '请选择挂在哪个库存阶段之后';
    return;
  }
  saving.value = true;
  try {
    await saveCustomProcess({
      ...draft.value,
      name: draft.value.name.trim(),
      remark: draft.value.remark.trim() || undefined,
    });
    message.success('已保存附加工序');
    editOpen.value = false;
    emit('changed');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="m-0 text-sm font-semibold">
        附加工序<span class="ml-2 text-xs font-normal text-muted-foreground">打孔、全检等不改变规格的工序；挂在某个库存阶段之后，在那个阶段原地加工，残次从那个阶段扣掉</span>
      </h2>
      <Button v-if="canEdit" size="small" @click="openEdit()">＋ 新建附加工序</Button>
    </div>
    <p v-if="list.length === 0" class="m-0 text-xs text-muted-foreground">还没有附加工序。</p>
    <ul v-else class="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
      <li
        v-for="p in list"
        :key="p.id"
        class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
        :class="p.status === 1 ? 'opacity-60' : ''"
      >
        <span class="flex min-w-0 flex-col">
          <span class="flex items-center gap-2">
            <b>{{ p.name }}</b>
            <span class="text-xs text-muted-foreground">在{{ p.stageLabel }}之后</span>
            <Tag v-if="p.status === 1" class="m-0">停用</Tag>
          </span>
          <span v-if="p.remark" class="truncate text-xs text-muted-foreground">{{ p.remark }}</span>
        </span>
        <button v-if="canEdit" class="shrink-0 text-xs text-primary hover:underline" type="button" @click="openEdit(p)">编辑</button>
      </li>
    </ul>

    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :title="draft.id ? '编辑附加工序' : '新建附加工序'"
      ok-text="保存"
      @ok="save"
    >
      <div class="flex flex-col gap-3 text-sm">
        <label for="custom-process-name" class="flex flex-col gap-1 text-xs text-muted-foreground">
          工序名称
          <Input id="custom-process-name" v-model:value="draft.name" :maxlength="32" placeholder="例如 打孔、全检、丝印" />
        </label>
        <label for="custom-process-stage" class="flex flex-col gap-1 text-xs text-muted-foreground">
          挂在哪个库存阶段之后{{ draft.id ? '（建好后不能改）' : '' }}
          <Select
            id="custom-process-stage"
            v-model:value="draft.stage"
            :disabled="!!draft.id"
            :options="stageOptions"
            placeholder="选库存阶段"
          />
        </label>
        <label for="custom-process-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
          说明
          <Input id="custom-process-remark" v-model:value="draft.remark" :maxlength="255" placeholder="选填，例如 用哪台设备、适用哪些产品" />
        </label>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch :checked="draft.status !== 1" size="small" @change="(v) => (draft.status = v ? 0 : 1)" />
          启用（停用后不能再放进工艺、不能登记；已下的单不受影响）
        </label>
        <p class="m-0 text-xs text-muted-foreground">计件单价在「计价项目」里给这道工序加工序计件项目。</p>
        <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
      </div>
    </Modal>
  </section>
</template>
