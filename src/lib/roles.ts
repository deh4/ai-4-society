export const VALID_ROLES = [
    'signal-reviewer',
    'discovery-reviewer',
    'scoring-reviewer',
    'editor',
    'lead',
] as const;

export type UserRole = (typeof VALID_ROLES)[number];

export type UserStatus = 'pending' | 'active' | 'disabled';

export interface UserDoc {
    email: string;
    displayName: string;
    photoURL: string | null;
    roles: UserRole[];
    status: UserStatus;
    appliedRoles: UserRole[];
    applicationNote: string;
    appliedAt: { seconds: number } | null;
    approvedAt: { seconds: number } | null;
    approvedBy: string | null;
    lastActiveAt: { seconds: number } | null;
    totalReviews: number;
    acknowledgedAt: { seconds: number } | null;
    onboardingCompleted: Record<string, boolean>;
}

/** Which admin tabs each role can see */
export const ROLE_TAB_ACCESS: Record<string, UserRole[]> = {
    'review': ['signal-reviewer', 'discovery-reviewer', 'scoring-reviewer', 'lead'],
    'agents': ['lead'],
    'users': ['lead'],
    // Legacy tab access kept for backward compat during migration
    'risk-signals': ['signal-reviewer', 'lead'],
    'solution-signals': ['signal-reviewer', 'lead'],
    'discovery': ['discovery-reviewer', 'lead'],
    'validation': ['scoring-reviewer', 'lead'],
    'milestones': ['editor', 'lead'],
    'editorial': ['editor', 'lead'],
};

/** Check if a user with given roles can see a specific tab */
export function canAccessTab(userRoles: UserRole[], tab: string): boolean {
    const allowed = ROLE_TAB_ACCESS[tab];
    if (!allowed) return false;
    return userRoles.some(r => allowed.includes(r));
}
