<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  adoptDramaAudioTaskResult,
  cancelDramaAudioTask,
  cancelDramaComposition,
  generateDramaAudio,
  getDramaAudioTaskPage,
  getDramaAudioTaskWorkflow,
  getDramaCompositionPage,
  getDramaCompositionWorkflow,
  getDramaTimeline,
  initializeDramaTimeline,
  publishDramaComposition,
  retryDramaAudioTask,
  retryDramaComposition,
  updateDramaTimeline,
} from '#/api/fdmcreative';

import {
  clampClipStart,
  cloneDramaTimeline,
  DRAMA_AUDIO_STATUS_META,
  DRAMA_COMPOSITION_STATUS_META,
  DRAMA_TIMELINE_TRACK_META,
  frameToTimecode,
  getTimelineMediaIssues,
  isCancelableDramaPostTask,
  isRetryableDramaAudioTask,
  isRetryableDramaComposition,
  reorderAndReflowVideoTrack,
  timelineDurationSeconds,
} from './drama-timeline-utils';

defineOptions({ name: 'FdmCreativeDramaTimelineBoard' });

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  canEdit: false,
  projectStatus: 'ACTIVE',
});

const emit = defineEmits<{
  updated: [];
}>();

interface Props {
  assets?: FdmCreativeApi.CreativeAsset[];
  canEdit?: boolean;
  projectId: number;
  projectStatus?: FdmCreativeApi.ProjectStatus;
}

const router = useRouter();
const loading = ref(false);
const initializing = ref(false);
const saving = ref(false);
const submittingAudio = ref(false);
const submittingComposition = ref(false);
const timelineResponse = ref<FdmCreativeApi.DramaTimelineResponse>();
const timelineDraft = ref<FdmCreativeApi.DramaTimeline>();
const timelineUnavailable = ref(false);
const audioTasks = ref<FdmCreativeApi.DramaAudioTask[]>([]);
const compositions = ref<FdmCreativeApi.DramaComposition[]>([]);
const selected = ref<{ clipId: string; trackId: string }>();
const dragging = ref<{ clipId: string; trackId: string }>();
const preferredAudioModelId = ref<number>();
const workflowOpen = ref(false);
const workflowTitle = ref('');
const workflowJson = ref('');

const canOperate = computed(
  () => props.canEdit && props.projectStatus === 'ACTIVE',
);
const selectedTrack = computed(() =>
  timelineDraft.value?.tracks.find(
    (track) => track.trackId === selected.value?.trackId,
  ),
);
const selectedClip = computed(() =>
  selectedTrack.value?.clips.find(
    (clip) => clip.clipId === selected.value?.clipId,
  ),
);
const selectedTrackMeta = computed(() =>
  selectedTrack.value
    ? DRAMA_TIMELINE_TRACK_META[selectedTrack.value.type]
    : undefined,
);
const pixelsPerFrame = computed(() => {
  const frames = timelineDraft.value?.durationFrames ?? 0;
  return Math.max(0.035, Math.min(2, 1180 / Math.max(1, frames)));
});
const timelineWidth = computed(() =>
  Math.max(
    760,
    Math.ceil(
      (timelineDraft.value?.durationFrames ?? 0) * pixelsPerFrame.value,
    ),
  ),
);
const durationText = computed(() => {
  const duration = timelineDurationSeconds(timelineDraft.value);
  return duration > 0 ? `${duration.toFixed(2)} 秒` : '—';
});
const hasUnsavedChanges = computed(() => {
  if (!timelineResponse.value || !timelineDraft.value) return false;
  return (
    JSON.stringify(timelineDraft.value) !==
    JSON.stringify(timelineResponse.value.timeline)
  );
});
const mediaIssues = computed(() =>
  getTimelineMediaIssues(timelineDraft.value, props.assets),
);
const audioAssetOptions = computed(() =>
  props.assets
    .filter((asset) => asset.kind === 'AUDIO')
    .map((asset) => ({
      label: `${asset.name} (#${asset.id})`,
      value: asset.id,
    })),
);
const videoAssetOptions = computed(() =>
  props.assets
    .filter((asset) => asset.kind === 'VIDEO')
    .map((asset) => ({
      label: `${asset.name} (#${asset.id})`,
      value: asset.id,
    })),
);
const selectedAsset = computed(() =>
  selectedClip.value?.assetId
    ? props.assets.find((asset) => asset.id === selectedClip.value?.assetId)
    : undefined,
);
const selectedAudioType = computed(
  () =>
    selectedTrack.value &&
    ['DIALOGUE', 'MUSIC', 'NARRATION', 'SOUND_EFFECT'].includes(
      selectedTrack.value.type,
    ),
);
const latestComposition = computed(() => compositions.value[0]);
const latestCompositionAsset = computed(() =>
  latestComposition.value?.finalAssetId
    ? props.assets.find(
        (asset) => asset.id === latestComposition.value?.finalAssetId,
      )
    : undefined,
);
const publishDisabledReason = computed(() => {
  if (!timelineDraft.value || !timelineResponse.value)
    return '请先初始化时间线';
  if (!canOperate.value) return '当前成员角色或项目状态不允许合成';
  if (hasUnsavedChanges.value) return '请先保存当前时间线修改';
  if (mediaIssues.value.length > 0) return '仍有缺失或不兼容的项目素材';
  return undefined;
});

function normalizeNumber(
  value: null | number | string | undefined,
  fallback = 0,
) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function assetIdFromInput(value: unknown) {
  const assetId = normalizeNumber(
    typeof value === 'string' || typeof value === 'number' ? value : undefined,
  );
  return assetId > 0 ? assetId : undefined;
}

