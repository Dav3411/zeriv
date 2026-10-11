export interface Brand {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  primaryColor?: string | null;
  description?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;
  activeProfileId?: string | null;
  activeStyleId?: string | null;
  active_style_id?: string | null;
  meta?: {
    industry?: string | null;
    tagline?: string | null;
    website?: string | null;
    [key: string]: unknown;
  } | null;
  created_at: string;
  createdAt?: string;
  updated_at?: string | null;
}
