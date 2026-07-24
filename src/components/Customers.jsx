import React, { useState, useEffect, useRef } from 'react';

const { ipcRenderer } = window.require('electron');

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const phoneRef = useRef(null);
  const cityRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => { load(); }, [searchTerm]);

  const load = async () => {
    try {
      const result = await ipcRenderer.invoke('get-customers', { searchTerm });
      setCustomers(result || []);
    } catch {}
  };

  const openAdd = () => {
    setEditCustomer(null);
    setName(''); setPhone(''); setCity('');
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditCustomer(c);
    setName(c.name); setPhone(c.phone || ''); setCity(c.city || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { setStatusMsg('❌ Name required'); setTimeout(() => setStatusMsg(''), 3000); return; }
    const payload = { name: name.trim(), phone: phone.trim(), city: city.trim() };
    
    let result;
    if (editCustomer) {
      result = await ipcRenderer.invoke('update-customer', { ...payload, id: editCustomer.id });
    } else {
      result = await ipcRenderer.invoke('add-customer', payload);
    }

    if (result.success) {
      setShowForm(false);
      load();
      setStatusMsg('✅ Saved'); setTimeout(() => setStatusMsg(''), 3000);
    } else {
      setStatusMsg(`❌ Failed to save`); setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleDelete = async (c) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', `Delete customer ${c.name}?`);
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-customer', c.id);
    load();
  };

  const th = { padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e4e6ef', fontWeight: 600, color: '#3f4254' };
  const td = { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Customers ({customers.length})</h2>
          <input
            type="text"
            placeholder="Search name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none', width: 250 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusMsg && <span style={{ color: statusMsg.includes('❌') ? '#f64e60' : '#3699ff', fontWeight: 600 }}>{statusMsg}</span>}
          <button className="btn btn-primary" onClick={openAdd} style={{ padding: '8px 16px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>+ Add Customer</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa', zIndex: 1 }}>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Name</th>
              <th style={th}>Phone</th>
              <th style={th}>City</th>
              <th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No customers found</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, color: '#b5b5c3', fontWeight: 600 }}>#{c.id}</td>
                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                <td style={td}>{c.phone || '-'}</td>
                <td style={td}>{c.city || '-'}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button style={{ background: '#f5f8fa', color: '#3699ff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 8 }} onClick={() => openEdit(c)}>Edit</button>
                  <button style={{ background: '#fff5f8', color: '#f64e60', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }} onClick={() => handleDelete(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem' }}>{editCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#3f4254' }}>Name <span style={{ color: 'red' }}>*</span></label>
                <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') phoneRef.current?.focus(); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#3f4254' }}>Phone</label>
                <input ref={phoneRef} type="text" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') cityRef.current?.focus(); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#3f4254' }}>City</label>
                <input ref={cityRef} type="text" value={city} onChange={e => setCity(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: '8px 16px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;
