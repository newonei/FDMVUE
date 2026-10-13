<script setup lang="ts">
import type { AssignRow } from './request-batch';

import type { Contract, Directory } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { Alert, Button, message, Modal, Select, Spin } from 'ant-design-vue';

import {
  contractAction,
  getContract,
  getDirectory,
  newIdempotencyKey,
} from '#/api/fdmplatform';

import { errorText } from '../../data';
import { activeAssignRows, assignPayload, assignRows } from './request-batch';

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
/**
 * 分派只分单（采购部门约定）：主管把整张申请交给一个采购员，外采、自产、数量由采购员开单时决定。
 * 提交时每个产品按剩余数量记为外采任务，经办人都是选中的采购员。
 */
const owner = ref<number>();
/** 没指定申请时（如从合同订单「分派采购任务」进来），在弹窗里选要分派的申请 */
const chosenRequestId = ref<string>();
const requestId = computed(() => props.requestId ?? chosenRequestId.value);
let sequence = 0;
let pristine: number | undefined;
const request = computed(() =>
  contract.value?.requests?.find((entry) => entry.id === requestId.value),
);
const pendingRequests = computed(() =>
  (contract.value?.requests ?? [])
    .filter((entry) => assignRows(contract.value!, entry.id).length > 0)
    .map((entry) => ({
      value: entry.id,
      label: entry.code || entry.name || '采购申请',
    })),
);
function chooseRequest(id: string) {
  chosenRequestId.value = id;
  if (!contract.value) return;
  const me = Number(userStore.userInfo?.id);
  lines.value = assignRows(contract.value, id, me > 0 ? me : undefined);
  owner.value ??= lines.value[0]?.ownerUserId;
  pageError.value = lines.value.length === 0 ? '这张申请已全部分派' : '';
}
const userOptions = computed(() =>
  (directory.value?.users ?? []).map((user) => ({
    value: user.id,
    label: user.departmentName
      ? `${user.nickname} · ${user.departmentName}`
      : user.nickname,
  })),
);
const activeCount = computed(() => activeAssignRows(lines.value).length);
async function prepare(contractId: string, requestId?: string) {
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
    if (!requestId) {
      const pending = pendingRequests.value;
      if (pending.length === 0)
        pageError.value = '这个合同没有待分派的采购申请';
      else if (pending.length === 1) chooseRequest(String(pending[0]!.value));
      pristine = owner.value;
      return;
    }
    const me = Number(userStore.userInfo?.id);
    lines.value = assignRows(loaded, requestId, me > 0 ? me : undefined);
    if (lines.value.length === 0) pageError.value = '这张申请已全部分派';
    owner.value = lines.value[0]?.ownerUserId;
    pristine = owner.value;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}

async function save() {
  const current = contract.value;
  if (!current || !requestId.value || saving.value) return;
  submitted.value = true;
  if (!owner.value) {
    pageError.value = '请选择分派给哪个采购员';
    return;
  }
  for (const row of lines.value) {
    row.method = 'BUY';
    row.quantity = row.remaining;
    row.ownerUserId = owner.value;
  }
  saving.value = true;
  pageError.value = '';
  try {
    const updated = await contractAction(
      current.id,
      'ASSIGN_REQUEST',
      current.version,
      idempotencyKey.value,
      assignPayload(requestId.value, lines.value),
    );
    message.success(
      `已分派给 ${userOptions.value.find((user) => user.value === owner.value)?.label ?? '采购员'}`,
    );
    emit('saved', updated);
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

function close() {
  if (saving.value) return;
  if (!contract.value || owner.value === pristine) {
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
    owner.value = undefined;
    chosenRequestId.value = undefined;
    submitted.value = false;
    pageError.value = '';
    if (!props.open || !props.contractId) return;
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
      分派采购申请<span v-if="contract" class="title-sub">
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
      <label
        v-if="contract && !props.requestId && pendingRequests.length > 1"
        class="owner-field request-field"
      >
        <span>采购申请</span>
        <Select
          :value="chosenRequestId"
          :options="pendingRequests"
          :disabled="saving"
          placeholder="选择要分派的申请"
          aria-label="采购申请"
          style="width: 280px"
          @update:value="(value) => chooseRequest(String(value))"
        />
      </label>
      <div v-if="contract && lines.length" class="assign">
        <label class="owner-field">
          <span>分派给</span>
          <Select
            v-model:value="owner"
            :options="userOptions"
            show-search
            option-filter-prop="label"
            :disabled="saving"
            placeholder="选择采购员"
            aria-label="分派给"
            style="width: 280px"
          />
          <small class="hint">只分单：外采还是自产、买多少，由采购员开采购单时决定。</small>
        </label>
        <div class="table-wrap">
          <table class="batch-grid">
            <thead>
              <tr>
                <th>申请的产品</th>
                <th class="num">待分派</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in lines" :key="row.key">
                <td>
                  <b>{{ row.title }}</b>
                  <span v-if="row.specification" class="hint">{{
                    row.specification
                  }}</span>
                </td>
                <td class="num">{{ row.remaining }} {{ row.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Spin>
    <template #footer>
      <span v-if="contract && lines.length" class="footer-count">共 {{ activeCount }} 个产品</span>
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

.request-field {
  margin-bottom: 12px;
}

.assign-alert {
  margin-bottom: 12px;
}

.assign {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.owner-field {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
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

.batch-grid {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.batch-grid th {
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

.batch-grid td {
  padding: 6px 8px;
  vertical-align: top;
  border-top: 1px solid hsl(var(--border));
}

.batch-grid tr.split td {
  border-top-style: dashed;
}

.batch-grid tr.invalid td {
  background: hsl(var(--destructive) / 5%);
}

.batch-grid .num {
  text-align: right;
  white-space: nowrap;
}

.batch-grid .method {
  width: 96px;
}

.batch-grid .qty {
  width: 112px;
}

.batch-grid .owner {
  width: 180px;
}

.batch-grid .factory {
  width: 168px;
}

.batch-grid .ops {
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
