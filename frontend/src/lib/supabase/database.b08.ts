import type { AppDatabase as B06Database } from './database.b06';
import type { Json } from './database.types';

// Additive RPC overlay keeps the user's generated types file untouched.
export type AppDatabase = Omit<B06Database, 'public'> & {
  public: Omit<B06Database['public'], 'Functions'> & {
    Functions: B06Database['public']['Functions'] & {
      save_inventory_part: { Args: { input: Json }; Returns: Json };
      list_inventory: { Args: { input: Json }; Returns: Json };
    };
  };
};
