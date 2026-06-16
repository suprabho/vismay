/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Page } from './types';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { ErrorBoundary } from './components/ui';
import { MagazinePage } from './pages/MagazinePage';
import { RacePage } from './pages/RacePage';
import { SignalsPage } from './pages/SignalsPage';
import { StoriesPage } from './pages/StoriesPage';
import { StoryDetailPage } from './pages/StoryDetailPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { useAuth } from './contexts/AuthContext';

const PATH_TO_PAGE: Record<string, Page> = {
  '/': 'magazine',
  '/admin': 'admin',
  '/signals': 'signals',
  '/stories': 'stories',
  '/race': 'race',
};

const PAGE_TO_PATH: Record<Page, string> = {
  magazine: '/',
  admin: '/admin',
  signals: '/signals',
  stories: '/stories',
  race: '/race',
  'story-detail': '/stories',
};

export default function App() {
  const { user, loading } = useAuth();

  const [currentPage, setCurrentPage] = useState<Page>(
    () => PATH_TO_PAGE[window.location.pathname] ?? 'magazine'
  );
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      setCurrentPage(PATH_TO_PAGE[window.location.pathname] ?? 'magazine');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (page: Page) => {
    const path = PAGE_TO_PATH[page];
    if (window.location.pathname !== path) {
      history.pushState(null, '', path);
    }
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-500 font-mono text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleStoryClick = (id: string) => {
    setSelectedStoryId(id);
    navigate('story-detail');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'magazine':
        return <MagazinePage key="magazine" onPageChange={navigate} onStoryClick={handleStoryClick} />;
      case 'race':
        return <RacePage key="race" onStoryClick={handleStoryClick} />;
      case 'signals':
        return <SignalsPage key="signals" />;
      case 'stories':
        return <StoriesPage key="stories" onStoryClick={handleStoryClick} />;
      case 'story-detail':
        return <StoryDetailPage key="story-detail" storyId={selectedStoryId} />;
      case 'admin':
        return <AdminPage key="admin" />;
      default:
        return <MagazinePage key="magazine" onPageChange={navigate} onStoryClick={handleStoryClick} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <Header currentPage={currentPage} onPageChange={navigate} />

      {/* Mobile Top App Bar (Minimal) */}
      <header className="md:hidden flex justify-between items-center h-16 px-6 border-b border-neutral-100 bg-white sticky top-0 z-50">
        <span
          className="font-serif italic font-black text-2xl tracking-tighter text-neutral-900 cursor-pointer"
          onClick={() => navigate('magazine')}
        >
          APEX
        </span>
        <button className="text-neutral-900">
          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
            <span className="font-mono text-[10px] font-bold">16</span>
          </div>
        </button>
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Keyed by page so navigating away clears any caught render error. */}
          <ErrorBoundary key={currentPage}>{renderPage()}</ErrorBoundary>
        </AnimatePresence>
      </main>

      <MobileNav currentPage={currentPage} onPageChange={navigate} />
    </div>
  );
}

