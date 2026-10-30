<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useAttrs, watch } from 'vue';

import { Drawer } from 'ant-design-vue';

import {
  clampDrawerWidth,
  clearDrawerWidth,
  DEFAULT_MIN_DRAWER_WIDTH,
  DRAWER_OUTSIDE_GUTTER,
  loadDrawerWidth,
  saveDrawerWidth,
} from './drawer-width';

/**
 * 右侧抽屉：拖动左边缘调整宽度，按 resizeKey 记在本机浏览器；双击边缘恢复默认宽度。
 * 其余属性、事件和插槽原样透传给 ant-design-vue Drawer。
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    minWidth?: number;
    resizable?: boolean;
    /** 同一种单据用同一个 key，各入口共享宽度 */
    resizeKey?: string;
    width?: number | string;
  }>(),
  {
    minWidth: DEFAULT_MIN_DRAWER_WIDTH,
    resizable: true,
    resizeKey: undefined,
    width: undefined,
  },
);

const attrs = useAttrs();

const enabled = computed(
  () =>
    props.resizable &&
    !!props.resizeKey &&
    (attrs.placement === undefined || attrs.placement === 'right'),
);

const savedWidth = ref<number>();
const dragWidth = ref<number>();
const resizing = ref(false);
const anchor = shallowRef<HTMLElement>();
const wrapper = shallowRef<HTMLElement>();
let stopResize: (() => void) | undefined;

watch(
  () => props.resizeKey,
  (key) => {
    savedWidth.value = key ? loadDrawerWidth(key) : undefined;
  },
  { immediate: true },
);

const drawerWidth = computed(() => {
  const width = enabled.value
    ? (dragWidth.value ?? savedWidth.value)
    : undefined;
  // 记住的宽度在更窄的屏幕上也要留出抽屉外可点击的区域
  return width
    ? `min(${width}px, calc(100vw - ${DRAWER_OUTSIDE_GUTTER}px))`
    : props.width;
});

/** 抽屉内容插入页面后，从锚点找到宽度所在的外层容器，把拖动条挂上去 */
watch(
  anchor,
  (el) => {
    wrapper.value =
      el?.closest<HTMLElement>('.ant-drawer-content-wrapper') ?? undefined;
  },
  { flush: 'post' },
);

function startResize(event: PointerEvent) {
  const target = wrapper.value;
  const key = props.resizeKey;
  if (event.button !== 0 || !target || !key) return;
  event.preventDefault();
  stopResize?.();

  const handle = event.currentTarget as HTMLElement;
  // 嵌套抽屉打开时父抽屉会被推开，按实际右边缘计算
  const right = target.getBoundingClientRect().right;
  const previousTransition = target.style.transition;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  target.style.transition = 'none';
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  handle.setPointerCapture?.(event.pointerId);
  resizing.value = true;

  const move = (moveEvent: PointerEvent) => {
    dragWidth.value = clampDrawerWidth(
      right - moveEvent.clientX,
      props.minWidth,
      window.innerWidth,
    );
  };
  const stop = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
    handle.removeEventListener('lostpointercapture', stop);
    target.style.transition = previousTransition;
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    resizing.value = false;
    stopResize = undefined;
    if (dragWidth.value !== undefined) {
      savedWidth.value = dragWidth.value;
      saveDrawerWidth(key, dragWidth.value);
      dragWidth.value = undefined;
    }
  };
  stopResize = stop;
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('lostpointercapture', stop);
}

function resetWidth() {
  if (!props.resizeKey) return;
  clearDrawerWidth(props.resizeKey);
  savedWidth.value = undefined;
}

onBeforeUnmount(() => stopResize?.());
</script>

<template>
  <Drawer v-bind="attrs" :width="drawerWidth">
    <template
      v-for="name in Object.keys($slots).filter((slot) => slot !== 'default')"
      :key="name"
      #[name]="scope"
    >
      <slot :name="name" v-bind="scope ?? {}"></slot>
    </template>
    <template #default>
      <slot></slot>
      <span
        v-if="enabled"
        ref="anchor"
        class="fdm-resizable-drawer__anchor"
        hidden
      ></span>
      <Teleport v-if="enabled && wrapper" :to="wrapper">
        <div
          :class="{ 'is-resizing': resizing }"
          class="fdm-resizable-drawer__handle"
          title="拖动调整宽度，双击恢复默认"
          @dblclick="resetWidth"
          @pointerdown="startResize"
        ></div>
      </Teleport>
    </template>
  </Drawer>
</template>

<style scoped>
.fdm-resizable-drawer__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  z-index: 10;
  width: 8px;
  cursor: col-resize;
  /* Drawer 外层是 pointer-events: none，只有内容区恢复了 */
  pointer-events: auto;
  touch-action: none;
}

.fdm-resizable-drawer__handle::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  content: '';
  background: transparent;
  transition: background-color 0.2s;
}

.fdm-resizable-drawer__handle:hover::after,
.fdm-resizable-drawer__handle.is-resizing::after {
  background: hsl(var(--primary));
}
</style>
