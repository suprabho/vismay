import { SocialSubTabs } from '@/components/vizmaya/social/SocialSubTabs'

export const dynamic = 'force-dynamic'

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 pt-4 pb-2 border-b border-white/5">
        <SocialSubTabs />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  )
}
