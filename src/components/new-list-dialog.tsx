import Link from 'next/link';
import { AppIcon } from '@/components/app-icon';

export function NewListDialog() {
  return (
    <Link
      href="/listini"
      className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <AppIcon name="lists" className="h-5 w-5" />
      Nuovo listino
    </Link>
  );
}
