<script lang="ts" setup>
import type { PatternRecognitionApi } from '#/api/fdmdata/pattern/workstation';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
  message,
  Progress,
  Space,
  Switch,
  Tag,
  UploadDragger,
} from 'ant-design-vue';

import {
  confirmPatternMatch,
  getPatternRecognitionHealth,
  PATTERN_RECOGNITION_API_BASE,
  resolvePatternRecognitionAssetUrl,
  syncPatternRecognitionOrders,
  uploadPatternCapture,
} from '#/api/fdmdata/pattern/workstation';

defineOptions({ name: 'FdmdataPatternWorkstation' });

const captureFile = ref<File | null>(null);
const capturePreviewUrl = ref('');
const matching = ref(false);
const matchResult = ref<null | PatternRecognitionApi.UploadMatchResponse>(null);
const matchError = ref('');

const currentCaptureId = ref('');
const selectedOrderNo = ref('');
const selectedItemId = ref('');
const confirmLoading = ref(false);
const confirmResult = ref<null | PatternRecognitionApi.ConfirmResponse>(null);
const confirmError = ref('');

const incrementalSyncLoading = ref(false);
const fullSyncLoading = ref(false);
const syncStatus = ref('等待同步');
const autoSync = ref(true);
const serviceStatus = ref<'error' | 'loading' | 'ready'>('loading');
const serviceMessage = ref('正在连接识别服务');
let autoSyncTimer: number | undefined;

const bestMatch = computed(() => matchResult.value?.best_match || null);
const candidates = computed(() => matchResult.value?.top_candidates || []);
const selectedCandidate = computed(() =>
  candidates.value.find((item) => item.item_id === selectedItemId.value),
);
const canConfirm = computed(
  () =>
    !!currentCaptureId.value &&
    !!selectedOrderNo.value &&
    !!selectedItemId.value &&
    matchResult.value?.decision !== 'no_match',
);

function setCapturePreview(file: File | null) {
  if (capturePreviewUrl.value) {
    URL.revokeObjectURL(capturePreviewUrl.value);
    capturePreviewUrl.value = '';
  }
  if (file) {
    capturePreviewUrl.value = URL.createObjectURL(file);
  }
}

function beforeCaptureUpload(file: File) {
  captureFile.value = file;
  setCapturePreview(file);
  matchResult.value = null;
  matchError.value = '';
  confirmResult.value = null;
  confirmError.value = '';
  selectedOrderNo.value = '';
  selectedItemId.value = '';
  currentCaptureId.value = '';
  return false;
}

async function refreshHealth() {
  serviceStatus.value = 'loading';
  try {
    const data = await getPatternRecognitionHealth();
    serviceStatus.value = data.ok ? 'ready' : 'error';
    serviceMessage.value = data.ok
      ? `${data.active_model_id || '-'} / ${data.active_device || '-'}`
      : '识别服务未就绪';
  } catch (error) {
    serviceStatus.value = 'error';
    serviceMessage.value =
      error instanceof Error ? error.message : '识别服务连接失败';
  }
}

async function runSync(incremental: boolean, silent = false) {
  if (incrementalSyncLoading.value || fullSyncLoading.value) return;
  if (incremental) {
    incrementalSyncLoading.value = true;
  } else {
    fullSyncLoading.value = true;
  }
  if (!silent) {
    syncStatus.value = incremental ? '正在增量同步订单' : '正在全量重建索引';
  }
  try {
    const data = await syncPatternRecognitionOrders(incremental);
    const changed = data.orders_changed ?? data.orders_synced ?? 0;
    if (!silent || changed > 0) {
      syncStatus.value = incremental
        ? `增量同步完成：新增/变更 ${changed} 条，索引 ${data.indexed_orders ?? '-'} 条`
        : `全量重建完成：${data.orders_synced ?? '-'} 条订单，模型 ${data.active_model_id || '-'}`;
    }
    if (!silent) {
      message.success(incremental ? '增量同步完成' : '全量重建完成');
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text === 'sync_in_progress') return;
    if (!silent) {
      syncStatus.value = `同步失败：${text}`;
      message.error(syncStatus.value);
    }
  } finally {
    incrementalSyncLoading.value = false;
    fullSyncLoading.value = false;
  }
}

async function startMatch() {
  if (!captureFile.value) {
    message.warning('请选择实拍图');
    return;
  }
  matching.value = true;
  matchError.value = '';
  matchResult.value = null;
  confirmResult.value = null;
  confirmError.value = '';
  currentCaptureId.value = '';
  selectedOrderNo.value = '';
  selectedItemId.value = '';
  try {
    const form = new FormData();
    form.append('file', captureFile.value);
    const data = await uploadPatternCapture(form);
    matchResult.value = data;
    currentCaptureId.value = data.capture_id;
    if (data.best_match) {
      selectCandidate(data.best_match);
    }
    message.success('识别完成');
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    matchError.value =
      text === 'index_not_built' ? '请先同步订单并建立索引' : text;
    message.error(`识别失败：${matchError.value}`);
  } finally {
    matching.value = false;
  }
}

