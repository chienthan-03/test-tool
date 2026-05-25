import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseMatrixManifest } from '../../scripts/run-backtest-matrix.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = join(projectRoot, 'config/experiments/matrix.yaml');

describe('parseMatrixManifest', () => {
  it('parses valid matrix.yaml', () => {
    const raw = parse(readFileSync(matrixPath, 'utf8'));
    const manifest = parseMatrixManifest(raw, matrixPath);

    expect(manifest.from).toBe('2024-10-01');
    expect(manifest.to).toBe('2024-12-31');
    expect(manifest.mockSentiment).toBe(true);
    expect(manifest.runs).toHaveLength(2);
    expect(manifest.runs[0]?.id).toBe('baseline-mock');
    expect(manifest.runs[1]?.config).toContain('stricter-min-strength');
  });

  it('rejects empty runs', () => {
    expect(() =>
      parseMatrixManifest(
        { from: '2024-10-01', to: '2024-12-31', mockSentiment: true, runs: [] },
        'test',
      ),
    ).toThrow(/non-empty/);
  });

  it('rejects invalid date', () => {
    expect(() =>
      parseMatrixManifest(
        {
          from: 'not-a-date',
          to: '2024-12-31',
          mockSentiment: true,
          runs: [{ id: 'x', config: 'c.yaml' }],
        },
        'test',
      ),
    ).toThrow();
  });
});
