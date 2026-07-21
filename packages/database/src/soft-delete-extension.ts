import { Prisma } from '@prisma/client';

/**
 * Prisma extension that auto-filters soft-deleted records
 * and provides a softDelete method.
 *
 * Models with a `deletedAt` field are considered soft-deletable.
 */

// Models that support soft delete (have deletedAt field)
const SOFT_DELETE_MODELS = [
  'User',
  'Department',
  'EmployeeLevel',
  'Team',
  'Customer',
  'Lead',
  'Product',
  'Order',
  'Activity',
  'Document',
  'CallLog',
  'Task',
] as const;

type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      // Auto-filter deleted records on read queries
      async findMany({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async findFirst({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async findUnique({ args, query }) {
        // findUnique can't add arbitrary where clauses, delegate to query as-is
        return query(args);
      },
      async count({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      // Intercept delete to soft-delete instead
      async delete({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          // Convert delete to update with deletedAt
          return (query as any)({
            ...args,
            data: { deletedAt: new Date() },
          });
        }
        return query(args);
      },
      async deleteMany({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          // Convert deleteMany to updateMany with deletedAt
          return (query as any)({
            ...args,
            data: { deletedAt: new Date() },
          });
        }
        return query(args);
      },
    },
  },
});
