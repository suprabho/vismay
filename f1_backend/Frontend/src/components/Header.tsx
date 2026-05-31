/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';
import { LogOut, Settings, UserCircle } from 'lucide-react';
import { Page } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export function Header({ currentPage, onPageChange }: HeaderProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems: { id: Page; label: string }[] = [
    { id: 'magazine', label: 'Magazine' },
    { id: 'race', label: 'Race' },
    { id: 'signals', label: 'Signals' },
    { id: 'stories', label: 'Stories' },
    ...(user?.role === 'admin' ? [{ id: 'admin' as Page, label: 'Admin' }] : []),
  ];

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  return (
    <header className="hidden md:flex justify-between items-center h-16 px-6 max-w-[720px] mx-auto bg-white sticky top-0 z-50 border-b border-neutral-200 w-full transition-all duration-300">
      <div className="flex items-center">
        <span
          className="font-serif italic font-black text-2xl tracking-tighter text-neutral-900 cursor-pointer"
          onClick={() => onPageChange('magazine')}
        >
          APEX
        </span>
      </div>

      <nav className="flex gap-6">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={`font-serif text-lg tracking-tight transition-all duration-200 active:scale-95 ${
              currentPage === item.id
                ? 'text-f1-red font-bold'
                : 'text-neutral-400 hover:text-f1-red'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4 text-neutral-900">
        <button className="hover:text-f1-red transition-colors">
          <Settings size={20} />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="hover:text-f1-red transition-colors"
            aria-label="User menu"
          >
            <UserCircle size={24} />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-9 z-50 w-52 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
                {user && (
                  <div className="px-4 py-3 border-b border-neutral-100">
                    <p className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest">Signed in as</p>
                    <p className="font-mono text-xs text-neutral-700 truncate mt-0.5">
                      {user.email ?? user.displayName}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs text-neutral-600 hover:bg-neutral-50 hover:text-f1-red transition-colors"
                >
                  <LogOut size={13} />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
