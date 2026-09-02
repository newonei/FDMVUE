import type {
  CreateOrderDraftInput,
  DemandSplitUpdate,
  EntityId,
  QuantityString,
  ReceiptWriteOffInput,
  ShipmentDraftInput,
  TradePrototypeState,
} from './types';

import { ref } from 'vue';

import { defineStore } from 'pinia';

import { createTradePrototypeGateway } from './gateway';
import {
  LEGACY_TRADE_PROTOTYPE_STORAGE_KEY,
  TRADE_PROTOTYPE_STORAGE_KEY,
} from './migration';

function browserSessionStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useTradePrototypeStore = defineStore('fdm-trade-prototype', () => {
  const gateway = createTradePrototypeGateway();
  const state = ref<TradePrototypeState>(gateway.getSnapshot());
  const loading = ref(false);
  const errorState = ref<null | string>(null);
  const initialized = ref(false);

  function persistSnapshot(): void {
    const storage = browserSessionStorage();
    if (!storage) return;
    storage.setItem(TRADE_PROTOTYPE_STORAGE_KEY, JSON.stringify(state.value));
  }

  function syncFromGateway(): void {
    state.value = gateway.getSnapshot();
  }

  async function runQuery<T>(operation: () => Promise<T>): Promise<T> {
    loading.value = true;
    errorState.value = null;
    try {
      return await operation();
    } catch (error) {
      errorState.value = errorMessage(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function runMutation<T>(operation: () => Promise<T>): Promise<T> {
    loading.value = true;
    errorState.value = null;
    try {
      const result = await operation();
      syncFromGateway();
      // Persistence deliberately lives in the Pinia boundary. The gateway is
      // storage-agnostic and can later be replaced with an HTTP implementation.
      persistSnapshot();
      return result;
    } catch (error) {
      // Rule-blocking audit entries are retained in the gateway even when the
      // command throws; sync them so the visible audit log tells the full story.
      syncFromGateway();
      persistSnapshot();
      errorState.value = errorMessage(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function initialize(): Promise<TradePrototypeState> {
    return runQuery(async () => {
      const storage = browserSessionStorage();
      const snapshot = await gateway.loadSnapshot(
        storage?.getItem(TRADE_PROTOTYPE_STORAGE_KEY),
        storage?.getItem(LEGACY_TRADE_PROTOTYPE_STORAGE_KEY),
      );
      state.value = snapshot;
      initialized.value = true;
      // Seed and legacy snapshots become an explicit v2 session snapshot.
      // The legacy key is intentionally left untouched.
      persistSnapshot();
      return snapshot;
    });
  }

  async function reset(): Promise<TradePrototypeState> {
    return runMutation(async () => {
      const snapshot = await gateway.reset();
      // Reset scopes itself to the v2 key. Never delete or rewrite the v1 key.
      browserSessionStorage()?.removeItem(TRADE_PROTOTYPE_STORAGE_KEY);
      return snapshot;
    });
  }

  async function searchOkkiCustomers(query: string) {
    return runQuery(() => gateway.searchOkkiCustomers(query));
  }

  async function importTradingCustomer(
    okkiCustomerId: EntityId,
    actor?: string,
  ) {
    return runMutation(() =>
      gateway.importTradingCustomer(okkiCustomerId, actor),
    );
  }

  async function createOrderDraft(
    input: CreateOrderDraftInput,
    actor?: string,
  ) {
    return runMutation(() => gateway.createOrderDraft(input, actor));
  }

  async function generateDemandDraft(orderId: EntityId) {
    return runMutation(() => gateway.generateDemandDraft(orderId));
  }

  async function confirmDemandSplit(analysisId: EntityId, actor?: string) {
    return runMutation(() => gateway.confirmDemandSplit(analysisId, actor));
  }

  async function adoptSupplierSuggestion(
    requisitionId: EntityId,
    requisitionLineId: EntityId,
    supplierId: EntityId,
    actor?: string,
  ) {
    return runMutation(() =>
      gateway.adoptSupplierSuggestion(
        requisitionId,
        requisitionLineId,
        supplierId,
        actor,
      ),
    );
  }

  async function createShipmentDraft(
    input: ShipmentDraftInput,
    actor?: string,
  ) {
    return runMutation(() => gateway.createShipmentDraft(input, actor));
  }

  async function recordReceiptAndWriteOff(input: ReceiptWriteOffInput) {
    return runMutation(() => gateway.recordReceiptAndWriteOff(input));
  }

  async function checkCustomsReadiness(taskId: EntityId) {
    return runMutation(() => gateway.checkCustomsReadiness(taskId));
  }

  async function updateFactoryTaskProgress(
    taskId: EntityId,
    completedQty: QuantityString,
    actor?: string,
  ) {
    return runMutation(() =>
      gateway.updateFactoryTaskProgress(taskId, completedQty, actor),
    );
  }

  async function updateDemandSplit(
    analysisId: EntityId,
    lineId: EntityId,
    update: DemandSplitUpdate,
    actor?: string,
  ) {
    return runMutation(() =>
      gateway.updateDemandSplit(analysisId, lineId, update, actor),
    );
  }

  async function getReceivableSummary(orderId: EntityId) {
    return runQuery(() => gateway.getReceivableSummary(orderId));
  }

  async function getOrderRelations(orderId: EntityId) {
    return runQuery(() => gateway.getOrderRelations(orderId));
  }

  return {
    adoptSupplierSuggestion,
    checkCustomsReadiness,
    confirmDemandSplit,
    createOrderDraft,
    createShipmentDraft,
    error: errorState,
    generateDemandDraft,
    getOrderRelations,
    getReceivableSummary,
    importTradingCustomer,
    initialize,
    initialized,
    loading,
    recordReceiptAndWriteOff,
    reset,
    searchOkkiCustomers,
    state,
    updateDemandSplit,
    updateFactoryTaskProgress,
  };
});
