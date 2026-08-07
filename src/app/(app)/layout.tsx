import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // redirect() e il router client applicano gia' il basePath di Next.
  if (!user) redirect('/login');

  return (
    <ToastProvider>
      <AppShell logoutEndpoint={withBasePath('/api/auth/logout')} loginPath="/login">
        {children}
      </AppShell>
    </ToastProvider>
  );
}
