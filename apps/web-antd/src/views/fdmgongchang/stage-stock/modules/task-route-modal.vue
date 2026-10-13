<script setup lang="ts">
import type { RouteDraft } from '../../production-order/shared';
import type { AuxUsageDraft } from '../../shared/aux';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { ref, watch } from 'vue';

import { Modal } from 'ant-design-vue';

import {
  saveTaskRoute,
  searchStageAuxProducts,
} from '#/api/fdmgongchang/stage-stock';

import RoutePicker from '../../production-order/modules/route-picker.vue';
import { routeProblem, sortSteps } from '../../production-order/shared';
import { auxPayload, auxProblem, toAuxDrafts } from '../../shared/aux';
import AuxUsageEditor from '../../shared/aux-usage-editor.vue';

/**
 * 外贸自制任务的工艺：定好这个产品要走哪些工序，合同生产进度按最后一道报产出回写，出货从最后一道的库存出。
 * 不设时沿用旧规则：包装报产出时回写，从已包装成品出货。辅料用量定了之后，开工序单时按用量带出领用数；
 * 采购单关联本合同买的定制辅料只能给这个合同的工序单领。
 */
const props = defineProps<{ options?: RouteApi.Options; task?: Api.MakeTask }>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { required: true });

const draft = ref<RouteDraft>({ steps: [] });
const aux = ref<AuxUsageDraft[]>([]);
const saving = ref(false);
const error = ref('');

watch(open, (value) => {
  if (!value) return;
  error.value = '';
  aux.value = toAuxDrafts(props.task?.auxUsages);
  draft.value = {
    routeId: undefined,
    steps: props.options ? sortSteps(props.task?.processes ?? [], props.options.processes) : (props.task?.processes ?? []),
  };
});

async function save(clear = false) {
  error.value = '';
  if (!props.task) return;
  if (!clear) {
    const problem =
      (props.options ? routeProblem(draft.value.steps, props.options.processes) : '') || auxProblem(aux.value);
    if (problem) {
      error.value = problem;
      return;
    }
  }
  saving.value = true;
  try {
    await saveTaskRoute({
      assignmentId: props.task.assignmentId,
      auxUsages: clear ? [] : auxPayload(aux.value),
      contractId: props.task.contractId,
      routeId: clear ? undefined : draft.value.routeId,
      steps: clear ? [] : draft.value.steps,
    });
    open.value = false;
    emit('saved', clear ? '已清除工艺，按包装回写合同进度' : '已保存这个任务的工艺');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="saving"
    :width="720"
    ok-text="保存工艺"
    :title="`设置工艺 · ${task?.contractCode ?? ''} ${task?.productName ?? ''}`"
    @ok="save()"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p class="m-0 text-xs text-muted-foreground">
        定好这个产品要走哪些工序：合同生产进度按最后一道报产出回写，出货从最后一道的库存出。
        不设时按包装回写、从已包装成品出货。
      </p>
      <RoutePicker id="task-route" v-model="draft" :options="options" />
      <AuxUsageEditor id="task-route" v-model="aux" :options="options" :search="searchStageAuxProducts" :steps="draft.steps" />
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
      <button
        v-if="(task?.processes ?? []).length > 0"
        class="self-start text-xs text-destructive hover:underline"
        type="button"
        @click="save(true)"
      >
        清除工艺（回到按包装回写）
      </button>
    </div>
  </Modal>
</template>