function trackMeta(track: FdmCreativeApi.DramaTimelineTrack) {
  return DRAMA_TIMELINE_TRACK_META[track.type];
}

function assetFor(assetId?: number) {
  return assetId === undefined
    ? undefined
    : props.assets.find((asset) => asset.id === assetId);
}

function clipLabel(
  track: FdmCreativeApi.DramaTimelineTrack,
  clip: FdmCreativeApi.DramaTimelineClip,
) {
  if (track.type === 'VIDEO') {
    return assetFor(clip.assetId)?.name || clip.cueKey || clip.clipId;
  }
  return (
    clip.text?.trim() ||
    clip.cueKey ||
    assetFor(clip.assetId)?.name ||
    clip.clipId
  );
}

function clipStyle(clip: FdmCreativeApi.DramaTimelineClip) {
  return {
    left: `${Math.max(0, clip.startFrame) * pixelsPerFrame.value}px`,
    width: `${Math.max(46, clip.durationFrames * pixelsPerFrame.value)}px`,
  };
}

function clipTime(clip: FdmCreativeApi.DramaTimelineClip) {
  return `${frameToTimecode(clip.startFrame, timelineDraft.value?.fps ?? 1)} · ${clip.durationFrames}f`;
}

function setTimeline(response: FdmCreativeApi.DramaTimelineResponse) {
  timelineResponse.value = response;
  timelineDraft.value = cloneDramaTimeline(response.timeline);
  timelineUnavailable.value = false;
  const firstTrack = response.timeline.tracks.find(
    (track) => track.clips.length > 0,
  );
  const firstClip = firstTrack?.clips[0];
  selected.value =
    firstTrack && firstClip
      ? { clipId: firstClip.clipId, trackId: firstTrack.trackId }
      : undefined;
}

async function loadTasks() {
  const [audioPage, compositionPage] = await Promise.all([
    getDramaAudioTaskPage({
      pageNo: 1,
      pageSize: 100,
      projectId: props.projectId,
    }),
    getDramaCompositionPage({
      pageNo: 1,
      pageSize: 30,
      projectId: props.projectId,
    }),
  ]);
  audioTasks.value = audioPage.list;
  compositions.value = compositionPage.list;
}

async function load() {
  if (!Number.isFinite(props.projectId) || props.projectId <= 0) return;
  loading.value = true;
  try {
    try {
      setTimeline(await getDramaTimeline(props.projectId));
    } catch {
      timelineResponse.value = undefined;
      timelineDraft.value = undefined;
      timelineUnavailable.value = true;
    }
    await loadTasks();
  } finally {
    loading.value = false;
  }
}

async function initializeTimeline() {
  if (!canOperate.value) return;
  initializing.value = true;
  try {
    setTimeline(await initializeDramaTimeline(props.projectId));
    await loadTasks();
    message.success('已从当前确认剧本和已采用镜头初始化 frame 时间线');
    emit('updated');
  } finally {
    initializing.value = false;
  }
}

async function saveTimeline() {
  if (!timelineDraft.value || !timelineResponse.value || !canOperate.value)
    return;
  saving.value = true;
  try {
    setTimeline(
      await updateDramaTimeline({
        expectedVersion: timelineResponse.value.version,
        projectId: props.projectId,
        timeline: cloneDramaTimeline(timelineDraft.value),
      }),
    );
    message.success('时间线已使用版本 CAS 保存');
    emit('updated');
  } finally {
    saving.value = false;
  }
}

function selectClip(trackId: string, clipId: string) {
  selected.value = { clipId, trackId };
}

function patchSelected(values: Partial<FdmCreativeApi.DramaTimelineClip>) {
  if (!selectedClip.value) return;
  Object.assign(selectedClip.value, values);
}

function updateClipStart(value: null | number | string | undefined) {
  const timeline = timelineDraft.value;
  const track = selectedTrack.value;
  const clip = selectedClip.value;
  if (!timeline || !track || !clip) return;
  const requested = normalizeNumber(value, clip.startFrame);
  if (track.type === 'VIDEO') {
    track.clips = reorderAndReflowVideoTrack(
      track.clips,
      clip.clipId,
      requested,
    );
    syncTimelineEndToVideoTrack();
    return;
  }
  clip.startFrame = clampClipStart(clip, requested, timeline.durationFrames);
}

function updateClipDuration(value: null | number | string | undefined) {
  const timeline = timelineDraft.value;
  const track = selectedTrack.value;
  const clip = selectedClip.value;
  if (!timeline || !track || !clip) return;
  const nextDuration = Math.max(1, normalizeNumber(value, clip.durationFrames));
  clip.durationFrames =
    track.type === 'VIDEO'
      ? nextDuration
      : Math.min(
          nextDuration,
          Math.max(1, timeline.durationFrames - clip.startFrame),
        );
  if (track.type === 'VIDEO') {
    track.clips = reorderAndReflowVideoTrack(
      track.clips,
      clip.clipId,
      clip.startFrame,
    );
    syncTimelineEndToVideoTrack();
  }
}

function updateTransitionFrames(value: null | number | string | undefined) {
  const track = selectedTrack.value;
  const clip = selectedClip.value;
  if (!track || !clip || track.type !== 'VIDEO') return;
  const ordered = [...track.clips].toSorted(
    (left, right) =>
      left.startFrame - right.startFrame ||
      left.clipId.localeCompare(right.clipId),
  );
  const index = ordered.findIndex((item) => item.clipId === clip.clipId);
  const previous = ordered[index - 1];
  const maxFfmpegTransitionFrames = Math.max(
    0,
    (timelineDraft.value?.fps ?? 1) * 10,
  );
  clip.transitionFrames =
    index <= 0
      ? 0
      : Math.min(
          Math.max(0, normalizeNumber(value, clip.transitionFrames || 0)),
          clip.durationFrames,
          previous?.durationFrames || 0,
          maxFfmpegTransitionFrames,
        );
  track.clips = reorderAndReflowVideoTrack(
    track.clips,
    clip.clipId,
    clip.startFrame,
  );
  syncTimelineEndToVideoTrack();
}

