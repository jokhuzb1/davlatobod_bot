import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Home, LogOut, Users, BarChart2, Inbox, Activity, Shield, Loader2, CheckCircle2, XCircle, Clock, Map, Building, Plus, Users as UsersIcon, DoorOpen, Layers, Edit2, ArrowLeft, Send } from 'lucide-react';
import './index.css';

const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use((response) => response, (error) => {
  if (error.response && error.response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    window.location.reload();
  }
  return Promise.reject(error);
});

function App() {
  const [view, setView] = useState(() => localStorage.getItem('viewMode') || 'public');

  const switchView = (v) => {
    localStorage.setItem('viewMode', v);
    setView(v);
  };

  if (view === 'public') {
    return <PublicPortal onAdminSwitch={() => switchView('admin')} />;
  }

  return <AdminApp onPublicSwitch={() => switchView('public')} />;
}

// -----------------------------------------------------------------------------
// Public Portal (Citizen Form)
// -----------------------------------------------------------------------------
function PublicPortal({ onAdminSwitch }) {
  const [mahallas, setMahallas] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mId, setMId] = useState(null);

  const [images, setImages] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone: '', category: '', mahalla_id: '', building_id: '', mikrorayon: '', address: '', apartment_number: ''
  });

  useEffect(() => {
    api.get('/public/mahallas').then(r => setMahallas(r.data)).catch(console.error);
  }, []);

  const handleMahallaChange = async (e) => {
    const id = e.target.value;
    setForm({...form, mahalla_id: id, building_id: ''});
    if (id) {
      api.get(`/public/buildings?mahalla_id=${id}`).then(r => setBuildings(r.data)).catch(console.error);
    } else {
      setBuildings([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const mName = mahallas.find(m => m.id === parseInt(form.mahalla_id))?.name || '';
      const bName = buildings.find(b => b.id === parseInt(form.building_id))?.name_or_number || '';
      
      let addr = '';
      if (bName) addr += `Bino: ${bName}, `;
      if (form.apartment_number) addr += `Xonadon: ${form.apartment_number}, `;
      addr += `Qo'shimcha izoh: ${form.address}`;

      const formData = new FormData();
      Object.keys(form).forEach(key => formData.append(key, form[key]));
      formData.append('mikrorayon', mName);
      formData.set('address', addr);
      formData.append('source', 'web');

      for (let i = 0; i < images.length; i++) {
        formData.append('images', images[i]);
      }

      const res = await api.post('/murojaats/public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMId(res.data.id);
      setSubmitted(true);
    } catch(err) {
      alert("Xatolik: Barcha majburiy maydonlarni to'ldiring. (Rasm hajmi juda katta bo'lishi mumkin)");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="login-container" style={{background: 'var(--bg-light)'}}>
        <div className="login-card fade-in" style={{textAlign: 'center', padding: '3rem 2rem', maxWidth: '500px'}}>
          <CheckCircle2 color="#10b981" size={64} style={{marginBottom:'1rem'}}/>
          <h2 style={{color:'var(--text-dark)', marginBottom:'0.5rem'}}>Murojaatingiz Yuborildi!</h2>
          <p style={{color:'var(--text-gray)', fontSize:'1.1rem'}}>Sizning murojaatingiz <b>#{mId}</b> raqami ostida ro'yxatga olindi. Mas'ul xodimlar munosabat bildirishadi.</p>
          <button className="btn-secondary" style={{marginTop:'2rem', width:'100%'}} onClick={() => { setForm({full_name:'', phone:'', category:'', mahalla_id:'', building_id:'', mikrorayon:'', address:''}); setSubmitted(false); }}>
            Yangi murojaat qoldirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container fade-in" style={{background: 'var(--bg-light)', alignItems: 'flex-start', paddingTop: '4rem'}}>
      <div style={{position: 'absolute', top: '1rem', right: '1.5rem'}}>
        <button onClick={onAdminSwitch} className="logout-btn" style={{background: 'white', border: '1px solid var(--border)', color: 'var(--text-gray)'}}>
          <Shield size={16}/> Xodimlar uchun
        </button>
      </div>

      <div className="login-card" style={{maxWidth: '600px', width: '100%', marginBottom: '4rem'}}>
        <div style={{textAlign: 'center', marginBottom: '2rem'}}>
          <Shield color="var(--primary)" size={48} style={{marginBottom:'1rem'}}/>
          <h1 style={{margin:0, color:'var(--bg-dark)', fontSize: '2rem'}}>Murojaat Onlayn Kiritish</h1>
          <p style={{color:'var(--text-gray)', marginTop:'0.5rem'}}>Tartib bo'yicha ma'lumotlarni kiriting</p>
        </div>

        <form onSubmit={handleSubmit} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 1rem'}}>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
             <label>F.I.Sh (Ismingiz va Familiyangiz) *</label>
             <input type="text" value={form.full_name} onChange={e=>setForm({...form, full_name: e.target.value})} required placeholder="masalan. Eshmatov Toshmat" />
          </div>
          <div className="input-group">
             <label>Telefon raqam *</label>
             <input type="text" value={form.phone} onChange={e=>setForm({...form, phone: e.target.value})} required placeholder="+998 90 123 45 67" />
          </div>
          <div className="input-group">
             <label>Muammo yo'nalishi *</label>
             <select className="status-select" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} required>
                <option value="" disabled>-- Tanlang --</option>
                <option value="gaz">🔥 Gaz aralashmasi/muammosi</option>
                <option value="suv">💧 Suv va oqova muammosi</option>
                <option value="elektr">⚡ Elektr toki uzilishi</option>
                <option value="obodonlashtirish">🏗 Obodonlashtirish</option>
                <option value="boshqa">📌 Boshqa tushunmovchiliklar</option>
             </select>
          </div>

          <div className="input-group" style={{gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem'}}>
             <label>Hududingiz (Mahalla)</label>
             <select className="status-select" value={form.mahalla_id} onChange={handleMahallaChange} required>
               <option value="" disabled>-- Mahallangizni tanlang --</option>
               {mahallas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
             </select>
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
             <label>Binongiz (Uy/Xonadon)</label>
             <select className="status-select" value={form.building_id} onChange={e=>setForm({...form, building_id: e.target.value})}>
               <option value="">-- Tanlang yoki Bo'sh qoldiring --</option>
               {buildings.map(b => <option key={b.id} value={b.id}>{b.name_or_number} - {b.type === 'apartment' ? "Dom" : (b.type === 'house' ? "Hovli" : "Boshqa")}</option>)}
             </select>
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
             <label>Xonadon raqami (Ixtiyoriy)</label>
             <input type="text" value={form.apartment_number} onChange={e=>setForm({...form, apartment_number: e.target.value})} placeholder="Kvartira yoki podyezd raqami..." />
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
             <label>Qo'shimcha Manzil ma'lumoti / Izoh</label>
             <textarea 
               className="comment-textarea" 
               placeholder="shikoyatingiz mazmuni ochiqroq yozing..."
               style={{height: '100px'}}
               value={form.address}
               onChange={e=>setForm({...form, address: e.target.value})}
               required
             />
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
             <label>Rasmlar yuborish (ko'pi bilan 2 ta, ixtiyoriy)</label>
             <input type="file" multiple accept="image/*" onChange={e => {
                const files = Array.from(e.target.files);
                if (files.length > 2) {
                   alert("Faqatgina 2 ta rasm yuklash mumkin.");
                   e.target.value = '';
                   setImages([]);
                } else {
                   setImages(files);
                }
             }} />
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{gridColumn: '1 / -1', marginTop: '1rem', display:'flex', justifyContent:'center', gap:'8px'}}>
             {loading ? <Loader2 className="spinner" /> : <><Send size={18}/> Yuborish</>}
          </button>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Admin Sub-App (Dashboard + Login)
// -----------------------------------------------------------------------------
function AdminApp({ onPublicSwitch }) {
  const [auth, setAuth] = useState(() => {
    return { token: localStorage.getItem('token'), role: localStorage.getItem('role'), username: localStorage.getItem('username'), id: parseInt(localStorage.getItem('adminId'), 10) || null }
  });
  const [toast, setToast] = useState(null);

  const showToast = (message) => { setToast(message); setTimeout(() => setToast(null), 3500); }
  const login = (token, role, username, id) => {
    localStorage.setItem('token', token); localStorage.setItem('role', role); localStorage.setItem('username', username); localStorage.setItem('adminId', id);
    setAuth({ token, role, username, id });
  };
  const logout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username'); localStorage.removeItem('adminId');
    setAuth({ token: null, role: null, username: null, id: null });
  };

  if (!auth.token) return <AuthLogin onLogin={login} onPublicSwitch={onPublicSwitch} />;

  return (
    <>
      <Dashboard auth={auth} onLogout={logout} showToast={showToast} onPublicSwitch={onPublicSwitch} />
      {toast && (
        <div className="toast-container fade-in">
          <CheckCircle2 color="#10b981" size={20} /><span>{toast}</span>
        </div>
      )}
    </>
  );
}

function AuthLogin({ onLogin, onPublicSwitch }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const { data } = await api.post('/login', { username, password });
      onLogin(data.token, data.role, data.username, data.id);
    } catch (err) { setError(err.response?.data?.error || 'Xatolik'); } 
    finally { setLoading(false); }
  };

  return (
    <div className="login-container fade-in">
      <div style={{position: 'absolute', top: '1rem', left: '1.5rem'}}>
        <button onClick={onPublicSwitch} className="logout-btn" style={{background: 'white', border: '1px solid var(--border)', color: 'var(--text-gray)'}}>
          &larr; Fuqarolar uchun
        </button>
      </div>
      <div className="login-card">
        <h2>Xodimlar Tizimi</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="input-group"><label>Login</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <div className="input-group"><label>Parol</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? <Loader2 className="spinner" /> : 'Kirish'}</button>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dashboard Component
// -----------------------------------------------------------------------------
function Dashboard({ auth, onLogout, showToast, onPublicSwitch }) {
  const [activeTab, setActiveTab] = useState('murojaatlar');

  return (
    <div className="dashboard-container fade-in">
      <div className="sidebar">
        <div className="sidebar-header" style={{cursor: 'pointer'}} onClick={onPublicSwitch}>
          <Shield color="#3b82f6" size={28} /><span>Boshqaruv</span>
        </div>
        <div className="sidebar-menu">
          <div className={`sidebar-item ${activeTab === 'murojaatlar' ? 'active' : ''}`} onClick={() => setActiveTab('murojaatlar')}><Inbox size={20} /> Murojaatlar</div>
          <div className={`sidebar-item ${activeTab === 'profilim' ? 'active' : ''}`} onClick={() => setActiveTab('profilim')}><Activity size={20} /> Profilim</div>
          <div className={`sidebar-item ${activeTab === 'hududlar' ? 'active' : ''}`} onClick={() => setActiveTab('hududlar')}><Map size={20} /> Hudud/Binolar</div>
          <div className={`sidebar-item ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><BarChart2 size={20} /> Statistika</div>
          {auth.role === 'SuperAdmin' && (
            <div className={`sidebar-item ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}><Users size={20} /> Xodimlar</div>
          )}
        </div>
      </div>
      <div className="main-content">
        <div className="header-row">
          <div>
            <h1>{auth.role === 'SuperAdmin' ? 'Boshqaruv Paneli' : `Xodim Paneli`}</h1>
            <span style={{color: 'var(--text-light)', fontWeight: 500}}>Mutaxassis: {auth.username} ({auth.role})</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>Chiqish <LogOut size={16} /></button>
        </div>
        <div className="fade-in" key={activeTab}>
          {activeTab === 'murojaatlar' && <MurojaatlarTab auth={auth} showToast={showToast} />}
          {activeTab === 'profilim' && <ProfilimTab auth={auth} showToast={showToast} />}
          {activeTab === 'hududlar' && <HududlarTab auth={auth} showToast={showToast} />}
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'admins' && auth.role === 'SuperAdmin' && <AdminsTab showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MurojaatlarTab
// -----------------------------------------------------------------------------
function MurojaatlarTab({ auth, showToast }) {
  const [murojaats, setMurojaats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMurojaat, setSelectedMurojaat] = useState(null);
  const [filterCat, setFilterCat] = useState('barchasi');
  const [filterMahalla, setFilterMahalla] = useState('');
  const [mahallas, setMahallas] = useState([]);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  
  const [filterDateRange, setFilterDateRange] = useState('barchasi');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    api.get('/mahallas').then(r => setMahallas(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    const today = new Date();
    if (filterDateRange === 'barchasi') {
      setStartDate(''); setEndDate('');
    } else if (filterDateRange === 'bugun') {
      const d = today.toISOString().split('T')[0];
      setStartDate(d); setEndDate(d);
    } else if (filterDateRange === 'hafta') {
      const s = new Date(today); s.setDate(s.getDate() - 7);
      setStartDate(s.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]);
    } else if (filterDateRange === 'oy') {
      const s = new Date(today); s.setMonth(s.getMonth() - 1);
      setStartDate(s.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]);
    }
  }, [filterDateRange]);

  const fetchMurojaats = async () => {
    setLoading(true);
    try {
       const params = { category: filterCat };
       if (filterMahalla) params.mahalla_name = filterMahalla;
       if (startDate) params.startDate = startDate;
       if (endDate) params.endDate = endDate;
       const { data } = await api.get('/murojaats', { params });
       setMurojaats(data);
    } catch (err) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchMurojaats(); }, [filterCat, filterMahalla, filterDateRange, startDate, endDate]);

  const handleUpdate = async (id, formData) => {
    try {
      await api.patch(`/murojaats/${id}/status`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast("Holat saqlandi!"); setSelectedMurojaat(null); fetchMurojaats();
    } catch (err) { alert(err.response?.data?.error || "Xatolik."); }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'idle': return <span className="badge badge-idle"><Clock size={12}/> Kutilmoqda</span>;
      case 'in_progress': return <span className="badge badge-inprogress"><Activity size={12}/> Jarayonda</span>;
      case 'completed': return <span className="badge badge-completed"><CheckCircle2 size={12}/> Bajarildi</span>;
      case 'rejected': return <span className="badge badge-rejected"><XCircle size={12}/> Rad etildi</span>;
      default: return null;
    }
  };

  const getSourceBadge = (source) => {
    if(source === 'telegram') return <span style={{fontSize:'0.8rem', background:'#e0f2fe', color:'#0284c7', padding:'2px 6px', borderRadius:'4px'}}>🤖 Bot</span>;
    if(source === 'web') return <span style={{fontSize:'0.8rem', background:'#f3e8ff', color:'#7e22ce', padding:'2px 6px', borderRadius:'4px'}}>🌐 Veb</span>;
    if(source === 'call') return <span style={{fontSize:'0.8rem', background:'#ffedd5', color:'#c2410c', padding:'2px 6px', borderRadius:'4px'}}>☎️ Call</span>;
    return null;
  };

  return (
    <>
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button onClick={() => setManualAddOpen(true)} className="btn-primary" style={{width:'auto', padding:'0.85rem 1.5rem', display:'flex', gap:'8px'}}>
           <Plus size={18}/> Qo'lda qo'shish
        </button>

        <strong style={{marginLeft:'auto', color:'var(--text-gray)'}}>Filtr:</strong>
        
        <select className="input-group status-select" style={{ width: '130px', marginBottom: 0 }} value={filterDateRange} onChange={e => setFilterDateRange(e.target.value)}>
          <option value="barchasi">Barcha vaqt</option>
          <option value="bugun">Bugun</option>
          <option value="hafta">Shu hafta</option>
          <option value="oy">Shu oy</option>
          <option value="custom">Boshqa sana...</option>
        </select>
        
        {filterDateRange === 'custom' && (
          <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
            <input type="date" className="status-select" style={{marginBottom:0, padding:'0.5rem', width:'130px'}} value={startDate} onChange={e=>setStartDate(e.target.value)} />
            <input type="date" className="status-select" style={{marginBottom:0, padding:'0.5rem', width:'130px'}} value={endDate} onChange={e=>setEndDate(e.target.value)} />
          </div>
        )}

        <select className="input-group status-select" style={{ width: '160px', marginBottom: 0 }} value={filterMahalla} onChange={e => setFilterMahalla(e.target.value)}>
          <option value="">Barcha hududlar</option>
          {mahallas.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <select className="input-group status-select" style={{ width: '180px', marginBottom: 0 }} value={filterCat} onChange={e => setFilterCat(e.target.value)} disabled={auth.role !== 'SuperAdmin'}>
          {auth.role === 'SuperAdmin' && <option value="barchasi">Barcha yo'nalishlar</option>}
          <option value="gaz">🔥 Gaz</option><option value="suv">💧 Suv</option><option value="elektr">⚡ Elektr</option>
          <option value="obodonlashtirish">🏗 Obodonlashtirish</option><option value="boshqa">📌 Boshqa</option>
        </select>
        <button className="btn-secondary" style={{width: 'auto', padding: '0.85rem 1rem'}} onClick={fetchMurojaats}>Yangilash</button>
      </div>

      <div className="data-table-card">
        {loading ? (
          <div style={{padding: '4rem', textAlign: 'center'}}><Loader2 className="spinner spinner-dark" size={32} /></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>ID</th><th>Fuqaro</th><th>Telefon</th><th>Yo'nalish</th><th>Manzil</th><th>Sana</th><th>Mas'ul</th><th>Holati</th><th>Harakat</th></tr></thead>
            <tbody>
              {murojaats.map(m => (
                <tr key={m.id} style={{background: m.source === 'call' ? '#fffbeb' : 'inherit'}}>
                  <td style={{fontWeight: 600}}>#{m.id}</td><td>{m.full_name}</td><td>{m.phone}</td>
                  <td><span style={{textTransform:'capitalize', fontWeight: 500}}>{m.category}</span></td>
                  <td>{m.mikrorayon && <strong>{m.mikrorayon}<br/></strong>}<span style={{color: 'var(--text-gray)', fontSize: '0.9rem'}}>{m.address}</span></td>
                  <td style={{color: 'var(--text-gray)', fontSize: '0.9rem'}}>{new Date(m.created_at).toLocaleString('uz-UZ', {hour12: false})}</td>
                  <td style={{fontWeight:500, color: m.assigned_admin ? 'var(--primary)' : 'var(--text-light)'}}>{m.assigned_admin || 'Biriktirilmagan'}</td>
                  <td>{getStatusBadge(m.status)}</td>
                  <td><button className="action-btn" onClick={() => setSelectedMurojaat(m)}>Ko'rish</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedMurojaat && <UpdateModal murojaat={selectedMurojaat} onClose={() => setSelectedMurojaat(null)} onSave={handleUpdate} auth={auth} />}
      {manualAddOpen && <ManualMurojaatModal onClose={() => setManualAddOpen(false)} onSave={() => { setManualAddOpen(false); showToast("Kiritildi!"); fetchMurojaats(); }} />}
    </>
  );
}

function ManualMurojaatModal({ onClose, onSave }) {
  const [mahallas, setMahallas] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [form, setForm] = useState({full_name:'', phone:'', category:'', mahalla_id:'', building_id:'', apartment_number:'', address:''});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/public/mahallas').then(r => setMahallas(r.data)).catch(console.error);
  }, []);

  const handleMahallaChange = async (e) => {
    const id = e.target.value;
    setForm({...form, mahalla_id: id, building_id: ''});
    if (id) {
      api.get(`/public/buildings?mahalla_id=${id}`).then(r => setBuildings(r.data)).catch(console.error);
    } else {
      setBuildings([]);
    }
  };

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try { 
      const mName = mahallas.find(m => m.id === parseInt(form.mahalla_id))?.name || '';
      const bName = buildings.find(b => b.id === parseInt(form.building_id))?.name_or_number || '';
      let addr = '';
      if (bName) addr += `Bino: ${bName}, `;
      if (form.apartment_number) addr += `Xonadon: ${form.apartment_number}, `;
      addr += `Qo'shimcha izoh: ${form.address}`;

      await api.post('/murojaats/public', { ...form, mikrorayon: mName, address: addr, source:'call' }); 
      onSave(); 
    } 
    catch(err) { alert("Xatolik"); } finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal fade-in" style={{maxWidth: '600px'}}>
         <div className="modal-header"><h3>Qo'ng'iroq (Qo'lda kiritish)</h3><button className="close-btn" onClick={onClose}><XCircle size={20}/></button></div>
         <form onSubmit={submit} className="modal-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem 1rem'}}>
           <div className="input-group"><label>Ismi</label><input type="text" value={form.full_name} onChange={e=>setForm({...form, full_name:e.target.value})} required/></div>
           <div className="input-group"><label>Telefon</label><input type="text" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} required/></div>
           <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Yo'nalish</label>
              <select className="status-select" value={form.category} onChange={e=>setForm({...form, category:e.target.value})} required>
                <option value="">Tanlang</option><option value="gaz">🔥 Gaz</option><option value="suv">💧 Suv</option><option value="elektr">⚡ Elektr</option><option value="obodonlashtirish">🗑 Obodonlashtirish</option><option value="boshqa">📌 Boshqa</option>
              </select>
           </div>
           
           <div className="input-group">
              <label>Mahalla *</label>
              <select className="status-select" value={form.mahalla_id} onChange={handleMahallaChange} required>
                <option value="">-- Tanlang --</option>
                {mahallas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
           </div>
           
           <div className="input-group">
              <label>Bino / Uy</label>
              <select className="status-select" value={form.building_id} onChange={e=>setForm({...form, building_id:e.target.value})}>
                <option value="">-- Tanlang --</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name_or_number} ({b.type==='apartment'?"Dom":(b.type==='house'?"Hovli":"Boshqa")})</option>)}
              </select>
           </div>

           <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Xonadon raqami (Ixtiyoriy)</label><input type="text" value={form.apartment_number} onChange={e=>setForm({...form, apartment_number:e.target.value})} /></div>
           <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Izoh / Shikoyat matni</label><textarea className="comment-textarea" value={form.address} onChange={e=>setForm({...form, address:e.target.value})} required></textarea></div>
           
           <button type="submit" className="btn-primary" style={{gridColumn:'1 / -1', marginTop:'0.5rem'}} disabled={loading}>{loading ? "..." : "Tizimga Kiritish"}</button>
         </form>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Hududlar Tab
// -----------------------------------------------------------------------------
function HududlarTab({ auth, showToast }) {
  const [mahallas, setMahallas] = useState([]);
  const [selectedMahalla, setSelectedMahalla] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null); 
  
  const [addMahallaOpen, setAddMahallaOpen] = useState(false);
  const [addBuildingOpen, setAddBuildingOpen] = useState(false);
  const [newMahalla, setNewMahalla] = useState('');
  const [bForm, setBForm] = useState({ type: 'apartment', name_or_number: '', levels: '', apartments_count: '', residents_count: '' });

  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [activeKpiFilter, setActiveKpiFilter] = useState(null);

  const renderBuildingIcons = (cats) => {
    const hasGas = cats?.includes('gaz');
    const hasWater = cats?.includes('suv');
    const hasElec = cats?.includes('elektr');
    const hasTrash = cats?.includes('obodonlashtirish') || cats?.includes('boshqa');

    return (
      <div style={{ display: 'flex', gap: '12px', fontSize: '1.4rem', marginTop: '12px', padding: '8px 12px', background: 'var(--bg-light)', borderRadius: '8px', justifyContent: 'space-between' }}>
        <span style={{ opacity: hasGas ? 1 : 0.25, filter: hasGas ? 'drop-shadow(0 0 6px #c2410c)' : 'grayscale(100%)' }} title="Gaz">🔥</span>
        <span style={{ opacity: hasWater ? 1 : 0.25, filter: hasWater ? 'drop-shadow(0 0 6px #0284c7)' : 'grayscale(100%)' }} title="Suv">💧</span>
        <span style={{ opacity: hasElec ? 1 : 0.25, filter: hasElec ? 'drop-shadow(0 0 6px #f59e0b)' : 'grayscale(100%)' }} title="Elektr">⚡</span>
        <span style={{ opacity: hasTrash ? 1 : 0.25, filter: hasTrash ? 'drop-shadow(0 0 6px #16a34a)' : 'grayscale(100%)' }} title="Chiqindi / Boshqa">🗑</span>
      </div>
    );
  };

  const fetchMahallas = () => api.get('/mahallas').then(r => setMahallas(r.data)).catch(console.error);
  
  const fetchBuildings = (id) => {
    if (id === 'all') {
      api.get(`/buildings?all=true`).then(r => setBuildings(r.data)).catch(console.error);
    } else {
      api.get(`/buildings?mahalla_id=${id}`).then(r => setBuildings(r.data)).catch(console.error);
    }
  };

  useEffect(() => { 
    fetchMahallas(); 
    fetchBuildings('all');
    setSelectedMahalla({id: 'all', name: 'Barcha Binolar'});
  }, []);

  const handleAddMahalla = async (e) => {
    e.preventDefault();
    try { await api.post('/mahallas', { name: newMahalla }); setNewMahalla(''); setAddMahallaOpen(false); showToast("Saqlandi!"); fetchMahallas(); } catch(e){}
  };

  const handleAddBuilding = async (e) => {
    e.preventDefault();
    try {
      await api.post('/buildings', { ...bForm, mahalla_id: selectedMahalla.id });
      setBForm({ type: 'apartment', name_or_number: '', levels: '', apartments_count: '', residents_count: '' });
      setAddBuildingOpen(false); showToast("Bino qo'shildi!"); fetchBuildings(selectedMahalla.id);
    } catch(err) {}
  };

  if (selectedBuilding) {
    return <BuildingProfile building={selectedBuilding} mahallaName={selectedBuilding.mahalla_name || selectedMahalla.name} auth={auth} showToast={showToast} onBack={() => { setSelectedBuilding(null); fetchBuildings(selectedMahalla.id); }} />;
  }

  const totalBuildings = buildings.length;
  const problemBuildings = buildings.filter(b => b.active_issues > 0).length;
  const gasProblems = buildings.filter(b => b.active_categories && b.active_categories.includes('gaz')).length;
  const waterProblems = buildings.filter(b => b.active_categories && b.active_categories.includes('suv')).length;
  const electrProblems = buildings.filter(b => b.active_categories && b.active_categories.includes('elektr')).length;
  const otherProblems = buildings.filter(b => b.active_categories && (b.active_categories.includes('obodonlashtirish') || b.active_categories.includes('boshqa'))).length;

  let displayedBuildings = buildings;
  if (showProblemsOnly) {
     displayedBuildings = displayedBuildings.filter(b => b.active_issues > 0);
  }
  if (activeKpiFilter) {
     displayedBuildings = displayedBuildings.filter(b => {
        if (!b.active_categories) return false;
        if (activeKpiFilter === 'boshqa') return b.active_categories.includes('obodonlashtirish') || b.active_categories.includes('boshqa');
        return b.active_categories.includes(activeKpiFilter);
     });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Filter Bar */}
      <div className="data-table-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ flex: '1 1 300px', marginBottom: 0 }}>
          <label style={{maxWidth: '100%'}}>Hudud / Mahalla</label>
          <select 
            className="status-select" 
            style={{width: '100%', maxWidth: '350px'}}
            value={selectedMahalla?.id || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all') {
                setSelectedMahalla({id: 'all', name: 'Barcha Binolar'});
                fetchBuildings('all');
              } else if (val) {
                const mah = mahallas.find(m => m.id === parseInt(val, 10));
                setSelectedMahalla(mah);
                fetchBuildings(mah.id);
              }
            }}
          >
            <option value="" disabled>Hududni tanlang...</option>
            <option value="all">Barcha Binolar (Keng ko'lamli)</option>
            {mahallas.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500, color: 'var(--text-gray)', marginTop: '0.75rem' }}>
            <input type="checkbox" style={{width:'18px', height:'18px'}} checked={showProblemsOnly} onChange={e => setShowProblemsOnly(e.target.checked)} />
            Faqat muammolilarni ajratish
          </label>
        </div>
        
        {auth.role === 'SuperAdmin' && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
             <button className="btn-secondary" onClick={() => setAddMahallaOpen(true)}><Plus size={16}/> Mahalla qo'shish</button>
             {selectedMahalla && selectedMahalla.id !== 'all' && (
                <button className="btn-primary" onClick={() => setAddBuildingOpen(true)}><Plus size={16}/> Bino qo'shish</button>
             )}
          </div>
        )}
      </div>

      {/* KPI Stats Row */}
      {selectedMahalla && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
        <div className="stat-card" style={{ background: 'var(--bg-light)' }}>
          <div className="stat-title" style={{color: 'var(--text-gray)'}}>Jami Binolar</div>
          <div className="stat-value" style={{color: 'var(--text-dark)'}}>{totalBuildings}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--danger-bg)', cursor:'pointer', border: showProblemsOnly ? '2px solid var(--danger)' : 'none', opacity: (showProblemsOnly || !activeKpiFilter) ? 1 : 0.5 }} onClick={() => setShowProblemsOnly(!showProblemsOnly)}>
          <div className="stat-title" style={{color: 'var(--danger)'}}>Muammoli 🔴</div>
          <div className="stat-value" style={{color: 'var(--danger)'}}>{problemBuildings}</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer', border: activeKpiFilter === 'gaz' ? '2px solid #c2410c':'none', opacity: (!activeKpiFilter || activeKpiFilter === 'gaz') ? 1 : 0.5}} onClick={() => setActiveKpiFilter(activeKpiFilter === 'gaz' ? null : 'gaz')}>
          <div className="stat-title" style={{color: '#c2410c'}}>Gaz 🔥</div>
          <div className="stat-value" style={{color: '#c2410c'}}>{gasProblems}</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer', border: activeKpiFilter === 'suv' ? '2px solid #0284c7':'none', opacity: (!activeKpiFilter || activeKpiFilter === 'suv') ? 1 : 0.5}} onClick={() => setActiveKpiFilter(activeKpiFilter === 'suv' ? null : 'suv')}>
          <div className="stat-title" style={{color: '#0284c7'}}>Suv 💧</div>
          <div className="stat-value" style={{color: '#0284c7'}}>{waterProblems}</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer', border: activeKpiFilter === 'elektr' ? '2px solid #f59e0b':'none', opacity: (!activeKpiFilter || activeKpiFilter === 'elektr') ? 1 : 0.5}} onClick={() => setActiveKpiFilter(activeKpiFilter === 'elektr' ? null : 'elektr')}>
          <div className="stat-title" style={{color: '#f59e0b'}}>Elektr ⚡</div>
          <div className="stat-value" style={{color: '#f59e0b'}}>{electrProblems}</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer', border: activeKpiFilter === 'boshqa' ? '2px solid gray':'none', opacity: (!activeKpiFilter || activeKpiFilter === 'boshqa') ? 1 : 0.5}} onClick={() => setActiveKpiFilter(activeKpiFilter === 'boshqa' ? null : 'boshqa')}>
          <div className="stat-title" style={{color: 'var(--text-gray)'}}>Qolgan 📌</div>
          <div className="stat-value" style={{color: 'var(--text-gray)'}}>{otherProblems}</div>
        </div>
      </div>
      )}

      {/* Buildings Grid */}
      {(showProblemsOnly || activeKpiFilter) && (
        <div style={{display:'flex', justifyContent:'center', margin: '0.5rem 0'}}>
          <button className="btn-secondary" onClick={() => { setShowProblemsOnly(false); setActiveKpiFilter(null); }}>
             Barchasini ko'rsatish (Filtrlarni tozalash)
          </button>
        </div>
      )}
      <div className="data-table-card" style={{ padding: '1.5rem', minHeight: '400px' }}>
        {!selectedMahalla ? (
           <div className="empty-state" style={{marginTop: '3rem'}}><Map size={64} style={{color: 'var(--border)', marginBottom: '1rem'}}/><h3>Yuqoridan hududni tanlang yoki "Barchasi"ni faollashtiring</h3></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
             {displayedBuildings.map(b => (
               <div key={b.id} onClick={() => setSelectedBuilding(b)} style={{padding: '1.25rem', borderRadius: '12px', cursor: 'pointer', border: b.active_issues > 0 ? '2px solid var(--danger)' : '1px solid var(--border)', background: b.active_issues > 0 ? '#fff5f5' : 'white'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems: 'center'}}>
                    <strong style={{fontSize:'1.15rem'}}><Building size={18} style={{marginRight: '6px', verticalAlign:'text-bottom', color:'var(--primary)'}}/> {b.name_or_number}</strong>
                    {b.active_issues > 0 && (
                      <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                         <span className="badge badge-rejected">{b.active_issues} ta muammo</span>
                      </div>
                    )}
                  </div>
                  {selectedMahalla.id === 'all' && b.mahalla_name && <div style={{fontSize:'0.85rem', color:'var(--text-light)', marginTop:'8px'}}><Map size={12} style={{verticalAlign:'text-bottom'}}/> {b.mahalla_name}</div>}
                  <div style={{fontSize:'0.9rem', color:'var(--text-gray)', marginTop:'6px'}}>Turi: {b.type === 'apartment' ? "Ko'p qavatli" : (b.type === 'house' ? 'Hovli' : 'Boshqa')}</div>
                  
                  {/* Glowing Iconic HUD */}
                  {renderBuildingIcons(b.active_categories)}
               </div>
             ))}
             {displayedBuildings.length === 0 && <div style={{color:'var(--text-gray)', gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 0'}}>Ushbu filtr bo'yicha binolar topilmadi.</div>}
          </div>
        )}
      </div>

      {addMahallaOpen && (
        <div className="modal-overlay">
          <div className="modal fade-in">
             <div className="modal-header"><h3>Yangi Mahalla Qo'shish</h3></div>
             <form onSubmit={handleAddMahalla} className="modal-body">
               <div className="input-group"><input type="text" value={newMahalla} onChange={e=>setNewMahalla(e.target.value)} required /></div>
               <div style={{display:'flex', gap:'1rem'}}><button type="submit" className="btn-primary">Saqlash</button><button type="button" className="btn-secondary" onClick={()=>setAddMahallaOpen(false)}>Bekor</button></div>
             </form>
          </div>
        </div>
      )}

      {addBuildingOpen && (
         <div className="modal-overlay">
         <div className="modal fade-in">
            <div className="modal-header"><h3>{selectedMahalla?.name} - Bino qo'shish</h3></div>
            <form onSubmit={handleAddBuilding} className="modal-body" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                 <div className="input-group" style={{gridColumn: '1 / -1'}}>
                   <label>Bino turi</label>
                   <select className="status-select" value={bForm.type} onChange={e=>setBForm({...bForm, type: e.target.value})}>
                     <option value="apartment">Ko'p qavatli uy (Dom)</option>
                     <option value="house">Xonadon / Hovli</option>
                     <option value="other">Boshqa (Tashkilot, obyekt...)</option>
                   </select>
                 </div>
                 <div className="input-group" style={{gridColumn: '1 / -1'}}>
                   <label>Uy raqami yoki Nomi</label>
                   <input type="text" required value={bForm.name_or_number} onChange={e=>setBForm({...bForm, name_or_number: e.target.value})} />
                 </div>
                 <div className="input-group" style={{gridColumn: '1 / -1'}}>
                   <label>Aholi soni (Taxminiy)</label>
                   <input type="number" value={bForm.residents_count} onChange={e=>setBForm({...bForm, residents_count: e.target.value})} />
                 </div>
                 {bForm.type === 'apartment' && (
                   <>
                     <div className="input-group">
                       <label>Qavatlar soni</label>
                       <input type="number" required value={bForm.levels} onChange={e=>setBForm({...bForm, levels: e.target.value})} />
                     </div>
                     <div className="input-group">
                       <label>Podyezd/Xonadonlar</label>
                       <input type="number" required value={bForm.apartments_count} onChange={e=>setBForm({...bForm, apartments_count: e.target.value})} />
                     </div>
                   </>
                 )}
                 <div style={{display:'flex', gap:'1rem', gridColumn:'1 / -1', marginTop:'1rem'}}><button type="submit" className="btn-primary">Saqlash</button><button type="button" className="btn-secondary" onClick={()=>setAddBuildingOpen(false)}>Bekor</button></div>
            </form>
         </div>
       </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// RESTORED BUILDING PROFILE & CRUD
// -----------------------------------------------------------------------------
function BuildingProfile({ building, mahallaName, auth, onBack, showToast }) {
  const [stats, setStats] = useState({ total: 0, idle: 0, in_progress: 0, completed: 0, rejected: 0 });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(building);
  const [saving, setSaving] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);

  useEffect(() => {
    fetchBuildingData();
  }, [building.id]);

  const fetchBuildingData = () => {
    setLoading(true);
    Promise.all([
      api.get(`/buildings/${building.id}/stats`),
      api.get(`/buildings/${building.id}/murojaats`)
    ]).then(([st, hi]) => {
      setStats(st.data);
      setHistory(hi.data);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/buildings/${building.id}`, form);
      // Update local object dynamically
      Object.assign(building, form);
      showToast("Bino ma'lumotlari yangilandi!");
      setEditMode(false);
    } catch(err) {
      alert("Xatolik");
    } finally { setSaving(false); }
  };

  const delBuilding = async () => {
    if(!window.confirm("Barcha ma'lumotlar o'chib ketadi. Rostdan o'chirasizmi?")) return;
    try {
      await api.delete(`/buildings/${building.id}`);
      showToast("Bino tizimdan butunlay o'chirildi");
      onBack();
    } catch(e) { alert("Xatolik"); }
  };
  const handleHistoryUpdate = async (id, formData) => {
    try {
      await api.patch(`/murojaats/${id}/status`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast("Holat saqlandi!");
      setSelectedHistory(null);
      fetchBuildingData();
    } catch (err) {
      alert(err.response?.data?.error || "Xatolik ro'y berdi");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'idle': return <span className="badge badge-idle">Kutilmoqda</span>;
      case 'in_progress': return <span className="badge badge-inprogress">Jarayonda</span>;
      case 'completed': return <span className="badge badge-completed">Bajarildi</span>;
      case 'rejected': return <span className="badge badge-rejected">Rad etildi</span>;
      default: return <span className="badge badge-idle">{status}</span>;
    }
  };

  if (loading) return <div style={{padding:'4rem', textAlign:'center'}}><Loader2 className="spinner spinner-dark"/></div>;

  return (
    <div className="fade-in">
      {/* Top Navigation */}
      <button onClick={onBack} className="action-btn" style={{marginBottom: '1rem', display:'flex', gap:'8px', alignItems:'center'}}>
        <ArrowLeft size={16} /> Ortga qaytish
      </button>

      {/* Main Header Card */}
      <div className="data-table-card" style={{padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'linear-gradient(135deg, white, #f8fafc)'}}>
        <div>
           <div style={{color: 'var(--text-gray)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem'}}>Uy-joy Pasporti</div>
           <h2 style={{margin: 0, fontSize: '2rem', color: 'var(--text-dark)', display:'flex', alignItems:'center', gap:'10px'}}>
             <Building color="var(--primary)"/> {building.name_or_number}
           </h2>
           <div style={{color: 'var(--text-light)', marginTop: '0.5rem', fontSize: '1rem'}}>{mahallaName}</div>
        </div>
        
        {/* Actions */}
        {auth.role === 'SuperAdmin' && (
          <div style={{display:'flex', gap:'1rem'}}>
             <button className="logout-btn" onClick={() => setEditMode(true)}><Edit2 size={16}/> Tahrirlash</button>
             <button onClick={delBuilding} className="logout-btn" style={{borderColor:'var(--danger)', color:'var(--danger)', background:'white'}}><XCircle size={16}/> O'chirish</button>
          </div>
        )}
      </div>

      {/* Stats and Metrics */}
      <div style={{display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap'}}>
         <div className="data-table-card" style={{flex: '1 1 300px', padding: '1.5rem'}}>
            <h3 style={{marginTop: 0, marginBottom: '1.5rem', borderBottom:'1px solid var(--border)', paddingBottom:'0.5rem'}}>Fizik Tavsif</h3>
            <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'1rem'}}>
                <span style={{color:'var(--text-gray)', display:'flex', gap:'8px'}}><UsersIcon size={18}/> Aholi soni:</span> 
                <b>{building.residents_count || 0} kishi</b>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'1rem'}}>
                <span style={{color:'var(--text-gray)', display:'flex', gap:'8px'}}><Building size={18}/> Bino turi:</span> 
                <b>{building.type === 'apartment' ? "Ko'p qavatli uy" : (building.type === 'house' ? "Hovli / Xonadon" : "Boshqa boshqarma/obyekt")}</b>
              </div>
              {building.type === 'apartment' && (
                <>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:'1rem'}}>
                    <span style={{color:'var(--text-gray)', display:'flex', gap:'8px'}}><Layers size={18}/> Qavatlar soni:</span> 
                    <b>{building.levels || '-'} ta</b>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:'1rem'}}>
                    <span style={{color:'var(--text-gray)', display:'flex', gap:'8px'}}><DoorOpen size={18}/> Xonadonlar:</span> 
                    <b>{building.apartments_count || '-'} ta</b>
                  </div>
                </>
              )}
            </div>
         </div>

         <div className="data-table-card" style={{flex: '2 1 400px', padding: '1.5rem'}}>
           <h3 style={{marginTop: 0, marginBottom: '1.5rem', borderBottom:'1px solid var(--border)', paddingBottom:'0.5rem'}}>Murojaatlar Statistikasi</h3>
           <div className="stats-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
             <div className="stat-card" style={{background: 'linear-gradient(135deg, #3b82f6, #1e40af)', padding: '1.5rem'}}>
               <div className="stat-value" style={{fontSize: '2.5rem'}}>{stats.total}</div>
               <div className="stat-label">Jami Shikyotlar</div>
             </div>
             <div className="stat-card" style={{background: 'linear-gradient(135deg, #10b981, #047857)', padding: '1.5rem'}}>
               <div className="stat-value" style={{fontSize: '2.5rem'}}>{stats.completed}</div>
               <div className="stat-label">Hal etilganlar</div>
             </div>
             <div className="stat-card" style={{background: 'linear-gradient(135deg, #f59e0b, #b45309)', padding: '1.5rem'}}>
               <div className="stat-value" style={{fontSize: '2.5rem'}}>{stats.in_progress + stats.idle}</div>
               <div className="stat-label">Hozirgi muammolar</div>
             </div>
             <div className="stat-card" style={{background: 'linear-gradient(135deg, #ef4444, #b91c1c)', padding: '1.5rem'}}>
               <div className="stat-value" style={{fontSize: '2.5rem'}}>{stats.rejected}</div>
               <div className="stat-label">Rad etilganlar</div>
             </div>
           </div>
         </div>
      </div>

       <h3 style={{marginBottom: '1rem'}}>Bu binodagi so'nggi murojaatlar</h3>
      <div className="data-table-card">
         <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Fuqaro / Telefon</th><th>Sana</th><th>Yo'nalish</th><th>Mas'ul</th><th>Holati</th><th>Harakat</th></tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:'2rem', color:'var(--text-gray)'}}>Bu bino uchun murojaatlar yozilmagan.</td></tr>}
              {history.map(h => (
                <tr key={h.id}>
                  <td style={{fontWeight:600}}>#{h.id}</td>
                  <td>{h.full_name}<br/><span style={{fontSize:'0.8rem', color:'var(--text-light)'}}>{h.phone}</span></td>
                  <td style={{color:'var(--text-gray)'}}>{new Date(h.created_at).toLocaleString('uz-UZ', {hour12: false})}</td>
                  <td><span style={{textTransform:'capitalize', fontWeight: 500}}>{h.category}</span></td>
                  <td style={{fontWeight:500, color: h.assigned_admin ? 'var(--primary)' : 'var(--text-light)'}}>{h.assigned_admin || 'Biriktirilmagan'}</td>
                  <td>{getStatusBadge(h.status)}</td>
                  <td><button className="action-btn" onClick={() => setSelectedHistory(h)}>Ko'rish</button></td>
                </tr>
              ))}
            </tbody>
         </table>
      </div>

      {selectedHistory && <UpdateModal murojaat={selectedHistory} onClose={() => setSelectedHistory(null)} onSave={handleHistoryUpdate} auth={auth} />}

      {editMode && (
         <div className="modal-overlay">
           <div className="modal">
             <div className="modal-header">
               <h3>Binoni Tahrirlash</h3>
               <button className="close-btn" onClick={() => setEditMode(false)}><XCircle size={20}/></button>
             </div>
             <form onSubmit={handleUpdate} className="modal-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
               <div className="input-group" style={{gridColumn: '1 / -1'}}>
                 <label>Bino turi</label>
                 <select className="status-select" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                   <option value="apartment">Ko'p qavatli uy (Dom)</option>
                   <option value="house">Xonadon / Hovli</option>
                   <option value="other">Boshqa (Tashkilot, obyekt...)</option>
                 </select>
               </div>
               <div className="input-group" style={{gridColumn: '1 / -1'}}>
                 <label>Uy nomi/raqami</label>
                 <input type="text" value={form.name_or_number} onChange={e=>setForm({...form, name_or_number: e.target.value})} required/>
               </div>
               <div className="input-group" style={{gridColumn: '1 / -1'}}>
                 <label>Aholi soni: </label>
                 <input type="number" value={form.residents_count} onChange={e=>setForm({...form, residents_count: e.target.value})} />
               </div>
               {form.type === 'apartment' && (
                 <>
                  <div className="input-group">
                    <label>Qavatlar</label>
                    <input type="number" value={form.levels} onChange={e=>setForm({...form, levels: e.target.value})} required/>
                  </div>
                  <div className="input-group">
                    <label>Xonadonlar</label>
                    <input type="number" value={form.apartments_count} onChange={e=>setForm({...form, apartments_count: e.target.value})} required/>
                  </div>
                 </>
               )}
               <button className="btn-primary" type="submit" disabled={saving} style={{gridColumn: '1 / -1', marginTop:'1rem'}}>
                 {saving ? <Loader2 className="spinner"/> : "Saqlash"}
               </button>
             </form>
           </div>
         </div>
      )}
    </div>
  );
}

function StatsTab({ auth }) { 
  const [stats, setStats] = useState({ staffPerformers: [], problematicBuildings: [], categoryBreakdown: {} });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('barchasi');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    const today = new Date();
    if (dateRange === 'barchasi') {
      setStart(''); setEnd('');
    } else if (dateRange === 'bugun') {
      const d = today.toISOString().split('T')[0];
      setStart(d); setEnd(d);
    } else if (dateRange === 'hafta') {
      const s = new Date(today); s.setDate(s.getDate() - 7);
      setStart(s.toISOString().split('T')[0]); setEnd(today.toISOString().split('T')[0]);
    } else if (dateRange === 'oy') {
      const s = new Date(today); s.setMonth(s.getMonth() - 1);
      setStart(s.toISOString().split('T')[0]); setEnd(today.toISOString().split('T')[0]);
    }
  }, [dateRange]);

  const fetchStats = () => {
    if (auth.role !== 'SuperAdmin') return;
    setLoading(true);
    let url = '/admin-stats?';
    if (start) url += `startDate=${start}&`;
    if (end) url += `endDate=${end}`;
    api.get(url).then(r => setStats(r.data || { staffPerformers: [], problematicBuildings: [], categoryBreakdown: {} })).catch(console.error).finally(()=>setLoading(false));
  };

  useEffect(() => { fetchStats(); }, [start, end]);

  if (auth.role !== 'SuperAdmin') {
     return <div style={{padding:'4rem', textAlign:'center', color:'var(--text-gray)'}}><Shield size={48} style={{opacity:0.2, marginBottom:'1rem'}}/><h3>Bu sahifa faqat Bosh Rahbar uchun</h3></div>;
  }

  const getRatingBadge = (rating) => {
     if(rating==='good') return <span style={{background:'#dcfce7', color:'#166534', padding:'4px 8px', borderRadius:'12px', fontWeight:600, fontSize:'0.85rem'}}>A'lo 🌟</span>;
     if(rating==='average') return <span style={{background:'#fef9c3', color:'#854d0e', padding:'4px 8px', borderRadius:'12px', fontWeight:600, fontSize:'0.85rem'}}>Qoniqarli 📊</span>;
     return <span style={{background:'#fee2e2', color:'#991b1b', padding:'4px 8px', borderRadius:'12px', fontWeight:600, fontSize:'0.85rem'}}>Sust 📉</span>;
  };

  return (
    <div className="fade-in" style={{padding:'0 1.5rem 2rem 1.5rem'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem'}}>
        <h2 style={{margin:0}}>Xodimlar & Tizim Statistikasi</h2>
        <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
          <select className="status-select" style={{width:'180px', marginBottom:0}} value={dateRange} onChange={e=>setDateRange(e.target.value)}>
            <option value="barchasi">Barcha vaqt</option>
            <option value="bugun">Bugun</option>
            <option value="hafta">Shu hafta</option>
            <option value="oy">Shu oy</option>
            <option value="custom">Boshqa sana...</option>
          </select>
          {dateRange === 'custom' && (
            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
              <input type="date" className="status-select" style={{marginBottom:0, padding:'0.5rem'}} value={start} onChange={e=>setStart(e.target.value)} />
              <span>-</span>
              <input type="date" className="status-select" style={{marginBottom:0, padding:'0.5rem'}} value={end} onChange={e=>setEnd(e.target.value)} />
            </div>
          )}
          <button className="btn-secondary" onClick={fetchStats}>Yangilash</button>
        </div>
      </div>
      
      {loading ? <div style={{padding:'4rem',textAlign:'center'}}><Loader2 className="spinner spinner-dark" size={32}/></div> : (
        <div style={{display:'flex', flexDirection:'column', gap:'2rem'}}>
          
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'1rem'}}>
             <div className="data-table-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', background:'#fff7ed'}}>
                 <div style={{fontSize:'2.5rem', fontWeight:700, color:'#c2410c'}}>{stats.categoryBreakdown?.gaz || 0} ta</div>
                 <div style={{color:'#c2410c', fontWeight:500}}>🔥 Gaz Muammosi</div>
             </div>
             <div className="data-table-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', background:'#f0f9ff'}}>
                 <div style={{fontSize:'2.5rem', fontWeight:700, color:'#0284c7'}}>{stats.categoryBreakdown?.suv || 0} ta</div>
                 <div style={{color:'#0284c7', fontWeight:500}}>💧 Suv Muammosi</div>
             </div>
             <div className="data-table-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', background:'#fef3c7'}}>
                 <div style={{fontSize:'2.5rem', fontWeight:700, color:'#d97706'}}>{stats.categoryBreakdown?.elektr || 0} ta</div>
                 <div style={{color:'#d97706', fontWeight:500}}>⚡ Elektr Muammosi</div>
             </div>
             <div className="data-table-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', background:'#f0fdf4'}}>
                 <div style={{fontSize:'2.5rem', fontWeight:700, color:'#16a34a'}}>{(stats.categoryBreakdown?.obodonlashtirish || 0) + (stats.categoryBreakdown?.boshqa || 0)} ta</div>
                 <div style={{color:'#16a34a', fontWeight:500}}>🗑 Obod. va Boshqa</div>
             </div>
          </div>

          <div style={{display:'flex', gap:'2rem', flexWrap:'wrap', alignItems:'flex-start'}}>
            <div className="data-table-card" style={{flex:'1 1 500px'}}>
              <h3 style={{margin:'0', padding:'1.5rem', borderBottom:'1px solid var(--border)'}}>🏆 Reyting (Eng ko'p hal etganlar)</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Xodim</th><th>Yangi/Jarayon</th><th>Bajarildi</th><th>Me'yor</th><th>Bahosi</th></tr>
                </thead>
                <tbody>
                  {(stats.staffPerformers || []).map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{fontWeight:600}}><span style={{color:'var(--text-gray)'}}>{idx+1}.</span> @{s.username}</td>
                      <td style={{color:'#d97706', fontWeight:600}}>{s.active} ta</td>
                      <td style={{color:'#059669', fontWeight:600}}>{s.completed} ta</td>
                      <td style={{color:'var(--text-light)'}}>~{s.expected}</td>
                      <td>{getRatingBadge(s.rating)}</td>
                    </tr>
                  ))}
                  {(!stats.staffPerformers || stats.staffPerformers.length===0) && <tr><td colSpan="5" style={{textAlign:'center', padding:'2rem'}}>Ma'lumot topilmadi</td></tr>}
                </tbody>
              </table>
            </div>

             <div className="data-table-card" style={{flex:'1 1 400px'}}>
              <h3 style={{margin:'0', padding:'1.5rem', borderBottom:'1px solid var(--border)'}}>🔴 Eng Problematik Binolar (Top 10)</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Bino</th><th>Mahalla</th><th>Muammolar</th></tr>
                </thead>
                <tbody>
                  {(stats.problematicBuildings || []).map(b => (
                    <tr key={b.id}>
                      <td style={{fontWeight:600, color:'var(--text-dark)'}}>{b.name_or_number}</td>
                      <td style={{color:'var(--text-gray)'}}>{b.mahalla_name}</td>
                      <td>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <span className="badge badge-rejected" style={{fontWeight:700}}>{b.issues_count} ta</span>
                          <span style={{fontSize:'1.1rem'}}>
                             {b.categories?.includes('gaz') ? '🔥 ' : ''}
                             {b.categories?.includes('suv') ? '💧 ' : ''}
                             {b.categories?.includes('elektr') ? '⚡ ' : ''}
                             {b.categories?.includes('obodonlashtirish') || b.categories?.includes('boshqa') ? '🗑 ' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!stats.problematicBuildings || stats.problematicBuildings.length===0) && <tr><td colSpan="3" style={{textAlign:'center', padding:'2rem'}}>Barcha binolar tinch! 🎉</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function AdminsTab({ showToast }) { 
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'Gaz_Staff' });
  const [loading, setLoading] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);

  const fetchAdmins = () => api.get('/admins').then(r => setAdmins(r.data)).catch(console.error);
  
  useEffect(() => { fetchAdmins(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editAdmin) {
        await api.put(`/admins/${editAdmin.id}`, form);
        showToast("Xodim yangilandi!");
      } else {
        await api.post('/admins', form);
        showToast("Xodim muvaffaqiyatli qo'shildi!");
      }
      setForm({ username: '', password: '', role: 'Gaz_Staff' });
      setEditAdmin(null);
      fetchAdmins();
    } catch (err) { alert("Xatolik ro'y berdi"); } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Rostdan ham bu xodimni o'chirmoqchimisiz?")) return;
    try { await api.delete(`/admins/${id}`); showToast("Xodim o'chirildi"); fetchAdmins(); } catch (err) { alert("O'chirishda xatolik"); }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <div className="data-table-card" style={{ flex: '1 1 500px' }}>
        <h3 style={{padding: '1.5rem', margin: 0, borderBottom: '1px solid var(--border)'}}>Xodimlar ro'yxati</h3>
        <table className="data-table">
          <thead><tr><th>ID</th><th>Login (Username)</th><th>Vazifasi (Mas'ul)</th><th>Harakat</th></tr></thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id}>
                <td style={{fontWeight:600}}>#{a.id}</td><td>{a.username}</td><td><span className="badge badge-idle">{a.role}</span></td>
                <td style={{display:'flex', gap:'8px'}}>
                  <button className="action-btn" onClick={() => { setEditAdmin(a); setForm({ username: a.username, password: '', role: a.role }); }}><Edit2 size={14} /> Tahrir</button>
                  <button className="logout-btn" style={{padding:'0.4rem 0.8rem', fontSize:'0.8rem', border:'none', background:'var(--danger-bg)', color:'var(--danger)'}} onClick={() => handleDelete(a.id)}><XCircle size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-card" style={{ flex: '1 1 300px', padding: '2rem', alignSelf: 'start' }}>
        <h3 style={{marginTop: 0, marginBottom: '1.5rem'}}>{editAdmin ? "Xodimni tahrirlash" : "Yangi Xodim Qo'shish"}</h3>
        <form onSubmit={handleAdd}>
          <div className="input-group"><label>Login</label><input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required placeholder="masalan. admin2" /></div>
          <div className="input-group"><label>Parol</label><input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editAdmin} placeholder={editAdmin ? "O'zgartirmaslik uchun bo'sh qoldiring" : "kamida 6 ta belgi"} /></div>
          <div className="input-group">
            <label>Mutaxassislik (Role)</label>
            <select className="status-select" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
               <option value="SuperAdmin">Bosh Rahbar (SuperAdmin)</option><option value="Gaz_Staff">Gaz Ta'minoti</option>
               <option value="Suv_Staff">Suv Oqova</option><option value="Elektr_Staff">Elektr</option><option value="Obodonlashtirish_Staff">Obodonlashtirish</option><option value="Boshqa_Staff">Boshqa</option>
            </select>
          </div>
          <div style={{display:'flex', gap:'1rem'}}>
             <button type="submit" className="btn-primary" disabled={loading}>{loading ? <Loader2 className="spinner" /> : "Saqlash"}</button>
             {editAdmin && <button type="button" className="btn-secondary" onClick={() => {setEditAdmin(null); setForm({username:'', password:'', role:'Gaz_Staff'});}}>Bekor</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdateModal({ murojaat, onClose, onSave, auth }) {
  const [status, setStatus] = useState(murojaat.status);
  const [comment, setComment] = useState('');
  const [assigned, setAssigned] = useState(murojaat.assigned_admin_id || '');
  const [proofImage, setProofImage] = useState(null);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    api.get('/staff').then(res => setStaff(res.data)).catch(console.error);
  }, []);

  const isAssignedToOther = murojaat.assigned_admin_id && murojaat.assigned_admin_id !== auth.id && auth.role !== 'SuperAdmin';

  const handleSave = () => {
    if (status === 'completed' && !proofImage && !murojaat.staff_proof_image) {
      alert("Bajarilgan holatiga o'tkazish uchun isbot rasm yuklash majburiy.");
      return;
    }
    const formData = new FormData();
    formData.append('status', status);
    formData.append('comment', comment);
    if (assigned) formData.append('assigned_admin_id', assigned);
    if (proofImage) formData.append('proof_image', proofImage);
    
    onSave(murojaat.id, formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal fade-in">
        <div className="modal-header"><h3>Murojaat #{murojaat.id}</h3><button onClick={onClose} className="close-btn"><XCircle size={18}/></button></div>
        <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
          {(murojaat.user_image1 || murojaat.user_image2 || murojaat.staff_proof_image) && (
            <div style={{display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'8px'}}>
              {murojaat.user_image1 && <img src={murojaat.user_image1} alt="Fuqaro yuborgan" style={{height:'100px', objectFit:'contain', borderRadius:'8px', cursor:'pointer', border:'1px solid var(--border)'}} onClick={()=>window.open(murojaat.user_image1, '_blank')}/>}
              {murojaat.user_image2 && <img src={murojaat.user_image2} alt="Fuqaro yuborgan" style={{height:'100px', objectFit:'contain', borderRadius:'8px', cursor:'pointer', border:'1px solid var(--border)'}} onClick={()=>window.open(murojaat.user_image2, '_blank')}/>}
              {murojaat.staff_proof_image && <img src={murojaat.staff_proof_image} alt="Bajarildi isboti" style={{height:'100px', objectFit:'contain', borderRadius:'8px', border:'2px solid var(--primary)', cursor:'pointer'}} onClick={()=>window.open(murojaat.staff_proof_image, '_blank')} title="Xodim isbot rasmi"/>}
            </div>
          )}

          <div className="input-group" style={{marginBottom:0}}>
             <label>Mas'ul xodim</label>
             <select className="status-select" value={assigned} onChange={e=>setAssigned(e.target.value)} disabled={isAssignedToOther} style={{background: isAssignedToOther ? 'var(--bg-light)' : 'white'}}>
                <option value="">-- Biriktirilmagan --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.username} ({s.role})</option>)}
             </select>
          </div>
          <div className="input-group" style={{marginBottom:0}}><label>Yangi Holat</label>
             <select className="status-select" value={status} onChange={e=>setStatus(e.target.value)} disabled={isAssignedToOther} style={{background: isAssignedToOther ? 'var(--bg-light)' : 'white'}}>
                <option value="idle">Kutilmoqda</option><option value="in_progress">Jarayonda</option><option value="completed">Bajarildi</option><option value="rejected">Rad etildi</option>
             </select>
          </div>
          <div className="input-group" style={{marginBottom:0}}><label>Izoh</label>
             <textarea className="comment-textarea" value={comment} onChange={e=>setComment(e.target.value)} disabled={isAssignedToOther} style={{background: isAssignedToOther ? 'var(--bg-light)' : 'white'}}/>
          </div>

          <div className="input-group" style={{marginBottom:0, display: status === 'completed' ? 'block' : 'none'}}>
             <label style={{color:'var(--primary)'}}>Isbot rasm (faqat 'Bajarildi' uchun majburiy)</label>
             <input type="file" accept="image/*" onChange={e=>setProofImage(e.target.files[0])} disabled={isAssignedToOther} style={{background: isAssignedToOther ? 'var(--bg-light)' : 'white'}} />
          </div>
          
          <div style={{display:'flex',gap:'1rem', marginTop:'1rem'}}>
            {isAssignedToOther ? (
               <div style={{color:'var(--danger)', fontWeight:500, padding:'0.85rem', background:'var(--danger-bg)', borderRadius:'8px', flex:1, display:'flex', alignItems:'center', gap:'8px'}}>
                 <Shield size={18}/> Boshqa xodimga biriktirilgan
               </div>
            ) : (
               <>
                 <button className="btn-primary" onClick={handleSave}>Saqlash</button>
                 <button className="btn-secondary" onClick={onClose}>Bekor</button>
               </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfilimTab({ auth }) {
  const [stats, setStats] = useState({ total: 0, idle: 0, in_progress: 0, completed: 0, rejected: 0 });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMurojaat, setSelectedMurojaat] = useState(null);

  const fetchProfile = () => {
    setLoading(true);
    Promise.all([
      api.get('/profile/stats'),
      api.get('/profile/murojaats')
    ]).then(([st, ts]) => {
      setStats(st.data); setTasks(ts.data);
    }).catch(console.error).finally(()=>setLoading(false));
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleUpdate = async (id, formData) => {
    try {
      await api.patch(`/murojaats/${id}/status`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      setSelectedMurojaat(null); fetchProfile();
    } catch (err) { alert(err.response?.data?.error || "Xatolik."); }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'idle': return <span className="badge badge-idle"><Clock size={12}/> Kutilmoqda</span>;
      case 'in_progress': return <span className="badge badge-inprogress"><Activity size={12}/> Jarayonda</span>;
      case 'completed': return <span className="badge badge-completed"><CheckCircle2 size={12}/> Bajarildi</span>;
      case 'rejected': return <span className="badge badge-rejected"><XCircle size={12}/> Rad etildi</span>;
      default: return null;
    }
  };

  if (loading) return <div style={{padding:'4rem', textAlign:'center'}}><Loader2 className="spinner spinner-dark" size={32}/></div>;

  return (
    <>
      <h2 style={{marginTop:0, marginBottom:'1.5rem'}}>Shaxsiy Faoliyat</h2>
      
      <div className="data-table-card" style={{padding: '1.5rem', marginBottom: '2rem'}}>
         <h3 style={{marginTop: 0, marginBottom: '1.5rem', borderBottom:'1px solid var(--border)', paddingBottom:'0.5rem'}}>Mening KPI Ko'rsatkichlarim</h3>
         <div className="stats-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
            <div className="stat-card stat-total" style={{padding: '1.5rem'}}>
              <div className="stat-value" style={{fontSize: '2rem'}}>{stats.total}</div><div className="stat-label">Jami Biriktirilgan</div>
            </div>
            <div className="stat-card stat-completed" style={{padding: '1.5rem'}}>
              <div className="stat-value" style={{fontSize: '2rem'}}>{stats.completed}</div><div className="stat-label">Bajarildi</div>
            </div>
            <div className="stat-card stat-progress" style={{padding: '1.5rem'}}>
              <div className="stat-value" style={{fontSize: '2rem'}}>{stats.in_progress + stats.idle}</div><div className="stat-label">Jarayonda/Kutilmoqda</div>
            </div>
         </div>
      </div>

      <h3 style={{marginBottom:'1rem'}}>Mas'ul etib belgilangan murojaatlar</h3>
      <div className="data-table-card">
         <table className="data-table">
            <thead><tr><th>ID</th><th>Fuqaro / Telefon</th><th>Kategoriya</th><th>Sana</th><th>Holati</th><th>Harakat</th></tr></thead>
            <tbody>
              {tasks.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'var(--text-gray)'}}>Sizga biriktirilgan vazifalar yo'q.</td></tr>}
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{fontWeight: 600}}>#{t.id}</td><td>{t.full_name}<br/><span style={{fontSize:'0.8rem', color:'var(--text-gray)'}}>{t.phone}</span></td>
                  <td><span style={{textTransform:'capitalize', fontWeight: 500}}>{t.category}</span></td>
                  <td>{new Date(t.created_at).toLocaleString('uz-UZ', {hour12: false})}</td>
                  <td>{getStatusBadge(t.status)}</td>
                  <td><button className="action-btn" onClick={() => setSelectedMurojaat(t)}>Ko'rish</button></td>
                </tr>
              ))}
            </tbody>
         </table>
      </div>

      {selectedMurojaat && <UpdateModal murojaat={selectedMurojaat} onClose={() => setSelectedMurojaat(null)} onSave={handleUpdate} auth={auth} />}
    </>
  );
}

export default App;
