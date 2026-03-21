import type { Timestamp } from "firebase/firestore";

export interface EditorialHook {
  id: string;
  signal_id: string;
  signal_title: string;
  hook_text: string;
  status: "pending" | "approved" | "rejected";
  related_node_ids: string[];
  impact_score: number;
  source_name: string;
  source_credibility: number;
  published_date: string;
  generated_at: Timestamp | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  /** Featured image for narrative display */
  featured_image_url?: string;
  featured_image_alt?: string;
  /** Editable narrative headline (separate from hook_text) */
  narrative_headline?: string;
  /** Task assignment */
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Timestamp | null;
}
