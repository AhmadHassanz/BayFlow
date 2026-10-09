import { StaffPage } from '@/components/workspace/StaffPage';
export default function Page({ params }: { params: Promise<{ slug: string }> }) { return <StaffPage params={params} segment="qc" />; }
