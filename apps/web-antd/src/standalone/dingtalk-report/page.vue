<script setup lang="ts">
import type { ReportContext } from './api';
import type { ReportDraft } from './model';

import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, onMounted, ref, watch } from 'vue';

import {
  applySliceYield,
  formatQty,
  sliceHint,
  toNumber,
} from '../../views/fdmgongchang/stage-stock/model';
import { CardApiError, createCardApi } from '../dingtalk-card/api';
import { requestCardAuthCode } from '../dingtalk-card/auth';
import {
  cardSessionKey,
  createCardSession,
  readCardSession,
} from '../dingtalk-card/model';
import { createReportApi, shrinkPhoto } from './api';
import {
  bestWage,
  blockReason,
  buildPayload,
  createDraft,
  parseReportQuery,
  reportErrors,
} from './model';

const WORKBENCH_PATH = '/gongchang/workbench';

const appConfig = (
  window as Window & {
    _VBEN_ADMIN_PRO_APP_CONF_?: { VITE_GLOB_API_URL?: string };
  }
)._VBEN_ADMIN_PRO_APP_CONF_;
const apiBase =
  appConfig?.VITE_GLOB_API_URL ||
  import.meta.env.VITE_GLOB_API_URL ||
  '/admin-api';
const cardApi = createCardApi(apiBase);
const api = createReportApi(apiBase);

const stage = ref<'blocked' | 'done' | 'error' | 'form' | 'loading'>('loading');
const message = ref('正在打开');
const prepare = ref<Api.TaskPrepare>();
const draft = ref<ReportDraft>();
const wage = ref<FdmgongchangWageApi.Match>();
const my = ref<Api.My>();
const sheets = ref<string[]>([]);
const uploading = ref(0);
const submitting = ref(false);
const errors = ref<string[]>([]);
const editingPicks = ref(false);
const doneAmount = ref(0);

let context: ReportContext | undefined;
let taskId = 0;
let factoryId = 0;
let sessionKey = '';
let tenantId = 0;
let corpId = '';
let clientId = '';

const unit = computed(() => prepare.value?.task.unit ?? '');
const good = computed(() => toNumber(draft.value?.output.goodQuantity) ?? 0);
const pieceAmount = computed(() => {
  const price = toNumber(wage.value?.price) ?? 0;
  return Math.round(good.value * price * 100) / 100;
});
const hint = computed(() =>
  draft.value && draft.value.process.code === 'SLICE'
    ? sliceHint(draft.value.inputs, [draft.value.output], draft.value.output)
    : '',
);

async function login() {
  const code = await requestCardAuthCode(corpId, clientId);
  const result = await cardApi.login(tenantId, corpId, code);
  const session = createCardSession(result.accessToken, result.expiresTime);
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
  } catch {
    /* 存不了也能用这次的令牌。 */
  }
  context = { accessToken: session.accessToken, factoryId, tenantId };
}

/** 去拍照的工夫令牌可能过期：遇到 401 重新免登一次再试。 */
async function withLogin<T>(run: (context: ReportContext) => Promise<T>) {
  try {
    return await run(context!);
  } catch (error) {
    if (!(error instanceof CardApiError) || error.code !== 401) throw error;
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* 没有缓存可清。 */
    }
    await login();
    return run(context!);
  }
}

async function load() {
  stage.value = 'loading';
  message.value = '正在打开';
  try {
    ({ factoryId, taskId } = parseReportQuery(window.location.search));
    if (!/DingTalk/i.test(navigator.userAgent)) {
      throw new Error('请在钉钉里打开');
    }
    tenantId = await cardApi.resolveTenant(window.location.hostname);
    const config = await cardApi.publicConfig(tenantId);
    if (!config.enabled || !config.corpId || !config.clientId) {
      throw new Error('钉钉应用还没启用，请找管理员');
    }
    corpId = config.corpId;
    clientId = config.clientId;
    sessionKey = cardSessionKey(tenantId, config);
    let cached;
    try {
      cached = readCardSession(sessionStorage, sessionKey);
    } catch {
      /* 读不了就重新免登。 */
    }
    if (cached) {
      context = { accessToken: cached.accessToken, factoryId, tenantId };
    } else {
      await login();
    }
    await loadTask();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '打开失败，请重试';
    stage.value = 'error';
  }
}

