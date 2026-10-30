<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { GroupView } from '../config-model';

import { computed, ref, watch } from 'vue';

import dayjs from 'dayjs';
import {
  Alert,
  DatePicker,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Tag,
} from 'ant-design-vue';

import {
  saveEcProfitDefaultGroups,
  saveEcProfitMonthGroups,
} from '#/api/fdmcaiwu/ec-profit';

/**
 * 批量把店铺放进某个分组。
 * default：改默认分组，可选从某月起（之前已导入的月份保留原分组）或所有月份；
 * month：只改所选月份，或从该月起都改（同时改默认分组，以后导入的月份按新分组）。
 */
const props = defineProps<{
  groups: Api.Group[];
  /** 打开时预选的分组（表格里直接选了分组时带入） */
  initialGroupId?: number;
  month: string;
  open: boolean;
  shops: Api.GroupMemberShop[];
  view: GroupView;
}>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>();

type Scope = 'all' | 'from' | 'only';
const groupId = ref<number>();
const reason = ref('');
const scope = ref<Scope>('from');
const fromMonth = ref(dayjs().format('YYYY-MM'));
const saving = ref(false);
const error = ref('');
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    groupId.value = props.initialGroupId;
    reason.value = '';
    scope.value = 'from';
    fromMonth.value = props.view === 'month' ? props.month : dayjs().format('YYYY-MM');
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
/** 只改本月、且调到的正好是默认分组的店铺：本月调整会被取消，恢复默认 */
const backToDefault = computed(() =>
  props.view === 'month' && scope.value === 'only' && groupId.value
    ? props.shops.filter((shop) => shop.defaultGroupId === groupId.value).length
    : 0,
);
const hint = computed(() => {
  if (props.view === 'month' && scope.value === 'only') {
    return `只影响 ${props.month}，其他月份仍按默认分组。${backToDefault.value ? `其中 ${backToDefault.value} 家默认就在该组，会直接恢复默认。` : ''}`;
  }
  if (scope.value === 'all') {
    return '所有月份（包括已导入的历史月份）都按新的默认分组汇总；已单独调整过的月份仍按调整。';
  }
  return `${fromMonth.value} 及以后按新的默认分组（以后导入的月份也是）；之前已导入的月份保留原来的分组。`;
});

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
    const onlyMonth = props.view === 'month' && scope.value === 'only';
    let changed = 0;
    for (let index = 0; index < shopIds.length; index += 500) {
      const batch = shopIds.slice(index, index + 500);
      changed += onlyMonth
        ? await saveEcProfitMonthGroups({
            groupId: groupId.value,
            month: props.month,
            reason: reason.value.trim() || undefined,
            shopIds: batch,
          })
        : await saveEcProfitDefaultGroups({
            fromMonth: scope.value === 'all' ? undefined : fromMonth.value,
            groupId: groupId.value,
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
    :width="540"
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
      <FormItem label="生效范围">
        <RadioGroup v-if="view === 'month'" v-model:value="scope" :disabled="saving">
          <Radio value="from">{{ month }} 及以后（同时改默认分组）</Radio>
          <Radio value="only">只改 {{ month }}</Radio>
        </RadioGroup>
        <div v-else class="flex flex-wrap items-center gap-2">
          <RadioGroup v-model:value="scope" :disabled="saving">
            <Radio value="from">从</Radio>
          </RadioGroup>
          <DatePicker
            v-model:value="fromMonth"
            picker="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            :allow-clear="false"
            :disabled="saving || scope !== 'from'"
            size="small"
            class="w-36"
          />
          <span class="mr-3">起</span>
          <RadioGroup v-model:value="scope" :disabled="saving">
            <Radio value="all">所有月份</Radio>
          </RadioGroup>
        </div>
      </FormItem>
      <FormItem v-if="view === 'month' && scope === 'only'" label="调整原因（可选）">
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
      <Alert type="info" show-icon :message="hint" />
    </Form>
  </Modal>
</template>
