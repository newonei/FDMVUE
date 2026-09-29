<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { GroupView } from '../config-model';

import { computed, ref, watch } from 'vue';

import { Alert, Form, FormItem, Input, message, Modal, Select, Tag } from 'ant-design-vue';

import {
  saveEcProfitDefaultGroups,
  saveEcProfitMonthGroups,
} from '#/api/fdmcaiwu/ec-profit';

/**
 * 批量把店铺放进某个分组。
 * default：改默认分组（所有月份）；month：只改所选月份，其他月份仍按默认分组。
 */
const props = defineProps<{
  groups: Api.Group[];
  month: string;
  open: boolean;
  shops: Api.GroupMemberShop[];
  view: GroupView;
}>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>();

const groupId = ref<number>();
const reason = ref('');
const saving = ref(false);
const error = ref('');
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    groupId.value = undefined;
    reason.value = '';
    error.value = '';
  },
);
const options = computed(() =>
  props.groups
    .filter((group) => group.enabled)
    .map((group) => ({ label: group.name, value: group.id })),
);
const title = computed(() =>
  props.view === 'default'
    ? `设置默认分组（${props.shops.length} 家店铺）`
    : `${props.month} 调整分组（${props.shops.length} 家店铺）`,
);
/** 调到的正好是默认分组的店铺：本月调整会被取消，恢复默认 */
const backToDefault = computed(() =>
  props.view === 'month' && groupId.value
    ? props.shops.filter((shop) => shop.defaultGroupId === groupId.value).length
    : 0,
);

async function save() {
  if (saving.value) return;
  if (!groupId.value) {
    error.value = '请选择分组';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const shopIds = props.shops.map((shop) => shop.shopId);
    let changed = 0;
    for (let index = 0; index < shopIds.length; index += 500) {
      const batch = shopIds.slice(index, index + 500);
      changed +=
        props.view === 'default'
          ? await saveEcProfitDefaultGroups({ groupId: groupId.value, shopIds: batch })
          : await saveEcProfitMonthGroups({
              groupId: groupId.value,
              month: props.month,
              reason: reason.value.trim() || undefined,
              shopIds: batch,
            });
    }
    message.success(changed ? `已调整 ${changed} 家店铺` : '没有需要调整的店铺');
    emit('update:open', false);
    emit('saved');
  } catch {
    // 请求层已提示具体原因；保留弹窗方便重试
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :width="520"
    :confirm-loading="saving"
    :mask-closable="!saving"
    ok-text="保存"
    @cancel="emit('update:open', false)"
    @ok="save"
  >
    <Form layout="vertical" class="pt-3">
      <FormItem
        :label="view === 'default' ? '默认分组' : `${month} 归到`"
        required
        :validate-status="error ? 'error' : undefined"
        :help="error || undefined"
      >
        <Select
          v-model:value="groupId"
          :options="options"
          :disabled="saving"
          placeholder="选择分组"
          show-search
          option-filter-prop="label"
        />
      </FormItem>
      <FormItem v-if="view === 'month'" label="调整原因（可选）">
        <Input
          v-model:value="reason"
          :maxlength="500"
          :disabled="saving"
          placeholder="例如：张三请假，本月由李四负责"
        />
      </FormItem>
      <div class="mb-3 max-h-28 overflow-auto">
        <Tag v-for="shop in shops" :key="shop.shopId" class="!mb-1">{{
          shop.shopName
        }}</Tag>
      </div>
      <Alert
        type="info"
        show-icon
        :message="
          view === 'default'
            ? '默认分组对所有月份生效；已单独调整过的月份仍按调整。'
            : `只影响 ${month}，其他月份仍按默认分组。${backToDefault ? `其中 ${backToDefault} 家默认就在该组，会直接恢复默认。` : ''}`
        "
      />
    </Form>
  </Modal>
</template>
