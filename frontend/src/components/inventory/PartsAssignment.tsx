'use client';
import { AssignmentPicker } from '@/components/shared/AssignmentPicker';
export function PartsAssignment({ shopId, returnTo, select }: { shopId: string; returnTo: string; select: (id: string, name: string) => void }) {
  return <AssignmentPicker shopId={shopId} returnTo={returnTo} kind="PARTS" select={select} />;
}
