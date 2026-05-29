import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseOptimizeManifest } from '../../scripts/lib/optimize-manifest.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = join(projectRoot, 'config/optimize-periods.yaml');

describe('parseOptimizeManifest', () => {
  it('parses config/optimize-periods.yaml', () => {
    const raw = parse(readFileSync(manifestPath, 'utf8'));
    const manifest = parseOptimizeManifest(raw, manifestPath);

    expect(manifest.periods).toHaveLength(2);
    expect(manifest.periods[0]?.from).toBe('2024-10-01');
    expect(manifest.targets.targetPnlPercent).toBe(60);
    expect(manifest.targets.minWinRate).toBe(55);
    expect(manifest.targets.maxIterations).toBe(20);
    expect(manifest.symbolPool).toContain('BTCUSDT');
    expect(manifest.denylist).toContain('mode');
  });

  it('rejects empty periods', () => {
    expect(() =>
      parseOptimizeManifest(
        { periods: [], targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 } },
        'test',
      ),
    ).toThrow(/periods/);
  });

  it('applies path defaults', () => {
    const manifest = parseOptimizeManifest(
      {
        periods: [{ from: '2024-10-01', to: '2024-12-31' }],
        targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 },
      },
      'test',
    );
    expect(manifest.paths.candidatesDir).toBe('config/optimize');
    expect(manifest.paths.optimizeDataDir).toBe('data/optimize');
    expect(manifest.baseConfig).toBe('config/production.yaml');
    expect(manifest.seedConfig).toBe('config/production.yaml');
  });

  it('applies plateau target defaults', () => {
    const manifest = parseOptimizeManifest(
      {
        periods: [{ from: '2024-10-01', to: '2024-12-31' }],
        targets: { targetPnlPercent: 60, minWinRate: 55, maxIterations: 20 },
      },
      'test',
    );
    expect(manifest.targets.plateauWindow).toBe(3);
    expect(manifest.targets.plateauEpsilonWinRate).toBe(1);
    expect(manifest.targets.maxCodeIterations).toBe(0);
  });
});
