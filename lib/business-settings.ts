export const DEFAULT_AVERAGE_JOB_VALUE = 500;
export const MAX_AVERAGE_JOB_VALUE = 100_000;

export function averageJobValueDollarsToCents(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
  return value * 100;
}

export function averageJobValueCentsToDollars(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
  return Math.round(value / 100);
}
