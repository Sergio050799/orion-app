"use client";

import AdminPanel from '@/components/saas/admin/AdminPanel';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  return <AdminPanel onClose={() => router.back()} />;
}
