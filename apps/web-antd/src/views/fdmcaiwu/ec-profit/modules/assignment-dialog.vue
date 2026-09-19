<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  Alert,
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import {
  applyShopAssignments,
  previewShopAssignments,
} from '#/api/fdmcaiwu/ec-profit';
import {
  assignmentApply,
  assignmentLabel,
  assignmentRequest,
} from '../config-model';

const props = defineProps<{
  open: boolean;
  month: string;
  shops: Api.AssignmentShop[];
  groups: Api.Group[];
}>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>();
const values = reactive({
  included: true,
  groupId: undefined as number | undefined,
  departmentCode: '',
  departmentName: '',
  reason: '',
});
const preview = ref<Api.AssignmentPreview>();
const preparing = ref(false);
const saving = ref(false);
const error = ref('');
const options = computed(() =>
  props.groups
    .filter((group) => group.enabled)
    .map((group) => ({
      label: `${group.departmentName} / ${group.name}`,
      value: group.id,
    })),
);
const locked = computed(
  () => preparing.value || saving.value || !!preview.value,
);
let payload: Api.AssignmentApply | undefined;
let sequence = 0;
watch(
  () => props.open,
  (open) => {
    sequence++;
    preview.value = undefined;
    payload = undefined;
    error.value = '';
    preparing.value = false;
    if (open)
      Object.assign(values, {
        included: true,
        groupId: undefined,
        departmentCode: '',
        departmentName: '',
        reason: '',
      });
  },
);
onBeforeUnmount(() => sequence++);
function resetPreview() {
  sequence++;
  preview.value = undefined;
  payload = undefined;
  error.value = '';
}
async function prepare() {
  let request: Api.AssignmentRequest;
  try {
    request = assignmentRequest(props.month, props.shops, values);
  } catch (cause) {
    error.value = (cause as Error).message;
    return;
  }
  const current = ++sequence;
  preparing.value = true;
  error.value = '';
  try {
    const result = await previewShopAssignments(request);
    if (current !== sequence) return;
    payload = assignmentApply(request, result, crypto.randomUUID());
    preview.value = result;
  } catch (cause) {
    if (current === sequence)
      error.value =
        cause instanceof Error ? cause.message : '归属预览失败，请重试。';
  } finally {
    if (current === sequence) preparing.value = false;
  }
}
async function apply() {
  if (!preview.value || !payload || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await applyShopAssignments(payload);
    message.success(`已保存 ${result.changeCount} 家店铺的归属配置`);
    emit('update:open', false);
    emit('saved');
  } catch {
    error.value =
      '提交未确认成功，可重试本次提交；若版本或预览已过期，请重新编辑并预览。';
  } finally {
    saving.value = false;
  }
}
const columns = [
  { title: '店铺', dataIndex: 'shopName', width: 160 },
  { title: '原归属', key: 'before', width: 250 },
  { title: '新归属', key: 'after', width: 250 },
];
</script>

<template>
  <Modal
    :open="open"
    title="批量配置店铺归属"
    :width="880"
    :footer="null"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    @cancel="emit('update:open', false)"
  >
    <div class="space-y-4 pt-3">
      <div class="flex flex-wrap items-center gap-2">
        <Tag color="blue">{{ month }} 起生效</Tag
        ><span>已选 {{ shops.length }} 家店铺</span>
      </div>
      <div class="flex max-h-24 flex-wrap gap-1 overflow-auto">
        <Tag v-for="shop in shops" :key="shop.shopId">{{ shop.shopName }}</Tag>
      </div>
      <Form layout="vertical"
        ><FormItem label="核算范围"
          ><Radio.Group v-model:value="values.included" :disabled="locked"
            ><Radio :value="true">纳入毛利</Radio
            ><Radio :value="false">不纳入毛利</Radio></Radio.Group
          ></FormItem
        ><FormItem v-if="values.included" label="目标财务小组"
          ><Select
            v-model:value="values.groupId"
            :options="options"
            allow-clear
            show-search
            option-filter-prop="label"
            :disabled="locked"
            placeholder="选择小组；留空则作为未分组店铺"
        /></FormItem>
        <div
          v-if="values.included && !values.groupId"
          class="grid grid-cols-2 gap-4"
        >
          <FormItem label="财务部门代码（可选）"
            ><Input
              v-model:value="values.departmentCode"
              :maxlength="64"
              :disabled="locked" /></FormItem
          ><FormItem label="财务部门名称（可选）"
            ><Input
              v-model:value="values.departmentName"
              :maxlength="100"
              :disabled="locked"
          /></FormItem>
        </div>
        <FormItem :label="values.included ? '变更说明' : '排除原因（必填）'"
          ><Input.TextArea
            v-model:value="values.reason"
            :maxlength="500"
            :rows="2"
            :disabled="locked" /></FormItem
      ></Form>
      <Alert v-if="error" type="error" show-icon :message="error" />
      <template v-if="preview"
        ><Alert
          v-for="warning in preview.warnings"
          :key="warning"
          type="warning"
          show-icon
          :message="warning"
        /><Table
          :columns="columns"
          :data-source="preview.changes"
          :pagination="false"
          :scroll="{ y: 300 }"
          row-key="shopId"
          size="small"
          ><template #bodyCell="{ column, record }"
            ><template v-if="column.key === 'before'">{{
              assignmentLabel(record.before)
            }}</template
            ><template v-else-if="column.key === 'after'">{{
              assignmentLabel(record.after)
            }}</template></template
          ></Table
        >
        <div
          v-if="preview.affectedReports.length"
          class="rounded-lg bg-muted/40 p-3 text-xs leading-6"
        >
          <strong>已建月报保持原快照</strong>
          <div v-for="report in preview.affectedReports" :key="report.id">
            {{ report.month }}：{{
              report.syncAllowed
                ? '配置保存后，可在月度页单独同步范围'
                : '已有导入数据，禁止自动改动归属'
            }}
          </div>
        </div></template
      >
      <p v-else class="mb-0 text-xs text-muted-foreground">
        先预览所有店铺的原归属、新归属与受影响月份，再整批保存。历史月报不会自动改变。
      </p>
      <div class="flex justify-end gap-2">
        <Button :disabled="saving" @click="emit('update:open', false)"
          >取消</Button
        ><Button v-if="preview" :disabled="saving" @click="resetPreview"
          >重新编辑</Button
        ><Button
          v-if="!preview"
          type="primary"
          :loading="preparing"
          @click="prepare"
          >预览变更</Button
        ><Button v-else type="primary" :loading="saving" @click="apply"
          >确认保存归属</Button
        >
      </div>
    </div>
  </Modal>
</template>
