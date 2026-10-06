import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/server';
import FisioShell from '@/app/components/fisio-shell';

export default async function Home() {
  const user = await requireUser();
  if (!user) redirect('/login');
  return <FisioShell email={user.email ?? null} />;
}
