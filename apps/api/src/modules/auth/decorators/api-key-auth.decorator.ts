import { SetMetadata } from '@nestjs/common';

export const API_KEY_AUTH = 'apiKeyAuth';

/** Mark endpoint to use API key auth (x-api-key header) instead of JWT. */
export const ApiKeyAuth = () => SetMetadata(API_KEY_AUTH, true);