function syncTimelineEndToVideoTrack() {
  const timeline = timelineDraft.value;
  const videoTrack = timeline?.tracks.find((track) => track.type === 'VIDEO');
  if (!timeline || !videoTrack?.clips.length) return;
  const videoEnd = Math.max(
    ...videoTrack.clips.map((clip) => clip.startFrame + clip.durationFrames),
  );
  timeline.durationFrames = Math.max(1, videoEnd);
  for (const track of timeline.tracks) {
    if (track.type === 'VIDEO') continue;
    track.clips.forEach((clip) => {
      clip.durationFrames = Math.min(
        Math.max(1, clip.durationFrames),
        timeline.durationFrames,
      );
      clip.startFrame = clampClipStart(
        clip,
        clip.startFrame,
        timeline.durationFrames,
      );
    });
  }
}

function onClipDragStart(trackId: string, clipId: string) {
  dragging.value = { clipId, trackId };
}

function onTrackDrop(
  track: FdmCreativeApi.DramaTimelineTrack,
  event: DragEvent,
) {
  event.preventDefault();
  if (
    !dragging.value ||
    dragging.value.trackId !== track.trackId ||
    !timelineDraft.value
  )
    return;
  const dragged = track.clips.find(
    (clip) => clip.clipId === dragging.value?.clipId,
  );
  if (!dragged) return;
  const lane = event.currentTarget as HTMLElement;
  const requested = Math.round(
    (event.clientX - lane.getBoundingClientRect().left) / pixelsPerFrame.value,
  );
  if (track.type === 'VIDEO') {
    track.clips = reorderAndReflowVideoTrack(
      track.clips,
      dragged.clipId,
      requested,
    );
    syncTimelineEndToVideoTrack();
  } else {
    dragged.startFrame = clampClipStart(
      dragged,
      requested,
      timelineDraft.value.durationFrames,
    );
  }
  selectClip(track.trackId, dragged.clipId);
  dragging.value = undefined;
}

function defaultTrackCueText(type: FdmCreativeApi.DramaTimelineTrack['type']) {
  switch (type) {
    case 'MUSIC': {
      return '背景音乐提示词';
    }
    case 'SOUND_EFFECT': {
      return '音效提示词';
    }
    case 'SUBTITLE': {
      return '请校对字幕文本';
    }
    default: {
      return '请填写音频文本';
    }
  }
}

function addTrackCue(track: FdmCreativeApi.DramaTimelineTrack) {
  const timeline = timelineDraft.value;
  if (!timeline || !canOperate.value || track.type === 'VIDEO') return;
  const ordinal = track.clips.length + 1;
  const typeKey = track.type.toLowerCase();
  const clip: FdmCreativeApi.DramaTimelineClip = {
    clipId: `${typeKey}:custom:${Date.now()}:${ordinal}`,
    cueKey:
      track.type === 'SUBTITLE'
        ? `subtitle:custom:${ordinal}`
        : `${typeKey}:custom:${ordinal}`,
    durationFrames: Math.min(
      timeline.durationFrames,
      Math.max(1, timeline.fps * 3),
    ),
    startFrame: 0,
    text: defaultTrackCueText(track.type),
    transition: 'NONE',
    transitionFrames: 0,
    trimInFrames: 0,
    trimOutFrames: 0,
    volume: 1,
    voicePitch: 0,
    voiceSpeed: 1,
  };
  track.clips.push(clip);
  selectClip(track.trackId, clip.clipId);
}

function removeSelectedClip() {
  const track = selectedTrack.value;
  const clip = selectedClip.value;
  if (!track || !clip || !canOperate.value || track.type === 'VIDEO') return;
  track.clips = track.clips.filter((item) => item.clipId !== clip.clipId);
  selected.value = undefined;
}

async function generateSelectedAudio() {
  const timeline = timelineResponse.value;
  const clip = selectedClip.value;
  if (
    !timeline ||
    !clip?.cueKey ||
    !selectedAudioType.value ||
    !canOperate.value
  ) {
    message.warning('请选择一个包含 cueKey 的对白、旁白、音乐或音效片段');
    return;
  }
  if (hasUnsavedChanges.value) {
    message.warning('请先保存时间线，音频任务必须冻结在明确版本上');
    return;
  }
  submittingAudio.value = true;
  try {
    await generateDramaAudio({
      cueKey: clip.cueKey,
      expectedTimelineVersion: timeline.version,
      logicalModelId: preferredAudioModelId.value,
      projectId: props.projectId,
    });
    await loadTasks();
    message.success(
      '音频任务已进入统一执行队列；未指定模型时由服务器选择已启用的默认路由',
    );
  } finally {
    submittingAudio.value = false;
  }
}

async function cancelAudio(task: FdmCreativeApi.DramaAudioTask) {
  await cancelDramaAudioTask({ projectId: props.projectId, taskId: task.id });
  await loadTasks();
}

async function retryAudio(task: FdmCreativeApi.DramaAudioTask) {
  await retryDramaAudioTask({ projectId: props.projectId, taskId: task.id });
  await loadTasks();
}

async function adoptAudio(task: FdmCreativeApi.DramaAudioTask) {
  if (!timelineResponse.value || !task.resultAssetId) return;
  setTimeline(
    await adoptDramaAudioTaskResult({
      assetId: task.resultAssetId,
      expectedTimelineVersion: timelineResponse.value.version,
      projectId: props.projectId,
      taskId: task.id,
    }),
  );
  await loadTasks();
  message.success('音频结果已显式采用到当前时间线版本');
  emit('updated');
}

