# User Management Portal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace binary admin/not-admin with role-based access control (RBAC) for 5 contributor roles, with self-service applications and Lead approval.

**Architecture:** Firestore `/users/{uid}` collection stores roles and status. AuthContext reads user doc on login, exposes `userDoc` with roles. Firestore security rules use `hasRole()`/`hasAnyRole()` helper functions. Admin console filters tabs by role. Contribute page gets inline application form. Cloud Functions verify roles before executing.

**Tech Stack:** Firebase Auth (Google OAuth), Firestore, Cloud Functions (email notification), React context, TypeScript

**Design Doc:** `docs/plans/2026-02-25-user-management-design.md`

---

## Task 1: User Types & Constants

Define the shared types and role constants used across the entire feature.

**Files:**
- Create: `src/lib/roles.ts`

**Step 1: Create roles module**

Create `src/lib/roles.ts` with the following content:

```typescript
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
}

/** Which admin tabs each role can see */
export const ROLE_TAB_ACCESS: Record<string, UserRole[]> = {
    'risk-signals': ['signal-reviewer', 'lead'],
    'solution-signals': ['signal-reviewer', 'lead'],
    'discovery': ['discovery-reviewer', 'lead'],
    'validation': ['scoring-reviewer', 'lead'],
    'milestones': ['editor', 'lead'],
    'users': ['lead'],
};

/** Check if a user with given roles can see a specific tab */
export function canAccessTab(userRoles: UserRole[], tab: string): boolean {
    const allowed = ROLE_TAB_ACCESS[tab];
    if (!allowed) return false;
    return userRoles.some(r => allowed.includes(r));
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS (no type errors — new file, no consumers yet)

**Step 3: Commit**

```bash
git add src/lib/roles.ts
git commit -m "feat(rbac): add user roles types and tab access helpers"
```

---

## Task 2: Refactor AuthContext for RBAC

Replace the binary `isAdmin` check with role-based auth. Read `/users/{uid}` on login, with backward-compatible migration from `/admins/{uid}`.

**Files:**
- Modify: `src/store/AuthContext.tsx`

**Current behavior (lines 30-34):**
```typescript
const adminRef = doc(db, 'admins', firebaseUser.uid);
const adminSnap = await getDoc(adminRef);
setIsAdmin(adminSnap.exists());
```

**Step 1: Update AuthContext**

Replace the entire file `src/store/AuthContext.tsx` with:

```typescript
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserDoc, UserRole } from '../lib/roles';

