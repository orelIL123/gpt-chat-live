// Dashboard.js
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { auth, db } from '../firebase';

const Dashboard = () => {
  const history = useHistory();
  const [clientData, setClientData] = useState(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const clientId = localStorage.getItem('client_id');

  useEffect(() => {
    if (!clientId) {
      history.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const clientSnap = await db.collection('brains').doc(clientId).get();
        setClientData(clientSnap.data());

        const leadsSnap = await db.collection('leads').where('client_id', '==', clientId).get();
        setLeadsCount(leadsSnap.size);

        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    fetchData();
  }, [clientId, history]);

  const handleLogout = async () => {
    await auth.signOut();
    localStorage.clear();
    history.push('/login');
  };

  if (loading || !clientData) return <div>טוען נתונים...</div>;

  const totalConversations = clientData?.history?.length || 0;
  const conversionRate = totalConversations ? ((leadsCount / totalConversations) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">לוח בקרה</h1>
          <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded">התנתק</button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <StatCard title="סה"כ שיחות" value={totalConversations} />
          <StatCard title="סה"כ לידים" value={leadsCount} />
          <StatCard title="% המרה" value={`${conversionRate}%`} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">הגדרות הבוט</h2>
          <p><strong>System Prompt:</strong> {clientData.system_prompt}</p>
          <p><strong>הודעת פתיחה:</strong> {clientData.welcome_message}</p>
          <p><strong>שאלות פתיחה:</strong></p>
          <ul className="list-disc pl-5">
            {clientData.onboarding_questions?.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value }) => (
  <div className="bg-white p-6 rounded-lg shadow text-center">
    <p className="text-sm text-gray-500">{title}</p>
    <p className="text-2xl font-bold text-gray-800">{value}</p>
  </div>
);

export default Dashboard;
