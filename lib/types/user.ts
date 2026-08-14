/** Must match the users_display_name_length_check constraint (20260814_cap_display_name_length.sql). */
export const MAX_DISPLAY_NAME_LENGTH = 50;

export interface UserProfile {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  created_at: string;
}

export interface UserProfilePatch {
  display_name: string;
}
