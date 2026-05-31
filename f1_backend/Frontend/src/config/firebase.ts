import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            'AIzaSyAVPUMkN_9QN6WSFqJ2Qn1cZdj8X8xn6uM',
  authDomain:        'apexgp-5ff22.firebaseapp.com',
  projectId:         'apexgp-5ff22',
  storageBucket:     'apexgp-5ff22.firebasestorage.app',
  messagingSenderId: '490510692890',
  appId:             '1:490510692890:web:4b33f513d8e482b27c97a3',
  measurementId:     'G-LGD2KV2VEF',
};

export const app            = initializeApp(firebaseConfig);
export const auth           = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
