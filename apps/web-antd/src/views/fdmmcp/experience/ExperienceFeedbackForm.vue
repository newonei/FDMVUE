<script lang="ts" setup>
import type { FeedbackOutcome } from '#/api/fdmmcp/experience';

import { ref } from 'vue';

import { Button, Input, Radio } from 'ant-design-vue';

const props = defineProps<{
  busy: boolean;
  note?: null | string;
  outcome?: FeedbackOutcome | null;
}>();
const emit = defineEmits<{ submit: [FeedbackOutcome, string] }>();
const outcome = ref(props.outcome);
const note = ref(props.note ?? '');
</script>
<template>
  <form
    class="feedback-form"
    @submit.prevent="outcome && emit('submit', outcome, note.trim())"
  >
    <strong>这条经验用下来怎么样？</strong>
    <Radio.Group v-model:value="outcome" aria-label="使用结果" :disabled="busy">
      <Radio value="resolved">已解决</Radio>
      <Radio value="needs-detail">未解决，需补充</Radio>
      <Radio value="outdated">已过时</Radio>
    </Radio.Group>
    <Input.TextArea
      v-model:value="note"
      aria-label="反馈说明"
      placeholder="补充给作者的说明（选填）"
      :rows="2"
      :maxlength="1000"
      :disabled="busy"
    />
    <Button html-type="submit" :disabled="busy || !outcome">
      {{ props.outcome ? '更新反馈' : '提交使用反馈' }}
    </Button>
  </form>
</template>
<style scoped>
.feedback-form {
  display: grid;
  gap: 8px;
  margin-block: 12px;
}

.feedback-form .ant-btn {
  justify-self: start;
}
</style>
