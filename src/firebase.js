import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBR6Z50VtVK-Dd1e2fiy3ryBtwOSjQlogo",
  authDomain: "gpt-chat-saas.firebaseapp.com",
  projectId: "gpt-chat-saas",
  storageBucket: "gpt-chat-saas.firebasestorage.app",
  messagingSenderId: "206429388071",
  appId: "1:206429388071:web:31140f728435b8c85afd02",
  measurementId: "G-H6HBLS06ZB"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();