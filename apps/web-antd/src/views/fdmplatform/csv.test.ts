import { describe, expect, it } from 'vitest';

import { parseMasterCsv } from './csv';

describe('platform master data CSV staging', () => {
  it('directs customer creation to the country-aware customer center without changing supplier imports', () => {
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nCUSTOMER,客户,MANUAL,1'),
    ).toThrow('客户中心');
    expect(
      parseMasterCsv('type,name,code,externalId\nSUPPLIER,供应商,S01,1')[0],
    ).toMatchObject({ type: 'SUPPLIER', code: 'S01' });
  });
  it('retains source IDs including leading zeros and accepts UTF-8 BOM', () => {
    const result = parseMasterCsv(
      '\uFEFFtype,name,code,externalId\r\nSKU,瑜伽垫,0001,000008\r\n',
    );
    expect(result[0]).toMatchObject({ code: '0001', externalId: '000008' });
  });

  it('preserves quoted commas, escaped quotes and multiline specifications', () => {
    const result = parseMasterCsv(
      'type,name,code,externalId,specification\nSKU,"垫子,大号",S01,9,"印刷""A""\n第二行"',
    );
    expect(result[0]).toMatchObject({
      name: '垫子,大号',
      specification: '印刷"A"\n第二行',
    });
  });

  it('rejects malformed quotes and row widths instead of silently shifting identifiers', () => {
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nSKU,"未闭合,S01,9'),
    ).toThrow('未闭合');
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nSKU,名称,S01,9,多余字段'),
    ).toThrow('字段数量');
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nSKU,"名称"错误,S01,9'),
    ).toThrow('无效字符');
  });

  it('rejects duplicate and unsupported headers', () => {
    expect(() =>
      parseMasterCsv('type,name,code,externalId,externalId\nSKU,名称,S01,9,9'),
    ).toThrow('表头重复');
    expect(() =>
      parseMasterCsv('type,name,code,externalId,amount\nSKU,名称,S01,9,500'),
    ).toThrow('不支持');
  });

  it('rejects missing identities and unsupported business types', () => {
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nSKU,名称,S01,'),
    ).toThrow('externalId');
    expect(() =>
      parseMasterCsv('type,name,code,externalId\nCONTRACT,名称,S01,9'),
    ).toThrow('主数据类型');
  });

  it('enforces the 200-record batch boundary and does not turn blank files into data', () => {
    const header = 'type,name,code,externalId\n';
    const lines = Array.from(
      { length: 201 },
      (_, index) => `SKU,名称,SKU-${index},${index}`,
    );
    expect(
      parseMasterCsv(header + lines.slice(0, 200).join('\n')),
    ).toHaveLength(200);
    expect(() => parseMasterCsv(header + lines.join('\n'))).toThrow('200');
    expect(() => parseMasterCsv(header)).toThrow('1 至 200');
  });
});
