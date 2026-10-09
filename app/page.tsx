import { redirect } from 'next/navigation';
import { getCurrentMembership } from '@/lib/access-server';
import FisioShell from '@/app/components/fisio-shell';

export default async function Home() {
  const membership = await getCurrentMembership();
  if (!membership) redirect('/login');
  return <FisioShell email={membership.user.email ?? null} role={membership.role} organizationId={membership.organizationId} />;
}
