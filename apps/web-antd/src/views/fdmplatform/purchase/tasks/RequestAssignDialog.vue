<script setup lang="ts">
import type { AssignRow, FulfillmentMethod } from './request-batch';

import type { Contract, Directory } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
} from 'ant-design-vue';

import {
  contractAction,
  getContract,
  getDirectory,
  newIdempotencyKey,
} from '#/api/fdmplatform';

import { errorText } from '../../data';
import {
  activeAssignRows,
  assignErrors,
  assignPayload,
  assignRows,
  METHOD_OPTIONS,
  splitRow,
} from './request-batch';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  requestId?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [contract: Contract];
}>();

const userStore = useUserStore();
const contract = ref<Contract>();
const directory = ref<Directory>();
const lines = ref<AssignRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const submitted = ref(false);
const pageError = ref('');
const idempotencyKey = ref('');
const bulkMethod = ref<FulfillmentMethod>();
const bulkOwner = ref<number>();
let sequence = 0;
let pristine = '';

const request = computed(() =>
  contract.value?.requests?.find((entry) => entry.id === props.requestId),
);
const userOptions = computed(() =>
  (directory.value?.users ?? []).map((user) => ({
    value: user.id,
    label: user.departmentName
      ? `${user.nickname} · ${user.departmentName}`
      : user.nickname,
  })),
);
const errors = computed(() =>
  submitted.value ? assignErrors(lines.value) : {},
);
const activeCount = computed(() => activeAssignRows(lines.value).length);

function applyMethod(value: FulfillmentMethod | undefined) {
  if (!value) return;
  for (const row of lines.value) if (!row.split) row.method = value;
  bulkMethod.value = undefined;
}
function applyOwner(value: number | undefined) {
  if (!value) return;
  for (const row of lines.value) row.ownerUserId = value;
  bulkOwner.value = undefined;
}
function split(row: AssignRow) {
  const index = lines.value.indexOf(row);
  const last = lines.value.findLastIndex(
    (entry) => entry.requestItemId === row.requestItemId,
  );
  lines.value.splice(Math.max(index, last) + 1, 0, splitRow(lines.value, row));
}
function remove(row: AssignRow) {
  lines.value = lines.value.filter((entry) => entry.key !== row.key);
}

async function prepare(contractId: string, requestId: string) {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const [loaded, users] = await Promise.all([
      getContract(contractId),
      directory.value
        ? Promise.resolve(directory.value)
        : getDirectory(0).catch(() => undefined),
    ]);
    if (run !== sequence || !props.open) return;
    if (!loaded.allowedActions?.includes('ASSIGN_REQUEST'))
      throw new Error('当前合同状态或你的角色不能分派采购任务');
    contract.value = loaded;
    directory.value = users;
    const me = Number(userStore.userInfo?.id);
    lines.value = assignRows(loaded, requestId, me > 0 ? me : undefined);
    if (lines.value.length === 0) pageError.value = '这张申请已全部分派';
    pristine = JSON.stringify(lines.value);
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}

