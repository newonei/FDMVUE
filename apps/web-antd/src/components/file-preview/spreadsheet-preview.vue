<script setup lang="ts">
import type { CSSProperties } from 'vue';
import type { PreviewCell, SheetMetadata } from './spreadsheet-grid';

import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import { columnLabel, offsetIndex, SPREADSHEET_LIMITS, visibleIndices } from './spreadsheet-grid';

defineOptions({ name: 'SpreadsheetPreview' });
const props = defineProps<{ blob: Blob; fileName: string }>();
const emit = defineEmits<{ fallback: [] }>();
const sheets = shallowRef<SheetMetadata[]>([]);
const sheetIndex = ref(0);
const sheet = computed(() => sheets.value[sheetIndex.value]);
const cells = shallowRef<PreviewCell[]>([]);
const selected = shallowRef<PreviewCell>();
const loading = ref(true);
const error = ref('');
const zoom = ref(100);
const scale = computed(() => zoom.value / 100);
const viewport = ref<HTMLDivElement>();
const scrollLeft = ref(0);
const scrollTop = ref(0);
const viewportWidth = ref(1000);
const viewportHeight = ref(600);
const parseMilliseconds = ref(0);
let worker: Worker | undefined;
let observer: ResizeObserver | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let requestId = 0;
let generation = 0;

const columnStart = computed(() => sheet.value ? offsetIndex(sheet.value.columnOffsets, scrollLeft.value / scale.value) : 0);
const columnEnd = computed(() => sheet.value ? offsetIndex(sheet.value.columnOffsets, (scrollLeft.value + viewportWidth.value) / scale.value) : 0);
const rowStart = computed(() => sheet.value ? offsetIndex(sheet.value.rowOffsets, scrollTop.value / scale.value) : 0);
const rowEnd = computed(() => sheet.value ? offsetIndex(sheet.value.rowOffsets, (scrollTop.value + viewportHeight.value) / scale.value) : 0);
const visibleRows = computed(() => sheet.value ? visibleIndices(sheet.value.rowOffsets, rowStart.value, rowEnd.value) : []);
const visibleColumns = computed(() => sheet.value ? visibleIndices(sheet.value.columnOffsets, columnStart.value, columnEnd.value) : []);
const gridWidth = computed(() => ((sheet.value?.columnOffsets.at(-1) ?? 0) * scale.value));
const gridHeight = computed(() => ((sheet.value?.rowOffsets.at(-1) ?? 0) * scale.value));
const selectedAddress = computed(() => selected.value ? `${columnLabel(selected.value.column)}${selected.value.row + 1}` : '选择单元格');

function stop() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timeout);
  cancelAnimationFrame(frame);
}

function fail(message: string) {
  error.value = message;
  loading.value = false;
  stop();
}

function requestViewport() {
  if (!sheet.value || !worker) return;
  worker.postMessage({ type: 'viewport', id: ++requestId, sheet: sheetIndex.value,
    firstRow: Math.max(0, rowStart.value - 2), lastRow: Math.min(sheet.value.rows - 1, rowEnd.value + 2),
    firstColumn: Math.max(0, columnStart.value - 1), lastColumn: Math.min(sheet.value.columns - 1, columnEnd.value + 1) });
}

function onScroll() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    scrollLeft.value = viewport.value?.scrollLeft ?? 0;
    scrollTop.value = viewport.value?.scrollTop ?? 0;
    requestViewport();
  });
}

function cellStyle(cell: PreviewCell): CSSProperties {
  const current = sheet.value!;
  return {
    ...cell.style,
    left: `${current.columnOffsets[cell.column]! * scale.value}px`,
    top: `${current.rowOffsets[cell.row]! * scale.value}px`,
    width: `${(current.columnOffsets[Math.min(cell.endColumn + 1, current.columns)]! - current.columnOffsets[cell.column]!) * scale.value}px`,
    height: `${(current.rowOffsets[Math.min(cell.endRow + 1, current.rows)]! - current.rowOffsets[cell.row]!) * scale.value}px`,
    fontSize: `${Number.parseFloat(cell.style?.fontSize ?? '13') * scale.value}px`,
    textAlign: (cell.style?.textAlign ?? (cell.numeric ? 'right' : 'left')) as CSSProperties['textAlign'],
    backgroundColor: cell.style?.backgroundColor ?? cell.background ?? '#fff',
  };
}

