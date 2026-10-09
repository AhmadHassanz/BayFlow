import type { AppDatabase as B04Database } from './database.b04';
import type { Json } from './database.types';

// Additive RPC overlay; preserve the user's generated database.types.ts change.
export type AppDatabase = Omit<B04Database, 'public'> & {
  public: Omit<B04Database['public'], 'Functions'> & {
    Functions: B04Database['public']['Functions'] & {
      create_booking: { Args: { input: Json }; Returns: Json };
    };
  };
};
