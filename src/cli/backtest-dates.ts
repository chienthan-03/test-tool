const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MIN_YEAR = 2017;
const MAX_YEAR = 2035;
const MAX_RANGE_DAYS = 400;

export const parseStrictIsoDate = (value: string, flag: string): Date => {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid ${flag} date: ${value}. Use YYYY-MM-DD (e.g. 2025-01-01).`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${flag} date: ${value}. Use YYYY-MM-DD (e.g. 2025-01-01).`);
  }

  return date;
};

export const validateBacktestRange = (from: Date, to: Date): void => {
  const fromYear = from.getUTCFullYear();
  const toYear = to.getUTCFullYear();

  if (fromYear < MIN_YEAR || fromYear > MAX_YEAR) {
    throw new Error(
      `--from year ${fromYear} looks invalid (typo?). Use YYYY-MM-DD, e.g. 2025-01-01.`,
    );
  }

  if (toYear < MIN_YEAR || toYear > MAX_YEAR) {
    throw new Error(
      `--to year ${toYear} looks invalid (typo?). Use YYYY-MM-DD, e.g. 2025-01-31.`,
    );
  }

  const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(
      `Backtest range is ${Math.floor(rangeDays)} days (max ${MAX_RANGE_DAYS}). Split into smaller ranges, e.g. one month at a time.`,
    );
  }
};
