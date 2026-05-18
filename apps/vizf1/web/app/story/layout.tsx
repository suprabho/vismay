/**
 * Story routes render full-screen. No AppShell chrome.
 */
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg">{children}</div>
}
