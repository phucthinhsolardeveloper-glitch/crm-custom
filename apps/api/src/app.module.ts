import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeeLevelsModule } from './modules/employee-levels/employee-levels.module';
import { TeamsModule } from './modules/teams/teams.module';
import { LeadSourcesModule } from './modules/lead-sources/lead-sources.module';
import { LeadGroupsModule } from './modules/lead-groups/lead-groups.module';
import { LabelsModule } from './modules/labels/labels.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { CustomersModule } from './modules/customers/customers.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProductCategoriesModule } from './modules/product-categories/product-categories.module';
import { ProductsModule } from './modules/products/products.module';
import { PaymentTypesModule } from './modules/payment-types/payment-types.module';
import { CustomerTiersModule } from './modules/customer-tiers/customer-tiers.module';
import { OrderFormatsModule } from './modules/order-formats/order-formats.module';
import { ProductGroupsModule } from './modules/product-groups/product-groups.module';
import { PaymentInstallmentsModule } from './modules/payment-installments/payment-installments.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BankTransactionsModule } from './modules/bank-transactions/bank-transactions.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { CallLogsModule } from './modules/call-logs/call-logs.module';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { LeadDocumentsModule } from './modules/lead-documents/lead-documents.module';
import { ImportModule } from './modules/import/import.module';
import { ExportModule } from './modules/export/export.module';
import { ThirdPartyApiModule } from './modules/third-party-api/third-party-api.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SearchModule } from './modules/search/search.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AssignmentTemplatesModule } from './modules/assignment-templates/assignment-templates.module';
import { RecallConfigModule } from './modules/recall-config/recall-config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventBusModule } from './common/event-bus/event-bus.module';
import { AppCacheModule } from './common/cache/cache.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { WebhookEndpointsModule } from './modules/webhook-endpoints/webhook-endpoints.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { DepartmentViewConfigsModule } from './modules/department-view-configs/department-view-configs.module';
import { LeadFieldDefinitionsModule } from './modules/lead-field-definitions/lead-field-definitions.module';
import { McpAgentModule } from './modules/mcp-agent/mcp-agent.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { CronRunModule } from './modules/cron-run/cron-run.module';
import { UserPhonesModule } from './modules/user-phones/user-phones.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { OmicallModule } from './modules/omicall/omicall.module';
import { LarkSyncModule } from './modules/lark-sync/lark-sync.module';
import { ApiKeyAuthGuard } from './modules/auth/guards/api-key-auth.guard';
import { BullModule } from '@nestjs/bullmq';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles-authorization.guard';
import { BigIntTransformInterceptor } from './common/interceptors/bigint-transform.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { DemoReadonlyGuard } from './common/guards/demo-readonly.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env.production', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10) },
      { name: 'auth', ttl: 60000, limit: parseInt(process.env.THROTTLE_AUTH_LIMIT || '5', 10) },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: (() => {
        const url = process.env.REDIS_URL;
        if (url) {
          const parsed = new URL(url);
          return {
            host: parsed.hostname,
            port: parseInt(parsed.port || '6379'),
            ...(parsed.password && { password: parsed.password }),
          };
        }
        return { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6380') };
      })(),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
        // Skip noisy polling/health endpoints để giảm log volume (~80% trong production)
        autoLogging: {
          ignore: (req: any) => {
            const u: string = req.url || '';
            return u.includes('/notifications/unread-count') || u.startsWith('/api/v1/health') || u === '/api/v1' || u === '/';
          },
        },
        // Slim serializers: strip full headers, chỉ giữ field cần cho debug/audit.
        // Giảm log size từ ~1KB/dòng xuống ~150 byte/dòng.
        serializers: {
          req(req: any) {
            const body =
              req.url?.includes('/system-settings') && req.raw?.method === 'PUT' && req.body?.value
                ? { value: '[Redacted]' }
                : undefined;
            return {
              method: req.method,
              url: req.url,
              userId: req.raw?.user?.id ? String(req.raw.user.id) : undefined,
              ...(body ? { body } : {}),
            };
          },
          res(res: any) {
            return { statusCode: res.statusCode };
          },
        },
      },
    }),
    EventBusModule,
    PrismaModule,
    AppCacheModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    EmployeeLevelsModule,
    TeamsModule,
    LeadSourcesModule,
    LeadGroupsModule,
    LabelsModule,
    ReferenceDataModule,
    CustomersModule,
    LeadsModule,
    ProductCategoriesModule,
    ProductsModule,
    PaymentTypesModule,
    CustomerTiersModule,
    OrderFormatsModule,
    ProductGroupsModule,
    PaymentInstallmentsModule,
    BankAccountsModule,
    OrdersModule,
    RefundsModule,
    PaymentsModule,
    BankTransactionsModule,
    ActivitiesModule,
    CallLogsModule,
    FileUploadModule,
    LeadDocumentsModule,
    ImportModule,
    ExportModule,
    ThirdPartyApiModule,
    DistributionModule,
    TasksModule,
    SearchModule,
    NotificationsModule,
    AssignmentTemplatesModule,
    RecallConfigModule,
    DashboardModule,
    ApiKeysModule,
    WebhookEndpointsModule,
    SystemSettingsModule,
    DepartmentViewConfigsModule,
    LeadFieldDefinitionsModule,
    McpAgentModule,
    AuditLogModule,
    CronRunModule,
    UserPhonesModule,
    ContactsModule,
    OmicallModule,
    LarkSyncModule,
  ],
  controllers: [AppController],
  providers: [
    // Global JWT auth guard (skip @Public() routes)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global roles guard
    { provide: APP_GUARD, useClass: RolesGuard },
    // API key auth for external endpoints
    { provide: APP_GUARD, useClass: ApiKeyAuthGuard },
    // Global rate limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Chặn ghi khi chạy bản demo (DEMO_MODE=true) - app thật không ảnh hưởng
    { provide: APP_GUARD, useClass: DemoReadonlyGuard },
    // BigInt → string serialization
    { provide: APP_INTERCEPTOR, useClass: BigIntTransformInterceptor },
    // Standard error responses
    { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
    // DTO validation
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule {}
