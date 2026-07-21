import type { ActorContext } from './system-actor';

/**
 * Augment nestjs-cls ClsStore so `cls.set('actor', ...)` / `cls.get('actor')`
 * is type-checked across the codebase. Add new keys here as needed.
 */
declare module 'nestjs-cls' {
  interface ClsStore {
    actor?: ActorContext;
    /** When 'bulk' DomainEventBridge skips emit (CSV import path). */
    mode?: 'bulk';
  }
}

export {};
