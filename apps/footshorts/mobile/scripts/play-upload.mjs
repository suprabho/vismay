#!/usr/bin/env node
/**
 * Upload an .aab to a Google Play track — keyless.
 *
 * Auth is Application Default Credentials: in CI, google-github-actions/auth
 * exports GOOGLE_APPLICATION_CREDENTIALS pointing at a Workload Identity
 * Federation config, so no service-account JSON key ever exists (the org
 * policy iam.disableServiceAccountKeyCreation stays enforced).
 *
 * Usage: node play-upload.mjs <path/to/app.aab> [track] [releaseName]
 *   track defaults to "internal".
 *
 * Requires: npm install googleapis (done ad hoc by the workflow — this is
 * deliberately not a workspace dependency).
 */
import fs from 'node:fs';
import { google } from 'googleapis';

const PACKAGE_NAME = 'com.promad.footshorts';

const [aabPath, track = 'internal', releaseName] = process.argv.slice(2);
if (!aabPath || !fs.existsSync(aabPath)) {
  console.error(`usage: play-upload.mjs <app.aab> [track] [releaseName] — missing or unreadable: ${aabPath}`);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const play = google.androidpublisher({ version: 'v3', auth });

const { data: edit } = await play.edits.insert({ packageName: PACKAGE_NAME });
console.log(`Opened edit ${edit.id}`);

const { data: bundle } = await play.edits.bundles.upload({
  packageName: PACKAGE_NAME,
  editId: edit.id,
  media: {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(aabPath),
  },
});
console.log(`Uploaded bundle: versionCode ${bundle.versionCode}`);

await play.edits.tracks.update({
  packageName: PACKAGE_NAME,
  editId: edit.id,
  track,
  requestBody: {
    track,
    releases: [
      {
        ...(releaseName ? { name: releaseName } : {}),
        versionCodes: [String(bundle.versionCode)],
        status: 'completed',
      },
    ],
  },
});

const { data: committed } = await play.edits.commit({
  packageName: PACKAGE_NAME,
  editId: edit.id,
});
console.log(`Committed edit ${committed.id} — versionCode ${bundle.versionCode} released to "${track}".`);