async function loadTask() {
  const [mine, task, options] = await withLogin((c) =>
    Promise.all([api.my(c), api.prepare(c, taskId), api.options(c)]),
  );
  my.value = mine;
  prepare.value = task;
  const process = mine.processes.find((p) => p.code === task.task.process);
  if (!process) {
    message.value = '你没有这道工序的岗位，请找班组长';
    stage.value = 'blocked';
    return;
  }
  const material =
    options.materials.find((m) => m.value.toUpperCase() === 'TPE')?.value ??
    options.materials[0]?.value;
  const { draft: created, outputs } = createDraft(task, process, material);
  const blocked = blockReason(task, process, outputs);
  if (blocked || !created) {
    message.value = blocked ?? '这个任务要自己选料';
    stage.value = 'blocked';
    return;
  }
  draft.value = created;
  const attrs = created.output.attrs;
  try {
    wage.value = bestWage(
      await withLogin((c) =>
        api.wageMatch(c, {
          length: toNumber(attrs.length),
          process: process.code,
          thickness: toNumber(attrs.thickness),
          width: toNumber(attrs.width),
        }),
      ),
    );
  } catch {
    // 没配计价项目或查不到都不影响报工，由班组长补登计件
    wage.value = undefined;
  }
  stage.value = 'form';
}

// 开片按领的板材算能开多少片，改了用料要跟着重算
watch(
  () => draft.value?.inputs.map((line) => line.quantity).join(','),
  () => {
    const d = draft.value;
    if (d?.process.code === 'SLICE') applySliceYield(d.inputs, [d.output]);
  },
  { immediate: true },
);

function step(key: 'defectQuantity' | 'goodQuantity', delta: number) {
  const output = draft.value!.output;
  output[key] = Math.max(0, (toNumber(output[key]) ?? 0) + delta);
}

function setNumber(event: Event, apply: (value: number | undefined) => void) {
  const raw = (event.target as HTMLInputElement).value;
  const value = Number(raw);
  apply(raw === '' || !Number.isFinite(value) || value < 0 ? undefined : value);
}

async function pickPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  errors.value = [];
  for (const file of files) {
    uploading.value += 1;
    try {
      const blob = await shrinkPhoto(file);
      const name = blob === file ? file.name : 'issue-sheet.jpg';
      sheets.value.push(await withLogin((c) => api.upload(c, blob, name)));
    } catch (error) {
      errors.value = [
        error instanceof Error
          ? `照片没传上去：${error.message}`
          : '照片没传上去',
      ];
    } finally {
      uploading.value -= 1;
    }
  }
}

function removePhoto(index: number) {
  sheets.value.splice(index, 1);
}

