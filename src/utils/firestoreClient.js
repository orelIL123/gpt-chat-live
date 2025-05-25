import { db } from '../firebase';

export const getClientIdFromUser = async (uid) => {
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data().client_id : null;
  } catch (error) {
    console.error('Error fetching client_id:', error);
    return null;
  }
};