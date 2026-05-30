import { notFound } from 'next/navigation';
import NativeStoryboard from '@/components/storyboard/NativeStoryboard';
import { getStoryboard, listStoryboards } from '@/lib/storyboards';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listStoryboards().map((s) => ({ slug: s.slug }));
}

export default async function NativeStoryboardPage({ params }: RouteParams) {
  const { slug } = await params;
  const storyboard = getStoryboard(slug);
  if (!storyboard) notFound();
  return <NativeStoryboard storyboard={storyboard} />;
}
