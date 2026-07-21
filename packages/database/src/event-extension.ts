import { Prisma } from '@prisma/client';

/**
 * Raw event bus interface (dependency inversion).
 * @crm/database does NOT depend on NestJS. App layer implements this.
 */
export interface RawEventBus {
  emit(event: RawMutationEvent): void;
}

export interface RawMutationEvent {
  model: string;
  op: 'create' | 'update' | 'delete';
  before?: unknown;
  after?: unknown;
  at: Date;
}

/**
 * Models that emit raw mutation events.
 * Restrict to entities consumed by event listeners + audit.
 * Bridge layer (apps/api) translates raw events into semantic events.
 */
export const TRACKED_MODELS = [
  'Lead',
  'Customer',
  'Order',
  'Payment',
  'Task',
  'Activity',
  'CallLog',
] as const;

type TrackedModel = (typeof TRACKED_MODELS)[number];

function isTrackedModel(model: string): model is TrackedModel {
  return (TRACKED_MODELS as readonly string[]).includes(model);
}

/**
 * Prisma extension that emits raw mutation events for tracked models.
 *
 * Semantics:
 * - At-least-once best effort. Emit happens AFTER successful query.
 * - `before` snapshot fetched via findUnique (cost: +1 SELECT per update/delete on tracked models).
 * - `updateMany` / `deleteMany` are SKIPPED (no return rows). Document at callsite.
 * - Soft-delete (update setting deletedAt) emits 'update' op. Bridge layer detects soft-delete pattern.
 */
export function eventExtension(bus: RawEventBus) {
  return Prisma.defineExtension({
    name: 'eventEmitter',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = await query(args);
          if (isTrackedModel(model)) {
            bus.emit({ model, op: 'create', after: result, at: new Date() });
          }
          return result;
        },
        async update({ model, args, query }) {
          let before: unknown;
          if (isTrackedModel(model) && args.where) {
            try {
              before = await (Prisma as any).getExtensionContext(this).$parent[
                model.charAt(0).toLowerCase() + model.slice(1)
              ].findUnique({ where: args.where });
            } catch {
              before = undefined;
            }
          }
          const result = await query(args);
          if (isTrackedModel(model)) {
            bus.emit({ model, op: 'update', before, after: result, at: new Date() });
          }
          return result;
        },
        async delete({ model, args, query }) {
          let before: unknown;
          if (isTrackedModel(model) && args.where) {
            try {
              before = await (Prisma as any).getExtensionContext(this).$parent[
                model.charAt(0).toLowerCase() + model.slice(1)
              ].findUnique({ where: args.where });
            } catch {
              before = undefined;
            }
          }
          const result = await query(args);
          if (isTrackedModel(model)) {
            bus.emit({ model, op: 'delete', before, at: new Date() });
          }
          return result;
        },
      },
    },
  });
}
