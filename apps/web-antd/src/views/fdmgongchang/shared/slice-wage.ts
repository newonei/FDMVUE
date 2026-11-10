import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import BigNumber from 'bignumber.js';

interface SliceOutput {
  attrs: { length?: unknown; thickness?: unknown; width?: unknown };
  goodQuantity?: unknown;
}

function positive(value: unknown) {
  const number = new BigNumber(String(value ?? 0));
  return number.isFinite() && number.isPositive() ? number : new BigNumber(0);
}

/** 物料尺寸以 cm 保存；各规格良品体积汇总为 m³，计价前不舍入。 */
export function sliceVolume(outputs: SliceOutput[]) {
  let sum = new BigNumber(0);
  for (const output of outputs) {
    sum = sum.plus(positive(output.goodQuantity)
      .times(positive(output.attrs.length))
      .times(positive(output.attrs.width))
      .times(positive(output.attrs.thickness))
      .dividedBy(1_000_000));
  }
  return sum.toFixed(sum.decimalPlaces() ?? 0);
}

/** 开片统一使用标准体积项目，旧的按长度或按片项目不能参与计算。 */
export function sliceWageItem(matches: FdmgongchangWageApi.Match[]) {
  return matches.find((item) => item.name === '开片' && item.unit === 'm³'
    && item.price !== null && item.price !== undefined
    && new BigNumber(item.price).isFinite() && new BigNumber(item.price).isGreaterThanOrEqualTo(0));
}

/** 先将整批工资四舍五入到分，再按人员 ID 升序平分，余下的分依次分配。 */
export function sliceWageAllocation(volume: FdmgongchangWageApi.Decimal, price: FdmgongchangWageApi.Decimal, people: Array<number | undefined>) {
  const userIds = [...new Set(people.filter((id): id is number => !!id))].toSorted((a, b) => a - b);
  const cents = new BigNumber(volume).times(price).times(100).integerValue(BigNumber.ROUND_HALF_UP);
  const base = userIds.length > 0 ? cents.dividedToIntegerBy(userIds.length) : new BigNumber(0);
  const remainder = userIds.length > 0 ? cents.modulo(userIds.length).toNumber() : 0;
  return {
    amount: cents.dividedBy(100).toNumber(),
    shares: userIds.map((userId, index) => ({
      amount: base.plus(index < remainder ? 1 : 0).dividedBy(100).toNumber(),
      userId,
    })),
  };
}

export function sliceParticipantError(people: Array<number | undefined>) {
  if (people.length === 0 || people.some((id) => !id)) return '请选择每一位参与开片的人员。';
  if (new Set(people).size !== people.length) return '同一人不能重复参与本次开片工资分配。';
  return '';
}

export function formatVolume(volume: FdmgongchangWageApi.Decimal) {
  return new BigNumber(volume).toFormat();
}
