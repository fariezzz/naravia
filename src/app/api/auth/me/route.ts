import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/http';
import { getDefaultPersona, getEffectiveDailyBudget, getTodayTokenUsage } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      // Cookie ada tapi sesinya tidak valid: hapus agar middleware berhenti meloloskan
      const res = NextResponse.json({ error: 'Sesi tidak valid. Silakan masuk kembali.' }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }

    const [persona, budget, usage] = await Promise.all([
      getDefaultPersona(user.id),
      getEffectiveDailyBudget(user.id),
      getTodayTokenUsage(user.id),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar: persona?.avatar || '',
      },
      quota: {
        daily_budget: budget,
        today_used: usage.used,
        remaining: budget > 0 ? Math.max(0, budget - usage.used) : null,
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat sesi.');
  }
}
