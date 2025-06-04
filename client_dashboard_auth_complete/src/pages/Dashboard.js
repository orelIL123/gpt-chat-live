// client_dashboard_auth_complete/src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase'; // Assuming firebase.js is in the parent directory
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom'; // Assuming react-router-dom is used for navigation

const Dashboard = () => {
  const [user, loading, error] = useAuthState(auth);
  const [clientId, setClientId] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const navigate = useNavigate();

  // Effect to check authentication status and redirect if not logged in
  useEffect(() => {
    if (loading) {
      // Maybe show a loading spinner
      return;
    }
    if (!user) {
      // Redirect to login page if user is not authenticated
      navigate('/login'); // TODO: Update with your actual login route
    }
  }, [user, loading, navigate]);

  // Effect to fetch client_id and then client data
  useEffect(() => {
    const fetchClientInfo = async () => {
      if (user) {
        try {
          // Fetch client_id from the user's document in Firestore
          // Assuming user documents are stored in a 'users' collection
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const userClientId = userData.client_id; // Assuming client_id is stored in the user document
            setClientId(userClientId);

            if (userClientId) {
              // Now fetch data based on client_id
              // Assuming data is in a 'data' collection with a 'clientId' field
              const dataCollectionRef = collection(db, 'data');
              const q = query(dataCollectionRef, where('clientId', '==', userClientId));
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setClientData(data);
                setFetchError(null); // Clear any previous fetch errors
              } else {
                // No data found for this client
                setClientData([]); // Set to empty array to indicate no data
                setFetchError("System information not found for this client.");
                console.warn(`No data found for client_id: ${userClientId}`);
              }
            } else {
              // client_id not found in user document
              setClientId(null);
              setClientData([]);
              setFetchError("Client ID not found for this user.");
              console.warn(`Client ID not found for user: ${user.uid}`);
            }
          } else {
            // User document not found
            setClientId(null);
            setClientData([]);
            setFetchError("User profile not found.");
            console.warn(`User document not found for user: ${user.uid}`);
          }
        } catch (err) {
          console.error("Error fetching client info or data:", err);
          setFetchError("Error fetching system information.");
          setClientData([]);
        } finally {
          setDataLoading(false);
        }
      }
    };

    fetchClientInfo();
  }, [user]); // Rerun when user changes

  if (loading || dataLoading) {
    return <div>Loading dashboard...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (fetchError) {
    return <div>Error: {fetchError}</div>;
  }

  if (!user) {
    // This case should be handled by the redirect in the useEffect, but as a fallback
    return <div>Please log in to view the dashboard.</div>;
  }

  return (
    <div>
      <h2>Dashboard</h2>
      {clientId && <p>Client ID: {clientId}</p>}

      {clientData && clientData.length > 0 ? (
        <div>
          <h3>System Information:</h3>
          {/* TODO: Render your clientData here */}
          <pre>{JSON.stringify(clientData, null, 2)}</pre>
        </div>
      ) : (
        <div>
          <p>No system information available for this client.</p>
          {/* This message will appear if clientData is null or empty */}
        </div>
      )}
    </div>
  );
};

export default Dashboard;