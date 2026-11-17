import type { ViewportRequest } from './spreadsheet-grid';

import { SpreadsheetModel } from './spreadsheet-model';

let model: SpreadsheetModel | undefined;
self.onmessage = (event: MessageEvent<{ type: 'open'; buffer: ArrayBuffer; fileName: string } | ViewportRequest>) => {
  try {
    const request = event.data;
    if (request.type === 'open') {
      const started = performance.now();
      model = new SpreadsheetModel(request.buffer, request.fileName);
      self.postMessage({ type: 'ready', sheets: model.sheets, parseMilliseconds: Math.round(performance.now() - started) });
    } else {
      self.postMessage({ type: 'viewport', id: request.id, cells: model?.viewport(request) ?? [] });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '表格解析失败，请使用版式预览' });
  }
};
