import { PublicHeader } from '@/components/public/PublicHeader';
import { LoadingSkeleton } from '@/components/shared/feedback';
export default function Loading() { return <><PublicHeader /><main className="container route-feedback"><LoadingSkeleton label="Preparing your workshop visit…" /></main></>; }
