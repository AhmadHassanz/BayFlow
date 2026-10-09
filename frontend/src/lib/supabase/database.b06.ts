import type { AppDatabase as B05Database } from './database.b05';
import type { Json } from './database.types';

// Additive B06 RPC overlay; preserve the user's generated database.types.ts change.
export type AppDatabase = Omit<B05Database, 'public'> & {
  public: Omit<B05Database['public'], 'Functions'> & {
    Functions: B05Database['public']['Functions'] & {
      apply_booking_action: { Args: { input: Json }; Returns: Json };
      get_booking: { Args: { input: Json }; Returns: Json };
      list_my_bookings: { Args: { input?: Json }; Returns: Json };
      list_shop_bookings: { Args: { input: Json }; Returns: Json };
    };
  };
};
