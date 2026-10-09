import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import './globals.css';

const editorial = Fraunces({ subsets: ['latin'], variable: '--font-editorial', display: 'swap' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
export const metadata: Metadata = {
  title: 'BayFlow — Better repairs, fewer unknowns',
  description: 'Find a workshop, explore its services, and arrange your next visit with BayFlow.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${editorial.variable} ${body.variable}`}><body>{children}</body></html>;
}
