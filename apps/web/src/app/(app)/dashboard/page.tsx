'use client';

import { useRoleFlags } from '@/lib/auth';
import { LoadingBlock } from '@/components/ui/Primitives';
import { StudentDashboard } from '@/components/dashboard/StudentDashboard';
import { StaffDashboard } from '@/components/dashboard/StaffDashboard';

/**
 * One route, two very different jobs:
 *  • students get a readiness score, AI recommendations and their own pipeline
 *  • staff get institute-wide placement analytics and operational queues
 */
export default function DashboardPage() {
  const { isStudent, role } = useRoleFlags();

  if (!role) return <LoadingBlock rows={6} />;

  return isStudent ? <StudentDashboard /> : <StaffDashboard />;
}
