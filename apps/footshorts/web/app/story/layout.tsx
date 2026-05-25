import { AuthGate } from '@/components/AuthGate';

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
