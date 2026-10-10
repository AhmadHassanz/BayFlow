import type { AppDatabase as B10Database } from './database.b10';
import type { Json } from './database.types';

// Additive RPC overlay; never regenerate the protected generated types file.
export type AppDatabase = Omit<B10Database, 'public'> & {
  public: Omit<B10Database['public'], 'Functions'> & {
    Functions: B10Database['public']['Functions'] & {
      list_estimate_catalog: { Args: { input: Json }; Returns: Json };
    };
  };
};