interface AuthContextType {
    user: User | null;
    /** Backward compat — true if user has any active role */
    isAdmin: boolean;
    /** Full user document from /users/{uid}, null if not a contributor */
    userDoc: UserDoc | null;
    loading: boolean;
    signIn: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const lastActivityRef = useRef<number>(0);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    // Try /users/{uid} first (new RBAC system)
                    const userRef = doc(db, 'users', firebaseUser.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists()) {
                        setUserDoc(userSnap.data() as UserDoc);
                    } else {
                        // Migration: check legacy /admins/{uid}
                        const adminRef = doc(db, 'admins', firebaseUser.uid);
                        const adminSnap = await getDoc(adminRef);
                        if (adminSnap.exists()) {
                            // Auto-migrate: create /users doc with lead role
                            const migratedDoc: UserDoc = {
                                email: firebaseUser.email ?? '',
                                displayName: firebaseUser.displayName ?? '',
                                photoURL: firebaseUser.photoURL ?? null,
                                roles: ['lead'] as UserRole[],
                                status: 'active',
                                appliedRoles: ['lead'] as UserRole[],
                                applicationNote: 'Auto-migrated from legacy admin',
                                appliedAt: null,
                                approvedAt: null,
                                approvedBy: 'system-migration',
                                lastActiveAt: null,
                                totalReviews: 0,
                            };
                            await setDoc(userRef, {
                                ...migratedDoc,
                                appliedAt: serverTimestamp(),
                                approvedAt: serverTimestamp(),
                                lastActiveAt: serverTimestamp(),
                            });
                            setUserDoc(migratedDoc);
                        } else {
                            setUserDoc(null);
                        }
                    }
                } catch (err) {
                    console.error('Failed to load user document:', err);
                    setUserDoc(null);
                }
            } else {
                setUserDoc(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Throttled activity tracking: update lastActiveAt at most once per hour
    useEffect(() => {
        if (!user || !userDoc || userDoc.status !== 'active') return;
        const now = Date.now();
        if (now - lastActivityRef.current < 3600_000) return;
        lastActivityRef.current = now;
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { lastActiveAt: serverTimestamp() }).catch(() => {});
    }, [user, userDoc]);

    const signIn = async () => {
        await signInWithPopup(auth, googleProvider);
    };

    const logOut = async () => {
        await signOut(auth);
    };

    const isAdmin = userDoc !== null && userDoc.status === 'active' && userDoc.roles.length > 0;

    return (
        <AuthContext.Provider value={{ user, isAdmin, userDoc, loading, signIn, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
```

**Key changes:**
- `userDoc: UserDoc | null` replaces the concept of binary admin
- `isAdmin` stays as a computed boolean for backward compat (true if active + has roles)
- Migration path: if `/users/{uid}` missing but `/admins/{uid}` exists → auto-create with `lead` role
- Activity tracking: `lastActiveAt` updated max once per hour via `useRef` throttle

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS (isAdmin still exported, existing consumers unaffected)

**Step 3: Commit**

```bash
git add src/store/AuthContext.tsx
git commit -m "feat(rbac): refactor AuthContext to read /users collection with migration"
```

---

## Task 3: Update ProtectedRoute for Role-Based Access

The ProtectedRoute currently checks `isAdmin`. Update it to support optional role requirements, while keeping backward compat for routes that just need "any active role."

**Files:**
- Modify: `src/components/ProtectedRoute.tsx`

**Step 1: Update ProtectedRoute**

Replace `src/components/ProtectedRoute.tsx` with:

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import type { UserRole } from '../lib/roles';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** If provided, user must have at least one of these roles */
    requiredRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
    const { user, isAdmin, userDoc, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="text-gray-400 text-sm">Checking access...</div>
            </div>
        );
    }

    // Must be signed in with an active role
    if (!user || !isAdmin) {
        return <Navigate to="/" replace />;
    }

    // If specific roles required, check them
    if (requiredRoles && userDoc) {
        const hasRequired = userDoc.roles.some(r => requiredRoles.includes(r));
        if (!hasRequired) {
            return <Navigate to="/admin" replace />;
        }
    }

    return <>{children}</>;
}
```

**Step 2: Update App.tsx to pass requiredRoles for Observatory**

In `src/App.tsx`, the Observatory route should require `lead` role. Update line 29:

```typescript
// Before:
<ProtectedRoute>
  <Observatory />
</ProtectedRoute>

// After:
<ProtectedRoute requiredRoles={['lead']}>
  <Observatory />
</ProtectedRoute>
```

Also add the import at the top of App.tsx:

```typescript
import type { UserRole } from './lib/roles';
```

Wait — actually `requiredRoles` is typed as `UserRole[]` in ProtectedRoute and the string literal `'lead'` will satisfy it. The import isn't needed in App.tsx since the prop accepts string literals that match UserRole. But TypeScript may need it. Check the build.

**Step 3: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/App.tsx
git commit -m "feat(rbac): update ProtectedRoute with optional role requirements"
```

---

## Task 4: Update Firestore Security Rules

Replace `isAdmin()` with `hasRole()`/`hasAnyRole()` helpers. Add `/users` collection rules. Keep backward compat with `/admins` during migration.

**Files:**
- Modify: `firestore.rules`

**Step 1: Replace firestore.rules**

Replace the entire `firestore.rules` file:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── Helper Functions ─────────────────────────────────────────────────────

    // Legacy admin check (kept during migration, remove after confirmed)
    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    function getUserDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function isActiveUser() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && getUserDoc().data.status == 'active';
    }

    function hasRole(role) {
      return isActiveUser()
        && role in getUserDoc().data.roles;
    }

    function hasAnyRole(roles) {
      return isActiveUser()
        && getUserDoc().data.roles.hasAny(roles);
    }

    // During migration: accept either legacy admin OR new RBAC
    function canWrite(roles) {
      return isAdmin() || hasAnyRole(roles);
    }

    function canRead(roles) {
      return isAdmin() || hasAnyRole(roles);
    }

    // ─── Users Collection (RBAC) ──────────────────────────────────────────────

    match /users/{userId} {
      // Users can read their own doc
      allow read: if request.auth != null && request.auth.uid == userId;

      // Lead can read all users
      allow read: if isAdmin() || hasRole('lead');

      // Application: user creates own doc with pending status, no self-assigned roles
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == 'pending'
                    && request.resource.data.roles.size() == 0
                    && request.resource.data.appliedRoles.size() > 0
                    && request.resource.data.keys().hasAll(
                         ['email', 'displayName', 'status', 'roles',
                          'appliedRoles', 'applicationNote', 'appliedAt']);

      // Lead manages users: can update status and roles, but not email or appliedAt
      allow update: if (isAdmin() || hasRole('lead'))
                    && request.resource.data.email == resource.data.email
                    && request.resource.data.appliedAt == resource.data.appliedAt;

      // No deletes (audit trail preserved)
      allow delete: if false;
    }

    // ─── Admins Collection (Legacy — kept during migration) ───────────────────

    match /admins/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.auth.token.email in ['dehakuran@gmail.com'];
      allow update, delete: if false;
    }

    // ─── Public Collections ───────────────────────────────────────────────────

    match /risks/{riskId} {
      allow read: if true;
      allow write: if canWrite(['editor', 'lead']);
    }

    match /solutions/{solutionId} {
      allow read: if true;
      allow write: if canWrite(['editor', 'lead']);
    }

    match /milestones/{milestoneId} {
      allow read: if true;
      allow write: if canWrite(['editor', 'lead']);
    }

    match /signals/{signalId} {
      allow read: if resource.data.status in ['approved', 'edited']
                  || canRead(['signal-reviewer', 'lead']);
      allow write: if canWrite(['signal-reviewer', 'lead']);
    }

    // ─── Pipeline & Archive (server-only write) ──────────────────────────────

    match /_pipeline_health/{document=**} {
      allow read: if true;
      allow write: if false;
    }

    match /_archive/{document=**} {
      allow read: if canRead(['lead']);
      allow write: if false;
    }

    match /_usage/{document=**} {
      allow read: if canRead(['lead']);
      allow write: if false;
    }

    // ─── Agent-Related Collections ────────────────────────────────────────────

    match /topics/{topicId} {
      allow read: if canRead(['discovery-reviewer', 'lead']);
      allow write: if false;
    }

    match /risk_updates/{updateId} {
      allow read: if canRead(['scoring-reviewer', 'lead']);
      allow write: if canWrite(['scoring-reviewer', 'lead']);
    }

    match /solution_updates/{updateId} {
      allow read: if canRead(['scoring-reviewer', 'lead']);
      allow write: if canWrite(['scoring-reviewer', 'lead']);
    }

    match /validation_reports/{reportId} {
      allow read: if canRead(['scoring-reviewer', 'lead']);
      allow write: if false;
    }

    match /changelogs/{changelogId} {
      allow read: if canRead(['lead']);
      allow write: if false;
    }

    match /agents/{agentId} {
      allow read: if true;
      allow write: if false;
    }

    match /agents/{agentId}/config/{doc} {
      allow read: if canRead(['lead']);
      allow write: if canWrite(['lead']);
    }

    match /agents/{agentId}/health/{doc} {
      allow read: if canRead(['lead']);
      allow write: if false;
    }

    match /agents/{agentId}/runs/{runId} {
      allow read: if canRead(['lead']);
      allow write: if false;
    }

    // ─── Discovery & Validation Proposals ─────────────────────────────────────

    match /discovery_proposals/{docId} {
      allow read: if canRead(['discovery-reviewer', 'lead']);
      allow write: if canWrite(['discovery-reviewer', 'lead']);
    }

    match /validation_proposals/{docId} {
      allow read: if canRead(['scoring-reviewer', 'lead']);
      allow write: if canWrite(['scoring-reviewer', 'lead']);
    }
  }
}
```

**Key changes:**
- Added `hasRole()`, `hasAnyRole()`, `isActiveUser()` helpers
- Added `canWrite()`/`canRead()` that accept EITHER legacy admin OR new roles (migration bridge)
- Added `/users/{userId}` rules with self-escalation prevention
- Updated all collection rules to use role-specific access
- Legacy `/admins` collection rules unchanged

**Step 2: Validate rules syntax**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx firebase-tools deploy --only firestore:rules --dry-run` or use the Firebase MCP validation tool.

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rbac): update Firestore rules with hasRole/hasAnyRole and /users collection"
```

---

## Task 5: Filter Admin Tabs by Role

Update Admin.tsx to show only the tabs the user's roles allow.

**Files:**
- Modify: `src/pages/Admin.tsx`

**Step 1: Import roles and update tab logic**

At the top of `src/pages/Admin.tsx`, add import:

```typescript
import { canAccessTab } from '../lib/roles';
import type { UserRole } from '../lib/roles';
```

**Step 2: Get userDoc from AuthContext**

Change line 53 from:
```typescript
const { user, logOut } = useAuth();
```
to:
```typescript
const { user, userDoc, logOut } = useAuth();
```

**Step 3: Compute visible tabs**

After the existing state declarations (after line 64), add:

```typescript
const userRoles: UserRole[] = userDoc?.roles ?? [];

// All possible tabs in display order
const ALL_TABS = ['risk-signals', 'solution-signals', 'discovery', 'validation', 'milestones', 'users'] as const;
type AdminTab = (typeof ALL_TABS)[number];

const visibleTabs = ALL_TABS.filter(tab => canAccessTab(userRoles, tab));
```

Update the adminTab state type and default to first visible tab:
```typescript
// Replace line 60:
const [adminTab, setAdminTab] = useState<AdminTab>('risk-signals');

// After visibleTabs is computed, ensure current tab is valid:
useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(adminTab)) {
        setAdminTab(visibleTabs[0]!);
    }
}, [visibleTabs, adminTab]);
```

**Step 4: Update tab rendering**

Replace the hardcoded tab buttons (lines 200-238) with a dynamic loop. The tab labels and accent colors:

```typescript
const TAB_CONFIG: Record<AdminTab, { label: string; accent: string }> = {
    'risk-signals': { label: 'Risk Signals', accent: 'border-cyan-400' },
    'solution-signals': { label: 'Solution Signals', accent: 'border-cyan-400' },
    'discovery': { label: 'Discovery', accent: 'border-cyan-400' },
    'validation': { label: 'Validation', accent: 'border-cyan-400' },
    'milestones': { label: 'Milestones', accent: 'border-yellow-400' },
    'users': { label: 'Users', accent: 'border-emerald-400' },
};
```

Replace the tab buttons block with:

```tsx
<div className="flex gap-4 px-4 border-b border-white/10 overflow-x-auto md:gap-6 md:px-6">
    {visibleTabs.map(tab => (
        <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            className={`py-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
                adminTab === tab
                    ? `${TAB_CONFIG[tab].accent} text-white`
                    : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
        >
            {TAB_CONFIG[tab].label}
            {(tab === 'risk-signals' || tab === 'solution-signals') && adminTab === tab && (
                <span className="ml-2 text-[10px] text-gray-500">{signals.length}</span>
            )}
        </button>
    ))}
    {canAccessTab(userRoles, 'users') && (
        <button
            onClick={() => navigate('/observatory')}
            className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300 whitespace-nowrap"
        >
            Observatory
        </button>
    )}
</div>
```

**Step 5: Add Users tab render**

After the milestones tab render block (around line 249), add:

```tsx
{adminTab === 'users' && (
    <UsersTab />
)}
```

Add the import at the top:
```typescript
import UsersTab from '../components/admin/UsersTab';
```

(UsersTab will be created in Task 6 — for now this import will cause a build error. Create a stub file first.)

**Step 6: Create UsersTab stub**

Create `src/components/admin/UsersTab.tsx`:
```typescript
export default function UsersTab() {
    return <div className="p-6 text-gray-500">Users tab — coming soon</div>;
}
```

**Step 7: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS

**Step 8: Commit**

```bash
git add src/pages/Admin.tsx src/components/admin/UsersTab.tsx
git commit -m "feat(rbac): filter admin tabs by user role"
```

---

## Task 6: Build Users Tab (Lead-Only)

Full CRUD for managing user applications and roles.

**Files:**
- Modify: `src/components/admin/UsersTab.tsx` (replace stub)

**Step 1: Implement UsersTab**

Replace the stub `src/components/admin/UsersTab.tsx` with the full component. This is large but follows the same pattern as MilestonesTab.

```typescript
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';
import { VALID_ROLES } from '../../lib/roles';
import type { UserDoc, UserRole, UserStatus } from '../../lib/roles';

interface UserEntry extends UserDoc {
    id: string;
}

export default function UsersTab() {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserEntry[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null);
    const [updating, setUpdating] = useState(false);
    const [editRoles, setEditRoles] = useState<UserRole[]>([]);
    const [rejectNote, setRejectNote] = useState('');
    const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
    const [showDisabled, setShowDisabled] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'users'), orderBy('appliedAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserEntry)));
        });
        return unsub;
    }, []);

    const pendingUsers = users.filter(u => u.status === 'pending');
    const activeUsers = users.filter(u => u.status === 'active');
    const disabledUsers = users.filter(u => u.status === 'disabled');

    const displayedUsers = statusFilter === 'all' ? users : users.filter(u => u.status === statusFilter);

    const approveUser = async (u: UserEntry) => {
        if (editRoles.length === 0) {
            alert('Select at least one role to assign.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), {
                status: 'active',
                roles: editRoles,
                approvedAt: serverTimestamp(),
                approvedBy: user?.uid ?? null,
            });
            setSelectedUser(null);
        } finally {
            setUpdating(false);
        }
    };

    const rejectUser = async (u: UserEntry) => {
        if (!rejectNote.trim()) {
            alert('Please provide a reason for rejection.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), {
                status: 'disabled',
                approvedBy: user?.uid ?? null,
                rejectionNote: rejectNote,
            });
            setSelectedUser(null);
            setRejectNote('');
        } finally {
            setUpdating(false);
        }
    };

    const updateRoles = async (u: UserEntry) => {
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), { roles: editRoles });
            setSelectedUser(null);
        } finally {
            setUpdating(false);
        }
    };

    const toggleStatus = async (u: UserEntry, newStatus: UserStatus) => {
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), { status: newStatus });
        } finally {
            setUpdating(false);
        }
    };

    const selectUser = (u: UserEntry) => {
        setSelectedUser(u);
        setEditRoles([...u.roles]);
        setRejectNote('');
    };

    const toggleRole = (role: UserRole) => {
        setEditRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    };

    const formatDate = (ts: { seconds: number } | null) => {
        if (!ts) return '—';
        return new Date(ts.seconds * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    };

    const roleBadge = (role: string) => {
        const colors: Record<string, string> = {
            'signal-reviewer': 'bg-cyan-400/10 text-cyan-400',
            'discovery-reviewer': 'bg-purple-400/10 text-purple-400',
            'scoring-reviewer': 'bg-orange-400/10 text-orange-400',
            'editor': 'bg-blue-400/10 text-blue-400',
            'lead': 'bg-emerald-400/10 text-emerald-400',
        };
        return colors[role] ?? 'bg-gray-400/10 text-gray-400';
    };

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)]">
            {/* Left: User List */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto shrink-0">
                {/* Filter */}
                <div className="flex gap-2 p-3 border-b border-white/10">
                    {(['all', 'pending', 'active', 'disabled'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                                statusFilter === s ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {s} {s === 'pending' && pendingUsers.length > 0 && (
                                <span className="ml-1 text-yellow-400">({pendingUsers.length})</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Pending section (highlighted) */}
                {statusFilter !== 'disabled' && pendingUsers.length > 0 && (
                    <div className="border-b border-yellow-400/20">
                        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-yellow-400 bg-yellow-400/5">
                            Pending Applications ({pendingUsers.length})
                        </div>
                        {pendingUsers.map(u => (
                            <button
                                key={u.id}
                                onClick={() => selectUser(u)}
                                className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-3 ${
                                    selectedUser?.id === u.id ? 'bg-white/10' : ''
                                }`}
                            >
                                {u.photoURL ? (
                                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                                        {u.displayName?.[0] ?? '?'}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-white truncate">{u.displayName}</div>
                                    <div className="text-[10px] text-yellow-400">
                                        Wants: {u.appliedRoles.join(', ')}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Active/All users */}
                {(statusFilter === 'all' ? activeUsers : displayedUsers.filter(u => u.status !== 'pending')).map(u => (
                    <button
                        key={u.id}
                        onClick={() => selectUser(u)}
                        className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-3 ${
                            selectedUser?.id === u.id ? 'bg-white/10' : ''
                        }`}
                    >
                        {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                                {u.displayName?.[0] ?? '?'}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-white truncate">{u.displayName}</div>
                            <div className="flex gap-1 flex-wrap">
                                {u.roles.map(r => (
                                    <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded ${roleBadge(r)}`}>
                                        {r}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {u.status === 'disabled' && (
                            <span className="text-[9px] text-red-400">disabled</span>
                        )}
                    </button>
                ))}

                {displayedUsers.length === 0 && (
                    <div className="p-6 text-center text-gray-600 text-sm">No users found</div>
                )}
            </div>

            {/* Right: Detail Panel */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {!selectedUser ? (
                    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                        Select a user to view details
                    </div>
                ) : (
                    <div className="max-w-xl space-y-6">
                        {/* User header */}
                        <div className="flex items-center gap-4">
                            {selectedUser.photoURL ? (
                                <img src={selectedUser.photoURL} alt="" className="w-14 h-14 rounded-full" />
                            ) : (
                                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-lg text-gray-400">
                                    {selectedUser.displayName?.[0] ?? '?'}
                                </div>
                            )}
                            <div>
                                <h2 className="text-lg font-bold text-white">{selectedUser.displayName}</h2>
                                <p className="text-sm text-gray-400">{selectedUser.email}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${
                                    selectedUser.status === 'active' ? 'bg-green-400/10 text-green-400' :
                                    selectedUser.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' :
                                    'bg-red-400/10 text-red-400'
                                }`}>
                                    {selectedUser.status}
                                </span>
                            </div>
                        </div>

                        {/* Application info */}
                        {selectedUser.applicationNote && (
                            <div className="bg-white/5 rounded p-4">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Application Note</div>
                                <p className="text-sm text-gray-300">{selectedUser.applicationNote}</p>
                                <div className="text-[10px] text-gray-600 mt-2">
                                    Applied: {formatDate(selectedUser.appliedAt)} · Requested: {selectedUser.appliedRoles.join(', ')}
                                </div>
                            </div>
                        )}

                        {/* Activity */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 rounded p-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500">Last Active</div>
                                <div className="text-sm text-white mt-1">{formatDate(selectedUser.lastActiveAt)}</div>
                            </div>
                            <div className="bg-white/5 rounded p-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500">Total Reviews</div>
                                <div className="text-sm text-white mt-1">{selectedUser.totalReviews}</div>
                            </div>
                        </div>

                        {/* Role management */}
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                                {selectedUser.status === 'pending' ? 'Assign Roles' : 'Current Roles'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {VALID_ROLES.map(role => (
                                    <button
                                        key={role}
                                        onClick={() => toggleRole(role)}
                                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                                            editRoles.includes(role)
                                                ? `${roleBadge(role)} border-current`
                                                : 'border-white/10 text-gray-500 hover:text-gray-300'
                                        }`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3">
                            {selectedUser.status === 'pending' && (
                                <>
                                    <button
                                        onClick={() => approveUser(selectedUser)}
                                        disabled={updating || editRoles.length === 0}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                    >
                                        {updating ? 'Approving...' : 'Approve'}
                                    </button>
                                    <div className="w-full">
                                        <textarea
                                            value={rejectNote}
                                            onChange={e => setRejectNote(e.target.value)}
                                            placeholder="Rejection reason (required)..."
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 resize-none"
                                            rows={2}
                                        />
                                        <button
                                            onClick={() => rejectUser(selectedUser)}
                                            disabled={updating || !rejectNote.trim()}
                                            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                        >
                                            {updating ? 'Rejecting...' : 'Reject'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {selectedUser.status === 'active' && (
                                <>
                                    <button
                                        onClick={() => updateRoles(selectedUser)}
                                        disabled={updating}
                                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                    >
                                        {updating ? 'Saving...' : 'Update Roles'}
                                    </button>
                                    <button
                                        onClick={() => toggleStatus(selectedUser, 'disabled')}
                                        disabled={updating}
                                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm rounded transition-colors"
                                    >
                                        Deactivate
                                    </button>
                                </>
                            )}

                            {selectedUser.status === 'disabled' && (
                                <button
                                    onClick={() => toggleStatus(selectedUser, 'active')}
                                    disabled={updating}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                >
                                    {updating ? 'Reactivating...' : 'Reactivate'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add src/components/admin/UsersTab.tsx
git commit -m "feat(rbac): build UsersTab with application review, role management, activity display"
```

---

## Task 7: Add Application Form to Contribute Page

Add inline application form on the Contribute page. Each role card gets an "Apply" button that triggers Google sign-in if needed, then shows a role selection + motivation form.

**Files:**
- Modify: `src/pages/Contribute.tsx`

**Step 1: Add application form**

At the top of `src/pages/Contribute.tsx`, add imports:

```typescript
import { useAuth } from '../store/AuthContext';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserRole } from '../lib/roles';
```

Inside the `Contribute` component (after existing state), add:

```typescript
const { user, userDoc, signIn, loading: authLoading } = useAuth();
const [applying, setApplying] = useState(false);
const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
const [applicationNote, setApplicationNote] = useState('');
const [submitting, setSubmitting] = useState(false);
const [submitted, setSubmitted] = useState(false);
const [existingStatus, setExistingStatus] = useState<string | null>(null);

// Check if user already has a /users doc
useEffect(() => {
    if (!user) { setExistingStatus(null); return; }
    if (userDoc) {
        setExistingStatus(userDoc.status);
    }
}, [user, userDoc]);

const handleApply = async (roleId: string) => {
    if (!user) {
        await signIn();
        return;
    }
    if (existingStatus) return; // Already applied or active
    setSelectedRoles([roleId as UserRole]);
    setApplying(true);
};

const toggleApplyRole = (role: UserRole) => {
    setSelectedRoles(prev =>
        prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
};

const submitApplication = async () => {
    if (!user || selectedRoles.length === 0 || !applicationNote.trim()) return;
    setSubmitting(true);
    try {
        await setDoc(doc(db, 'users', user.uid), {
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            photoURL: user.photoURL ?? null,
            roles: [],
            status: 'pending',
            appliedRoles: selectedRoles,
            applicationNote: applicationNote.trim(),
            appliedAt: serverTimestamp(),
            approvedAt: null,
            approvedBy: null,
            lastActiveAt: null,
            totalReviews: 0,
        });
        setSubmitted(true);
        setApplying(false);
    } catch (err) {
        console.error('Application failed:', err);
        alert('Failed to submit application. Please try again.');
    } finally {
        setSubmitting(false);
    }
};
```

**Step 2: Add Apply button to each role card**

In the role card render (inside the `{ROLES.map((role) => {` block), after the "If you're unavailable" section (around line 270), add an Apply button:

```tsx
{/* Apply button */}
<div className="pt-2">
    {!user ? (
        <button
            onClick={() => handleApply(role.id)}
            className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded transition-colors"
        >
            Sign in to Apply
        </button>
    ) : existingStatus === 'active' ? (
        <div className="text-xs text-green-400 bg-green-400/10 rounded p-2 text-center">
            You're an active contributor
        </div>
    ) : existingStatus === 'pending' ? (
        <div className="text-xs text-yellow-400 bg-yellow-400/10 rounded p-2 text-center">
            Your application is pending review
        </div>
    ) : existingStatus === 'disabled' ? (
        <div className="text-xs text-red-400 bg-red-400/10 rounded p-2 text-center">
            Your access has been revoked
        </div>
    ) : (
        <button
            onClick={() => handleApply(role.id)}
            className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded transition-colors"
        >
            Apply for this Role
        </button>
    )}
</div>
```

**Step 3: Add application form overlay**

Before the closing `</main>` tag, add the application form (shown when `applying` is true):

```tsx
{/* Application Form Overlay */}
{applying && (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Apply to Contribute</h3>
            <p className="text-sm text-gray-400">
                Select the role(s) you'd like and tell us why you're interested.
            </p>

            {/* Role selection */}
            <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Roles</div>
                <div className="flex flex-wrap gap-2">
                    {ROLES.map(role => (
                        <button
                            key={role.id}
                            onClick={() => toggleApplyRole(role.id as UserRole)}
                            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                                selectedRoles.includes(role.id as UserRole)
                                    ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/30'
                                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {role.title}
                        </button>
                    ))}
                </div>
            </div>

            {/* Motivation */}
            <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    Why are you interested? (2-3 sentences)
                </div>
                <textarea
                    value={applicationNote}
                    onChange={e => setApplicationNote(e.target.value)}
                    placeholder="I'm interested because..."
                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none"
                    rows={3}
                    maxLength={500}
                />
                <div className="text-[10px] text-gray-600 text-right">{applicationNote.length}/500</div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={submitApplication}
                    disabled={submitting || selectedRoles.length === 0 || !applicationNote.trim()}
                    className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                >
                    {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
                <button
                    onClick={() => setApplying(false)}
                    className="px-4 py-2.5 border border-white/10 text-gray-400 hover:text-white text-sm rounded transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
)}

{/* Success message */}
{submitted && (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg max-w-md w-full p-6 text-center space-y-4">
            <div className="text-4xl">✓</div>
            <h3 className="text-lg font-bold text-white">Application Submitted</h3>
            <p className="text-sm text-gray-400">
                A Lead will review your application and get back to you. You'll gain access as soon as you're approved.
            </p>
            <button
                onClick={() => setSubmitted(false)}
                className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded transition-colors"
            >
                Got it
            </button>
        </div>
    </div>
)}
```

**Step 4: Update the CTA section**

Replace the existing "Interested?" CTA at the bottom (lines 302-321) with one that's dynamic based on auth state:

```tsx
<div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-6 text-center">
    {!user ? (
        <>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">Ready to contribute?</h2>
            <p className="text-sm text-gray-400 mb-4">
                Sign in with Google and apply for the role that fits you best.
            </p>
            <button
                onClick={signIn}
                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-wider uppercase rounded transition-colors"
            >
                Sign in with Google
            </button>
        </>
    ) : submitted || existingStatus === 'pending' ? (
        <>
            <h2 className="text-xl font-bold text-yellow-300 mb-2">Application Pending</h2>
            <p className="text-sm text-gray-400">
                We've received your application. A Lead will review it shortly.
            </p>
        </>
    ) : existingStatus === 'active' ? (
        <>
            <h2 className="text-xl font-bold text-green-300 mb-2">You're a contributor!</h2>
            <p className="text-sm text-gray-400 mb-4">
                Head to the admin console to start reviewing.
            </p>
            <button
                onClick={() => navigate('/admin')}
                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-wider uppercase rounded transition-colors"
            >
                Go to Admin Console
            </button>
        </>
    ) : (
        <>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">Ready to contribute?</h2>
            <p className="text-sm text-gray-400 mb-4">
                Pick a role above and apply — it takes less than a minute.
            </p>
        </>
    )}
</div>
```

**Step 5: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add src/pages/Contribute.tsx
git commit -m "feat(rbac): add inline application form to Contribute page"
```

---

## Task 8: Update Cloud Functions for Role-Based Auth

Update callable functions to check `/users/{uid}` for role-based authorization instead of just checking auth.

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Add role-checking helper**

Near the top of `functions/src/index.ts` (after existing imports), add a helper function:

```typescript
/** Check if the calling user has one of the required roles */
async function requireRole(uid: string, requiredRoles: string[]): Promise<void> {
    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();

    if (!userSnap.exists) {
        // Fallback: check legacy admins collection during migration
        const adminSnap = await db.collection('admins').doc(uid).get();
        if (adminSnap.exists) return; // Legacy admin, allow
        throw new HttpsError('permission-denied', 'No user profile found');
    }

    const userData = userSnap.data()!;
    if (userData.status !== 'active') {
        throw new HttpsError('permission-denied', 'User account is not active');
    }

    const userRoles = userData.roles as string[];
    if (!requiredRoles.some(r => userRoles.includes(r))) {
        throw new HttpsError('permission-denied', `Requires one of: ${requiredRoles.join(', ')}`);
    }
}
```

**Step 2: Update applyValidationProposal**

After the existing auth check (`if (!request.auth)` at line 547), add:

```typescript
await requireRole(uid, ['scoring-reviewer', 'lead']);
```

**Step 3: Update triggerAgentRun**

After the existing auth check (`if (!request.auth)` at line 630), add:

```typescript
await requireRole(request.auth.uid, ['lead']);
```

**Step 4: Add totalReviews increment to applyValidationProposal**

Inside the transaction, after the proposal is approved (around line 618), add:

```typescript
// Increment reviewer's totalReviews counter
const reviewerRef = db.collection('users').doc(uid);
const reviewerSnap = await tx.get(reviewerRef);
if (reviewerSnap.exists) {
    tx.update(reviewerRef, {
        totalReviews: FieldValue.increment(1),
    });
}
```

**Step 5: Verify functions build**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(rbac): add role-based auth checks to callable functions"
```

---

## Task 9: Increment totalReviews on Signal/Discovery Actions

When an admin approves/rejects signals or discovery proposals, increment their `totalReviews` counter in `/users/{uid}`.

**Files:**
- Modify: `src/pages/Admin.tsx` (signal approve/reject)
- Modify: `src/components/admin/DiscoveryTab.tsx` (proposal approve/reject)

**Step 1: Update signal review in Admin.tsx**

In the `updateSignal` function (around line 111-129), after the `updateDoc` call for the signal, add:

```typescript
// Increment reviewer's totalReviews
if (user?.uid) {
    const userRef = doc(db, 'users', user.uid);
    updateDoc(userRef, {
        totalReviews: increment(1),
    }).catch(() => {}); // Non-critical, don't block
}
```

Add `increment` to the Firestore imports at the top of Admin.tsx:

```typescript
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, increment, type QueryConstraint } from 'firebase/firestore';
```

Also add it to the bulk reject function `handleBulkReject` — after the `Promise.all` for rejecting signals, add:

```typescript
// Increment reviewer's totalReviews by number of rejected signals
if (user?.uid) {
    const userRef = doc(db, 'users', user.uid);
    updateDoc(userRef, {
        totalReviews: increment(pendingInGroup.length),
    }).catch(() => {});
}
```

**Step 2: Update DiscoveryTab**

In `src/components/admin/DiscoveryTab.tsx`, find the approve/reject handler and add the same increment logic after each action. Add `increment` to its Firestore imports as well.

**Step 3: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/pages/Admin.tsx src/components/admin/DiscoveryTab.tsx
git commit -m "feat(rbac): increment totalReviews on signal and discovery actions"
```

---

## Task 10: Migration Script — Seed Existing Admin as Lead User

Create a script to migrate the existing admin to `/users/{uid}` with `lead` role.

**Files:**
- Create: `src/scripts/seed-lead-user.ts`

**Step 1: Create migration script**

Create `src/scripts/seed-lead-user.ts`:

```typescript
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault(),
});

const db = getFirestore();

async function seedLeadUser() {
    console.log('Migrating existing admins to /users collection...');

    const adminsSnap = await db.collection('admins').get();
    console.log(`Found ${adminsSnap.size} admin(s) to migrate.`);

    for (const adminDoc of adminsSnap.docs) {
        const uid = adminDoc.id;
        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
            console.log(`  ${uid}: already has /users doc, skipping.`);
            continue;
        }

        // We need Firebase Auth user info — use admin SDK
        const { getAuth } = await import('firebase-admin/auth');
        const authUser = await getAuth().getUser(uid);

        await userRef.set({
            email: authUser.email ?? '',
            displayName: authUser.displayName ?? '',
            photoURL: authUser.photoURL ?? null,
            roles: ['lead'],
            status: 'active',
            appliedRoles: ['lead'],
            applicationNote: 'Migrated from legacy admin',
            appliedAt: FieldValue.serverTimestamp(),
            approvedAt: FieldValue.serverTimestamp(),
            approvedBy: 'system-migration',
            lastActiveAt: FieldValue.serverTimestamp(),
            totalReviews: 0,
        });
        console.log(`  ${uid} (${authUser.email}): migrated as lead.`);
    }

    console.log('Migration complete.');
}

seedLeadUser()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    });
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsx src/scripts/seed-lead-user.ts --dry-run` (or just check types)

**Step 3: Commit**

```bash
git add src/scripts/seed-lead-user.ts
git commit -m "feat(rbac): add lead user migration script"
```

---

## Task 11: Update Firestore Rules — Allow Self-Update of lastActiveAt

The activity tracking in AuthContext calls `updateDoc(userRef, { lastActiveAt: serverTimestamp() })` but the current `/users` rules only allow Lead to update. We need a rule for users to update their own `lastActiveAt` field.

**Files:**
- Modify: `firestore.rules`

**Step 1: Add self-update rule for activity tracking**

In the `/users/{userId}` match block, add a rule between the create and the lead-update rules:

```
// Active users can update their own lastActiveAt (activity tracking)
allow update: if request.auth != null
              && request.auth.uid == userId
              && isActiveUser()
              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastActiveAt']);
```

This ensures users can ONLY update `lastActiveAt` and nothing else on their own doc.

**Step 2: Verify rules syntax**

Use Firebase CLI or MCP tool to validate.

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rbac): allow self-update of lastActiveAt for activity tracking"
```

---

## Task 12: Deploy & Verify

Deploy all changes and run the migration.

**Step 1: Build frontend**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: SUCCESS with no errors

**Step 2: Build functions**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: SUCCESS with no errors

**Step 3: Check active Firebase project**

Run: `cd /Users/dehakuran/Projects/ai-4-society && firebase use`
Expected: `ai-4-society`
If not: `firebase use ai-4-society`

**Step 4: Run migration script**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsx src/scripts/seed-lead-user.ts`
Expected: Existing admin migrated to `/users` with lead role

**Step 5: Deploy**

Run: `cd /Users/dehakuran/Projects/ai-4-society && firebase deploy --only firestore:rules,hosting,functions`

**Step 6: Verify**

Manual test checklist:
1. Sign in as existing admin → should auto-migrate to /users, see all tabs
2. Open /contribute as non-signed-in user → see "Sign in to Apply" buttons
3. Apply with a test account → should create /users/{uid} with pending status
4. In Users tab → see pending application, approve it with roles
5. Sign in as approved user → see only role-appropriate tabs
6. Deactivate user → they should lose access immediately

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat(rbac): complete user management portal deployment"
```
