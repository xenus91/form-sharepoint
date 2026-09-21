// src/axios.d.ts
// Module augmentation для axios — добавляет кастомные поля (__noCache, __cacheKey),
// которые используются нашим axios-cache интерсептором и enrich-обходом.
//
// Без этого TS ругается на "__noCache does not exist in type 'AxiosRequestConfig<any>'"
// во всех файлах, которые используют расширения.

import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Skip cache lookup/store for this request (TanStack is the only cache). */
    __noCache?: boolean;
    /** Internal cache key used by sp/cache.js interceptor. */
    __cacheKey?: string;
    /** Override forceRefresh semantics for TanStack-aligned helpers. */
    __forceRefresh?: boolean;
  }

  export interface InternalAxiosRequestConfig {
    __cacheKey?: string;
  }
}
