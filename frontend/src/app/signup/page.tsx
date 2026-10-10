import { AuthPage } from '@/components/workspace/AuthPage';
export const metadata = { title: 'Create account | BayFlow' };
export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; type?: string; role?: string }> }) { return <AuthPage mode="signup" searchParams={searchParams} />; }
