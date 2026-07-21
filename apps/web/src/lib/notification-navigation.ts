export function getNotificationUrl(refType: string, refId: string | number | bigint): string | null {
  switch (refType.toUpperCase()) {
    case 'LEAD':     return `/leads/${refId}`;
    case 'CUSTOMER': return `/customers/${refId}`;
    case 'ORDER':    return `/orders/${refId}`;
    case 'TASK':     return `/tasks?focus=${refId}`;
    default:         return null;
  }
}
