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
