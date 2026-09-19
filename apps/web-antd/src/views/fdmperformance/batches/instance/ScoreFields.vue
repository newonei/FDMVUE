<script lang="ts" setup>
import type { ScoreRow } from './score-model';
import { computed } from 'vue';
import { InputNumber, Textarea } from 'ant-design-vue';

const props = defineProps<{
  row: ScoreRow;
  selfEditable: boolean;
  supervisorEditable: boolean;
  managerEditable: boolean;
  managerEnabled: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:row': [row: ScoreRow] }>();
const stages = computed(() => [
  {
    key: 'selfScore' as const,
    comment: 'selfComment' as const,
    label: '员工自评（50%）',
    editable: props.selfEditable,
  },
  {
    key: 'supervisorScore' as const,
    comment: 'supervisorComment' as const,
    label: props.managerEnabled ? '主管评分（40%）' : '主管评分（50%）',
    editable: props.supervisorEditable,
  },
  ...(props.managerEnabled
    ? [
        {
          key: 'managerScore' as const,
          comment: 'managerComment' as const,
          label: '上级评分（10%）',
          editable: props.managerEditable,
        },
      ]
    : []),
]);
</script>

<template>
  <div class="score-stages">
    <section
      v-for="stage in stages"
      :key="stage.key"
      class="score-stage"
      :class="{ editable: stage.editable }"
    >
      <label
        class="stage-label"
        :for="
          stage.editable ? `performance-score-${row.indicator.id}` : undefined
        "
        >{{ stage.label }}</label
      >
      <template v-if="stage.editable">
        <InputNumber
          :id="`performance-score-${row.indicator.id}`"
          :value="row[stage.key] ?? undefined"
          :disabled="disabled"
          :max="100"
          :min="0"
          class="score-input"
          addon-after="分"
          placeholder="必填，可填 0"
          @update:value="
            (value) =>
              emit('update:row', {
                ...row,
                [stage.key]: value == null ? undefined : Number(value),
              })
          "
        />
        <Textarea
          :value="row[stage.comment]"
          :disabled="disabled"
          :aria-label="`${row.indicator.name || '指标'} ${stage.label}说明`"
          :rows="2"
          placeholder="填写事实与评分说明"
          @update:value="
            (value) => emit('update:row', { ...row, [stage.comment]: value })
          "
        />
      </template>
      <template v-else
        ><strong>{{ row[stage.key] ?? '—' }}</strong
        ><span class="readonly-comment">{{
          row[stage.comment] || '暂无说明'
        }}</span></template
      >
    </section>
  </div>
</template>

<style scoped>
.score-stages {
  display: flex;
  gap: 14px;
}
.score-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 130px;
}
.stage-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.editable .stage-label {
  color: #1677ff;
}
.score-input {
  width: 100%;
}
.readonly-comment {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .score-stages {
    flex-direction: column;
  }
  .score-stage {
    min-width: 0;
  }
}
</style>
