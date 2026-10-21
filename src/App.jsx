import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  Calendar, CheckCircle, XCircle, User, LogOut, 
  MapPin, Clock, ShieldAlert, Activity
} from 'lucide-react';

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD8nGONfOywjTAFozOLdiaK48uN0AUygkk",
  authDomain: "uspv-judo.firebaseapp.com",
  projectId: "uspv-judo",
  storageBucket: "uspv-judo.firebasestorage.app",
  messagingSenderId: "153451349087",
  appId: "1:153451349087:web:7a1d1fbd789d9c020907ea",
  measurementId: "G-JPNR2K3C75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Dates des vacances scolaires (Zone A)
const HOLIDAYS_ZONE_A = [
  { start: '2026-10-17', end: '2026-11-02' }, // Toussaint 2026
  { start: '2026-12-19', end: '2027-01-04' }, // Noël 2026
  { start: '2027-02-06', end: '2027-02-22' }, // Hiver 2027
  { start: '2027-04-03', end: '2027-04-19' }, // Printemps 2027
  { start: '2027-07-03', end: '2027-09-01' }, // Été 2027
  { start: '2027-10-23', end: '2027-11-08' }  // Toussaint 2027
];

// Vérifie si une date tombe pendant les vacances
const isHoliday = (dateObj) => {
  const localDate = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000));
  const dateString = localDate.toISOString().split('T')[0];
  return HOLIDAYS_ZONE_A.some(h => dateString >= h.start && dateString <= h.end);
};

