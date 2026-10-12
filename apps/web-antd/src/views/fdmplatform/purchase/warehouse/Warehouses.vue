<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockBalance } from '#/api/fdmplatform/warehouse';

import { computed, onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  message,
  Modal,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import {
  getProcurementSettings,
  saveProcurementSetting,
} from '#/api/fdmplatform/procurement';
import { getStocks } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { money } from './model';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformWarehouses' });

const rows = ref<ProcurementSetting[]>([]);
const stocks = ref<StockBalance[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const editing = ref<Partial<ProcurementSetting>>();
const saving = ref(false);
const formError = ref('');
let idempotencyKey = '';

const summary = computed(() => {
  const result = new Map<string, { amount: number; products: number }>();
  for (const stock of stocks.value) {
    const entry = result.get(stock.warehouseId) ?? { amount: 0, products: 0 };
    entry.products += 1;
    if (stock.costKnown) entry.amount += Number(stock.costAmount);
    result.set(stock.warehouseId, entry);
  }
  return result;
});
/** 默认仓在前，停用的放最后。 */
const sorted = computed(() =>
  rows.value.toSorted(
    (a, b) =>
      Number(!!b.isDefault) - Number(!!a.isDefault) ||
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name, 'zh-CN'),
  ),
);
const companyOptions = computed(() =>
  (directory.value?.companies ?? []).map((entry) => ({
    value: entry.companyId,
    label: entry.companyName,
  })),
);
const userOptions = computed(() =>
  (directory.value?.users ?? []).map((entry) => ({
    value: entry.id,
    label: entry.departmentName
      ? `${entry.nickname} · ${entry.departmentName}`
      : entry.nickname,
  })),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [rows.value, stocks.value] = await Promise.all([
      getProcurementSettings('warehouses'),
      getStocks({ inStockOnly: true }),
    ]);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
function edit(row?: ProcurementSetting) {
  idempotencyKey = crypto.randomUUID();
  formError.value = '';
  editing.value = row
    ? { ...row, managerUserIds: [...(row.managerUserIds ?? [])] }
    : {
        active: true,
        countInTotal: true,
        isDefault: rows.value.length === 0,
        managerUserIds: [],
      };
}
async function save() {
  const value = editing.value;
  if (!value) return;
  if (!value.name?.trim() || !value.code?.trim()) {
    formError.value = '仓库名称和编号必填';
    return;
  }
  saving.value = true;
  formError.value = '';
  try {
    await saveProcurementSetting('warehouses', {
      idempotencyKey,
      ...(value.id ? { id: value.id, expectedVersion: value.version } : {}),
      name: value.name.trim(),
      code: value.code.trim(),
      companyId: value.companyId ?? null,
      address: value.address?.trim() || null,
      managerUserIds: value.managerUserIds ?? [],
      isDefault: !!value.isDefault,
      countInTotal: value.countInTotal !== false,
      active: value.active !== false,
      remark: value.remark?.trim() || null,
    });
    editing.value = undefined;
    message.success('仓库已保存');
    void load();
  } catch (error_) {
    formError.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  void load();
  try {
    directory.value = await getDirectory(0);
  } catch {
    // 只影响公司和库管人员显示
  }
});
</script>

<template>
  <div class="warehouse-page">
    <div class="toolbar">
      <span class="muted">
        仓库是采购入库、销售出库的落点。默认仓库会自动带进入库和出库单；停用后不能再选，历史单据照常可查。
      </span>
      <span class="grow"></span>
      <Button :loading="loading" @click="load">刷新</Button>
      <Button type="primary" @click="edit()">新增仓库</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Table
      class="fdm-business-table"
      size="middle"
      table-layout="fixed"
      row-key="id"
      :data-source="sorted"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 1000 }"
      :columns="[
        { title: '仓库', key: 'name', width: 180 },
        { title: '所属公司', key: 'company', width: 200 },
        { title: '库管人员', key: 'managers', width: 220 },
        { title: '地址', key: 'address', width: 220 },
        { title: '库存', key: 'stock', width: 160, align: 'right' },
        { title: '', key: 'action', width: 80 },
      ]"
    >
      <template #emptyText>还没有仓库，点右上角「新增仓库」。</template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'name'" class="cell">
          <span>
            <b>{{ record.name }}</b>
            <span class="muted mono"> {{ record.code }}</span>
          </span>
          <span>
            <Tag v-if="record.isDefault" color="blue">默认</Tag>
            <Tag v-if="!record.active">停用</Tag>
            <Tag v-if="record.countInTotal === false">不计总库存</Tag>
          </span>
        </div>
        <span v-else-if="column.key === 'company'">{{
          directory?.companies.find(
            (entry) => entry.companyId === record.companyId,
          )?.companyName ?? '—'
        }}</span>
        <span v-else-if="column.key === 'managers'" class="ellipsis">{{
          (record.managerUserIds ?? [])
            .map((id: number) => personName(directory, id))
            .join('、') || '—'
        }}</span>
        <span v-else-if="column.key === 'address'" class="ellipsis">{{
          record.address ?? '—'
        }}</span>
        <div
          v-else-if="column.key === 'stock'"
          class="cell num"
          style="align-items: flex-end"
        >
          <span>{{ summary.get(record.id)?.products ?? 0 }} 种产品</span>
          <span class="muted">{{
            money(summary.get(record.id)?.amount ?? 0)
          }}</span>
        </div>
        <Button
          v-else-if="column.key === 'action'"
          type="link"
          size="small"
          @click="edit(record as ProcurementSetting)"
        >
          编辑
        </Button>
      </template>
    </Table>
    <Modal
      :open="!!editing"
      :title="editing?.id ? '编辑仓库' : '新增仓库'"
      :confirm-loading="saving"
      ok-text="保存"
      width="640px"
      @ok="save"
      @cancel="editing = undefined"
    >
      <div v-if="editing" class="warehouse-form">
        <Alert v-if="formError" type="error" :message="formError" show-icon />
        <label>
          <span>仓库名称</span>
          <Input v-model:value="editing.name" placeholder="例如：武汉仓库" />
        </label>
        <label>
          <span>编号</span>
          <Input v-model:value="editing.code" placeholder="例如：WH" />
        </label>
        <label>
          <span>所属公司</span>
          <Select
            v-model:value="editing.companyId"
            allow-clear
            show-search
            option-filter-prop="label"
            :options="companyOptions"
            placeholder="库存挂在哪家公司名下"
          />
        </label>
        <label>
          <span>库管人员</span>
          <Select
            v-model:value="editing.managerUserIds"
            mode="multiple"
            show-search
            option-filter-prop="label"
            :options="userOptions"
            placeholder="可多选"
          />
        </label>
        <label class="wide">
          <span>地址</span>
          <Input
            v-model:value="editing.address"
            placeholder="选这个仓库收货时，地址会带进采购合同"
          />
        </label>
        <label class="wide">
          <span>备注</span>
          <Input v-model:value="editing.remark" />
        </label>
        <div class="wide checks">
          <Checkbox v-model:checked="editing.isDefault">默认仓库</Checkbox>
          <Checkbox v-model:checked="editing.countInTotal">计入总库存</Checkbox>
          <Checkbox v-model:checked="editing.active">启用</Checkbox>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.warehouse-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.warehouse-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.warehouse-form label > span {
  color: hsl(var(--muted-foreground));
}

.warehouse-form .wide {
  grid-column: 1 / -1;
}

.warehouse-form .checks {
  display: flex;
  gap: 16px;
}
</style>
