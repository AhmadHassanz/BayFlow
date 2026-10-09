import type { AppDatabase as B09Database } from './database.b09';
import type { Json } from './database.types';

// Additive B10 overlay keeps the user's generated types file untouched.
export type AppDatabase = Omit<B09Database, 'public'> & {
  public: Omit<B09Database['public'], 'Functions'> & {
    Functions: B09Database['public']['Functions'] & {
      list_notifications: { Args: { input?: Json }; Returns: Json };
      mark_notification_read: { Args: { input: Json }; Returns: Json };
    };
  };
};