function selectCandidate(candidate: PatternRecognitionApi.Candidate) {
  selectedOrderNo.value = candidate.order_no;
  selectedItemId.value = candidate.item_id;
}

async function submitConfirm() {
  if (!canConfirm.value) return;
  confirmLoading.value = true;
  confirmError.value = '';
  confirmResult.value = null;
  try {
    confirmResult.value = await confirmPatternMatch({
      capture_id: currentCaptureId.value,
      item_id: selectedItemId.value,
      order_no: selectedOrderNo.value,
    });
    message.success('确认完成');
  } catch (error) {
    confirmError.value = error instanceof Error ? error.message : String(error);
    message.error(`确认失败：${confirmError.value}`);
  } finally {
    confirmLoading.value = false;
  }
}

function formatScore(score: unknown) {
  const value = Number(score);
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '-';
}

function formatOptionalScore(score: null | number | undefined) {
  return score === null || score === undefined ? '-' : formatScore(score);
}

function decisionMeta(decision?: string) {
  if (decision === 'auto_match') return { color: 'success', text: '自动匹配' };
  if (decision === 'manual_review') return { color: 'warning', text: '人工复核' };
  if (decision === 'no_match') return { color: 'error', text: '无可靠候选' };
  return { color: 'default', text: decision || '待识别' };
}

function progressPercent(candidate: PatternRecognitionApi.Candidate) {
  if (!candidate.quantity) return 0;
  return Math.min(
    100,
    Math.round((candidate.recognized_count / candidate.quantity) * 100),
  );
}

function candidateImageUrl(candidate: PatternRecognitionApi.Candidate) {
  return resolvePatternRecognitionAssetUrl(
    candidate.local_image_url || candidate.design_image_url,
  );
}

onMounted(() => {
  void refreshHealth();
  autoSyncTimer = window.setInterval(() => {
    if (autoSync.value) {
      void runSync(true, true);
    }
  }, 60_000);
});

onBeforeUnmount(() => {
  if (autoSyncTimer) {
    window.clearInterval(autoSyncTimer);
  }
  if (capturePreviewUrl.value) {
    URL.revokeObjectURL(capturePreviewUrl.value);
  }
});
</script>