async function publishComposition() {
  if (!timelineResponse.value || publishDisabledReason.value) {
    message.warning(publishDisabledReason.value || '当前时间线无法合成');
    return;
  }
  submittingComposition.value = true;
  try {
    await publishDramaComposition({
      expectedTimelineVersion: timelineResponse.value.version,
      projectId: props.projectId,
    });
    await loadTasks();
    message.success(
      '已冻结时间线并创建成片版本；执行、字幕和最终资产会在统一任务链路中恢复',
    );
  } finally {
    submittingComposition.value = false;
  }
}

async function cancelComposition(composition: FdmCreativeApi.DramaComposition) {
  await cancelDramaComposition({
    projectId: props.projectId,
    revisionId: composition.id,
  });
  await loadTasks();
}

async function retryComposition(composition: FdmCreativeApi.DramaComposition) {
  await retryDramaComposition({
    projectId: props.projectId,
    revisionId: composition.id,
  });
  await loadTasks();
}

async function openAudioWorkflow(task: FdmCreativeApi.DramaAudioTask) {
  const response = await getDramaAudioTaskWorkflow(props.projectId, task.id);
  workflowTitle.value = `音频任务 #${task.id} 的不可变工作流`;
  workflowJson.value = JSON.stringify(response.workflow, null, 2);
  workflowOpen.value = true;
}

async function openCompositionWorkflow(
  composition: FdmCreativeApi.DramaComposition,
) {
  const response = await getDramaCompositionWorkflow(
    props.projectId,
    composition.id,
  );
  workflowTitle.value = `成片版本 #${composition.id} 的不可变工作流`;
  workflowJson.value = JSON.stringify(response.workflow, null, 2);
  workflowOpen.value = true;
}

function openExecution(executionId?: number) {
  if (!executionId) {
    message.info('该记录尚未绑定底层执行任务');
    return;
  }
  void router.push({
    path: '/fdmcreative/execution',
    query: { executionId: String(executionId) },
  });
}

function openAssetLibrary() {
  void router.push('/fdmcreative/assets');
}

