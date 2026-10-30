<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  message,
  Modal,
  Steps,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  applyJournalImport,
  previewJournalImport,
} from '#/api/fdmcaiwu/journal';

import { DIRECTION_LABELS, formatMoney } from '../model';

/**
 * 导入原来的 Excel 日记账：选文件 → 预览每张表新增/重复/有问题的行数 → 确认导入。
 * 收入表、支出表可以在同一个文件里；系统里已有的记录跳过，有问题的行列出来不导入。
 */
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ imported: [] }>();

const files = ref<UploadFile[]>([]);
const preview = ref<Api.ImportPreview>();
const previewing = ref(false);
const applying = ref(false);

const file = computed(() => files.value[0]?.originFileObj as File | undefined);

watch(open, (value) => {
  if (!value) return;
  files.value = [];
  preview.value = undefined;
});
watch(files, () => {
  preview.value = undefined;
});

async function runPreview() {
  if (!file.value) {
    message.warning('请先选择 Excel 文件');
    return;
  }
  previewing.value = true;
  try {
    preview.value = await previewJournalImport(file.value);
  } finally {
    previewing.value = false;
  }
}

async function apply() {
  if (!preview.value || !file.value) return;
  applying.value = true;
  try {
    const result = await applyJournalImport(file.value);
    const skipped = [
      result.duplicateRows ? `跳过已有 ${result.duplicateRows} 笔` : '',
      result.errorRows ? `${result.errorRows} 行有问题未导入` : '',
    ]
      .filter(Boolean)
      .join('，');
    message.success(`已导入 ${result.created} 笔${skipped ? `，${skipped}` : ''}`);
    open.value = false;
    emit('imported');
  } finally {
    applying.value = false;
  }
}

const sheetColumns = [
  { dataIndex: 'sheetName', key: 'sheetName', title: '工作表' },
  { dataIndex: 'direction', key: 'direction', title: '识别为', width: 80 },
  { align: 'right' as const, dataIndex: 'totalRows', key: 'totalRows', title: '数据行', width: 80 },
  { align: 'right' as const, dataIndex: 'newRows', key: 'newRows', title: '将新增', width: 80 },
  { align: 'right' as const, dataIndex: 'duplicateRows', key: 'duplicateRows', title: '已有跳过', width: 90 },
  { align: 'right' as const, dataIndex: 'errorRows', key: 'errorRows', title: '有问题', width: 80 },
];
const sampleColumns = [
  { dataIndex: 'direction', key: 'direction', title: '收支', width: 60 },
  { dataIndex: 'entryDate', key: 'entryDate', title: '日期', width: 105 },
  { dataIndex: 'entryMonth', key: 'entryMonth', title: '月份', width: 80 },
  { dataIndex: 'summary', ellipsis: true, key: 'summary', title: '摘要' },
  { align: 'right' as const, dataIndex: 'amount', key: 'amount', title: '金额', width: 120 },
  { align: 'right' as const, dataIndex: 'rmbAmount', key: 'rmbAmount', title: '折人民币', width: 120 },
  { dataIndex: 'companyName', ellipsis: true, key: 'companyName', title: '所属公司', width: 140 },
  { dataIndex: 'bankAccount', ellipsis: true, key: 'bankAccount', title: '收付款行', width: 110 },
  { dataIndex: 'counterparty', ellipsis: true, key: 'counterparty', title: '往来单位/收款方', width: 130 },
];
</script>

