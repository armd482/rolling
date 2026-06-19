import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginForm from '@/components/LoginForm';

export default async function Home() {
  const session = await getSession();
  if (session) redirect('/rooms');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">롤링페이퍼</h1>
        <p className="mt-2 text-sm text-gray-500">등록된 이메일로 입장하세요.</p>
      </div>
      <LoginForm />
    </main>
  );
}
