# User Management Portal — Design

**Goal:** Replace binary admin/not-admin with role-based access control (RBAC) for the 5 contributor roles, with self-service applications and Lead approval.

**Architecture:** Firestore `/users/{uid}` collection stores roles and status. Firestore security rules enforce permissions per role. AuthContext reads user doc on login. Admin console tabs filter by role.

**Tech:** Firebase Auth (Google OAuth), Firestore, Cloud Functions (email notification), React context for role state.

---

## Data Model

### `/users/{uid}` collection

```
{
  email: string,
  displayName: string,
  photoURL: string | null,
  roles: string[],              // e.g. ["signal-reviewer", "editor"]
  status: "pending" | "active" | "disabled",
  appliedRoles: string[],       // what they originally requested
  applicationNote: string,      // short motivation text
  appliedAt: Timestamp,
  approvedAt: Timestamp | null,
  approvedBy: string | null,    // UID of Lead who approved
  lastActiveAt: Timestamp,
  totalReviews: number,         // lifetime review count
}
```

### Valid roles

- `signal-reviewer`
- `discovery-reviewer`
- `scoring-reviewer`
- `editor`
- `lead`

### Permission matrix

| Permission | signal-reviewer | discovery-reviewer | scoring-reviewer | editor | lead |
|---|---|---|---|---|---|
| Signals tab (approve/reject) | write | - | - | - | write |
| Discovery tab (approve/reject) | - | write | - | - | write |
| Validation tab (approve/reject) | - | - | write | - | write |
| Milestones tab (CRUD) | - | - | - | write | write |
| Risks/Solutions (read) | read | read | read | read | read |
| Risks/Solutions (edit narratives) | - | - | - | write | write |
| Users tab (manage) | - | - | - | - | write |
| Observatory (agent triggers) | - | - | - | - | write |

---

## Application & Onboarding Flow

### User journey

1. Visitor lands on `/contribute` — sees the 5 roles with descriptions
2. Clicks "Apply for this role" — triggers Google sign-in if needed
3. Application form: select desired role(s), write short motivation (2-3 sentences)
4. Submit creates `/users/{uid}` doc with `status: "pending"`, `roles: []`
5. Lead gets email notification about new application
6. Lead reviews in Users tab: sees name, email, requested roles, motivation
7. Lead approves → sets `status: "active"`, assigns roles (can grant subset of requested)
8. Lead rejects → sets `status: "disabled"` with a note

### Login behavior

1. Firebase Auth signs in (Google)
2. AuthContext reads `/users/{uid}`
   - Document exists + status `active` → load roles, show role-appropriate admin tabs
   - Document exists + status `pending` → show "application pending" message
   - Document exists + status `disabled` → show "access revoked" message
   - No document → regular public user (dashboard only)
3. Existing admin auto-migrated: if `/admins/{uid}` exists but `/users/{uid}` doesn't, create user doc with `roles: ["lead"]`

### Activity tracking

- `lastActiveAt` updates on admin console visit (throttled to 1x per hour)
- `totalReviews` incremented on each approve/reject action
- Users tab shows "Last seen" and "Reviews this month" for spotting inactive contributors

### Email notification

Cloud Function triggers on `/users` document creation where `status == "pending"`. Sends email to Lead email with applicant name, email, requested roles, and link to Users tab.

---

## Admin Console Changes

### New "Users" tab (Lead-only)

**Pending Applications** (top, if any):
- Card per application: photo, name, email, requested roles, motivation, applied date
- Approve button (opens role picker), Reject button (requires note)

**Active Users** (main section):
- List: photo, name, email, role badges, last seen, reviews this month
- Click to expand: change roles, deactivate, view activity
- Sortable by name, last seen, review count

**Disabled Users** (collapsed at bottom):
- Same fields, "Reactivate" button

### Tab filtering by role

| Tab | Visible to |
|---|---|
| Risk Signals | signal-reviewer, lead |
| Solution Signals | signal-reviewer, lead |
| Discovery | discovery-reviewer, lead |
| Validation | scoring-reviewer, lead |
| Milestones | editor, lead |
| Users | lead |
| Observatory (link) | lead |

Users with multiple roles see all their role-appropriate tabs.

### Contribute page update

Each role card gets an "Apply" button. Signed-in users see the application form inline. The "Email us" CTA becomes the fallback for unsigned-in users.

---

## Firestore Security Rules

### `/users` collection

```
match /users/{userId} {
  // Users can read their own doc
  allow read: if request.auth != null && request.auth.uid == userId;

  // Lead can read all users
  allow read: if hasRole('lead');

  // Application: user creates own doc, pending status, no self-assigned roles
  allow create: if request.auth != null
                && request.auth.uid == userId
                && request.resource.data.status == 'pending'
                && request.resource.data.roles.size() == 0
                && request.resource.data.appliedRoles.size() > 0
                && request.resource.data.keys().hasAll(
                     ['email', 'displayName', 'status', 'roles',
                      'appliedRoles', 'applicationNote', 'appliedAt']);

  // Lead manages: can update status and roles, not email or appliedAt
  allow update: if hasRole('lead')
                && request.resource.data.email == resource.data.email
                && request.resource.data.appliedAt == resource.data.appliedAt;

  allow delete: if false;
}
```

### Helper functions (replacing isAdmin)

```
function hasRole(role) {
  return request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active'
    && role in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles;
}

function hasAnyRole(roles) {
  return request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active'
    && roles.hasAny(
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles);
}
```

### Updated collection rules

```
signals:              hasAnyRole(['signal-reviewer', 'lead'])
milestones:           hasAnyRole(['editor', 'lead'])
discovery_proposals:  hasAnyRole(['discovery-reviewer', 'lead'])
validation_proposals: hasAnyRole(['scoring-reviewer', 'lead'])
risks, solutions:     read: public / write: hasAnyRole(['editor', 'lead'])
risk_updates, solution_updates: hasAnyRole(['scoring-reviewer', 'lead'])
```

### Migration from /admins

1. Deploy rules with both `isAdmin()` and `hasRole()` (backward compatible)
2. Create `/users` doc for existing admin with `roles: ["lead"]`
3. Remove `/admins` checks after confirmed migration

### Cloud Functions auth

Callable functions read `/users/{uid}` to verify roles before executing:
- `applyValidationProposal` → requires `scoring-reviewer` or `lead`
- `triggerAgentRun` → requires `lead`

---

## Security Hardening

- Create rule ensures `roles.size() == 0` — no self-assigned roles
- Update rule ensures immutable audit fields (`email`, `appliedAt`)
- `hasRole()` checks `status == 'active'` — disabled users lose access instantly
- No delete operations on user docs (audit trail preserved)
- All actions logged with UID + timestamp
- Firestore rules read live data (no caching) — revoked roles take effect immediately