watch(viewport, (element) => {
  observer?.disconnect();
  if (!element) return;
  const measure = () => {
    viewportWidth.value = element.clientWidth || 1000;
    viewportHeight.value = element.clientHeight || 600;
    requestViewport();
  };
  observer = new ResizeObserver(measure);
  observer.observe(element);
  measure();
});

watch([sheetIndex, zoom], async () => {
  cells.value = [];
  selected.value = undefined;
  scrollLeft.value = 0;
  scrollTop.value = 0;
  if (viewport.value) { viewport.value.scrollLeft = 0; viewport.value.scrollTop = 0; }
  await nextTick();
  requestViewport();
});

watch(() => props.blob, async (blob) => {
  stop();
  const current = ++generation;
  // A replacement workbook can keep sheet index 0, so its scroll state must
  // reset independently of the sheet/zoom watcher.
  requestId++;
  scrollLeft.value = 0;
  scrollTop.value = 0;
  if (viewport.value) { viewport.value.scrollLeft = 0; viewport.value.scrollTop = 0; }
  sheets.value = [];
  cells.value = [];
  selected.value = undefined;
  sheetIndex.value = 0;
  error.value = '';
  loading.value = true;
  if (blob.size > SPREADSHEET_LIMITS.fileBytes) { fail('文件超过 25 MB，建议使用版式预览查看完整内容'); return; }
  try {
    worker = new Worker(new URL('./spreadsheet.worker.ts', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    worker.onerror = () => { if (current === generation) fail('表格预览加载失败，请使用版式预览'); };
    worker.onmessage = (event: MessageEvent) => {
      if (current !== generation) return;
      const response = event.data;
      if (response.type === 'error') { fail(response.message); return; }
      if (response.type === 'ready') {
        clearTimeout(timeout);
        sheets.value = response.sheets;
        parseMilliseconds.value = response.parseMilliseconds;
        loading.value = false;
        void nextTick(requestViewport);
      } else if (response.type === 'viewport' && response.id === requestId) {
        cells.value = response.cells;
      }
    };
    timeout = setTimeout(() => fail('该文件解析时间较长，已停止快速预览；可切换版式预览'), SPREADSHEET_LIMITS.parseMilliseconds);
    const buffer = await blob.arrayBuffer();
    if (current !== generation || worker !== activeWorker) return;
    worker.postMessage({ type: 'open', buffer, fileName: props.fileName }, [buffer]);
  } catch {
    if (current === generation) fail('无法读取此表格，请使用版式预览');
  }
}, { immediate: true });

onBeforeUnmount(() => { generation++; stop(); observer?.disconnect(); });
</script>

<template>
  <section class="spreadsheet-preview" :aria-label="`${fileName} 表格预览`" :data-parse-ms="parseMilliseconds">
    <div class="spreadsheet-toolbar">
      <div class="spreadsheet-title"><span class="spreadsheet-badge">X</span><strong>{{ fileName }}</strong><span class="spreadsheet-readonly">只读</span></div>
      <div class="spreadsheet-actions">
        <label>缩放 <select v-model.number="zoom" aria-label="表格缩放"><option v-for="value in [75, 100, 125, 150, 200]" :key="value" :value="value">{{ value }}%</option></select></label>
        <button type="button" @click="emit('fallback')">版式预览</button>
      </div>
    </div>
    <div class="spreadsheet-notice">快速表格视图 · 公式显示文件保存时的结果；图片、图表和复杂排版请切换版式预览。</div>
    <div v-if="loading" class="spreadsheet-state" role="status"><span class="spreadsheet-spinner"></span>正在读取表格…</div>
    <div v-else-if="error" class="spreadsheet-state" role="alert"><span>{{ error }}</span><button type="button" @click="emit('fallback')">打开版式预览</button></div>
    <template v-else-if="sheet">
      <div class="spreadsheet-formula"><span class="spreadsheet-address">{{ selectedAddress }}</span><span class="spreadsheet-fx">fx</span><div class="spreadsheet-value" :title="selected?.formula ? `=${selected.formula}` : selected?.text">{{ selected?.formula ? `=${selected.formula}　 →　${selected.text}` : selected?.text || '点击单元格查看完整内容' }}</div></div>
      <div class="spreadsheet-frame">
        <div class="spreadsheet-corner"></div>
        <div class="spreadsheet-column-headers">
          <div v-for="column in visibleColumns" :key="column" class="spreadsheet-header" :style="{ left: `${sheet.columnOffsets[column]! * scale - scrollLeft}px`, width: `${(sheet.columnOffsets[column + 1]! - sheet.columnOffsets[column]!) * scale}px` }">{{ columnLabel(column) }}</div>
        </div>
        <div class="spreadsheet-row-headers">
          <div v-for="row in visibleRows" :key="row" class="spreadsheet-header" :style="{ top: `${sheet.rowOffsets[row]! * scale - scrollTop}px`, height: `${(sheet.rowOffsets[row + 1]! - sheet.rowOffsets[row]!) * scale}px` }">{{ row + 1 }}</div>
        </div>
        <div ref="viewport" class="spreadsheet-viewport" role="grid" :aria-rowcount="sheet.rows" :aria-colcount="sheet.columns" @scroll="onScroll">
          <div class="spreadsheet-canvas" :style="{ width: `${gridWidth}px`, height: `${gridHeight}px` }">
            <button v-for="cell in cells" :key="`${cell.row}:${cell.column}`" type="button" role="gridcell" class="spreadsheet-cell" :class="{ 'is-selected': selected?.row === cell.row && selected?.column === cell.column }" :aria-rowindex="cell.row + 1" :aria-colindex="cell.column + 1" :aria-selected="selected?.row === cell.row && selected?.column === cell.column" :style="cellStyle(cell)" :title="cell.text" @click="selected = cell">{{ cell.text }}</button>
          </div>
        </div>
      </div>
      <div class="spreadsheet-bottom"><div class="spreadsheet-tabs" role="tablist" aria-label="工作表"><button v-for="(item, index) in sheets" :key="index" role="tab" type="button" :aria-selected="index === sheetIndex" :class="{ active: index === sheetIndex }" @click="sheetIndex = index">{{ item.name }}{{ item.hidden ? '（隐藏表）' : '' }}</button></div><span class="spreadsheet-status">{{ sheet.rows.toLocaleString() }} 行 × {{ sheet.columns.toLocaleString() }} 列 · 只读</span></div>
    </template>
  </section>
</template>

<style scoped>
.spreadsheet-preview{width:100%;min-width:0;background:#fff;color:#1e293b;font-size:13px;border:1px solid #dbe3ed;border-radius:10px;overflow:hidden}
.spreadsheet-toolbar{min-height:54px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff}
.spreadsheet-title,.spreadsheet-actions{display:flex;align-items:center;gap:12px;min-width:0}.spreadsheet-title strong{max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.spreadsheet-badge{display:grid;place-items:center;background:#168352;color:#fff;width:28px;height:30px;border-radius:5px;font-weight:700;font-size:18px}.spreadsheet-readonly{background:#eef6f1;color:#34815b;padding:2px 7px;border-radius:4px;white-space:nowrap;font-size:11px}.spreadsheet-actions{flex-shrink:0}.spreadsheet-actions label{white-space:nowrap;color:#64748b}.spreadsheet-actions select{padding:4px;border:1px solid #e2e8f0;border-radius:5px;background:white;color:#334155}.spreadsheet-actions button,.spreadsheet-state button{border:1px solid #cbd5e1;border-radius:5px;background:#fff;padding:5px 10px;color:#334155;cursor:pointer}
.spreadsheet-notice{font-size:12px;background:#f3f7fb;color:#64748b;padding:7px 16px;border-top:1px solid #e8eef5;border-bottom:1px solid #e2e8f0}.spreadsheet-state{height:440px;display:flex;align-items:center;justify-content:center;gap:14px;flex-direction:column;color:#64748b}.spreadsheet-spinner{width:26px;height:26px;border:3px solid #e2e8f0;border-top-color:#168352;border-radius:50%;animation:spreadsheet-spin .8s linear infinite}@keyframes spreadsheet-spin{to{transform:rotate(360deg)}}
.spreadsheet-formula{height:40px;display:flex;align-items:center;border-bottom:1px solid #dbe3ed;background:#fff}.spreadsheet-address{width:112px;padding:0 12px;text-align:center;font-size:12px;color:#475569;flex-shrink:0;border-right:1px solid #e2e8f0}.spreadsheet-fx{font-family:Georgia,serif;font-size:17px;font-style:italic;color:#94a3b8;padding:0 14px}.spreadsheet-value{overflow:auto;white-space:nowrap;padding-right:16px;user-select:text;font-size:13px;line-height:30px}
.spreadsheet-frame{height:clamp(220px,calc(100vh - 340px),820px);display:grid;grid-template-columns:52px minmax(0,1fr);grid-template-rows:28px minmax(0,1fr);overflow:hidden;background:#f8fafc}.spreadsheet-corner{background:#edf2f7;border-right:1px solid #dbe3ed;border-bottom:1px solid #dbe3ed}.spreadsheet-column-headers,.spreadsheet-row-headers{position:relative;overflow:hidden;background:#f1f5f9;color:#64748b;user-select:none}.spreadsheet-header{position:absolute;display:flex;align-items:center;justify-content:center;border-right:1px solid #dbe3ed;border-bottom:1px solid #dbe3ed;font-size:11px;box-sizing:border-box}.spreadsheet-column-headers .spreadsheet-header{height:28px}.spreadsheet-row-headers .spreadsheet-header{width:52px}.spreadsheet-viewport{overflow:auto;overscroll-behavior:contain;position:relative;min-height:0;min-width:0}.spreadsheet-canvas{position:relative;background:#fff;min-width:100%;min-height:100%}.spreadsheet-cell{position:absolute;box-sizing:border-box;margin:0;border:0;border-right:1px solid #e4e9f0;border-bottom:1px solid #e4e9f0;border-radius:0;padding:4px 8px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:pre;line-height:1.4;font-family:Arial,"Microsoft YaHei",sans-serif;cursor:cell;user-select:text;display:block}.spreadsheet-cell:hover{box-shadow:inset 0 0 0 1px #86bfa2}.spreadsheet-cell.is-selected{box-shadow:inset 0 0 0 2px #168352;z-index:1}.spreadsheet-cell:focus-visible{outline:2px solid #168352;outline-offset:-2px}
.spreadsheet-bottom{display:flex;align-items:center;gap:12px;border-top:1px solid #dbe3ed;background:#f8fafc;min-height:39px}.spreadsheet-tabs{display:flex;overflow:auto;flex:1;min-width:0;align-self:stretch}.spreadsheet-tabs button{border:0;border-right:1px solid #e2e8f0;border-bottom:2px solid transparent;background:transparent;padding:8px 18px;white-space:nowrap;color:#64748b;cursor:pointer}.spreadsheet-tabs button.active{color:#168352;background:#fff;border-bottom-color:#168352;font-weight:600}.spreadsheet-status{padding-right:14px;color:#94a3b8;white-space:nowrap;font-size:11px}@media(max-width:640px){.spreadsheet-toolbar{padding:8px;gap:6px}.spreadsheet-title{gap:6px}.spreadsheet-title strong{max-width:25vw}.spreadsheet-readonly,.spreadsheet-status{display:none}.spreadsheet-actions{gap:6px}.spreadsheet-notice{padding:6px 8px}.spreadsheet-frame{grid-template-columns:38px minmax(0,1fr)}.spreadsheet-row-headers .spreadsheet-header{width:38px}}
</style>
