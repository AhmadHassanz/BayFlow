import type { AppDatabase as B03Database } from './database.b03';
import type { Json } from './database.types';

// Additive overlay; never overwrite the user's modified generated types.
type SlotView = B03Database['public']['Views']['public_appointment_slots'];
export type AppDatabase = Omit<B03Database, 'public'> & {
  public: Omit<B03Database['public'], 'Functions' | 'Views'> & {
    Functions: B03Database['public']['Functions'] & {
      save_shop: { Args: { target_shop_id: string | null; settings: Json }; Returns: Json };
      save_service: { Args: { target_shop_id: string; target_service_id: string | null; settings: Json }; Returns: Json };
    };
    Views: Omit<B03Database['public']['Views'], 'public_appointment_slots'> & {
      public_appointment_slots: Omit<SlotView, 'Row'> & {
        Row: SlotView['Row'] & { capacity_remaining: number | null; local_date: string | null };
      };
    };
  };
};