watch(
  () => props.projectId,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading">
    <section class="timeline-board">
      <header class="timeline-board__header">
        <div>
          <p class="timeline-board__eyebrow">06 · P5C · FRAME TIMELINE</p>
          <h2>时间线与成片</h2>
          <span
            >时间、裁剪和转场均以 frame
            保存；模型调用、FFmpeg、资产和血缘继续走统一执行链路。</span
          >
        </div>
        <div class="timeline-board__header-actions">
          <Button :loading="loading" @click="load">
            <IconifyIcon icon="lucide:refresh-cw" /> 刷新状态
          </Button>
          <Button
            v-if="timelineDraft && canOperate"
            :loading="saving"
            type="primary"
            @click="saveTimeline"
          >
            <IconifyIcon icon="lucide:save" /> 保存时间线
          </Button>
        </div>
      </header>

      <div v-if="timelineUnavailable && !timelineDraft" class="timeline-empty">
        <Empty description="尚未初始化短剧时间线">
          <template #description>
            <p>
              请先确认剧本、生成稳定分镜并采用每个镜头的视频。初始化不会调用模型或
              FFmpeg。
            </p>
          </template>
          <Button
            :disabled="!canOperate"
            :loading="initializing"
            type="primary"
            @click="initializeTimeline"
          >
            <IconifyIcon icon="lucide:rows-3" /> 从已确认内容初始化
          </Button>
        </Empty>
      </div>

      <template v-else-if="timelineDraft && timelineResponse">
        <div class="timeline-summary">
          <span
            ><b>{{ durationText }}</b> ·
            {{ timelineDraft.durationFrames }} frames</span
          >
          <span
            ><b>{{ timelineDraft.fps }} fps</b> · {{ timelineDraft.width }} ×
            {{ timelineDraft.height }}</span
          >
          <Tag :color="hasUnsavedChanges ? 'warning' : 'success'">
            {{
              hasUnsavedChanges
                ? '有未保存的 frame 修改'
                : `已保存 v${timelineResponse.version}`
            }}
          </Tag>
          <span class="timeline-summary__cost"
            >成本需由实际模型路由与额度确认，当前不做不可靠报价。</span
          >
        </div>

        <div class="timeline-layout">
          <div class="timeline-editor">
            <div class="timeline-ruler-scroll">
              <div
                class="timeline-ruler"
                :style="{ width: `${timelineWidth}px` }"
              >
                <span>00:00</span>
                <span>{{
                  frameToTimecode(
                    Math.floor(timelineDraft.durationFrames / 2),
                    timelineDraft.fps,
                  )
                }}</span>
                <span>{{
                  frameToTimecode(
                    timelineDraft.durationFrames,
                    timelineDraft.fps,
                  )
                }}</span>
              </div>
            </div>
            <div class="timeline-tracks">
              <article
                v-for="track in timelineDraft.tracks"
                :key="track.trackId"
                class="timeline-track"
              >
                <aside class="timeline-track__meta">
                  <span
                    class="timeline-track__color"
                    :style="{ background: trackMeta(track).color }"
                  ></span>
                  <div>
                    <b>{{ track.label || trackMeta(track).label }}</b>
                    <small>{{ track.clips.length }} 段</small>
                  </div>
                  <Tooltip
                    v-if="track.type !== 'VIDEO' && canOperate"
                    title="新增片段会写入明确的 frame、cueKey 和默认安全参数"
                  >
                    <Button
                      size="small"
                      type="text"
                      @click="addTrackCue(track)"
                    >
                      <IconifyIcon icon="lucide:plus" />
                    </Button>
                  </Tooltip>
                </aside>
                <div class="timeline-track__viewport">
                  <div
                    class="timeline-track__lane"
                    :style="{ width: `${timelineWidth}px` }"
                    @dragover.prevent
                    @drop="onTrackDrop(track, $event)"
                  >
                    <button
                      v-for="clip in track.clips"
                      :key="clip.clipId"
                      class="timeline-clip"
                      :class="[
                        {
                          selected:
                            selected?.clipId === clip.clipId &&
                            selected?.trackId === track.trackId,
                        },
                      ]"
                      :style="{
                        ...clipStyle(clip),
                        '--track-color': trackMeta(track).color,
                      }"
                      :title="`${clipLabel(track, clip)}\n${clipTime(clip)}`"
                      draggable="true"
                      type="button"
                      @click="selectClip(track.trackId, clip.clipId)"
                      @dragend="dragging = undefined"
                      @dragstart="onClipDragStart(track.trackId, clip.clipId)"
                    >
                      <span>{{ clipLabel(track, clip) }}</span>
                      <small>{{ clipTime(clip) }}</small>
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <aside class="clip-inspector">
            <template v-if="selectedTrack && selectedClip">
              <div class="clip-inspector__head">
                <div>
                  <p :style="{ color: selectedTrackMeta?.color }">
                    {{ selectedTrack.label || selectedTrackMeta?.label }}
                  </p>
                  <b>{{ selectedClip.clipId }}</b>
                </div>
                <Button
                  v-if="selectedTrack.type !== 'VIDEO' && canOperate"
                  danger
                  size="small"
                  type="text"
                  @click="removeSelectedClip"
                >
                  删除
                </Button>
              </div>

              <label
                >开始帧
                <InputNumber
                  :disabled="!canOperate"
                  :min="0"
                  :value="selectedClip.startFrame"
                  @update:value="updateClipStart($event)"
                />
              </label>
              <label
                >持续帧
                <InputNumber
                  :disabled="!canOperate"
                  :min="1"
                  :value="selectedClip.durationFrames"
                  @update:value="updateClipDuration($event)"
                />
              </label>
              <div class="clip-inspector__time">
                {{ clipTime(selectedClip) }} ·
                {{
                  (selectedClip.durationFrames / timelineDraft.fps).toFixed(2)
                }}
                秒
              </div>

              <template v-if="selectedTrack.type === 'VIDEO'">
                <label
                  >视频素材
                  <Select
                    allow-clear
                    :disabled="!canOperate"
                    :options="videoAssetOptions"
                    :value="selectedClip.assetId"
                    placeholder="采用当前项目视频"
                    @update:value="
                      patchSelected({ assetId: assetIdFromInput($event) })
                    "
                  />
                </label>
                <label
                  >裁入帧
                  <InputNumber
                    :disabled="!canOperate"
                    :min="0"
                    :value="selectedClip.trimInFrames || 0"
                    @update:value="
                      patchSelected({ trimInFrames: normalizeNumber($event) })
                    "
                  />
                </label>
                <label
                  >裁出帧
                  <InputNumber
                    :disabled="!canOperate"
                    :min="0"
                    :value="selectedClip.trimOutFrames || 0"
                    @update:value="
                      patchSelected({ trimOutFrames: normalizeNumber($event) })
                    "
                  />
                </label>
                <label
                  >进入转场
                  <Select
                    :disabled="!canOperate || selectedClip.startFrame === 0"
                    :options="[
                      { label: '无', value: 'NONE' },
                      { label: '淡化', value: 'FADE' },
                      { label: '淡黑', value: 'FADEBLACK' },
                    ]"
                    :value="selectedClip.transition || 'NONE'"
                    @update:value="
                      patchSelected({
                        transition:
                          $event as FdmCreativeApi.DramaTimelineClip['transition'],
                      })
                    "
                  />
                </label>
                <label
                  >转场帧
                  <InputNumber
                    :disabled="
                      !canOperate ||
                      selectedClip.startFrame === 0 ||
                      (selectedClip.transition || 'NONE') === 'NONE'
                    "
                    :min="0"
                    :value="selectedClip.transitionFrames || 0"
                    @update:value="updateTransitionFrames($event)"
                  />
                </label>
              </template>

              <template v-else-if="selectedTrack.type !== 'SUBTITLE'">
                <label
                  >采用音频素材
                  <Select
                    allow-clear
                    :disabled="!canOperate"
                    :options="audioAssetOptions"
                    :value="selectedClip.assetId"
                    placeholder="从任务结果或资产库采用"
                    @update:value="
                      patchSelected({ assetId: assetIdFromInput($event) })
                    "
                  />
                </label>
                <label
                  >裁入帧
                  <InputNumber
                    :disabled="!canOperate"
                    :min="0"
                    :value="selectedClip.trimInFrames || 0"
                    @update:value="
                      patchSelected({ trimInFrames: normalizeNumber($event) })
                    "
                  />
                </label>
                <label
                  >裁出帧
                  <InputNumber
                    :disabled="!canOperate"
                    :min="0"
                    :value="selectedClip.trimOutFrames || 0"
                    @update:value="
                      patchSelected({ trimOutFrames: normalizeNumber($event) })
                    "
                  />
                </label>
                <label
                  >音量（0–2）
                  <InputNumber
                    :disabled="!canOperate"
                    :max="2"
                    :min="0"
                    :step="0.05"
                    :value="selectedClip.volume ?? 1"
                    @update:value="
                      patchSelected({
                        volume: Math.max(0, Math.min(2, Number($event) || 0)),
                      })
                    "
                  />
                </label>
              </template>

              <template v-if="selectedTrack.type !== 'VIDEO'">
                <label
                  >cueKey
                  <Input
                    :disabled="!canOperate"
                    :value="selectedClip.cueKey"
                    @update:value="
                      patchSelected({ cueKey: $event || undefined })
                    "
                  />
                </label>
                <label
                  >{{
                    selectedTrack.type === 'SUBTITLE'
                      ? '字幕文本'
                      : '音频文本 / 提示词'
                  }}
                  <Textarea
                    :auto-size="{ minRows: 3, maxRows: 8 }"
                    :disabled="!canOperate"
                    :value="selectedClip.text"
                    @update:value="patchSelected({ text: $event || undefined })"
                  />
                </label>
              </template>

              <template
                v-if="
                  selectedTrack.type === 'DIALOGUE' ||
                  selectedTrack.type === 'NARRATION'
                "
              >
                <label
                  >角色 / 声音标识
                  <Input
                    :disabled="!canOperate"
                    :value="selectedClip.voiceId"
                    @update:value="
                      patchSelected({ voiceId: $event || undefined })
                    "
                  />
                </label>
                <label
                  >语速（0.5–2）
                  <InputNumber
                    :disabled="!canOperate"
                    :max="2"
                    :min="0.5"
                    :step="0.1"
                    :value="selectedClip.voiceSpeed ?? 1"
                    @update:value="
                      patchSelected({ voiceSpeed: Number($event) || 1 })
                    "
                  />
                </label>
                <label
                  >音高（-24–24）
                  <InputNumber
                    :disabled="!canOperate"
                    :max="24"
                    :min="-24"
                    :step="1"
                    :value="selectedClip.voicePitch ?? 0"
                    @update:value="
                      patchSelected({ voicePitch: Number($event) || 0 })
                    "
                  />
                </label>
              </template>

              <div v-if="selectedAudioType" class="clip-inspector__generate">
                <label
                  >优先模型（可选）
                  <InputNumber
                    v-model:value="preferredAudioModelId"
                    :disabled="!canOperate"
                    :min="1"
                    placeholder="留空使用默认路由"
                  />
                </label>
                <Button
                  :disabled="!canOperate"
                  :loading="submittingAudio"
                  type="primary"
                  @click="generateSelectedAudio"
                >
                  <IconifyIcon icon="lucide:audio-lines" /> 生成此音频
                </Button>
              </div>

              <audio
                v-if="selectedAsset?.kind === 'AUDIO' && selectedAsset.url"
                controls
                preload="metadata"
                :src="selectedAsset.url"
              ></audio>
            </template>
            <Empty
              v-else
              description="选择一个时间线片段后可编辑明确的 frame 数据、素材和字幕。"
            />
          </aside>
        </div>

        <section class="timeline-preflight">
          <div>
            <p>合成前检查</p>
            <span
              >服务端会在冻结版本与启动前再次校验项目权限、素材可读性、路线、额度、FFmpeg
              边界和状态版本。</span
            >
          </div>
          <div class="timeline-preflight__facts">
            <Tag>{{ durationText }}</Tag>
            <Tag>{{ timelineDraft.width }} × {{ timelineDraft.height }}</Tag>
            <Tag>{{ timelineDraft.fps }} fps</Tag>
            <Tag :color="mediaIssues.length ? 'error' : 'success'">
              {{
                mediaIssues.length
                  ? `${mediaIssues.length} 个素材问题`
                  : '素材检查通过'
              }}
            </Tag>
          </div>
          <ul v-if="mediaIssues.length">
            <li
              v-for="issue in mediaIssues.slice(0, 8)"
              :key="`${issue.trackType}:${issue.clipId}:${issue.message}`"
            >
              {{
                trackMeta({
                  clips: [],
                  trackId: issue.trackType,
                  type: issue.trackType,
                }).label
              }}
              · {{ issue.clipId }}：{{ issue.message }}
            </li>
          </ul>
          <div class="timeline-preflight__actions">
            <Button
              :disabled="Boolean(publishDisabledReason)"
              :loading="submittingComposition"
              type="primary"
              @click="publishComposition"
            >
              <IconifyIcon icon="lucide:clapperboard" /> 冻结并合成成片
            </Button>
            <span v-if="publishDisabledReason">{{
              publishDisabledReason
            }}</span>
          </div>
        </section>

        <section class="post-production-tasks">
          <div class="post-production-tasks__title">
            <div>
              <p>统一任务面板</p>
              <h3>音频与成片版本</h3>
            </div>
            <Button size="small" @click="loadTasks">
              <IconifyIcon icon="lucide:refresh-cw" /> 刷新
            </Button>
          </div>
          <div class="post-production-tasks__grid">
            <article class="task-column">
              <h4>配音 / 音乐 / 音效</h4>
              <Empty
                v-if="audioTasks.length === 0"
                description="尚无音频任务"
              />
              <div v-for="task in audioTasks" :key="task.id" class="task-row">
                <div>
                  <b>{{ task.cueKey }}</b>
                  <small
                    >{{ task.taskType }} · 尝试 {{ task.attemptNo }} · 时间线
                    v{{ task.timelineVersion }}</small
                  >
                  <span v-if="task.errorMessage" class="task-row__error">{{
                    task.errorMessage
                  }}</span>
                </div>
                <div class="task-row__actions">
                  <Tag :color="DRAMA_AUDIO_STATUS_META[task.status].color">
                    {{ DRAMA_AUDIO_STATUS_META[task.status].label }}
                  </Tag>
                  <Button size="small" @click="openAudioWorkflow(task)">
                    快照
                  </Button>
                  <Button
                    v-if="task.executionId"
                    size="small"
                    @click="openExecution(task.executionId)"
                  >
                    执行
                  </Button>
                  <Button
                    v-if="canOperate && isCancelableDramaPostTask(task.status)"
                    size="small"
                    @click="cancelAudio(task)"
                  >
                    取消
                  </Button>
                  <Button
                    v-if="canOperate && isRetryableDramaAudioTask(task.status)"
                    size="small"
                    @click="retryAudio(task)"
                  >
                    重试
                  </Button>
                  <Button
                    v-if="
                      canOperate &&
                      task.status === 'SUCCEEDED' &&
                      task.resultAssetId
                    "
                    size="small"
                    type="primary"
                    @click="adoptAudio(task)"
                  >
                    采用
                  </Button>
                </div>
              </div>
            </article>

            <article class="task-column">
              <h4>成片版本</h4>
              <Empty
                v-if="compositions.length === 0"
                description="尚未创建成片版本"
              />
              <div
                v-for="composition in compositions"
                :key="composition.id"
                class="task-row composition-row"
              >
                <div>
                  <b>版本 #{{ composition.id }}</b>
                  <small
                    >时间线 v{{ composition.timelineVersion }} ·
                    {{ composition.materialAssetIds.length }} 个冻结输入</small
                  >
                  <span
                    v-if="composition.errorMessage"
                    class="task-row__error"
                    >{{ composition.errorMessage }}</span
                  >
                  <div
                    v-if="composition.materialAssetIds.length"
                    class="lineage-tags"
                  >
                    <span>血缘输入</span>
                    <Tag
                      v-for="assetId in composition.materialAssetIds"
                      :key="assetId"
                    >
                      #{{ assetId }}
                    </Tag>
                  </div>
                </div>
                <div class="task-row__actions">
                  <Tag
                    :color="
                      DRAMA_COMPOSITION_STATUS_META[composition.status].color
                    "
                  >
                    {{
                      DRAMA_COMPOSITION_STATUS_META[composition.status].label
                    }}
                  </Tag>
                  <Button
                    size="small"
                    @click="openCompositionWorkflow(composition)"
                  >
                    快照
                  </Button>
                  <Button
                    v-if="composition.executionId"
                    size="small"
                    @click="openExecution(composition.executionId)"
                  >
                    执行
                  </Button>
                  <Button
                    v-if="
                      canOperate &&
                      isCancelableDramaPostTask(composition.status)
                    "
                    size="small"
                    @click="cancelComposition(composition)"
                  >
                    取消
                  </Button>
                  <Button
                    v-if="
                      canOperate &&
                      isRetryableDramaComposition(composition.status)
                    "
                    size="small"
                    @click="retryComposition(composition)"
                  >
                    恢复
                  </Button>
                  <Button
                    v-if="composition.finalAssetId"
                    size="small"
                    type="primary"
                    @click="openAssetLibrary"
                  >
                    资产库
                  </Button>
                </div>
              </div>
            </article>
          </div>
          <div
            v-if="latestComposition?.status === 'SUCCEEDED'"
            class="final-preview"
          >
            <div>
              <p>最终成片已归档</p>
              <span
                >视频、SRT、VTT
                都是当前项目的私有资产；下面仅提供用户主动播放的预览。</span
              >
              <div class="final-preview__actions">
                <Button type="primary" @click="openAssetLibrary">
                  <IconifyIcon icon="lucide:archive" /> 查看资产库
                </Button>
                <a
                  v-if="latestCompositionAsset?.url"
                  :href="latestCompositionAsset.url"
                  rel="noopener"
                  target="_blank"
                  >下载最终视频</a
                >
                <a
                  v-if="latestComposition.subtitleSrtAssetId"
                  @click.prevent="openAssetLibrary"
                  >SRT #{{ latestComposition.subtitleSrtAssetId }}</a
                >
                <a
                  v-if="latestComposition.subtitleVttAssetId"
                  @click.prevent="openAssetLibrary"
                  >VTT #{{ latestComposition.subtitleVttAssetId }}</a
                >
              </div>
            </div>
            <video
              v-if="latestCompositionAsset?.url"
              controls
              preload="metadata"
              :src="latestCompositionAsset.url"
            ></video>
          </div>
        </section>
      </template>
    </section>
  </Spin>

  <Modal
    v-model:open="workflowOpen"
    :footer="null"
    :title="workflowTitle"
    width="min(980px, calc(100vw - 32px))"
  >
    <pre class="workflow-snapshot">{{ workflowJson }}</pre>
  </Modal>
