import { AdminTabs } from '@/components/admin/AdminTabs'

export default function TabbedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminTabs />
      {children}
    </>
  )
}
