import type { ImpulseLeg } from './swing-detector.js';

export type FibLevels = {
  retrace382: number;
  retrace500: number;
  retrace618: number;
  retrace786: number;
  extension1618: number;
};

export const fibLevelsForLeg = (leg: ImpulseLeg): FibLevels => {
  const { start, end, direction, range } = leg;

  if (range <= 0) {
    return {
      retrace382: end.price,
      retrace500: end.price,
      retrace618: end.price,
      retrace786: end.price,
      extension1618: end.price,
    };
  }

  if (direction === 'up') {
    return {
      retrace382: end.price - range * 0.382,
      retrace500: end.price - range * 0.5,
      retrace618: end.price - range * 0.618,
      retrace786: end.price - range * 0.786,
      extension1618: end.price + range * 0.618,
    };
  }

  return {
    retrace382: end.price + range * 0.382,
    retrace500: end.price + range * 0.5,
    retrace618: end.price + range * 0.618,
    retrace786: end.price + range * 0.786,
    extension1618: end.price - range * 0.618,
  };
};

export const isInRetraceZone = (
  price: number,
  leg: ImpulseLeg,
  minRatio: number,
  maxRatio: number,
  tolerancePercent: number,
): boolean => {
  const levels = fibLevelsForLeg(leg);
  const top = leg.direction === 'up' ? levels.retrace382 : levels.retrace618;
  const bottom = leg.direction === 'up' ? levels.retrace618 : levels.retrace382;
  const zoneLow = Math.min(top, bottom);
  const zoneHigh = Math.max(top, bottom);
  const buffer = leg.range * tolerancePercent;

  if (price >= zoneLow - buffer && price <= zoneHigh + buffer) {
    return true;
  }

  const minLevel =
    leg.direction === 'up'
      ? leg.end.price - leg.range * maxRatio
      : leg.end.price + leg.range * maxRatio;
  const maxLevel =
    leg.direction === 'up'
      ? leg.end.price - leg.range * minRatio
      : leg.end.price + leg.range * minRatio;

  return price >= Math.min(minLevel, maxLevel) - buffer &&
    price <= Math.max(minLevel, maxLevel) + buffer;
};

export const fibStopLoss = (
  leg: ImpulseLeg,
  stopRatio: number,
  stopBelowSwing = true,
  stopBufferPercent = 0.002,
): number => {
  if (leg.range <= 0) {
    return leg.end.price;
  }

  const fibSl =
    leg.direction === 'up'
      ? leg.end.price - leg.range * stopRatio
      : leg.end.price + leg.range * stopRatio;

  if (!stopBelowSwing) {
    return fibSl;
  }

  const buffer = leg.start.price * stopBufferPercent;
  const swingSl =
    leg.direction === 'up' ? leg.start.price - buffer : leg.start.price + buffer;

  return leg.direction === 'up' ? Math.min(fibSl, swingSl) : Math.max(fibSl, swingSl);
};

export const fibTakeProfit = (leg: ImpulseLeg, extensionRatio: number): number => {
  const { start, end, direction, range } = leg;
  if (range <= 0) {
    return end.price;
  }

  if (direction === 'up') {
    return end.price + range * (extensionRatio - 1);
  }
  return end.price - range * (extensionRatio - 1);
};
