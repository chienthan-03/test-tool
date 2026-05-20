import type { AppEvents } from './types.js';

type EventHandler<K extends keyof AppEvents> = AppEvents[K] extends void
  ? () => void
  : (payload: AppEvents[K]) => void;

export class AppEventBus {
  private readonly handlers = new Map<keyof AppEvents, Set<EventHandler<keyof AppEvents>>>();

  on<K extends keyof AppEvents>(event: K, handler: EventHandler<K>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler<keyof AppEvents>);
  }

  off<K extends keyof AppEvents>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler as EventHandler<keyof AppEvents>);
  }

  emit<K extends keyof AppEvents>(
    event: K,
    ...args: AppEvents[K] extends void ? [] : [AppEvents[K]]
  ): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }

    for (const handler of set) {
      if (args.length === 0) {
        (handler as () => void)();
      } else {
        (handler as (payload: AppEvents[K]) => void)(args[0]);
      }
    }
  }
}
