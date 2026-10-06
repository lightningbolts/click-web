import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { getServerUser } from '@/lib/server/getServerUser';
import { safeNextPath } from '@/lib/shell/appNav';

export const metadata: Metadata = { title: 'Log in · Click' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getServerUser()) redirect(safeNextPath(next ?? null));
  return <AuthForm mode="login" next={next} />;
}
