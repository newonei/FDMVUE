<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Select, Upload } from 'ant-design-vue';

import { importAndReconcileExpress } from '#/api/fdmdata/expressreconbatch';
import { getExpressFeeTemplateOptions } from '#/api/fdmdata/expressfeetemplate';

defineOptions({ name: 'ExpressReconImportModal' });

const emit = defineEmits<{ success: [batchId?: number] }>();

const templateId = ref<number | undefined>();
const templateOptions = ref<{ label: string; value: number }[]>([]);
const batchName = ref('');
const billMonth = ref('');
const orderFileName = ref('');
const billFileName = ref('');
let orderFile: File | null = null;
let billFile: File | null = null;

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!orderFile) {
      message.warning('请选择订单明细 Excel');
      return;
    }
    if (!billFile) {
      message.warning('请选择快递账单 Excel');
      return;
    }
    modalApi.lock();
    try {
      const res = await importAndReconcileExpress({
        orderFile,
        billFile,
        templateId: templateId.value,
        batchName: batchName.value.trim(),
        billMonth: billMonth.value.trim(),
      });
      message.success(`导入任务已提交，批次号：${res.batchNo}`);
      emit('success', res.batchId);
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      reset();
      return;
    }
    templateOptions.value = await getExpressFeeTemplateOptions();
    if (templateOptions.value.length > 0) {
      templateId.value = templateOptions.value[0]?.value;
    }
  },
});

function reset() {
  templateId.value = undefined;
  batchName.value = '';
  billMonth.value = '';
  orderFile = null;
  billFile = null;
  orderFileName.value = '';
  billFileName.value = '';
}

function beforeOrderUpload(file: FileType) {
  orderFile = file as File;
  orderFileName.value = file.name;
  return false;
}

function beforeBillUpload(file: FileType) {
  billFile = file as File;
  billFileName.value = file.name;
  return false;
}
</script>

<template>
  <Modal title="导入并对账" class="w-[640px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-4 px-1">
      <div>
        <div class="mb-1 text-sm font-medium">计费模板</div>
        <Select
          v-model:value="templateId"
          class="w-full"
          allow-clear
          :options="templateOptions"
          placeholder="不选则使用最新启用模板"
        />
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div class="mb-1 text-sm font-medium">批次名称</div>
          <Input
            v-model:value="batchName"
            allow-clear
            placeholder="可选，如 2026年5月中通对账"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">账单月份</div>
          <Input v-model:value="billMonth" allow-clear placeholder="如 2026-05" />
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div class="mb-1 text-sm font-medium">订单明细 Excel</div>
          <Upload
            :before-upload="beforeOrderUpload"
            :max-count="1"
            accept=".xls,.xlsx"
          >
            <Button type="primary">
              <template #icon>
                <IconifyIcon icon="lucide:upload" />
              </template>
              选择订单明细
            </Button>
          </Upload>
          <div v-if="orderFileName" class="mt-1 text-xs text-muted-foreground">
            {{ orderFileName }}
          </div>
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">快递账单 Excel</div>
          <Upload
            :before-upload="beforeBillUpload"
            :max-count="1"
            accept=".xls,.xlsx"
          >
            <Button type="primary">
              <template #icon>
                <IconifyIcon icon="lucide:upload" />
              </template>
              选择快递账单
            </Button>
          </Upload>
          <div v-if="billFileName" class="mt-1 text-xs text-muted-foreground">
            {{ billFileName }}
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>
