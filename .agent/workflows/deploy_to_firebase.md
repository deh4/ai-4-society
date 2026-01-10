---
description: How to deploy the AI 4 Society app to Firebase Hosting
---

# Deploy to Firebase Hosting

## Prerequisites
- Firebase CLI installed (`npm install -g firebase-tools`)
- Logged in to Firebase (`firebase login`)
- Project linked via `.firebaserc`

## Manual Deployment

```bash
# 1. Build the production bundle
npm run build

# 2. Deploy to Firebase Hosting
firebase deploy --only hosting
```

## CI/CD Deployment (GitHub Actions)

The project includes automatic deployment via GitHub Actions on push to `main`.

### One-Time Setup

1. **Create Firebase Service Account**:
   ```bash
   firebase init hosting:github
   ```
   This will:
   - Create a service account in Google Cloud
   - Add the secret to your GitHub repository
   - Generate the workflow file (already created)

2. **Or manually add the secret**:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate new private key
   - Go to GitHub repo → Settings → Secrets → Actions
   - Add secret: `FIREBASE_SERVICE_ACCOUNT_AI_4_SOCIETY`
   - Paste the JSON content

### Workflow Triggers

| Event | Action |
|-------|--------|
| Push to `main` | Build + Deploy to production |
| Pull Request | Build only (no deploy) |

// turbo-all
