import type { User } from "../types/user";

export function isVisitor(user: User | null): boolean {
  return user === null;
}

export function isMember(user: User | null): boolean {
  return user !== null && user.status === "active";
}

export function isReviewer(user: User | null): boolean {
  return isMember(user) && user!.isReviewer;
}

export function isAdmin(user: User | null): boolean {
  return isMember(user) && user!.isAdmin;
}

export function canReviewSignals(user: User | null): boolean {
  return isReviewer(user) || isAdmin(user);
}

export function canReviewProposals(user: User | null): boolean {
  return isAdmin(user);
}

export function canManageUsers(user: User | null): boolean {
  return isAdmin(user);
}

export function canManageAgents(user: User | null): boolean {
  return isAdmin(user);
}

export function canVote(user: User | null): boolean {
  return isMember(user);
}
