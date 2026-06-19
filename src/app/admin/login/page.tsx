import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-session';
import AdminLoginForm from '@/components/AdminLoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  // 이미 관리자 세션이 있으면 바로 관리자 페이지로
  if (await getAdminSession()) redirect('/admin');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">관리자 로그인</h1>
          <p className="mt-1 text-sm text-gray-500">관리자 전용 페이지입니다.</p>
        </div>
        <AdminLoginForm />
      </div>
    </main>
  );
}
