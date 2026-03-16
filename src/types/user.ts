import type { Timestamp } from "firebase/firestore";

export type UserStatus = "pending" | "active" | "blocked";

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isReviewer: boolean;
  isAdmin: boolean;
  status: UserStatus;
  preferences?: UserPreferences;
  requestedReviewer?: boolean;
  applicationNote?: string;
  appliedAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  lastActiveAt?: Timestamp;
  totalReviews: number;
  createdAt: Timestamp;
}

export interface UserPreferences {
  interests: string[]; // node IDs, e.g., ["R01", "R03", "S07"]
}