async function submit() {
  if (submitting.value || !draft.value || !prepare.value || !my.value) return;
  errors.value = reportErrors(draft.value, sheets.value);
  if (uploading.value > 0) errors.value.push('照片还在上传，等一下');
  if (errors.value.length > 0) return;
  submitting.value = true;
  try {
    const payload = buildPayload(
      taskId,
      prepare.value.sourceStage ?? '',
      draft.value,
      sheets.value,
      wage.value,
      my.value.userId,
    );
    await withLogin((c) => api.report(c, payload));
    try {
      const mine = await withLogin((c) => api.my(c));
      doneAmount.value = toNumber(mine.todayAmount) ?? 0;
    } catch {
      /* 报工已成功，只是今天计件没查到。 */
    }
    stage.value = 'done';
  } catch (error) {
    errors.value = [
      error instanceof Error ? error.message : '提交失败，请重试',
    ];
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="report">
    <section v-if="stage === 'loading'" class="panel center" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <p>{{ message }}</p>
    </section>

    <section v-else-if="stage === 'error'" class="panel center">
      <h1>没有打开</h1>
      <p>{{ message }}</p>
      <button class="primary" type="button" @click="load">再试一次</button>
    </section>

    <section v-else-if="stage === 'blocked'" class="panel center">
      <h1>这个任务要在工作台报工</h1>
      <p>{{ message }}</p>
      <a class="primary link" :href="WORKBENCH_PATH">打开工作台</a>
    </section>

    <section v-else-if="stage === 'done'" class="panel center">
      <span class="ok" aria-hidden="true">✓</span>
      <h1>报工成功</h1>
      <p>好的 {{ formatQty(good) }} {{ unit }}</p>
      <p v-if="doneAmount > 0" class="amount">
        今天计件 ¥{{ formatQty(doneAmount) }}
      </p>
      <p class="muted">可以返回钉钉了，卡片一会儿会更新。</p>
    </section>

    <template v-else-if="draft && prepare">
      <header class="panel">
        <span class="tag">{{ draft.process.label }}</span>
        <h1>
          {{ prepare.task.product || `${draft.process.outputLabel}任务` }}
        </h1>
        <p class="muted">
          要做 {{ formatQty(prepare.task.quantity) }} {{ unit }}
        </p>
        <p v-if="prepare.target" class="muted">{{ prepare.target }}</p>
      </header>

      <section class="panel">
        <label class="label" for="good">好的有多少{{ unit }}？</label>
        <div class="counter">
          <button
            aria-label="好的减 1"
            type="button"
            @click="step('goodQuantity', -1)"
          >
            −
          </button>
          <input
            id="good"
            :value="draft.output.goodQuantity ?? ''"
            inputmode="decimal"
            placeholder="0"
            type="number"
            @input="setNumber($event, (v) => (draft!.output.goodQuantity = v))"
          />
          <button
            aria-label="好的加 1"
            type="button"
            @click="step('goodQuantity', 1)"
          >
            +
          </button>
        </div>
        <p v-if="hint" class="muted small">{{ hint }}</p>

        <label class="label second" for="bad">坏的有多少{{ unit }}？</label>
        <div class="counter bad">
          <button
            aria-label="坏的减 1"
            type="button"
            @click="step('defectQuantity', -1)"
          >
            −
          </button>
          <input
            id="bad"
            :value="draft.output.defectQuantity ?? ''"
            inputmode="decimal"
            placeholder="0"
            type="number"
            @input="
              setNumber($event, (v) => (draft!.output.defectQuantity = v))
            "
          />
          <button
            aria-label="坏的加 1"
            type="button"
            @click="step('defectQuantity', 1)"
          >
            +
          </button>
        </div>
      </section>

      <section class="panel">
        <span class="label">拍领料单<em>*</em></span>
        <div class="photos">
          <div v-for="(url, index) in sheets" :key="url" class="photo">
            <img :src="url" alt="领料单照片" />
            <button
              aria-label="删掉这张照片"
              type="button"
              @click="removePhoto(index)"
            >
              ×
            </button>
          </div>
          <label class="add">
            <input accept="image/*" multiple type="file" @change="pickPhotos" />
            <span>{{ uploading > 0 ? '上传中…' : '＋ 拍照' }}</span>
          </label>
        </div>
      </section>

      <section class="panel">
        <div class="row">
          <span class="label">用的料</span>
          <button
            class="text"
            type="button"
            @click="editingPicks = !editingPicks"
          >
            {{ editingPicks ? '收起' : '不一样？改一下' }}
          </button>
        </div>
        <ul class="picks">
          <li v-for="(line, index) in draft.inputs" :key="line.stock.id">
            <span class="pick-name">
              批次 {{ line.stock.batchNo }}
              <small v-if="line.stock.location">{{
                line.stock.location
              }}</small>
            </span>
            <input
              v-if="editingPicks"
              :aria-label="`批次 ${line.stock.batchNo} 用了多少`"
              :value="line.quantity"
              inputmode="decimal"
              type="number"
              @input="
                setNumber(
                  $event,
                  (v) => (draft!.inputs[index]!.quantity = v ?? 0),
                )
              "
            />
            <b v-else>{{ formatQty(line.quantity) }}</b>
          </li>
          <li v-for="(line, index) in draft.aux" :key="`aux-${line.stockId}`">
            <span class="pick-name">{{ line.name }}</span>
            <input
              v-if="editingPicks"
              :aria-label="`${line.name} 用了多少`"
              :value="line.qty"
              inputmode="decimal"
              type="number"
              @input="
                setNumber($event, (v) => (draft!.aux[index]!.qty = v ?? 0))
              "
            />
            <b v-else>{{ formatQty(line.qty) }} {{ line.unit }}</b>
          </li>
        </ul>
      </section>

      <ul v-if="errors.length > 0" class="errors" role="alert">
        <li v-for="error in errors" :key="error">{{ error }}</li>
      </ul>

      <footer class="submit">
        <button
          class="primary"
          :disabled="submitting"
          type="button"
          @click="submit"
        >
          {{
            submitting
              ? '提交中…'
              : pieceAmount > 0
                ? `提交报工（计件 ¥${formatQty(pieceAmount)}）`
                : '提交报工'
          }}
        </button>
      </footer>
    </template>
  </main>
</template>

<style>
html {
  color-scheme: light;
}

body.dingtalk-report-page {
  min-width: 280px;
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  color: #19314f;
  background: #f4f7fb;
}

.report {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(100%, 560px);
  min-height: 100vh;
  padding: 12px 12px 88px;
  margin: 0 auto;
}

.panel {
  padding: 14px;
  background: white;
  border: 1px solid #e6edf5;
  border-radius: 12px;
}

.panel h1 {
  margin: 6px 0;
  font-size: 19px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.panel p {
  margin: 4px 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.center {
  padding-block: 44px;
  text-align: center;
}

.muted {
  color: #66788d;
}

.small {
  font-size: 13px;
}

.tag {
  padding: 2px 8px;
  font-size: 12px;
  color: #1677ff;
  background: #edf4fe;
  border-radius: 5px;
}

.label {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 700;
}

.label.second {
  margin-top: 16px;
}

.label em {
  margin-left: 4px;
  font-style: normal;
  color: #d4380d;
}

.counter {
  display: flex;
  gap: 8px;
  align-items: center;
}

.counter button {
  flex: none;
  width: 56px;
  height: 56px;
  font-size: 28px;
  font-weight: 700;
  color: #19314f;
  background: #f4f7fb;
  border: 1px solid #d8e2ee;
  border-radius: 10px;
}

.counter input {
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 56px;
  font-size: 30px;
  font-weight: 800;
  color: #1677ff;
  text-align: center;
  border: 1px solid #d8e2ee;
  border-radius: 10px;
}

.counter.bad input {
  color: #d4380d;
}

.photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.photo,
.add {
  position: relative;
  box-sizing: border-box;
  width: 96px;
  height: 96px;
  overflow: hidden;
  border-radius: 10px;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo button {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 28px;
  height: 28px;
  font-size: 18px;
  line-height: 1;
  color: white;
  background: #0009;
  border: none;
  border-radius: 50%;
}

.add {
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #1677ff;
  background: #f4f8ff;
  border: 1px dashed #91bdf6;
}

.add input {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row .label {
  margin: 0;
}

.text {
  min-height: 36px;
  padding: 0 4px;
  font-size: 14px;
  color: #1677ff;
  background: none;
  border: none;
}

.picks {
  padding: 0;
  margin: 6px 0 0;
  list-style: none;
}

.picks li {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  border-top: 1px solid #eef2f7;
}

.pick-name {
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.pick-name small {
  display: block;
  color: #66788d;
}

.picks input {
  box-sizing: border-box;
  flex: none;
  width: 96px;
  height: 36px;
  font-size: 16px;
  text-align: center;
  border: 1px solid #d8e2ee;
  border-radius: 8px;
}

.errors {
  padding: 10px 12px 10px 28px;
  margin: 0;
  font-size: 14px;
  color: #d4380d;
  background: #fff2ee;
  border-radius: 10px;
}

.submit {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: white;
  border-top: 1px solid #e6edf5;
}

.primary {
  box-sizing: border-box;
  display: block;
  width: min(100%, 536px);
  height: 52px;
  margin: 0 auto;
  font-size: 18px;
  font-weight: 700;
  line-height: 52px;
  color: white;
  text-align: center;
  text-decoration: none;
  background: #1677ff;
  border: none;
  border-radius: 10px;
}

.primary:disabled {
  opacity: 0.6;
}

.center .primary {
  margin-top: 18px;
}

.ok {
  display: inline-grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 30px;
  color: white;
  background: #24a35a;
  border-radius: 50%;
}

.amount {
  font-size: 20px;
  font-weight: 700;
  color: #1677ff;
}

.spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid #dfebfc;
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
