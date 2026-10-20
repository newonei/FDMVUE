<script lang="ts" setup>
import type { JixiaoApi } from '#/api/fdmperformance';

import type { ScoreRow } from './score-model';
import { computed } from 'vue';
import { InputNumber, Textarea } from 'ant-design-vue';

import {
  effectiveScoreWeights,
  defaultScoreWeights,
  formatWeight,
  managerLevelLabel,
} from '../../shared/score-weights';

const props = defineProps<{
  row: ScoreRow;
  selfEditable: boolean;
  supervisorEditable: boolean;
  managerEditable: boolean;
  managerEnabled: boolean;
  /** 参与评分的上级层级数。 */
  managerLevels?: number;
  /** 当前待评分的上级层级，从 1 开始。 */
  managerEditLevel?: number;
  /** 本次考核实际比重。 */
  weights?: JixiaoApi.ScoreWeights;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:row': [row: ScoreRow] }>();

interface Stage {
  comment?: string;
  commentKey?: 'managerComment' | 'selfComment' | 'supervisorComment';
  editable: boolean;
  id: string;
  label: string;
  scoreKey?: 'managerScore' | 'selfScore' | 'supervisorScore';
  value?: null | number;
}

const levels = computed(() =>
  props.managerEnabled ? Math.max(props.managerLevels ?? 1, 1) : 0,
);
const weights = computed(
  () =>
    props.weights ?? effectiveScoreWeights(defaultScoreWeights(), levels.value),
);
const stages = computed<Stage[]>(() => {
  const result: Stage[] = [
    {
      id: 'self',
      scoreKey: 'selfScore',
      commentKey: 'selfComment',
      label: `员工自评（${formatWeight(weights.value.selfWeight)}%）`,
      editable: props.selfEditable,
      value: props.row.selfScore,
      comment: props.row.selfComment,
    },
    {
      id: 'supervisor',
      scoreKey: 'supervisorScore',
      commentKey: 'supervisorComment',
      label: `主管评分（${formatWeight(weights.value.supervisorWeight)}%）`,
      editable: props.supervisorEditable,
      value: props.row.supervisorScore,
      comment: props.row.supervisorComment,
    },
  ];
  const editLevel = props.managerEditLevel ?? 1;
  for (let level = 1; level <= levels.value; level++) {
    const editable = props.managerEditable && level === editLevel;
    const saved = props.row.managerScores?.[level - 1];
    const weight = weights.value.managerWeights[level - 1];
    const name =
      levels.value > 1 ? managerLevelLabel(level).replace('上级', '') : '';
    result.push({
      id: `manager-${level}`,
      label: `上级评分${name ? `·${name}` : ''}（${formatWeight(weight)}%）`,
      editable,
      ...(editable
        ? {
            scoreKey: 'managerScore' as const,
            commentKey: 'managerComment' as const,
            value: props.row.managerScore,
            comment: props.row.managerComment,
          }
        : { value: saved?.score, comment: saved?.comment }),
    });
  }
  return result;
});
</script>

<template>
  <div class="score-stages">
    <section
      v-for="stage in stages"
      :key="stage.id"
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
      <template v-if="stage.editable && stage.scoreKey && stage.commentKey">
        <InputNumber
          :id="`performance-score-${row.indicator.id}`"
          :value="stage.value ?? undefined"
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
                [stage.scoreKey!]: value == null ? undefined : Number(value),
              })
          "
        />
        <Textarea
          :value="stage.comment"
          :disabled="disabled"
          :aria-label="`${row.indicator.name || '指标'} ${stage.label}说明`"
          :rows="2"
          placeholder="填写事实与评分说明"
          @update:value="
            (value) => emit('update:row', { ...row, [stage.commentKey!]: value })
          "
        />
      </template>
      <template v-else
        ><strong>{{ stage.value ?? '—' }}</strong
        ><span class="readonly-comment">{{
          stage.comment || '暂无说明'
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
