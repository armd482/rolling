import { redirect } from 'next/navigation';
import { getValidSession } from '@/lib/session';
import { USERS } from '@/lib/users';
import LoginForm from '@/components/LoginForm';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kicked?: string }>;
}) {
  // getValidSession 으로 active_sid 까지 확인. (getSession 만 쓰면 무효화된 세션에서도
  // 로그인 상태로 보고 /rooms 로 보내, /rooms 의 getValidSession 과 충돌해 리다이렉트 루프가 발생)
  const session = await getValidSession();
  if (session) redirect('/rooms');

  const { kicked } = await searchParams;

  const suggestions = USERS.map((u) => ({ email: u.email, nickname: u.nickname }));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="font-hand text-6xl text-indigo-600">롤링페이퍼</h1>
        <p className="mt-1 text-base text-gray-500">등록된 이메일로 입장하세요.</p>
      </div>
      {kicked && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          다른 곳에서 로그인되어 이 접속은 종료되었습니다.
        </p>
      )}
      <LoginForm suggestions={suggestions} />
    </main>
  );
}
