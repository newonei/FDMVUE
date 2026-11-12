<script setup lang="ts">
import type { ColorRepairDraft } from '../color-repair';

import type { ProductColorRepairResult } from '#/api/fdmplatform/product-color-repair';
import type { ProductAttributeOption } from '#/api/fdmplatform/products';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Spin,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  applyProductColorRepair,
  previewProductColorRepair,
  rollbackProductColorRepair,
} from '#/api/fdmplatform/product-color-repair';
import { getProductAttributeOptions } from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import {
  colorRepairDraft,
  colorRepairError,
  colorRepairItem,
  repairStatusText,
} from '../color-repair';
import ProductColorSummary from './ProductColorSummary.vue';

const props = defineProps<{ companyId: number; open: boolean }>();
const emit = defineEmits<{
  close: [];
  edit: [productId: string];
  updated: [];
}>();
const keyword = ref('');
const rows = ref<ColorRepairDraft[]>([]);
const colors = ref<ProductAttributeOption[]>([]);
const pageNo = ref(1);
const total = ref(0);
const ruleVersion = ref('');
const busy = ref(false);
const errorMessage = ref('');
const result = ref<ProductColorRepairResult>();
const reverted = ref(false);
const selected = computed(() => rows.value.filter((row) => row.selected));
let applyKey = newIdempotencyKey();
let rollbackKey = newIdempotencyKey();
let sequence = 0;
async function preview() {
  const run = ++sequence;
  busy.value = true;
  errorMessage.value = '';
  try {
    const [response, options] = await Promise.all([
      previewProductColorRepair({
        companyId: props.companyId,
        keyword: keyword.value.trim() || undefined,
        pageNo: pageNo.value,
        pageSize: 20,
      }),
      getProductAttributeOptions(),
    ]);
    if (run !== sequence || !props.open) return;
    rows.value = response.list.map(colorRepairDraft);
    total.value = response.total;
    ruleVersion.value = response.ruleVersion;
    colors.value = options.colors;
    applyKey = newIdempotencyKey();
  } catch (error) {
    if (run === sequence) errorMessage.value = errorText(error);
  } finally {
    if (run === sequence) busy.value = false;
  }
}
watch(
  () => props.open,
  (open) => {
    if (open) {
      pageNo.value = 1;
      result.value = undefined;
      reverted.value = false;
      void preview();
    } else ++sequence;
  },
  { immediate: true },
);
function changed(row: ColorRepairDraft) {
  row.selected = false;
  applyKey = newIdempotencyKey();
}
function selectionChanged() {
  applyKey = newIdempotencyKey();
}
async function apply() {
  if (selected.value.length === 0 || busy.value) return;
  const invalid = selected.value
    .map((row) => colorRepairError(row, colors.value))
    .find(Boolean);
  if (invalid) {
    errorMessage.value = invalid;
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    result.value = await applyProductColorRepair({
      companyId: props.companyId,
      idempotencyKey: applyKey,
      items: selected.value.map(colorRepairItem),
    });
    reverted.value = false;
    rollbackKey = newIdempotencyKey();
    emit('updated');
    await preview();
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
async function rollback() {
  if (!result.value || busy.value || reverted.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await rollbackProductColorRepair({
      companyId: props.companyId,
      batchId: result.value.batchId,
      idempotencyKey: rollbackKey,
    });
    reverted.value = true;
    emit('updated');
    await preview();
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
function turnPage(delta: number) {
  pageNo.value += delta;
  void preview();
}
</script>

<template>
  <Modal
    :open="open"
    title="历史产品颜色补录"
    width="min(1280px, 98vw)"
    :mask-closable="false"
    :closable="!busy"
    @cancel="emit('close')"
  >
    <div class="repair-stack">
      <Alert
        type="info"
        show-icon
        message="先核对，再逐行勾选补录。只补空字段，不改型号，不覆盖已有颜色，也不修改已下单快照。"
        description="识别建议不是确认结果。缺少的色号需先维护颜色字典；正反方向不明确时请手动核实。颜色补录后仍需独立确认制造结构与厚度。"
      />
      <Alert
        v-if="errorMessage"
        type="error"
        show-icon
        :message="errorMessage"
      />
      <div class="repair-toolbar">
        <Input
          v-model:value="keyword"
          placeholder="搜索 SKU、名称或历史型号"
          aria-label="补录搜索"
          :disabled="busy"
          @press-enter="
            pageNo = 1;
            preview();
          "
        />
        <Button
          :disabled="busy"
          @click="
            pageNo = 1;
            preview();
          "
        >
          查询预览
        </Button>
        <span class="muted">共 {{ total }} 项 · 规则 {{ ruleVersion || '—' }}</span>
      </div>
      <Alert
        v-if="result"
        type="success"
        show-icon
        :message="
          reverted
            ? '本批颜色补录已撤销'
            : `本批已补录 ${result.updatedCount} 个产品`
        "
      >
        <template #description>
          <span>批次 {{ result.batchId }}</span><Button
            v-if="!reverted"
            size="small"
            :disabled="busy"
            @click="rollback"
          >
            撤销本批
</Button><span v-if="!reverted" class="muted">仅后续未修改的产品可撤销。</span>
        </template>
      </Alert>
      <Spin :spinning="busy">
        <div class="repair-table-wrap">
          <table class="repair-table">
            <thead>
              <tr>
                <th>产品与原型号</th>
                <th>当前资料</th>
                <th>识别结果</th>
                <th>核对后的颜色</th>
                <th>确认</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.productId">
                <td>
                  <strong>{{ row.code }} · {{ row.name }}</strong>
                  <p>{{ row.model || '未填写型号' }}</p>
                  <Button
                    type="link"
                    size="small"
                    :disabled="busy"
                    @click="emit('edit', row.productId)"
                  >
                    打开产品核实
                  </Button>
                </td>
                <td><ProductColorSummary :value="row.current" /></td>
                <td>
                  <strong>{{ repairStatusText[row.status] }}</strong>
                  <p v-if="row.singleText">单色原文：{{ row.singleText }}</p>
                  <p v-if="row.frontText">正面原文：{{ row.frontText }}</p>
                  <p v-if="row.backText">反面原文：{{ row.backText }}</p>
                  <p v-for="reason in row.reasons" :key="reason" class="muted">
                    {{ reason }}
                  </p>
                </td>
                <td>
                  <div class="repair-fields">
                    <Select
                      v-model:value="row.edited.colorMode"
                      :disabled="
                        busy || ['CONFLICT', 'ALREADY_SET'].includes(row.status)
                      "
                      :options="[
                        { value: 'UNKNOWN', label: '待核实' },
                        { value: 'SINGLE', label: '单色' },
                        { value: 'DUAL', label: '双色' },
                      ]"
                      :aria-label="`${row.code}颜色方式`"
                      @change="changed(row)"
                    />
                    <Select
                      v-if="row.edited.colorMode === 'SINGLE'"
                      v-model:value="row.edited.colorCode"
                      :options="colors"
                      :disabled="busy"
                      show-search
                      option-filter-prop="label"
                      placeholder="选择单色颜色"
                      :aria-label="`${row.code}单色颜色`"
                      @change="changed(row)"
                    />
                    <template v-if="row.edited.colorMode === 'DUAL'">
                      <Select
                        v-model:value="row.edited.frontColor"
                        :options="colors"
                        :disabled="busy"
                        show-search
                        option-filter-prop="label"
                        placeholder="选择正面颜色"
                        :aria-label="`${row.code}正面颜色`"
                        @change="changed(row)"
                      />
                      <Select
                        v-model:value="row.edited.backColor"
                        :options="colors"
                        :disabled="busy"
                        show-search
                        option-filter-prop="label"
                        placeholder="选择反面颜色"
                        :aria-label="`${row.code}反面颜色`"
                        @change="changed(row)"
                      />
                    </template>
                  </div>
                  <p v-if="colorRepairError(row, colors)" class="muted">
                    {{ colorRepairError(row, colors) }}
                  </p>
                </td>
                <td>
                  <Checkbox
                    v-model:checked="row.selected"
                    :disabled="busy || !!colorRepairError(row, colors)"
                    :aria-label="`确认补录${row.code}`"
                    @change="selectionChanged"
                  >
                    已核对
                  </Checkbox>
                </td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="5">没有匹配产品</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Spin>
      <div class="repair-toolbar">
        <Button :disabled="busy || pageNo <= 1" @click="turnPage(-1)">
          上一页
</Button><span>第 {{ pageNo }} 页</span><Button :disabled="busy || pageNo * 20 >= total" @click="turnPage(1)">
          下一页
        </Button>
      </div>
    </div>
    <template #footer>
      <Button :disabled="busy" @click="emit('close')">关闭</Button><Button
        type="primary"
        :loading="busy"
        :disabled="selected.length === 0 || busy"
        @click="apply"
      >
        补录已核对的 {{ selected.length }} 项
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.repair-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.repair-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.repair-toolbar :deep(.ant-input) {
  max-width: 360px;
}

.repair-table-wrap {
  max-height: 58vh;
  overflow: auto;
}

.repair-table {
  width: 100%;
  min-width: 1080px;
  font-size: 13px;
  border-collapse: collapse;
}

.repair-table td,
.repair-table th {
  padding: 10px;
  vertical-align: top;
  text-align: left;
  border: 1px solid hsl(var(--border));
}

.repair-table th {
  background: hsl(var(--muted));
}

.repair-table td:first-child {
  width: 23%;
}

.repair-table td:nth-child(3) {
  width: 23%;
}

.repair-table td:nth-child(4) {
  width: 25%;
}

.repair-table p {
  margin: 4px 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.repair-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
