import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');
  const { roomId } = await params;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/rooms" className="text-sm text-gray-500 hover:text-gray-800">
        ← 방 목록
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{roomId}번 방</h1>
      <p className="mt-2 text-gray-500">게임 화면은 다음 단계에서 구현됩니다.</p>
    </main>
  );
}
