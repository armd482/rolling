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
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            롤링페이퍼
          </h1>
          <p className="mt-1.5 text-xs font-semibold text-gray-500">
            동료들과 함께하는 온라인 롤링페이퍼 서비스
          </p>
        </div>

        {kicked && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-700 border border-slate-200">
            <span>로그인 세션이 만료되었습니다. 다시 로그인해 주세요.</span>
          </div>
        )}

        <LoginForm suggestions={suggestions} />
      </div>
    </main>
  );
}