<template>
  <Modal
    v-model:open="open"
    title="导入 Excel 日记账"
    width="980px"
    :mask-closable="!applying"
    destroy-on-close
  >
    <Steps
      size="small"
      class="mb-4"
      :current="preview ? 1 : 0"
      :items="[{ title: '选择文件' }, { title: '核对并导入' }]"
    />

    <template v-if="!preview">
      <Upload.Dragger
        v-model:file-list="files"
        :before-upload="() => false"
        :max-count="1"
        accept=".xlsx,.xls"
      >
        <p class="mb-2 mt-2 text-3xl text-muted-foreground">
          <IconifyIcon icon="lucide:file-spreadsheet" class="inline-block" />
        </p>
        <p class="mb-1 text-sm">点击或拖拽日记账 Excel 到此处</p>
        <p class="text-xs text-muted-foreground">
          收入表、支出表可以放在同一个文件的不同工作表里，一次导入
        </p>
      </Upload.Dragger>
      <div class="mt-3 text-xs leading-5 text-muted-foreground">
        <p class="mb-1">
          按表头名称取列，列的顺序不限，表头上方可以有标题行。需要「日期」和「金额」（支出为「付款金额」）两列；
          有「付款金额 / 付款行 / 收款方」等列的表按支出导入，否则按收入导入。
        </p>
        <p class="mb-1">
          收入：月份、日期、摘要、金额、币种、折人民币、所属公司、收款行、类别、部门、经手人、往来单位、备注/单据号。
        </p>
        <p class="mb-1">
          支出：另有付款行、收款方、备注、票据类型、是否收到发票、发票号、发票金额、付款方式、送达人、送达日期。
        </p>
        <p class="mb-0">
          「月份+行 / 月份+业务员 / 月份+部门」不用导入，系统在「收支汇总」里直接按月统计。外币行需要有折人民币；币种留空按人民币。
        </p>
      </div>
    </template>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Tag color="green">将新增 {{ preview.newRows }}</Tag>
        <Tag v-if="preview.duplicateRows">已有跳过 {{ preview.duplicateRows }}</Tag>
        <Tag v-if="preview.errorRows" color="red">有问题 {{ preview.errorRows }}</Tag>
        <span class="text-muted-foreground">{{ preview.fileName }}</span>
      </div>
      <Table
        size="small"
        bordered
        row-key="sheetName"
        class="mb-3"
        :columns="sheetColumns"
        :data-source="preview.sheets"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'direction'">
            <Tag :color="record.direction === 'INCOME' ? 'green' : 'red'" class="mr-0">
              {{ DIRECTION_LABELS[record.direction as Api.Direction] }}
            </Tag>
          </template>
        </template>
      </Table>
      <Alert
        v-if="preview.errors.length"
        type="warning"
        show-icon
        class="mb-3"
        :message="`${preview.errorRows} 行有问题，这些行不会导入；可以改好 Excel 后重新导入，已导入的不会重复`"
      >
        <template #description>
          <div class="max-h-40 overflow-auto">
            <div v-for="error in preview.errors" :key="`${error.sheetName}-${error.rowNumber}`">
              {{ error.sheetName }} 第 {{ error.rowNumber }} 行：{{ error.message }}
            </div>
          </div>
        </template>
      </Alert>
      <template v-if="preview.samples.length">
        <div class="mb-2 text-sm font-medium">前 {{ preview.samples.length }} 笔将新增的记录（核对列是否对上）</div>
        <Table
          size="small"
          bordered
          :columns="sampleColumns"
          :data-source="preview.samples"
          :pagination="false"
          :row-key="(_: Api.Entry, index?: number) => String(index)"
          :scroll="{ x: 1000, y: 260 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'direction'">
              {{ DIRECTION_LABELS[record.direction as Api.Direction] }}
            </template>
            <template v-else-if="column.key === 'amount'">
              {{ formatMoney(record.amount) }}
              <span v-if="record.currency !== 'CNY'" class="text-xs text-muted-foreground">{{ record.currency }}</span>
            </template>
            <template v-else-if="column.key === 'rmbAmount'">
              {{ formatMoney(record.rmbAmount) }}
            </template>
          </template>
        </Table>
      </template>
    </template>

    <template #footer>
      <Button :disabled="applying" @click="open = false">取消</Button>
      <template v-if="!preview">
        <Button type="primary" :loading="previewing" :disabled="!file" @click="runPreview">
          预览
        </Button>
      </template>
      <template v-else>
        <Button :disabled="applying" @click="preview = undefined">重新选择</Button>
        <Button type="primary" :loading="applying" :disabled="!preview.newRows" @click="apply">
          导入 {{ preview.newRows }} 笔
        </Button>
      </template>
    </template>
  </Modal>
</template>
