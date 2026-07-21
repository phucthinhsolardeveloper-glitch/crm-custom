import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete-extension';
import { eventExtension, type RawEventBus } from './event-extension';

const noopBus: RawEventBus = { emit() {} };

/**
 * Factory: composes soft-delete + event extensions onto a fresh PrismaClient.
 * Pass a real RawEventBus from app layer to enable workflow events.
 * Default noopBus keeps seed scripts / standalone tools working.
 */
export function createPrismaClient(bus: RawEventBus = noopBus) {
  return new PrismaClient()
    .$extends(softDeleteExtension)
    .$extends(eventExtension(bus));
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

/**
 * Singleton instance with noop event bus.
 * Used by: seed scripts, standalone tools, legacy code.
 * App layer (apps/api) should construct its own via createPrismaClient(realBus).
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type ExtendedPrismaClient = typeof prisma;

export { PrismaClient };
export { softDeleteExtension } from './soft-delete-extension';
export {
  eventExtension,
  TRACKED_MODELS,
  type RawEventBus,
  type RawMutationEvent,
} from './event-extension';
export * from '@prisma/client';
