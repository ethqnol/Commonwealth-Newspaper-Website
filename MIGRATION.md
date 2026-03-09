# Migrating to a New Firebase Account

This guide covers moving the entire newspaper site from one Google/Firebase account to another (e.g. handing off from a personal account to a school-owned account).

---

## What Gets Migrated

| Thing | How |
|-------|-----|
| Code | its a git repo, just clone it |
| Firestore data (articles, users, whitelist) | export/import |
| Storage files (cover images) | copy between buckets |
| Auth users | nothing to do, they just re-login |
| Security rules | already in the repo |
| Hosting config | already in the repo |

---

## Step by Step

### 1. Create the New Firebase Project

On the **new** google account:

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (e.g. `cws-paper-new`)
3. Enable **Google sign-in** under Authentication
4. Create a **Firestore database** (same region as before if possible, `us-east1` or `us-central1`)
5. Enable **Storage**
6. Register a **web app** and copy the config values

### 2. Export Firestore Data from Old Project

You need the Google Cloud CLI (`gcloud`) for this. Install from [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install).

```bash
# login to the OLD account
gcloud auth login

# set to old project
gcloud config set project OLD-PROJECT-ID

# create a storage bucket for the export if one doesnt exist
# (the default bucket from firebase storage works fine)
gcloud firestore export gs://OLD-PROJECT-ID.appspot.com/firestore-backup
```

This exports all collections (`articles`, `users`, `whitelistedEmails`, `adminEmails`) to a Cloud Storage bucket.

### 3. Transfer the Export to the New Project

The new project needs access to the exported data. Easiest way:

```bash
# copy export from old bucket to new bucket
gsutil -m cp -r gs://OLD-PROJECT-ID.appspot.com/firestore-backup gs://NEW-PROJECT-ID.appspot.com/firestore-backup

# switch to new project
gcloud config set project NEW-PROJECT-ID

# import into new firestore
gcloud firestore import gs://NEW-PROJECT-ID.appspot.com/firestore-backup
```

If you cant access both buckets from one account, download locally first:

```bash
# download from old project
mkdir firestore-backup
gsutil -m cp -r gs://OLD-PROJECT-ID.appspot.com/firestore-backup ./firestore-backup

# upload to new project (login to new account first)
gcloud auth login  # login as new account
gcloud config set project NEW-PROJECT-ID
gsutil -m cp -r ./firestore-backup gs://NEW-PROJECT-ID.appspot.com/firestore-backup

# import
gcloud firestore import gs://NEW-PROJECT-ID.appspot.com/firestore-backup
```

### 4. Copy Storage Files (Article Images)

```bash
# from old account
gsutil -m cp -r gs://OLD-PROJECT-ID.appspot.com/articles gs://NEW-PROJECT-ID.firebasestorage.app/articles
```

Or download + re-upload if cross-account:

```bash
mkdir storage-backup
gsutil -m cp -r gs://OLD-PROJECT-ID.appspot.com/articles ./storage-backup/

# switch to new account
gcloud auth login
gsutil -m cp -r ./storage-backup/articles gs://NEW-PROJECT-ID.firebasestorage.app/articles
```

### 5. Fix Image URLs in Articles

**This is the one gotcha.** Article cover images reference the old storage bucket URL. After migration the URLs will be broken because the bucket name changed.

Run this one-time fix script in the Firebase console (or as a local script):

```javascript
// run this in your browser console while logged into the NEW project's site as admin
// or make a quick node script

// basically: find all articles, replace old bucket name with new one in coverImageUrl
const OLD_BUCKET = "OLD-PROJECT-ID.appspot.com";
const NEW_BUCKET = "NEW-PROJECT-ID.firebasestorage.app";

// for each article in firestore:
//   if coverImageUrl contains OLD_BUCKET, replace with NEW_BUCKET
//   also check article content for markdown image links with the old bucket
```

Or just re-upload the images through the admin panel if there arent many.

### 6. Update the Code

```bash
# edit .env.local with the new projects config values
NEXT_PUBLIC_FIREBASE_API_KEY=new-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=new-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=new-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=new-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=new-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=new-app-id
```

### 7. Deploy to New Project

```bash
# point firebase cli to new project
npx firebase use NEW-PROJECT-ID

# deploy rules
npx firebase deploy --only firestore:rules,storage

# deploy hosting
npx firebase deploy --only hosting
```

### 8. Set Up First Admin on New Project

Since user docs got migrated, existing admins should still work. But if auth UIDs changed (different google workspace), add the first admin email:

1. Go to Firebase Console → Firestore → `adminEmails` collection
2. Add a doc with field `email` = the new admin's email
3. That person signs in and gets auto-promoted

### 9. Custom Domain (if applicable)

If you had a custom domain on the old project:

1. Remove it from the old Firebase project's Hosting settings
2. Add it to the new project's Hosting settings
3. Update DNS records as Firebase instructs
4. SSL cert provisions automatically (takes a few min)

---

## Timeline

The whole migration takes about **30-60 minutes** if you know what youre doing. The longest part is waiting for the Firestore export/import and DNS propagation if you have a custom domain.

## Rollback

If something goes wrong, the old project is untouched. Nothing in this process deletes data from the old project. You can always just point `.env.local` back to the old config values and redeploy.
