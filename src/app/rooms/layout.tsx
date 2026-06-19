import SessionGuard from '@/components/SessionGuard';

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionGuard />
      {children}
    </>
  );
}
