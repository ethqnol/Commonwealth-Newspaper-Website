# Migrating to a New Firebase Account

This guide covers moving the entire newspaper site from one Google/Firebase account to another.

---

## What Gets Migrated

| Thing | How | Notes |
|-------|-----|-------|
| Code | git clone | nothing Firebase-specific |
| Firestore data (articles, users, whitelist, admins) | export/import | see step 3 |
| Storage files (cover images, article assets) | copy between buckets | see step 4 |
| Article image URLs in Firestore | rewrite script | see step 5 — **don't skip** |
| Auth users | re-login (default), or `auth:export`/`auth:import` | see step 9 |
| Security rules | already in repo, deploy with CLI | step 7 |
| Hosting config | already in repo, deploy with CLI | step 7 |
| Custom domain | move manually in console + DNS | step 10 |

**Important**: Firebase Auth UIDs are scoped per-project. Even with the same Google identity, the same person gets a **new UID** on the new project. The existing `users/{uid}` docs will not match new UIDs, so on first login the app creates fresh user docs. This is fine because the admin status is recovered from the `adminEmails` collection (keyed by email), and `AuthContext` auto-promotes on sign-in. The migrated `users/` collection becomes mostly historical record. If you care about preserving UIDs, see step 9.

---

## Before You Start

Install:

- **gcloud CLI** — [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install). Includes `gsutil` and `gcloud storage`.
- **firebase-tools** — bundled in `devDependencies`, so `npx firebase ...` works from the repo. Or install globally: `npm i -g firebase-tools`.
- **Node 20+** — for the URL-rewrite script in step 5.

You'll also need:

- Owner (or Editor + Service Usage Admin + Storage Admin) on **both** the old and new GCP projects.
- The new project must be on the **Blaze (pay-as-you-go) plan**. The site uses Next.js with `frameworksBackend` in `firebase.json`, which deploys via Cloud Functions and is not available on Spark.

Find the actual bucket names in the Firebase Console → **Storage**. Firebase projects generaaly use `<project-id>.firebasestorage.app`. However it is possible that the old bucket namint convention will be used: `<project-id>.appspot.com`. **Do not assume** and copy the exact bucket URI from the console. Throughout this guide:

- `OLD_BUCKET` = old project's default bucket (e.g. `cws-paper.appspot.com`)
- `NEW_BUCKET` = new project's default bucket (e.g. `cws-paper-new.firebasestorage.app`)

---

## Step by Step

### 1. Create the New Firebase Project

On the **new** Google account:

1. Go to [console.firebase.google.com](https://console.firebase.google.com), create a new project (e.g. `cws-paper-new`).
2. Upgrade to **Blaze** (Project Settings → Usage and billing). Required for Next.js hosting.
3. **Authentication** → enable **Google** sign-in provider.
4. **Firestore Database** → create. Pick the same region as the old project if possible (check old project under Firestore → ⚙ → Location). Mismatched regions don't break anything, but cross-region imports are slower and pricier.
5. **Storage** → create. Note the bucket URI shown; that's `NEW_BUCKET`.
6. **Hosting** → "Get started" so the project knows it's hosting-enabled.
7. **Project Settings** → register a **web app** and copy the config values for step 6.

### 2. Export Firestore from the Old Project

```bash
# login as old account
gcloud auth login
gcloud config set project OLD-PROJECT-ID

# export to old project's default bucket
gcloud firestore export gs://OLD_BUCKET/firestore-backup
```

This dumps all collections (`articles`, `users`, `whitelistedEmails`, `adminEmails`) under `gs://OLD_BUCKET/firestore-backup/`.

> The export runs as the project's Firestore service agent. The agent already has write access to the project's own default bucket, so this works out of the box. Cross-project export to `NEW_BUCKET` is possible but requires granting the old project's service agent `Storage Object Admin` on `NEW_BUCKET` — usually not worth the IAM dance vs. a two-step copy below.

### 3. Move the Export to the New Project

The new project's Firestore import service agent needs read access to wherever the export lives. The simplest path is to copy the export into `NEW_BUCKET` first.

**Option A — same-machine, both accounts authorized:**

```bash
# while logged in as the old account, grant the new project read on the old bucket
# (or the reverse — easier if the new account owns both projects)
gsutil -m cp -r gs://OLD_BUCKET/firestore-backup gs://NEW_BUCKET/firestore-backup
```

**Option B — true handoff (recommended for account changes):** download locally, then upload as the new account.

```bash
# as old account
mkdir -p firestore-backup
gcloud storage cp -r gs://OLD_BUCKET/firestore-backup ./firestore-backup

# switch identities
gcloud auth login          # log in as new account
gcloud config set project NEW-PROJECT-ID

# upload to new bucket
gcloud storage cp -r ./firestore-backup/firestore-backup gs://NEW_BUCKET/
```

Then import:

```bash
gcloud firestore import gs://NEW_BUCKET/firestore-backup
```

> `gcloud storage cp` is the modern replacement for `gsutil cp`; either works.

### 4. Copy Storage Files (Article Images)

Same shape as step 3. Article images live under `articles/` (the admin upload code writes to `articles/{slug}/{timestamp}-{filename}`).

**Same-account:**

```bash
gcloud storage cp -r gs://OLD_BUCKET/articles gs://NEW_BUCKET/articles
```

**Cross-account (download + reupload):**

```bash
# as old account
mkdir -p storage-backup
gcloud storage cp -r gs://OLD_BUCKET/articles ./storage-backup/

# as new account
gcloud auth login
gcloud storage cp -r ./storage-backup/articles gs://NEW_BUCKET/articles
```

### 5. Rewrite Image URLs in Firestore — **don't skip this**

Article cover images and inline markdown images store **full Firebase Storage download URLs** in Firestore (e.g. `https://firebasestorage.googleapis.com/v0/b/OLD_BUCKET/o/articles%2Fslug%2F123-img.jpg?alt=media&token=...`). After migration these URLs are broken in two ways:

1. The bucket name in the path (`/b/OLD_BUCKET/`) points at the old project.
2. The `?token=...` query parameter is bucket-specific and **does not survive a copy**. Even if you string-replace the bucket name, the token is invalid against the new bucket.

The fix is to look up each image by its storage path on the new bucket and ask the SDK for a fresh download URL. This script does it:

```javascript
// scripts/rewrite-image-urls.mjs
// run with: node scripts/rewrite-image-urls.mjs
//
// requires firebase-admin: npm i -D firebase-admin
// requires a service-account key for the NEW project (Project Settings →
// Service accounts → Generate new private key). Save it as new-sa.json
// (gitignored — do not commit).

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "node:fs";

const sa = JSON.parse(readFileSync("./new-sa.json", "utf8"));
const NEW_BUCKET = "NEW-PROJECT-ID.firebasestorage.app"; // confirm in console

initializeApp({
    credential: cert(sa),
    storageBucket: NEW_BUCKET,
});

const db = getFirestore();
const bucket = getStorage().bucket();

// extract the object path from a Firebase Storage download URL
// e.g. https://firebasestorage.googleapis.com/v0/b/<bucket>/o/articles%2Fslug%2F1-x.jpg?alt=...
//   →  "articles/slug/1-x.jpg"
function extractObjectPath(url) {
    const m = url.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

// returns a long-lived download URL for the same object on the new bucket
async function freshUrl(objectPath) {
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
        console.warn(`MISSING on new bucket: ${objectPath}`);
        return null;
    }
    // signed URL with far-future expiry (adjust as you like, max 7d for v4)
    const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2099-12-31",
    });
    return url;
}

async function rewriteUrlIfFirebase(url) {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return url;
    const path = extractObjectPath(url);
    if (!path) return url;
    const fresh = await freshUrl(path);
    return fresh || url;
}

// rewrite all firebasestorage URLs found in `content` (markdown body)
async function rewriteMarkdown(md) {
    if (!md) return md;
    const urlRe = /https:\/\/firebasestorage\.googleapis\.com\/[^\s)]+/g;
    const matches = [...new Set(md.match(urlRe) ?? [])];
    let out = md;
    for (const oldUrl of matches) {
        const fresh = await rewriteUrlIfFirebase(oldUrl);
        if (fresh && fresh !== oldUrl) out = out.split(oldUrl).join(fresh);
    }
    return out;
}

const snap = await db.collection("articles").get();
let touched = 0;
for (const doc of snap.docs) {
    const data = doc.data();
    const update = {};

    if (data.coverImageUrl) {
        const fresh = await rewriteUrlIfFirebase(data.coverImageUrl);
        if (fresh && fresh !== data.coverImageUrl) update.coverImageUrl = fresh;
    }
    if (data.content) {
        const fresh = await rewriteMarkdown(data.content);
        if (fresh !== data.content) update.content = fresh;
    }

    if (Object.keys(update).length) {
        await doc.ref.update(update);
        touched++;
        console.log(`updated ${doc.id} (${data.slug ?? "no-slug"})`);
    }
}
console.log(`done. ${touched}/${snap.size} articles updated.`);
```

Make sure `new-sa.json` is in `.gitignore` (the existing `*.pem` rule does **not** cover it). Delete it after the migration.

If only a handful of articles have images, re-uploading them through the admin panel after deploy is also fine.

### 6. Update the Code

Edit `.env.local` (do **not** commit):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=NEW-PROJECT-ID.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=NEW-PROJECT-ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=NEW_BUCKET   # exact value from console
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Update the project alias in `.firebaserc` so `firebase deploy` targets the new project. Either commit this change:

```json
{ "projects": { "default": "NEW-PROJECT-ID" } }
```

…or set it locally without committing:

```bash
npx firebase use --add NEW-PROJECT-ID   # first time, creates the alias
npx firebase use NEW-PROJECT-ID
```

### 7. Deploy Rules and Hosting

```bash
# rules first — Firestore reads from AuthContext fail without them
npx firebase deploy --only firestore:rules,storage

# then hosting (Next.js → Cloud Functions, takes a few minutes the first time)
npx firebase deploy --only hosting
```

If hosting deploy errors with "Cloud Functions API not enabled" or similar, enable Cloud Functions and Cloud Build APIs in the GCP console for the new project, then retry.

### 8. First Admin on the New Project

`adminEmails` was migrated in step 3, so existing admins auto-promote on next sign-in (the `AuthContext` checks `adminEmails` by email and upgrades the freshly-created user doc).

If you skipped the Firestore export, or you need a brand-new admin:

1. Firebase Console → Firestore → `adminEmails` collection.
2. Add a doc with field `email` = the new admin's email (`@commschool.org` or whitelisted).
3. That person signs in → gets ADMIN role automatically.

### 9. (Optional) Migrate Auth Users to Preserve UIDs

By default users just re-login and get new UIDs — orphaning the old `users/` docs but keeping admin status via `adminEmails`. If you specifically want to preserve UIDs (e.g. you've added per-user data outside `adminEmails`):

```bash
# old project
npx firebase use OLD-PROJECT-ID
npx firebase auth:export users.json --format=json

# new project
npx firebase use NEW-PROJECT-ID
npx firebase auth:import users.json
```

UIDs are preserved across the export/import. For Google federated identities the import keeps the providerUserInfo, and the next Google sign-in maps to the imported UID. Verify with one test account before relying on this for everyone.

### 10. Custom Domain

If the old project served a custom domain:

1. New project → Hosting → **Add custom domain**, follow the verification + DNS instructions.
2. Once the new domain shows "Connected", **then** remove it from the old project's Hosting and update DNS to point at the new project.
3. SSL provisions automatically (a few minutes to ~24h).

Order matters — adding the domain on the new project first lets Firebase pre-provision the cert, minimizing downtime.

---

## Testing

- [ ] Open the deployed site → homepage loads, featured article and grid render with images.
- [ ] Click into an article → cover image and inline images load (no broken images, no 403/404 in DevTools network tab).
- [ ] Open `/archive` → past articles list renders.
- [ ] Sign in with an admin account → `AuthContext` upgrades you to ADMIN, `/admin` is reachable.
- [ ] In `/admin`, click into an article → existing images appear in the per-article images panel.
- [ ] Upload a new image via the admin panel → file lands in `gs://NEW_BUCKET/articles/<slug>/...` and renders.
- [ ] Sign in with a non-admin `@commschool.org` account → app loads, no admin UI.
- [ ] Sign in with a non-whitelisted external email → gets the "Unauthorized account" alert and is signed out.

If any image step fails, re-run the rewrite script from step 5 as it's most likely cause is leftover stale URLs.

---

## Timeline

For a small site the active work is **30–60 minutes**. Add wait time for: Firestore export/import (minutes), `frameworksBackend` first deploy (5–10 min), DNS propagation if moving a custom domain (minutes to hours).

## Rollback

The old project is not modified by any step in this guide, so the data side of rollback is just pointing `.env.local` and `.firebaserc` back at `OLD-PROJECT-ID` and redeploying. Two caveats:

- If you moved a **custom domain**, rollback means re-pointing DNS back to the old project and re-adding the domain there. Allow for propagation time.
- Any **new content created after cutover** lives only on the new project. A rollback either loses it or requires running the same export/import in reverse.
