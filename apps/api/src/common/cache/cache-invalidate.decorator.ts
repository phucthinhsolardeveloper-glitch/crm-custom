/**
 * Method decorator: after method completes, deletes specified cache keys.
 * Requires the class to have `cacheService: CacheService` property.
 *
 * Usage:
 *   @CacheInvalidate('lookup:labels')
 *   async create(data) { ... }
 */
export function CacheInvalidate(...keys: string[]) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const original = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const result = await original.apply(this, args);

      if (this.cacheService) {
        await Promise.all(
          keys.map((key) =>
            key.endsWith('*')
              ? this.cacheService.delByPrefix(key.slice(0, -1))
              : this.cacheService.del(key),
          ),
        );
      }

      return result;
    };

    return descriptor;
  };
}
