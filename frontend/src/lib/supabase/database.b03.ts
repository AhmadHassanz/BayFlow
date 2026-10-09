import type { Database, Json } from './database.types';

// Pending migration overlay; preserve the user's Cloud-generated artifact.
// Remove after the approved B03 migration is applied and Cloud types regenerated.
export type AppDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Database['public']['Functions'] & {
      sync_profile: { Args: Record<string, never>; Returns: Json };
      add_staff_membership: {
        Args: { target_shop_id: string; target_user_id: string; staff_role: StaffRole };
        Returns: Json;
      };
      edit_staff_membership: {
        Args: { target_shop_id: string; target_member_id: string; staff_role?: StaffRole; is_active?: boolean };
        Returns: Json;
      };
    };
  };
};
export type StaffRole = Exclude<Database['public']['Enums']['shop_role'], 'OWNER'>;
