<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Spin,
  Tag,
} from 'ant-design-vue';
import {
  createEcProfit,
  getShopAssignments,
  updateEcProfit,
} from '#/api/fdmcaiwu/ec-profit';

const props = defineProps<{
  defaultMonth: string;
  open: boolean;
  report?: Api.Report;
}>();
const emit = defineEmits<{
  saved: [month: string];
  'update:open': [open: boolean];
  configure: [];
}>();
const formRef = ref<FormInstance>();
const form = reactive({ month: '', remark: '' });
const scope = ref<Api.AssignmentList>();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
let sequence = 0;
const unconfigured = computed(
  () => scope.value?.shops.filter((shop) => !shop.configured) ?? [],
);
const included = computed(
  () =>
    scope.value?.shops.filter((shop) => shop.configured && shop.included) ?? [],
);
const canCreate = computed(
  () =>
    !!scope.value &&
    !loading.value &&
    !error.value &&
    unconfigured.value.length === 0 &&
    included.value.length > 0,
);

async function loadScope() {
  const current = ++sequence;
  scope.value = undefined;
  error.value = '';
  if (!props.open || props.report || !form.month) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await getShopAssignments(form.month);
    if (current === sequence) scope.value = result;
  } catch {
    if (current === sequence) error.value = '本月应报范围加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [props.open, props.report] as const,
  ([open]) => {
    sequence++;
    if (!open) return;
    form.month = props.report?.month ?? props.defaultMonth;
    form.remark = props.report?.remark ?? '';
    formRef.value?.clearValidate();
    void loadScope();
  },
);
watch(
  () => form.month,
  () => void loadScope(),
);
onBeforeUnmount(() => sequence++);
async function save() {
  if (saving.value || (!props.report && !canCreate.value)) return;
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    if (props.report)
      await updateEcProfit({
        id: props.report.id,
        expectedVersion: props.report.version,
        remark: form.remark.trim() || undefined,
      });
    else
      await createEcProfit({
        month: form.month,
        expectedConfigVersion: scope.value!.configVersion,
        remark: form.remark.trim() || undefined,
      });
    message.success(
      props.report ? '月报备注已保存' : '已按本月配置生成完整待导入月报',
    );
    emit('update:open', false);
    emit('saved', form.month);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="report ? '编辑月报备注' : '新建电商毛利月报'"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !report && !canCreate }"
    :cancel-button-props="{ disabled: saving }"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    :width="640"
    :ok-text="report ? '保存备注' : '创建月报'"
    @cancel="emit('update:open', false)"
    @ok="save"
  >
    <Form ref="formRef" :model="form" layout="vertical" class="pt-3">
      <FormItem
        label="所属月份"
        name="month"
        :rules="[{ required: true, message: '请选择月份' }]"
        ><DatePicker
          v-model:value="form.month"
          picker="month"
          value-format="YYYY-MM"
          format="YYYY 年 MM 月"
          :disabled="!!report || saving"
          :allow-clear="false"
          class="w-full"
      /></FormItem>
      <Spin v-if="!report" :spinning="loading">
        <div class="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div class="mb-2 flex items-center justify-between">
            <strong>本月应报范围</strong
            ><Button size="small" :disabled="saving" @click="loadScope"
              >重新加载</Button
            >
          </div>
          <Alert v-if="error" type="error" :message="error" show-icon />
          <template v-else-if="scope"
            ><p>
              {{ included.length }} 家应报店铺 ·
              {{ unconfigured.length }} 家未配置 ·
              {{
                scope.shops.filter((shop) => shop.configured && !shop.included)
                  .length
              }}
              家已排除
            </p>
            <div class="flex max-h-40 flex-wrap gap-2 overflow-auto">
              <Tag v-for="shop in included" :key="shop.shopId"
                >{{ shop.shopName }} · {{ shop.groupName || '未分组' }}</Tag
              >
            </div>
            <Alert
              v-if="unconfigured.length"
              class="mt-3"
              type="warning"
              show-icon
              message="请先确认所有未配置店铺的归属或排除原因。"
              ><template #description>{{
                unconfigured.map((shop) => shop.shopName).join('、')
              }}</template></Alert
            ><Alert
              v-else-if="included.length === 0"
              class="mt-3"
              type="warning"
              message="本月没有纳入毛利的店铺，请先配置应报范围。"
          /></template>
          <Button class="mt-3" :disabled="saving" @click="emit('configure')"
            >打开店铺配置</Button
          >
        </div>
      </Spin>
      <FormItem label="备注" name="remark"
        ><Input.TextArea
          v-model:value="form.remark"
          :maxlength="500"
          :rows="3"
          show-count
          :disabled="saving"
      /></FormItem>
      <p class="mb-0 text-xs leading-6 text-muted-foreground">
        {{
          report
            ? '仅修改备注；需要调整店铺范围时，请使用月度页的「同步本月范围」。'
            : '服务端按当月有效配置生成所有应报店铺，金额先显示「—」。店铺 Excel 导入与计算将在后续接入。'
        }}
      </p>
    </Form>
  </Modal>
</template>
