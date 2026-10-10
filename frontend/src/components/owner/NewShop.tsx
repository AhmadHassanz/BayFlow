'use client';
import { useRouter } from 'next/navigation';
import { ShopForm } from './ShopForm';
export function NewShop() {
  const router = useRouter();
  return <ShopForm onSaved={shop => { router.replace(`/shops/${shop.id}/settings`); router.refresh(); }} />;
}
