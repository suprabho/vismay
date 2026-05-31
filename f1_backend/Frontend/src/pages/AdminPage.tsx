import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Activity, BookOpen, Database, FileText, LogOut, Play, Shield, User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WorkflowPanel } from '../components/admin/WorkflowPanel';
import { RunsPanel }      from '../components/admin/RunsPanel';
import { StoriesPanel }   from '../components/admin/StoriesPanel';
import { IngestionPanel } from '../components/admin/IngestionPanel';
import { AuditPanel }     from '../components/admin/AuditPanel';

type Section = 'workflow' | 'runs' | 'sessions' | 'stories' | 'audit';

const NAV: { id: Section; label: string; icon: typeof Play }[] = [
  { id: 'workflow', label: 'Workflow',  icon: Play     },
  { id: 'runs',     label: 'Runs',      icon: Activity },
  { id: 'sessions', label: 'Sessions',  icon: Database },
  { id: 'stories',  label: 'Stories',   icon: BookOpen },
  { id: 'audit',    label: 'Audit',     icon: FileText },
];

const SECTION_META: Record<Section, { title: string; desc: string }> = {
  workflow: { title: 'AI Workflow',    desc: 'Launch pipelines, monitor execution, simulate projections.' },
  runs:     { title: 'Pipeline Runs', desc: 'Browse all runs, stream logs, trigger new jobs.'            },
  sessions: { title: 'Sessions',      desc: 'Ingest OpenF1 telemetry sessions for analysis.'             },
  stories:  { title: 'Stories',       desc: 'Create, edit, and publish AI-generated race stories.'       },
  audit:    { title: 'Audit Log',     desc: 'Immutable record of all system actions.'                    },
};

export function AdminPage() {
  const { getIdToken, user, logout } = useAuth();
  const [section, setSection] = useState<Section>('workflow');
  const tokenFactory = useCallback(() => getIdToken(), [getIdToken]);

  const meta = SECTION_META[section];

  return (
    <motion.div
      className="flex-1 flex overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* ── Sidebar ── */}
      <aside className="w-52 shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        {/* Branding */}
        <div className="px-5 py-5 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-f1-red" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">Admin</span>
          </div>
          <p className="font-serif italic font-black text-lg text-white mt-1 leading-tight">
            Control Center
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-all ${
                section === id
                  ? 'text-white bg-neutral-800 border-r-2 border-f1-red'
                  : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>

        {/* User info */}
        {user && (
          <div className="px-5 py-3 border-t border-neutral-800 flex items-center gap-2">
            <User size={12} className="text-neutral-600 shrink-0" />
            <span className="font-mono text-[10px] text-neutral-600 truncate flex-1">
              {user.email ?? user.displayName ?? 'Admin'}
            </span>
            <button
              onClick={logout}
              title="Sign out"
              className="text-neutral-600 hover:text-f1-red transition-colors shrink-0"
            >
              <LogOut size={12} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Section header */}
          <div className="mb-8 pb-5 border-b border-neutral-200">
            <h1 className="font-serif italic font-black text-2xl text-neutral-900 tracking-tight">
              {meta.title}
            </h1>
            <p className="font-mono text-xs text-neutral-400 mt-1">{meta.desc}</p>
          </div>

          {/* Panel */}
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {section === 'workflow' && <WorkflowPanel getToken={tokenFactory} />}
            {section === 'runs'     && <RunsPanel     getToken={tokenFactory} />}
            {section === 'sessions' && <IngestionPanel getToken={tokenFactory} />}
            {section === 'stories'  && <StoriesPanel  getToken={tokenFactory} />}
            {section === 'audit'    && <AuditPanel    getToken={tokenFactory} />}
          </motion.div>
        </div>
      </main>
    </motion.div>
  );
}
