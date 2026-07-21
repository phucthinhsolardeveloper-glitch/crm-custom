export const CACHE_PREFIX = 'crm:cache:';

export const CACHE_TTL = {
  LOOKUP: 600,     // 10 minutes for lookup tables
  DASHBOARD: 30,   // 30 seconds for dashboard
  SHORT: 60,       // 1 minute
  MEDIUM: 300,     // 5 minutes
} as const;

export const CACHE_KEYS = {
  LOOKUP_LABELS: 'lookup:labels',
  LOOKUP_LEAD_SOURCES: 'lookup:lead-sources',
  LOOKUP_LEAD_GROUPS: 'lookup:lead-groups',
  LOOKUP_PRODUCTS: 'lookup:products',
  LOOKUP_USERS: 'lookup:users',
  LOOKUP_PAYMENT_TYPES: 'lookup:payment-types',
  LOOKUP_ORDER_FORMATS: 'lookup:order-formats',
  LOOKUP_PRODUCT_GROUPS: 'lookup:product-groups',
  LOOKUP_PAYMENT_INSTALLMENTS: 'lookup:payment-installments',
  LOOKUP_PRODUCT_CATEGORIES: 'lookup:product-categories',
  LOOKUP_BANK_ACCOUNTS: 'lookup:bank-accounts',
  LOOKUP_EMPLOYEE_LEVELS: 'lookup:employee-levels',
  LOOKUP_LEAD_FIELD_DEFS: 'lookup:lead-field-definitions',
  DASHBOARD_PREFIX: 'dashboard:',
} as const;
