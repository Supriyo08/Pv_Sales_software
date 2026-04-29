export const BP_DENOMINATOR = 10_000;

export function calcCommissionCents(baseCents: number, basisPoints: number): number {
  return Math.round((baseCents * basisPoints) / BP_DENOMINATOR);
}

export function bpToPercent(bp: number): number {
  return bp / 100;
}

export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}
