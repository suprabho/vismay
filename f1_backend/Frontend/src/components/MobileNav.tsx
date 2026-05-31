/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen, Activity, Zap, FileText, Shield } from 'lucide-react';
import { Page } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface MobileNavProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export function MobileNav({ currentPage, onPageChange }: MobileNavProps) {
  const { user } = useAuth();

  const baseItems = [
    { id: 'magazine' as Page, label: 'Magazine', icon: BookOpen },
    { id: 'race'     as Page, label: 'Race',     icon: Activity },
    { id: 'signals'  as Page, label: 'Signals',  icon: Zap },
    { id: 'stories'  as Page, label: 'Stories',  icon: FileText },
  ];

  const items = user?.role === 'admin'
    ? [...baseItems, { id: 'admin' as Page, label: 'Admin', icon: Shield }]
    : baseItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 px-4 bg-white/95 backdrop-blur-md border-t border-neutral-200">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={`flex flex-col items-center justify-center w-1/4 h-full transition-all duration-300 ${
              isActive ? 'text-f1-red border-t-2 border-f1-red pt-0.5' : 'text-neutral-400'
            }`}
          >
            <Icon size={20} className="mb-1" />
            <span className="font-serif text-[10px] uppercase tracking-widest font-medium">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
