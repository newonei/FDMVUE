<script setup lang="ts">
import type { StockIn, StockOut } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Input, Modal } from 'ant-design-vue';

import { voidStockIn, voidStockOut } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';

import './stock-dialog.css';

/** 作废入库单或出库单：填原因后冲回库存与合同进度，单据保留可查。 */
const props = defineProps<{
  stockIn?: StockIn;
  stockOut?: StockOut;
}>();
const emit = defineEmits<{
  close: [];
  saved: [code: string];
}>();

const reason = ref('');
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';

const open = computed(() => Boolean(props.stockIn || props.stockOut));
const code = computed(() => props.stockIn?.code ?? props.stockOut?.code ?? '');
const effect = computed(() => {
  if (props.stockIn)
    return props.stockIn.directShip
      ? `合格数从库存扣回，采购单可以重新入库；直发生成的出库单 ${props.stockIn.stockOutCode} 一起作废，合同出货随之冲回。`
      : '合格数按原入库成本从库存扣回，合同到货冲回，采购单可以重新入库。货已出库时请先作废相关出库单。';
  return '出库数量按原出库成本加回库存，合同出货冲回。';
});

watch(open, (value) => {
  if (!value) return;
  idempotencyKey = crypto.randomUUID();
  reason.value = '';
  error.value = '';
  submitted.value = false;
});

async function save() {
  submitted.value = true;
  if (!reason.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const data = { idempotencyKey, reason: reason.value.trim() };
    await (props.stockIn
      ? voidStockIn(props.stockIn.id, data)
      : voidStockOut(props.stockOut!.id, data));
    emit('saved', code.value);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="`作废${stockIn ? '入库单' : '出库单'} ${code}`"
    width="520px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Alert type="warning" :message="effect" show-icon />
      <label class="field">
        <span>作废原因</span>
        <Input.TextArea
          v-model:value="reason"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="500"
          placeholder="例如：数量录错、供应商没有发货"
        />
        <span v-if="submitted && !reason.trim()" class="field-error">
          请填写作废原因
        </span>
      </label>
    </div>
    <template #footer>
      <Button @click="emit('close')">取消</Button>
      <Button danger type="primary" :loading="saving" @click="save">
        确认作废
      </Button>
    </template>
  </Modal>
</template>
