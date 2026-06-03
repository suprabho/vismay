// Extend the Express Request type to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id:          string;   // MongoDB _id
        firebaseUid: string;
        email:       string;
        displayName: string;
        role:        'viewer' | 'editor' | 'admin';
        photoURL:    string | null;
      };
    }
  }
}

export {};
