import { AppShell } from '@/components/AppShell'
import { AuthGate } from '@/components/AuthGate'

// Account-only: logged-out visitors get the sign-in modal in place (and land
// back here after signing in) rather than a redirect to /login.
export default function FollowingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AuthGate message="Sign in to see who you follow">{children}</AuthGate>
    </AppShell>
  )
}
