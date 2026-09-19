<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { onBeforeUnmount, ref, watch } from 'vue';
import { Alert, Button, message, Modal, Table, Tag } from 'ant-design-vue';
import {
  previewEcProfitScope,
  syncEcProfitScope,
} from '#/api/fdmcaiwu/ec-profit';
const props = defineProps<{ open: boolean; report: Api.Report }>();
const emit = defineEmits<{
  'update:open': [open: boolean];
  saved: [];
  configure: [];
}>();
const preview = ref<Api.ScopePreview>();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
let payload: Api.ScopeApply | undefined;
let sequence = 0;
async function load() {
  const current = ++sequence;
  preview.value = undefined;
  payload = undefined;
  error.value = '';
  if (!props.open) return;
  loading.value = true;
  try {
    const result = await previewEcProfitScope({
      id: props.report.id,
      expectedVersion: props.report.version,
    });
    if (current !== sequence) return;
    preview.value = result;
    payload = {
      id: result.reportId,
      expectedVersion: result.reportVersion,
      expectedConfigVersion: result.configVersion,
      previewToken: result.previewToken,
      idempotencyKey: crypto.randomUUID(),
    };
  } catch {
    if (current === sequence) error.value = '范围预览失败，请刷新月报后重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => props.open,
  () => void load(),
);
onBeforeUnmount(() => sequence++);
async function save() {
  if (!preview.value?.canSync || !payload || saving.value) return;
  saving.value = true;
  try {
    await syncEcProfitScope(payload);
    message.success('本月应报范围已同步');
    emit('update:open', false);
    emit('saved');
  } catch {
    error.value =
      '同步未确认成功，可重试本次提交；若提示版本或预览过期，请重新预览。';
  } finally {
    saving.value = false;
  }
}
const columns = [
  { title: '变更', key: 'kind', width: 85 },
  { title: '店铺', dataIndex: 'shopName', width: 190 },
  { title: '原归属', key: 'before', width: 180 },
  { title: '新归属', key: 'after', width: 180 },
];
</script>

<template>
  <Modal
    :open="open"
    :title="`${report.month} 同步本月范围`"
    :width="850"
    :confirm-loading="saving"
    :ok-button-props="{
      disabled: loading || !preview?.canSync,
    }"
    :cancel-button-props="{ disabled: saving }"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    ok-text="确认同步范围"
    @ok="save"
    @cancel="emit('update:open', false)"
  >
    <div class="space-y-4 pt-3">
      <p class="mb-0 text-sm text-muted-foreground">
        仅同步尚无已导入数据的月报。归属配置与月报快照分开保存，以下变更确认后才进入本月。
      </p>
      <Alert v-if="error" type="error" show-icon :message="error" />
      <div class="flex items-center justify-between">
        <span>同步后应报 {{ preview?.expectedShopCount ?? '—' }} 家店铺</span
        ><Button :loading="loading" :disabled="saving" @click="load"
          >重新预览</Button
        >
      </div>
      <Alert
        v-for="warning in preview?.warnings ?? []"
        :key="warning"
        type="warning"
        show-icon
        :message="warning"
      /><Alert
        v-if="preview?.unconfiguredShops.length"
        type="warning"
        message="尚有店铺未配置，暂不能同步。"
        ><template #description
          >{{ preview.unconfiguredShops.map((shop) => shop.shopName).join('、')
          }}<Button type="link" @click="emit('configure')"
            >前往配置</Button
          ></template
        ></Alert
      ><Table
        :columns="columns"
        :data-source="preview?.changes ?? []"
        :loading="loading"
        :pagination="false"
        :scroll="{ y: 360 }"
        row-key="shopId"
        size="small"
        ><template #bodyCell="{ column, record }"
          ><Tag v-if="column.key === 'kind'">{{
            { ADD: '新增', REMOVE: '移除', UPDATE: '调组' }[
              record.kind as 'ADD' | 'REMOVE' | 'UPDATE'
            ]
          }}</Tag
          ><template v-else-if="column.key === 'before'">{{
            record.before
              ? `${record.before.departmentName || '未分配部门'} / ${record.before.groupName || '未分组'}`
              : '—'
          }}</template
          ><template v-else-if="column.key === 'after'">{{
            record.after
              ? `${record.after.departmentName || '未分配部门'} / ${record.after.groupName || '未分组'}`
              : '—'
          }}</template></template
        ><template #emptyText>{{
          loading
            ? '正在计算差异'
            : '店铺范围未变化；确认后同步当前配置版本与财务小组快照。'
        }}</template></Table
      >
    </div>
  </Modal>
</template>