async function save() {
  const current = contract.value;
  if (!current || !props.requestId || saving.value) return;
  submitted.value = true;
  if (activeCount.value === 0) {
    pageError.value = '请至少给一个产品填写分派数量';
    return;
  }
  if (Object.keys(assignErrors(lines.value)).length > 0) {
    pageError.value = '还有内容没填好，请看标红的行';
    return;
  }
  saving.value = true;
  pageError.value = '';
  try {
    const updated = await contractAction(
      current.id,
      'ASSIGN_REQUEST',
      current.version,
      idempotencyKey.value,
      assignPayload(props.requestId, lines.value),
    );
    message.success(`已分派 ${activeCount.value} 行`);
    emit('saved', updated);
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

function close() {
  if (saving.value) return;
  if (!contract.value || JSON.stringify(lines.value) === pristine) {
    ++sequence;
    emit('close');
    return;
  }
  Modal.confirm({
    title: '分派还没保存',
    content: '表格里调整的内容会丢掉。',
    okText: '放弃并关闭',
    cancelText: '继续填写',
    autoFocusButton: 'cancel',
    onOk: () => {
      ++sequence;
      emit('close');
    },
  });
}

watch(
  () => [props.open, props.contractId, props.requestId],
  () => {
    ++sequence;
    contract.value = undefined;
    lines.value = [];
    submitted.value = false;
    pageError.value = '';
    if (!props.open || !props.contractId || !props.requestId) return;
    idempotencyKey.value = newIdempotencyKey();
    void prepare(props.contractId, props.requestId);
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    width="min(1120px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    :destroy-on-close="true"
    @cancel="close"
  >
    <template #title>
      按单分派<span v-if="contract" class="title-sub">
        · {{ request?.name ?? '采购申请' }} · {{ contract.code }}</span>
    </template>
    <Spin :spinning="loading">
      <Alert
        v-if="pageError"
        type="error"
        show-icon
        :message="pageError"
        class="assign-alert"
      />
      <div v-if="contract && lines.length" class="assign">
        <div class="toolbar">
          <span class="hint">每个产品默认按剩余数量全部外采；要部分自产或拆给多人，点「拆分」。数量留空的行本次不分派。</span>
          <div class="bulk">
            <Select
              :value="bulkMethod"
              :options="METHOD_OPTIONS"
              placeholder="方式全部设为…"
              :disabled="saving"
              class="bulk-select"
              @change="(value) => applyMethod(value as FulfillmentMethod)"
            />
            <Select
              :value="bulkOwner"
              :options="userOptions"
              show-search
              option-filter-prop="label"
              placeholder="经办人全部设为…"
              :disabled="saving"
              class="bulk-select"
              @change="(value) => applyOwner(value as number)"
            />
          </div>
        </div>
        <div class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th>产品</th>
                <th class="num">待分派</th>
                <th class="method">方式</th>
                <th class="qty">本次数量</th>
                <th class="owner">经办人</th>
                <th class="factory">承接工厂</th>
                <th class="ops"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in lines"
                :key="row.key"
                :class="{ split: row.split, invalid: errors[row.key] }"
              >
                <td>
                  <template v-if="!row.split">
                    <b>{{ row.title }}</b>
                    <span v-if="row.specification" class="hint">{{
                      row.specification
                    }}</span>
                  </template>
                  <span v-else class="hint">↳ 拆分</span>
                  <span v-if="errors[row.key]" class="row-error">{{
                    errors[row.key]
                  }}</span>
                </td>
                <td class="num">
                  <template v-if="!row.split">
                    {{ row.remaining }} {{ row.unit }}
                  </template>
                </td>
                <td>
                  <Select
                    v-model:value="row.method"
                    :options="METHOD_OPTIONS"
                    :disabled="saving"
                    aria-label="履约方式"
                    style="width: 100%"
                  />
                </td>
                <td>
                  <InputNumber
                    v-model:value="row.quantity"
                    string-mode
                    :min="0"
                    :controls="false"
                    :disabled="saving"
                    aria-label="本次数量"
                    style="width: 100%"
                  />
                </td>
                <td>
                  <Select
                    v-model:value="row.ownerUserId"
                    :options="userOptions"
                    show-search
                    option-filter-prop="label"
                    :disabled="saving"
                    aria-label="经办人"
                    placeholder="选择经办人"
                    style="width: 100%"
                  />
                </td>
                <td>
                  <Input
                    v-if="row.method === 'MAKE'"
                    v-model:value="row.factoryId"
                    :disabled="saving"
                    aria-label="承接工厂"
                    placeholder="工厂名称或编码"
                  />
                  <span v-else class="hint">—</span>
                </td>
                <td class="ops">
                  <Button
                    v-if="!row.split"
                    type="link"
                    size="small"
                    :disabled="saving"
                    @click="split(row)"
                  >
                    拆分
                  </Button>
                  <Button
                    v-else
                    type="link"
                    size="small"
                    danger
                    :disabled="saving"
                    @click="remove(row)"
                  >
                    删除
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Spin>
    <template #footer>
      <span v-if="contract && lines.length" class="footer-count">本次分派 {{ activeCount }} 行</span>
      <Button :disabled="saving" @click="close">取消</Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="!contract || lines.length === 0"
        @click="save"
      >
        确认分派
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.title-sub {
  font-size: 13px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.assign-alert {
  margin-bottom: 12px;
}

.assign {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.bulk {
  display: flex;
  gap: 8px;
}

.bulk-select {
  width: 168px;
}

.hint {
  display: block;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.table-wrap {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.grid {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: left;
  white-space: nowrap;
  background: hsl(var(--accent));
}

.grid td {
  padding: 6px 8px;
  vertical-align: top;
  border-top: 1px solid hsl(var(--border));
}

.grid tr.split td {
  border-top-style: dashed;
}

.grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

.grid .num {
  text-align: right;
  white-space: nowrap;
}

.grid .method {
  width: 96px;
}

.grid .qty {
  width: 112px;
}

.grid .owner {
  width: 180px;
}

.grid .factory {
  width: 168px;
}

.grid .ops {
  width: 64px;
  text-align: center;
}

.row-error {
  display: block;
  font-size: 12px;
  color: hsl(var(--destructive));
}

.footer-count {
  margin-right: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
