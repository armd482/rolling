import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginForm from '@/components/LoginForm';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kicked?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/rooms');

  const { kicked } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">롤링페이퍼</h1>
        <p className="mt-2 text-sm text-gray-500">등록된 이메일로 입장하세요.</p>
      </div>
      {kicked && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          다른 곳에서 로그인되어 이 접속은 종료되었습니다.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