// Moteur de calendrier intelligent
const getUpcomingSchedule = () => {
  const now = new Date();
  let schedule = [];
  let addedDays = 0;
  let daysChecked = 0;

  // Cherche les 2 prochains jours de cours (Mercredi et Vendredi)
  while (addedDays < 2 && daysChecked < 14) { 
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() + daysChecked);
    const dayOfWeek = checkDate.getDay();

    if (dayOfWeek === 3 || dayOfWeek === 5) {
      const isHol = isHoliday(checkDate);
      const dayName = dayOfWeek === 3 ? 'Mercredi' : 'Vendredi';
      let dailyClasses = [];

      if (isHol) {
        // --- HORAIRES VACANCES ---
        // Seulement Ado-Adultes, à 18h00 - 19h30
        dailyClasses.push({ 
          id: `${dayName.substring(0,3).toLowerCase()}-ado`, 
          day: dayName, 
          time: '18:00 - 19:30', 
          level: 'Cours Ado-Adultes', 
          location: 'Dojo Principal', 
          isHoliday: true 
        });
      } else {
        // --- HORAIRES NORMAUX ---
        dailyClasses.push({ 
          id: `${dayName.substring(0,3).toLowerCase()}-enf`, 
          day: dayName, 
          time: dayName === 'Mercredi' ? '16:45 - 18:00' : '17:45 - 19:00', 
          level: 'Cours Enfants', 
          location: 'Dojo Principal', 
          isHoliday: false 
        });
        dailyClasses.push({ 
          id: `${dayName.substring(0,3).toLowerCase()}-ado`, 
          day: dayName, 
          time: dayName === 'Mercredi' ? '18:00 - 19:30' : '19:00 - 20:30', 
          level: 'Cours Ado-Adultes', 
          location: 'Dojo Principal', 
          isHoliday: false 
        });
      }

      let hasValidClassThisDay = false;

      // Vérifie si le cours n'est pas déjà passé aujourd'hui
      dailyClasses.forEach(cls => {
        const [startStr, endStr] = cls.time.split(' - ');
        const [startH, startM] = startStr.split(':').map(Number);
        const [endH, endM] = endStr.split(':').map(Number);

        const classStart = new Date(checkDate);
        classStart.setHours(startH, startM, 0, 0);

        const classEnd = new Date(checkDate);
        classEnd.setHours(endH, endM, 0, 0);

        if (now < classEnd) {
          const localDate = new Date(classStart.getTime() - (classStart.getTimezoneOffset() * 60000));
          const dateString = localDate.toISOString().split('T')[0];
          const sessionId = `${cls.id}_${dateString}`;

          schedule.push({
             ...cls,
             classDate: classStart,
             dateString,
             sessionId
          });
          hasValidClassThisDay = true;
        }
      });

      if (hasValidClassThisDay) addedDays++;
    }
    daysChecked++;
  }

  schedule.sort((a, b) => a.classDate - b.classDate);
  return schedule;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [attendances, setAttendances] = useState([]);
  const [dynamicSchedule, setDynamicSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('planning');

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
    const unsubscribe = onSnapshot(collection(db, "attendances"), (snapshot) => {
      const attendancesData = [];
      snapshot.forEach((doc) => {
        attendancesData.push(doc.data());
      });
      setAttendances(attendancesData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const updateSchedule = () => {
      setDynamicSchedule(getUpcomingSchedule());
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
    
    const docId = `${sessionId}_${user.uid}`;
    const docRef = doc(db, "attendances", docId);

    try {
      if (status === 'none') {
        await deleteDoc(docRef);
      } else {
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
      console.error("Erreur d'enregistrement :", error);
      alert("Une erreur est survenue.");
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
        <Activity className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Chargement du planning...</p>
      </div>
    );
  }

  if (!user || !profile?.name) {
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-white font-black text-xl">USPV</span>
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
                placeholder="Ex: Mehdi, Fabien..."
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2"
            >
              <User className="w-5 h-5" />
              Se connecter
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
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-inner">
            <span className="text-white font-bold text-sm tracking-wider">USPV</span>
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
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-blue-600" />
              <p>Indiquez votre présence sur les créneaux pour informer l'équipe.</p>
            </div>

            {Object.keys(groupedSchedule).map(dateLabel => {
              const dayClasses = groupedSchedule[dateLabel];
              const dayAttendances = attendances.filter(a => dayClasses.some(c => c.sessionId === a.sessionId));
              const presentToday = [...new Set(dayAttendances.filter(a => a.status === 'present').map(a => a.teacherName))];
              const absentToday = [...new Set(dayAttendances.filter(a => a.status === 'absent').map(a => a.teacherName))];

              return (
                <div key={dateLabel} className="flex flex-col gap-3 mb-2">
                  <div className="border-b border-gray-200 pb-3">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 capitalize mb-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      {dateLabel}
                    </h2>
                    
                    <div className="flex flex-wrap gap-2 text-xs">
                      {presentToday.length > 0 && (
                        <div className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md border border-green-200 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span className="font-medium">Présents :</span> {presentToday.join(', ')}
                        </div>
                      )}
                      {absentToday.length > 0 && (
                        <div className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md border border-red-200 flex items-center gap-1.5 shadow-sm">
                          <XCircle className="w-3.5 h-3.5" />
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
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${judoClass.isHoliday ? 'bg-orange-400' : 'bg-blue-500'}`}></div>
                          
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg leading-tight flex items-center gap-2">
                                {judoClass.level}
                                {judoClass.isHoliday && (
                                  <span className="bg-orange-100 text-orange-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full border border-orange-200">
                                    🌴 Vacances
                                  </span>
                                )}
                              </h3>
                              <p className="text-gray-500 text-sm flex items-center gap-1 mt-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span className={judoClass.isHoliday ? 'font-bold text-orange-600' : ''}>
                                  {judoClass.time}
                                </span>
                              </p>
                            </div>
                            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-100 flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3" />
                              Dojo
                            </span>
                          </div>

                          {classAtts.length > 0 && (
                            <div className="my-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                              <div className="flex flex-col gap-1.5">
                                {presentTeachers.length > 0 && (
                                  <div className="flex items-start gap-2 text-sm">
                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-gray-700">
                                      <span className="font-medium">Présents :</span> {presentTeachers.map(a => a.teacherName).join(', ')}
                                    </span>
                                  </div>
                                )}
                                {absentTeachers.length > 0 && (
                                  <div className="flex items-start gap-2 text-sm">
                                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
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
                              <CheckCircle className={`w-4 h-4 ${myStatus === 'present' ? 'text-green-600' : ''}`} />
                              Présent
                            </button>
                            
                            <button
                              onClick={() => toggleAttendance(judoClass.sessionId, myStatus === 'absent' ? 'none' : 'absent')}
                              className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                myStatus === 'absent' 
                                  ? 'bg-red-100 text-red-800 border-2 border-red-500 shadow-sm' 
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                              }`}
                            >
                              <XCircle className={`w-4 h-4 ${myStatus === 'absent' ? 'text-red-600' : ''}`} />
                              Absent
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
                <LogOut className="w-5 h-5" />
                Se déconnecter
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
            <Calendar className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Planning</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <User className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Profil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}