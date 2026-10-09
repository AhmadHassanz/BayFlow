import { AuthPage } from '@/components/workspace/AuthPage';
export const metadata = { title: 'Sign in | BayFlow' };
export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <AuthPage mode="login" searchParams={searchParams} />; }
