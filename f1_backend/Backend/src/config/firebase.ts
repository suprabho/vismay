import * as admin from 'firebase-admin';
import { env } from './env';

// Prevent re-initialisation during hot-reload in dev
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // \n literals in the env var must become real newlines
      privateKey:  env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export { admin };
