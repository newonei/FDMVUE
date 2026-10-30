<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  message,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  getStageStockSetting,
  saveStageStockSetting,
} from '#/api/fdmgongchang/stage-stock';

/** 基础设置：各工序可以从哪些库存领料（第一个为默认）、各阶段默认库位，以及字典和编码规则说明。 */
const props = defineProps<{ options: Api.Options }>();
const emit = defineEmits<{ saved: [] }>();

const { hasAccessByCodes } = useAccess();
const canEdit = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:setting']),
);

const loading = ref(true);
const saving = ref(false);
const sources = reactive<Record<string, string[]>>({});
const defaults = reactive<Record<string, string>>({});
const locations = reactive<Record<string, string>>({});

const stageLabel = (code: string) =>
  props.options.stages.find((s) => s.code === code)?.label ?? code;

onMounted(async () => {
  try {
    const setting = await getStageStockSetting();
    for (const p of setting.processes) {
      sources[p.process] = [...p.sources];
      defaults[p.process] = p.sources[0] ?? '';
    }
    for (const s of setting.stages) locations[s.stage] = s.defaultLocation;
  } finally {
    loading.value = false;
  }
});

function onSourcesChange(process: string, value: string[]) {
  sources[process] = value;
  if (!value.includes(defaults[process] ?? ''))
    defaults[process] = value[0] ?? '';
}

async function save() {
  const processes = props.options.processes.map((p) => {
    const chosen = sources[p.code] ?? [];
    const first = defaults[p.code];
    const ordered = p.allowedSources.filter((s) => chosen.includes(s));
    return {
      process: p.code,
      sources:
        first && ordered.includes(first)
          ? [first, ...ordered.filter((s) => s !== first)]
          : ordered,
    };
  });
  const empty = processes.find((p) => p.sources.length === 0);
  if (empty) {
    message.warning(
      `${props.options.processes.find((p) => p.code === empty.process)?.label}至少保留一个领料来源`,
    );
    return;
  }
  const blank = props.options.stages.find(
    (s) => !(locations[s.code] ?? '').trim(),
  );
  if (blank) {
    message.warning(`请填写${blank.label}的默认库位`);
    return;
  }
  saving.value = true;
  try {
    await saveStageStockSetting({
      processes,
      stages: props.options.stages.map((s) => ({
        defaultLocation: locations[s.code]!.trim(),
        stage: s.code,
      })),
    });
    message.success('基础设置已保存');
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Spin :spinning="loading">
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="m-0 text-sm font-semibold">
            工序与领料来源<span
              class="ml-2 text-xs font-normal text-muted-foreground"
              >只能向上游领料；跳过工序时可以勾选更早的阶段</span>
          </h3>
          <Button
            v-if="canEdit"
            :loading="saving"
            size="small"
            type="primary"
            @click="save"
          >
            保存设置
          </Button>
        </div>
        <div class="overflow-x-auto rounded-md border border-border">
          <table class="w-full border-collapse text-sm">
            <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">工序</th>
                <th class="px-3 py-2 font-medium">可领料的库存</th>
                <th class="px-3 py-2 font-medium">默认来源</th>
                <th class="px-3 py-2 font-medium">产出到</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in options.processes"
                :key="p.code"
                class="border-t border-border"
              >
                <td class="whitespace-nowrap px-3 py-2">{{ p.label }}</td>
                <td class="px-3 py-2">
                  <Checkbox.Group
                    :value="sources[p.code]"
                    :disabled="!canEdit"
                    :options="
                      p.allowedSources.map((s) => ({
                        label: stageLabel(s),
                        value: s,
                      }))
                    "
                    @change="(v) => onSourcesChange(p.code, v as string[])"
                  />
                </td>
                <td class="px-3 py-2">
                  <Select
                    :id="`setting-default-${p.code}`"
                    v-model:value="defaults[p.code]"
                    :disabled="!canEdit"
                    :options="
                      (sources[p.code] ?? []).map((s) => ({
                        label: stageLabel(s),
                        value: s,
                      }))
                    "
                    class="w-32"
                    size="small"
                  />
                </td>
                <td class="whitespace-nowrap px-3 py-2">
                  {{ stageLabel(p.outputStage) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">各阶段默认库位</h3>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label
            v-for="s in options.stages"
            :key="s.code"
            :for="`setting-location-${s.code}`"
            class="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            {{ s.label }}（{{ s.unit }}）
            <Input
              :id="`setting-location-${s.code}`"
              v-model:value="locations[s.code]"
              :disabled="!canEdit"
              :maxlength="64"
              size="small"
            />
          </label>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-semibold">编码规则</h3>
          <div
            class="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 text-xs"
          >
            <div>前缀 - 材质 [- 配方] - 颜色 - 长X宽X厚 [- 纹路] [- 图案]</div>
            <div class="text-muted-foreground">
              板材、片材一个色码；贴合之后是正面色码 +
              反面色码。属性完全相同就是同一个编码，不会重复建料。
            </div>
            <div class="font-mono">BC-TPE-REC001-DX-190X130X0.3</div>
            <div class="font-mono">YH-TPE-DXHS-185X63X0.6-BKFH</div>
            <div class="font-mono">DK-TPE-DXHS-183X61X0.6-BKFH-TW</div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-semibold">选项从哪里来</h3>
          <Alert type="info" show-icon>
            <template #message>
              <ul class="m-0 flex list-disc flex-col gap-1 pl-4 text-xs">
                <li>
                  颜色、材质：系统管理 →
                  字典管理（fdm_color、material_type），和 SKU 编码共用
                </li>
                <li>
                  压花纹路、雕刻图案：系统管理 →
                  字典管理（fdm_gongchang_texture、fdm_gongchang_pattern），value
                  作为编码段
                </li>
                <li>原材料、配方版本：财务部门 → 原材料价格、配方标准</li>
              </ul>
            </template>
          </Alert>
          <div class="flex flex-wrap gap-1 text-xs">
            <span class="text-muted-foreground">压花纹路</span>
            <Tag v-for="t in options.textures" :key="t.value">
              {{ t.label }} {{ t.value }}
            </Tag>
            <span v-if="options.textures.length === 0" class="text-warning">还没有，请先添加</span>
          </div>
          <div class="flex flex-wrap gap-1 text-xs">
            <span class="text-muted-foreground">雕刻图案</span>
            <Tag v-for="t in options.patterns" :key="t.value">
              {{ t.label }} {{ t.value }}
            </Tag>
            <span v-if="options.patterns.length === 0" class="text-warning">还没有，请先添加</span>
          </div>
        </div>
      </section>
    </div>
  </Spin>
</template>
