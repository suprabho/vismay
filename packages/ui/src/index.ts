export { AuthWidget } from './auth/AuthWidget'
export type { AuthWidgetProps, AuthWidgetBrand, AuthWidgetCopy } from './auth/AuthWidget'
export {
  createAuthBrowserClient,
  createSupabaseAuthClient,
  createAdminAuthClient,
} from './auth/client'
export type { AuthClient, AuthProvider, AuthResult } from './auth/client'
