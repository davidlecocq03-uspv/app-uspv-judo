import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8nGONfOywjTAFozOLdiaK48uN0AUygkk",
  authDomain: "uspv-judo.firebaseapp.com",
  projectId: "uspv-judo",
  storageBucket: "uspv-judo.firebasestorage.app",
  messagingSenderId: "153451349087",
  appId: "1:153451349087:web:7a1d1fbd789d9c020907ea",
  measurementId: "G-JPNR2K3C75"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const WEEKLY_SCHEDULE = [
  { id: 'mer-enf', day: 'Mercredi', time: '16:45 - 18:00', level: 'Cours Enfants', location: 'Dojo Principal' },
  { id: 'mer-ado', day: 'Mercredi', time: '18:00 - 19:30', level: 'Cours Ado-Adultes', location: 'Dojo Principal' },
  { id: 'ven-enf', day: 'Vendredi', time: '17:45 - 19:00', level: 'Cours Enfants', location: 'Dojo Principal' },
  { id: 'ven-ado', day: 'Vendredi', time: '19:00 - 20:30', level: 'Cours Ado-Adultes', location: 'Dojo Principal' },
];

const getNextClassDate = (dayName, timeRange) => {
  const daysMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
  const targetDay = daysMap[dayName];
  const [startStr, endStr] = timeRange.split(' - ');
  const [endHours, endMinutes] = endStr.split(':').map(Number);

  const now = new Date();
  const today = now.getDay();
  
  let daysUntil = targetDay - today;
  
  if (daysUntil < 0) {
    daysUntil += 7;
  } else if (daysUntil === 0) {
    const endDateTime = new Date(now);
    endDateTime.setHours(endHours, endMinutes, 0, 0);
    if (now > endDateTime) {
      daysUntil += 7;
    }
  }

  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntil);
  const [startHours, startMinutes] = startStr.split(':').map(Number);
  nextDate.setHours(startHours, startMinutes, 0, 0);
  return nextDate;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [attendances, setAttendances] = useState([]);
  const [dynamicSchedule, setDynamicSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('planning');

  // Chargement du profil local
  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem('uspv_profile');
      if (storedProfile) {
        const parsedProfile = JSON.parse(storedProfile);
        setProfile(parsedProfile);
        setUser({ uid: parsedProfile.uid });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Écoute de la base de données en temps réel
    const unsubscribe = onSnapshot(collection(db, "attendances"), (snapshot) => {
      const attendancesData = [];
      snapshot.forEach((doc) => {
        attendancesData.push(doc.data());
      });
      setAttendances(attendancesData);
    });

    // Nettoyage lors de la fermeture
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const updateSchedule = () => {
      const scheduleWithDates = WEEKLY_SCHEDULE.map(cls => {
        const classDate = getNextClassDate(cls.day, cls.time);
        const localDate = new Date(classDate.getTime() - (classDate.getTimezoneOffset() * 60000));
        const dateString = localDate.toISOString().split('T')[0];
        const sessionId = `${cls.id}_${dateString}`;
        return { ...cls, classDate, dateString, sessionId };
      });
      scheduleWithDates.sort((a, b) => a.classDate - b.classDate);
      setDynamicSchedule(scheduleWithDates);
    };

    updateSchedule();
    const intervalId = setInterval(updateSchedule, 60000);
    return () => clearInterval(intervalId);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    if (name) {
      const newUid = 'usr_' + name.toLowerCase().replace(/\s/g, '');
      const newProfile = { name, uid: newUid };
      setUser({ uid: newUid });
      setProfile(newProfile);
      localStorage.setItem('uspv_profile', JSON.stringify(newProfile));
    }
  };

  const toggleAttendance = async (sessionId, status) => {
    if (!user || !profile || !profile.name) return;
    
    // Identifiant unique pour ce prof sur ce cours
    const docId = `${sessionId}_${user.uid}`;
    const docRef = doc(db, "attendances", docId);

    try {
      if (status === 'none') {
        // Suppression de la présence
        await deleteDoc(docRef);
      } else {
        // Ajout ou modification de la présence
        await setDoc(docRef, {
          id: docId,
          sessionId,
          teacherId: user.uid,
          teacherName: profile.name,
          status,
          updatedAt: Date.now()
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement :", error);
      alert("Une erreur est survenue lors de l'enregistrement de votre présence.");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setProfile(null);
    setActiveTab('planning');
    localStorage.removeItem('uspv_profile');
  };

  const groupedSchedule = dynamicSchedule.reduce((acc, curr) => {
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const rawDateLabel = curr.classDate.toLocaleDateString('fr-FR', dateOptions);
    const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);
    if (!acc[dateLabel]) acc[dateLabel] = [];
    acc[dateLabel].push(curr);
    return acc;
  }, {});

  const getSessionAttendances = (sessionId) => attendances.filter(a => a.sessionId === sessionId);
  const getMyAttendanceStatus = (sessionId) => {
    if (!user) return 'none';
    const myAtt = attendances.find(a => a.sessionId === sessionId && a.teacherId === user.uid);
    return myAtt ? myAtt.status : 'none';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <div className="text-4xl animate-bounce mb-4">🥋</div>
        <p className="text-gray-500 font-medium">Chargement du planning...</p>
      </div>
    );
  }

  if (!user || !profile?.name) {
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md text-white font-black text-xl">
            USPV
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">Bienvenue !</h1>
          <p className="text-center text-gray-500 mb-6 text-sm">Entrez votre prénom pour accéder au planning.</p>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Votre Prénom</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Ex: Frédéric, Florent..."
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2"
            >
              <span>👤</span> Se connecter
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white px-4 py-3 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-inner text-white font-bold text-sm tracking-wider">
            USPV
          </div>
          <div>
            <h1 className="font-extrabold text-gray-900 leading-tight">Judo</h1>
            <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              En direct
            </p>
          </div>
        </div>
        <div className="w-8 h-8 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
          {profile.name.charAt(0).toUpperCase()}
        </div>
      </header>

      <main className="max-w-md mx-auto">
        {activeTab === 'planning' && (
          <div className="p-4 flex flex-col gap-6">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 flex gap-3 shadow-sm">
              <span className="text-xl">ℹ️</span>
              <p>Indiquez votre présence. Vos collègues verront votre réponse instantanément.</p>
            </div>

            {Object.keys(groupedSchedule).map(dateLabel => {
              const dayClasses = groupedSchedule[dateLabel];
              const dayAttendances = attendances.filter(a => dayClasses.some(c => c.sessionId === a.sessionId));
              const presentToday = [...new Set(dayAttendances.filter(a => a.status === 'present').map(a => a.teacherName))];
              const absentToday = [...new Set(dayAttendances.filter(a => a.status === 'absent').map(a => a.teacherName))];

              return (
                <div key={dateLabel} className="flex flex-col gap-3 mb-2">
                  <div className="border-b pb-3">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 capitalize mb-2">
                      <span>📅</span> {dateLabel}
                    </h2>
                    
                    <div className="flex flex-wrap gap-2 text-xs">
                      {presentToday.length > 0 && (
                        <div className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md border border-green-200 flex items-center gap-1.5 shadow-sm">
                          <span>✅</span>
                          <span className="font-medium">Présents :</span> {presentToday.join(', ')}
                        </div>
                      )}
                      {absentToday.length > 0 && (
                        <div className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md border border-red-200 flex items-center gap-1.5 shadow-sm">
                          <span>❌</span>
                          <span className="font-medium">Absents :</span> {absentToday.join(', ')}
                        </div>
                      )}
                      {presentToday.length === 0 && absentToday.length === 0 && (
                        <span className="text-gray-400 italic text-xs">En attente de pointage...</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {dayClasses.map(judoClass => {
                      const classAtts = getSessionAttendances(judoClass.sessionId);
                      const presentTeachers = classAtts.filter(a => a.status === 'present');
                      const absentTeachers = classAtts.filter(a => a.status === 'absent');
                      const myStatus = getMyAttendanceStatus(judoClass.sessionId);

                      return (
                        <div key={judoClass.sessionId} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                          
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg leading-tight">{judoClass.level}</h3>
                              <p className="text-gray-500 text-sm flex items-center gap-1 mt-1">
                                <span>⏰</span> {judoClass.time}
                              </p>
                            </div>
                            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-100 flex items-center gap-1">
                              <span>📍</span> Dojo
                            </span>
                          </div>

                          {classAtts.length > 0 && (
                            <div className="my-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Présences en direct</p>
                              <div className="flex flex-col gap-1.5">
                                {presentTeachers.length > 0 && (
                                  <div className="flex items-start gap-2 text-sm">
                                    <span>✅</span>
                                    <span className="text-gray-700">
                                      <span className="font-medium">Présents :</span> {presentTeachers.map(a => a.teacherName).join(', ')}
                                    </span>
                                  </div>
                                )}
                                {absentTeachers.length > 0 && (
                                  <div className="flex items-start gap-2 text-sm">
                                    <span>❌</span>
                                    <span className="text-gray-500">
                                      <span className="font-medium">Absents :</span> {absentTeachers.map(a => a.teacherName).join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 mt-2 pt-3 border-t border-gray-50">
                            <button
                              onClick={() => toggleAttendance(judoClass.sessionId, myStatus === 'present' ? 'none' : 'present')}
                              className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                myStatus === 'present' 
                                  ? 'bg-green-100 text-green-800 border-2 border-green-500 shadow-sm' 
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                              }`}
                            >
                              <span>✅</span> Je serai là
                            </button>
                            
                            <button
                              onClick={() => toggleAttendance(judoClass.sessionId, myStatus === 'absent' ? 'none' : 'absent')}
                              className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                myStatus === 'absent' 
                                  ? 'bg-red-100 text-red-800 border-2 border-red-500 shadow-sm' 
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                              }`}
                            >
                              <span>❌</span> Absent
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="p-4 flex flex-col gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-3xl font-bold mb-4 shadow-inner">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
              <p className="text-gray-500 text-sm mb-6">Professeur de Judo</p>
              
              <button 
                onClick={handleLogout}
                className="w-full flex justify-center items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-3 px-4 rounded-xl transition-colors border border-red-100"
              >
                <span>🚪</span> Se déconnecter
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-10">
        <div className="max-w-md mx-auto flex justify-around">
          <button 
            onClick={() => setActiveTab('planning')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'planning' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-xl">📅</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Planning</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-xl">👤</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Profil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}