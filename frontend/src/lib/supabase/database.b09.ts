import type { AppDatabase as B08Database } from './database.b08';
import type { Json } from './database.types';

// Additive B09 overlay keeps the user's generated types file untouched.
export type AppDatabase = Omit<B08Database, 'public'> & {
  public: Omit<B08Database['public'], 'Functions'> & {
    Functions: B08Database['public']['Functions'] & {
      list_qc_queue: { Args: { input: Json }; Returns: Json };
    };
  };
};
