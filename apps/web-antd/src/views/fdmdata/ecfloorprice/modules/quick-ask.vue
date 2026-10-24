<script lang="ts" setup>
import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Input, Spin, Tag } from 'ant-design-vue';

import {
  aiAskEcFloorPrice,
  lookupEcFloorPrice,
} from '#/api/fdmdata/ecfloorprice';

import { materialLabel, matKindLabel, seriesLabel } from '../data';
import { formatPrice, looksLikeItemCode } from '../model';

defineOptions({ name: 'EcFloorPriceQuickAsk' });

type FloorPrice = FdmdataEcFloorPriceApi.FloorPrice;

interface Answer {
  mode: 'ai' | 'code';
  understood?: string;
  hint?: string;
  error?: string;
  matches: Array<{ price: FloorPrice; reason?: string }>;
}

const EXAMPLES = [
  'tpe 平铺 185*61 6mm 和 8mm',
  '双人垫 1cm 多少',
  '麂皮绒普拉提垫',
  'TPE-ZD-NL-16006006',
];

const question = ref('');
const loading = ref(false);
const answer = ref<Answer>();
const loadingText = computed(() =>
  looksLikeItemCode(question.value) ? '按编码查询中…' : 'AI 正在理解你的问题…',
);

async function ask(text = question.value) {
  const q = text.trim();
  question.value = q;
  if (!q) {
    answer.value = undefined;
    return;
  }
  loading.value = true;
  answer.value = undefined;
  try {
    answer.value = looksLikeItemCode(q) ? await byCode(q) : await byAi(q);
  } catch (error: any) {
    answer.value = {
      mode: looksLikeItemCode(q) ? 'code' : 'ai',
      error: error?.message || '查询失败，请稍后再试',
      matches: [],
    };
  } finally {
    loading.value = false;
  }
}

async function byCode(code: string): Promise<Answer> {
  const r = await lookupEcFloorPrice(code);
  let hint = '';
  if (!r.skuSource) hint = `没找到商品编码 ${r.itemCode}，可以换成一句话描述让 AI 来查`;
  else if (!r.specText) hint = `${r.itemCode} 没有规格，查不到底价`;
  else if (r.matches.length === 0) {
    hint = `${r.itemCode} 规格 ${r.specText}${r.seriesCode ? `（${seriesLabel(r.seriesCode)}）` : ''} 还没有维护底价`;
  }
  return {
    mode: 'code',
    understood: r.specText ? `编码 ${r.itemCode} · 规格 ${r.specText}` : undefined,
    hint,
    matches: r.matches.map((price) => ({ price })),
  };
}

async function byAi(q: string): Promise<Answer> {
  const r = await aiAskEcFloorPrice(q);
  return {
    mode: 'ai',
    understood: r.understood,
    hint:
      r.followUp ||
      (r.matches.length === 0 ? '底价表里没找到对应的产品' : ''),
    matches: r.matches,
  };
}
</script>

<template>
  <div class="rounded-md border border-border bg-card p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex items-center gap-1 text-sm font-medium">
        <IconifyIcon icon="lucide:sparkles" class="text-primary" />
        快速查价
      </span>
      <Input.Search
        v-model:value="question"
        allow-clear
        class="w-full max-w-[560px]"
        :loading="loading"
        placeholder="一句话问 AI，如「tpe 平铺 185*61 6mm」，也可以粘贴商品标题或聚水潭编码"
        @search="ask()"
      >
        <template #enterButton>
          <Button type="primary" :loading="loading">查底价</Button>
        </template>
      </Input.Search>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span>试试：</span>
      <Tag
        v-for="e in EXAMPLES"
        :key="e"
        class="cursor-pointer"
        @click="ask(e)"
      >
        {{ e }}
      </Tag>
      <span class="ml-1">编码直接查，其余由 AI 理解；价格都来自底价表，AI 不会编价格。</span>
    </div>

    <Spin :spinning="loading" :tip="loadingText">
      <div v-if="loading" class="h-16"></div>
      <template v-else-if="answer">
        <Alert
          v-if="answer.error"
          class="mt-2"
          type="error"
          show-icon
          :message="answer.error"
        />
        <template v-else>
          <div v-if="answer.understood" class="mt-2 text-sm">
            <Tag :color="answer.mode === 'ai' ? 'purple' : 'blue'">
              {{ answer.mode === 'ai' ? 'AI 理解为' : '按编码' }}
            </Tag>
            {{ answer.understood }}
          </div>
          <div v-if="answer.matches.length > 0" class="mt-2 flex flex-wrap gap-2">
            <div
              v-for="m in answer.matches"
              :key="m.price.id"
              class="min-w-[200px] rounded border border-border px-3 py-2 text-sm"
            >
              <div class="text-xs text-muted-foreground">
                {{ seriesLabel(m.price.seriesCode) }}
                <template v-if="m.price.materialKey">
                  · {{ materialLabel(m.price.materialKey) }}
                </template>
                · {{ m.price.specText }}
                <template v-if="m.price.matKind">
                  · {{ matKindLabel(m.price.matKind) }}
                </template>
              </div>
              <div>
                底价
                <b class="text-base text-primary">
                  {{ formatPrice(m.price.floorPrice) }}
                </b>
                <span class="ml-3 text-muted-foreground">
                  参考价 {{ formatPrice(m.price.refPrice) }}
                </span>
              </div>
              <div v-if="m.reason" class="text-xs text-muted-foreground">
                {{ m.reason }}
              </div>
            </div>
          </div>
          <Alert
            v-if="answer.hint"
            class="mt-2"
            type="warning"
            show-icon
            :message="answer.hint"
          />
        </template>
      </template>
    </Spin>
  </div>
</template>