</template>

<style scoped>
.timeline-board {
  display: grid;
  gap: 16px;
}

.timeline-board__header,
.timeline-board__header-actions,
.timeline-summary,
.timeline-preflight__facts,
.timeline-preflight__actions,
.post-production-tasks__title,
.task-row__actions,
.final-preview__actions {
  display: flex;
  gap: 9px;
  align-items: center;
}

.timeline-board__header,
.post-production-tasks__title {
  justify-content: space-between;
}

.timeline-board__header h2,
.timeline-board__header p,
.post-production-tasks h3,
.post-production-tasks h4 {
  margin: 0;
}

.timeline-board__header > div:first-child {
  display: grid;
  gap: 4px;
}

.timeline-board__header > div:first-child > span,
.timeline-preflight span,
.final-preview span {
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.timeline-board__eyebrow,
.timeline-preflight p,
.post-production-tasks__title p,
.clip-inspector__head p,
.final-preview p {
  font-size: 11px;
  font-weight: 700;
  color: var(--ant-color-primary);
  letter-spacing: 0.12em;
}

.timeline-empty {
  display: grid;
  place-items: center;
  min-height: 260px;
  border: 1px dashed var(--ant-color-border);
  border-radius: 12px;
}

.timeline-empty p {
  max-width: 520px;
  color: var(--ant-color-text-secondary);
}

.timeline-summary {
  flex-wrap: wrap;
  padding: 10px 13px;
  font-size: 13px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.timeline-summary__cost {
  color: var(--ant-color-text-tertiary);
}

.timeline-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  overflow: hidden;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.timeline-editor {
  min-width: 0;
  padding: 12px 0 12px 12px;
  border-right: 1px solid var(--ant-color-border-secondary);
}

.timeline-ruler-scroll,
.timeline-track__viewport {
  overflow-x: auto;
}

.timeline-ruler {
  display: flex;
  justify-content: space-between;
  min-height: 26px;
  padding: 0 10px;
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.timeline-tracks {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.timeline-track {
  display: grid;
  grid-template-columns: 146px minmax(0, 1fr);
  min-width: 0;
}

.timeline-track__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 7px 8px 7px 0;
}

.timeline-track__meta > div {
  display: grid;
  flex: 1;
  min-width: 0;
}

.timeline-track__meta b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.timeline-track__meta small {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.timeline-track__color {
  width: 4px;
  height: 31px;
  border-radius: 999px;
}

.timeline-track__lane {
  position: relative;
  min-height: 48px;
  background: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent 44px,
    color-mix(in srgb, var(--ant-color-border-secondary) 45%, transparent) 45px
  );
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.timeline-clip {
  position: absolute;
  top: 6px;
  display: grid;
  min-height: 34px;
  padding: 4px 7px;
  overflow: hidden;
  color: var(--ant-color-text);
  text-align: left;
  cursor: grab;
  background: color-mix(
    in srgb,
    var(--track-color) 13%,
    var(--ant-color-bg-container)
  );
  border: 1px solid var(--track-color);
  border-radius: 6px;
}

.timeline-clip:active {
  cursor: grabbing;
}

.timeline-clip.selected {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--track-color) 36%, transparent);
}

.timeline-clip span,
.timeline-clip small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-clip span {
  font-size: 11px;
  font-weight: 600;
}

.timeline-clip small {
  font-size: 10px;
  color: var(--ant-color-text-secondary);
}

.clip-inspector {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 13px;
  background: var(--ant-color-bg-container);
}

.clip-inspector__head {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.clip-inspector__head > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.clip-inspector__head b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.clip-inspector label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.clip-inspector__time {
  padding: 7px 8px;
  font-size: 11px;
  color: var(--ant-color-text-secondary);
  background: var(--ant-color-fill-quaternary);
  border-radius: 6px;
}

.clip-inspector__generate {
  display: grid;
  gap: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.clip-inspector audio {
  width: 100%;
}

.timeline-preflight {
  display: grid;
  gap: 10px;
  padding: 13px;
  background: color-mix(
    in srgb,
    var(--ant-color-primary) 4%,
    var(--ant-color-bg-container)
  );
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.timeline-preflight > div:first-child {
  display: grid;
  gap: 3px;
}

.timeline-preflight p {
  margin: 0;
}

.timeline-preflight ul {
  display: grid;
  gap: 4px;
  padding-left: 18px;
  margin: 0;
  font-size: 12px;
  color: var(--ant-color-error);
}

.timeline-preflight__actions > span {
  color: var(--ant-color-warning);
}

.post-production-tasks {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.post-production-tasks__title > div {
  display: grid;
  gap: 3px;
}

.post-production-tasks__title p {
  margin: 0;
}

.post-production-tasks__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.task-column {
  display: grid;
  gap: 7px;
  align-content: start;
  min-width: 0;
}

.task-column h4 {
  padding-bottom: 7px;
  font-size: 13px;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.task-row {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.task-row:last-child {
  border-bottom: 0;
}

.task-row > div:first-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.task-row b,
.task-row small,
.task-row__error {
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row small {
  font-size: 11px;
  color: var(--ant-color-text-secondary);
}

.task-row__error {
  font-size: 11px;
  color: var(--ant-color-error);
}

.task-row__actions {
  flex-wrap: wrap;
  place-content: flex-start flex-end;
}

.lineage-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ant-color-text-tertiary);
}

.lineage-tags :deep(.ant-tag) {
  margin-inline-end: 0;
}

.final-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 38%);
  gap: 14px;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.final-preview > div {
  display: grid;
  gap: 7px;
}

.final-preview p {
  margin: 0;
}

.final-preview__actions {
  flex-wrap: wrap;
}

.final-preview a {
  font-size: 12px;
  color: var(--ant-color-primary);
  cursor: pointer;
}

.final-preview video {
  width: 100%;
  max-height: 280px;
  background: #000;
  border-radius: 8px;
}

.workflow-snapshot {
  max-height: min(68vh, 720px);
  padding: 12px;
  margin: 0;
  overflow: auto;
  font-size: 12px;
  color: var(--ant-color-text);
  background: var(--ant-color-fill-quaternary);
  border-radius: 8px;
}

@media (max-width: 1120px) {
  .timeline-layout {
    grid-template-columns: 1fr;
  }

  .timeline-editor {
    border-right: 0;
    border-bottom: 1px solid var(--ant-color-border-secondary);
  }

  .post-production-tasks__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .timeline-board__header,
  .timeline-board__header-actions,
  .timeline-summary,
  .task-row,
  .timeline-preflight__actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .timeline-track {
    grid-template-columns: 110px minmax(0, 1fr);
  }

  .timeline-track__meta {
    padding-right: 5px;
  }

  .final-preview {
    grid-template-columns: 1fr;
  }
}
</style>
