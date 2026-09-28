<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, DatePicker, Modal, Steps, Tooltip, Upload } from 'ant-design-vue';

/**
 * 导入入口。模板确定前只做选择与说明，不上传、不写库；
 * 后续流程：上传 → 解析与校验（店铺匹配、金额完整性）→ 差异预览 → 确认写入。
 */
const props = defineProps<{ defaultMonth: string }>();
const open = defineModel<boolean>('open', { default: false });

const month = ref(props.defaultMonth);
const files = ref<UploadFile[]>([]);
watch(open, (value) => {
  if (!value) return;
  month.value = props.defaultMonth;
  files.value = [];
});
const steps = [
  { title: '上传 Excel', description: '选择月份与源文件' },
  { title: '解析校验', description: '匹配店铺、检查金额完整性' },
  { title: '差异预览', description: '与当月已有数据逐店对比' },
  { title: '确认写入', description: '事务写入并刷新汇总' },
];
</script>

<template>
  <Modal v-model:open="open" title="导入毛利数据" :width="640">
    <Steps :current="0" size="small" :items="steps" class="mb-5 mt-2" />
    <Alert
      type="info"
      show-icon
      class="mb-4"
      message="导入模板确认中"
      description="模板确定后开放解析、计算与写入。当前仅可选择文件，不会上传或修改任何数据。"
    />
    <div class="mb-3 flex items-center gap-3">
      <span class="w-16 shrink-0 text-sm text-muted-foreground">导入月份</span>
      <DatePicker
        v-model:value="month"
        picker="month"
        value-format="YYYY-MM"
        format="YYYY 年 MM 月"
        :allow-clear="false"
        class="w-48"
      />
    </div>
    <Upload.Dragger
      v-model:file-list="files"
      :before-upload="() => false"
      :max-count="1"
      accept=".xlsx,.xls"
    >
      <p class="mb-2 mt-2 text-3xl text-muted-foreground">
        <IconifyIcon icon="lucide:file-spreadsheet" class="inline-block" />
      </p>
      <p class="mb-1 text-sm">点击或拖拽 Excel 文件到此处</p>
      <p class="text-xs text-muted-foreground">支持 .xlsx / .xls，单次一个文件</p>
    </Upload.Dragger>
    <template #footer>
      <div class="flex items-center justify-between">
        <Tooltip title="模板确定后提供下载">
          <Button type="link" class="!px-0" disabled>
            <template #icon><IconifyIcon icon="lucide:download" /></template>
            下载导入模板
          </Button>
        </Tooltip>
        <div class="flex gap-2">
          <Button @click="open = false">取消</Button>
          <Tooltip title="模板确定后开放">
            <Button type="primary" disabled>开始解析</Button>
          </Tooltip>
        </div>
      </div>
    </template>
  </Modal>
</template>
