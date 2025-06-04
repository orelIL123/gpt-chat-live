// client_dashboard_auth_complete/src/utils/firestoreClient.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase'; // Assuming firebase.js is in the parent directory

/**
 * Fetches the client_id for a given user UID from Firestore.
 * @param {string} uid - The user's Firebase Authentication UID.
 * @returns {Promise<string|null>} The client_id if found, otherwise null.
 */
const getClientIdForUser = async (uid) => {
  if (!uid) {
    console.error("getClientIdForUser: UID is null or undefined.");
    return null;
  }

  try {
    // Assuming user documents are stored in a 'users' collection
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      // Assuming client_id is stored in the user document
      return userData.client_id || null;
    } else {
      console.warn(`getClientIdForUser: User document not found for UID: ${uid}`);
      return null;
    }
  } catch (error) {
    console.error(`getClientIdForUser: Error fetching client_id for UID ${uid}:`, error);
    return null;
  }
};

export { getClientIdForUser };