<template>
  <Page auto-content-height content-class="pattern-workstation-page">
    <div class="workstation-shell">
      <section class="workstation-header">
        <div class="min-w-0">
          <h2>图案识别工作站</h2>
          <div class="header-meta">
            <Tag :color="serviceStatus === 'ready' ? 'success' : serviceStatus === 'loading' ? 'processing' : 'error'">
              {{ serviceStatus === 'ready' ? '识别服务在线' : serviceStatus === 'loading' ? '连接中' : '识别服务异常' }}
            </Tag>
            <span>{{ serviceMessage }}</span>
          </div>
        </div>
        <Space wrap>
          <Switch v-model:checked="autoSync" checked-children="自动同步" un-checked-children="手动同步" />
          <Button :loading="incrementalSyncLoading" @click="runSync(true)">
            <template #icon>
              <IconifyIcon icon="lucide:refresh-cw" />
            </template>
            增量同步订单
          </Button>
          <Button danger :loading="fullSyncLoading" @click="runSync(false)">
            <template #icon>
              <IconifyIcon icon="lucide:database-zap" />
            </template>
            全量重建索引
          </Button>
        </Space>
      </section>

      <Alert
        class="mb-4"
        show-icon
        type="info"
        :message="`识别后端：${PATTERN_RECOGNITION_API_BASE}`"
        :description="syncStatus"
      />

      <div class="workstation-grid">
        <Card class="upload-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:camera" />
              <span>上传实拍图</span>
            </div>
          </template>
          <UploadDragger
            accept="image/*"
            :before-upload="beforeCaptureUpload"
            :max-count="1"
            :show-upload-list="false"
          >
            <p class="upload-icon">
              <IconifyIcon icon="lucide:image-plus" />
            </p>
            <p class="upload-title">{{ captureFile?.name || '选择或拖入实拍图' }}</p>
          </UploadDragger>
          <Button
            class="mt-4 w-full"
            type="primary"
            :disabled="!captureFile"
            :loading="matching"
            @click="startMatch"
          >
            <template #icon>
              <IconifyIcon icon="lucide:scan-search" />
            </template>
            开始识别
          </Button>
          <div v-if="capturePreviewUrl" class="capture-preview">
            <Image :src="capturePreviewUrl" />
          </div>
          <Alert
            v-if="matchError"
            class="mt-4"
            show-icon
            type="error"
            :message="matchError"
          />
        </Card>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:badge-check" />
              <span>匹配结果</span>
            </div>
          </template>
          <template #extra>
            <Tag :color="decisionMeta(matchResult?.decision).color">
              {{ decisionMeta(matchResult?.decision).text }}
            </Tag>
          </template>

          <div v-if="matchResult" class="summary-panel">
            <div>
              <span>最佳订单</span>
              <strong>{{ bestMatch?.order_no || '-' }}</strong>
            </div>
            <div>
              <span>图案明细</span>
              <strong>{{ bestMatch?.item_no || '-' }}</strong>
            </div>
            <div>
              <span>相似度</span>
              <strong>{{ bestMatch ? formatScore(bestMatch.score) : '-' }}</strong>
            </div>
            <div>
              <span>图片质量</span>
              <strong>{{ matchResult.image_quality?.ok ? '合格' : '需复核' }}</strong>
            </div>
          </div>

          <div v-if="candidates.length > 0" class="candidate-list">
            <div
              v-for="candidate in candidates"
              :key="candidate.item_id"
              class="candidate-item"
              :class="{ selected: candidate.item_id === selectedItemId }"
            >
              <img :src="candidateImageUrl(candidate)" :alt="candidate.order_no" />
              <div class="candidate-body">
                <div class="candidate-title">
                  <strong>{{ candidate.order_no }}</strong>
                  <Tag>{{ candidate.item_no }}</Tag>
                  <Tag color="processing">{{ formatScore(candidate.score) }}</Tag>
                </div>
                <div class="score-line">
                  DINO {{ formatOptionalScore(candidate.embedding_score) }} / 分区
                  {{ formatOptionalScore(candidate.patch_score) }} / 局部
                  {{ formatOptionalScore(candidate.feature_score) }} / 细节
                  {{ formatOptionalScore(candidate.detail_score) }}
                </div>
                <Progress
                  :percent="progressPercent(candidate)"
                  size="small"
                  :format="() => `${candidate.recognized_count}/${candidate.quantity}`"
                />
                <div class="candidate-status">状态：{{ candidate.status }}</div>
              </div>
              <Button
                :type="candidate.item_id === selectedItemId ? 'primary' : 'default'"
                @click="selectCandidate(candidate)"
              >
                选择
              </Button>
            </div>
          </div>
          <Empty v-else description="暂无结果" />

          <div class="confirm-panel">
            <div class="selected-info">
              <span>当前选择</span>
              <strong>
                {{ selectedCandidate ? `${selectedCandidate.order_no} / ${selectedCandidate.item_no}` : '-' }}
              </strong>
            </div>
            <Button
              type="primary"
              :disabled="!canConfirm"
              :loading="confirmLoading"
              @click="submitConfirm"
            >
              <template #icon>
                <IconifyIcon icon="lucide:package-check" />
              </template>
              确认打包 / 下一个
            </Button>
          </div>

          <Alert
            v-if="confirmError"
            class="mt-3"
            show-icon
            type="error"
            :message="confirmError"
          />
          <Alert
            v-if="confirmResult"
            class="mt-3"
            show-icon
            :type="confirmResult.ready_to_ship ? 'success' : 'info'"
            :message="`已分配到订单 ${confirmResult.allocated_order_no} / 图案 ${confirmResult.allocated_item_no}`"
            :description="`图案进度 ${confirmResult.recognized_count}/${confirmResult.quantity}，订单状态 ${confirmResult.order_status}${confirmResult.removed_from_index ? '，该图案已完成并从识别索引移除' : '，该图案仍需继续识别'}`"
          />
        </Card>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.pattern-workstation-page {
  min-height: 0;
}

.workstation-shell {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 16px;
}

.workstation-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.workstation-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.card-title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-weight: 700;
}

.workstation-grid {
  display: grid;
  grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.upload-card,
.result-card {
  border-radius: 8px;
}

.upload-icon {
  margin-bottom: 8px;
  font-size: 34px;
  color: #2563eb;
}

.upload-title {
  margin: 0;
  font-weight: 600;
  color: #334155;
}

.capture-preview {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.capture-preview :deep(.ant-image),
.capture-preview :deep(.ant-image-img) {
  display: block;
  width: 100%;
}

.summary-panel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  margin-bottom: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.summary-panel span,
.selected-info span {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #64748b;
}

.summary-panel strong,
.selected-info strong {
  font-size: 14px;
  color: #0f172a;
}

.candidate-list {
  display: grid;
  gap: 10px;
}

.candidate-item {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.candidate-item.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgb(37 99 235 / 12%);
}

.candidate-item img {
  width: 132px;
  height: 92px;
  object-fit: contain;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.candidate-body {
  min-width: 0;
}

.candidate-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.candidate-title strong {
  font-size: 16px;
}

.score-line,
.candidate-status {
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
}

.confirm-panel {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid #eef2f7;
}

.selected-info {
  min-width: 0;
}

@media (max-width: 1180px) {
  .workstation-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .workstation-header,
  .confirm-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .candidate-item {
    grid-template-columns: 1fr;
  }

  .candidate-item img {
    width: 100%;
    height: 180px;
  }

  .summary-panel {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
