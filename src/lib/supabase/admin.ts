import 'server-only';

import { createClient } from '@supabase/supabase-js';

// 서버 전용. service_role 키를 사용하므로 RLS를 우회한다.
// 주제 배정, 관리자 전체 조회처럼 신뢰된 서버 로직에서만 사용할 것.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
