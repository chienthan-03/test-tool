export interface RetryOptions {
  attempts: number;
  delaysMs: number[];
}

export const retry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const { attempts, delaysMs } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < attempts - 1) {
        const delay = delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 0;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};
