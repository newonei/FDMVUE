<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, Input, message, Select, Upload } from 'ant-design-vue';

import {
  downloadExpressBillTemplate,
  reconcileCarrierExpress,
} from '#/api/fdmdata/expressreconbatch';
import { getExpressFeeTemplateOptions } from '#/api/fdmdata/expressfeetemplate';

defineOptions({ name: 'ExpressReconReconcileModal' });

const emit = defineEmits<{ success: [batchId?: number] }>();

const periodId = ref<number | undefined>();
const templateId = ref<number | undefined>();
const templateOptions = ref<{ label: string; value: number }[]>([]);
const batchName = ref('');
const billFileName = ref('');
let billFile: File | null = null;

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!periodId.value) {
      message.warning('缺少账期信息');
      return;
    }
    if (!billFile) {
      message.warning('请选择快递账单 Excel');
      return;
    }
    modalApi.lock();
    try {
      const res = await reconcileCarrierExpress({
        periodId: periodId.value,
        billFile,
        templateId: templateId.value,
        batchName: batchName.value.trim(),
      });
      message.success(`对账任务已提交，批次号：${res.batchNo}`);
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
    const data = modalApi.getData() as { periodId?: number } | null | undefined;
    periodId.value = Number(data?.periodId) || undefined;
    templateOptions.value = await getExpressFeeTemplateOptions();
    if (templateOptions.value.length > 0) {
      templateId.value = templateOptions.value[0]?.value;
    }
  },
});

function reset() {
  periodId.value = undefined;
  templateId.value = undefined;
  batchName.value = '';
  billFile = null;
  billFileName.value = '';
}

function beforeBillUpload(file: FileType) {
  billFile = file as File;
  billFileName.value = file.name;
  return false;
}

async function handleDownloadTemplate() {
  const data = await downloadExpressBillTemplate();
  downloadFileFromBlobPart({ fileName: '快递账单导入模板.xls', source: data });
}
</script>

<template>
  <Modal title="上传账单对账" class="w-[560px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-4 px-1">
      <p class="mb-0 text-xs text-muted-foreground">
        选择该快递公司的计费模板并上传其当月对账单，系统将以账单运单匹配本账期订单池。
      </p>
      <div>
        <div class="mb-1 text-sm font-medium">计费模板（对应快递公司）</div>
        <Select
          v-model:value="templateId"
          class="w-full"
          allow-clear
          :options="templateOptions"
          placeholder="不选则使用最新启用模板"
        />
      </div>
      <div>
        <div class="mb-1 text-sm font-medium">批次名称</div>
        <Input
          v-model:value="batchName"
          allow-clear
          placeholder="可选，如 中通对账"
        />
      </div>
      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-sm font-medium">快递账单 Excel</span>
          <Button type="link" size="small" class="!px-0" @click="handleDownloadTemplate">
            <template #icon>
              <IconifyIcon icon="lucide:file-down" />
            </template>
            下载模板
          </Button>
        </div>
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
  </Modal>
</template>
