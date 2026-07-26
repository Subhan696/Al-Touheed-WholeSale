import React, { useState, useEffect, useRef } from 'react';
import { PAKISTAN_CITIES } from '../utils/pakistanCities';

const { ipcRenderer } = window.require('electron');

function Customers({ onSelectCustomerLedger }) {
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const phoneRef = useRef(null);
  const cityRef = useRef(null);
  const balRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [editBalCust, setEditBalCust] = useState(null);
  const [editBalAmount, setEditBalAmount] = useState('');

  const [statusMsg, setStatusMsg] = useState('');

  const [cities, setCities] = useState(PAKISTAN_CITIES);
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const newCityRef = useRef(null);

  useEffect(() => { load(); }, [searchTerm]);
  useEffect(() => { loadCities(); }, []);

  const load = async () => {
    try {
      const result = await ipcRenderer.invoke('get-customers', { searchTerm });
      setCustomers(result || []);
    } catch { }
  };

  const loadCities = async () => {
    try {
      const result = await ipcRenderer.invoke('get-cities');
      const names = (result || []).map(r => r.name);
      // Merge in the built-in list too, in case the DB list hasn't been seeded yet
      const merged = Array.from(new Set([...names, ...PAKISTAN_CITIES])).sort((a, b) => a.localeCompare(b));
      setCities(merged.length ? merged : PAKISTAN_CITIES);
    } catch { }
  };

  const handleAddCity = async () => {
    const trimmed = newCityName.trim();
    if (!trimmed) return;
    try {
      await ipcRenderer.invoke('add-city', trimmed);
      await loadCities();
      setCity(trimmed);
      setNewCityName('');
      setShowAddCity(false);
    } catch {
      setStatusMsg('❌ Failed to add city'); setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const openAdd = () => {
    setEditCustomer(null);
    setName(''); setPhone(''); setCity(''); setInitialBalance('');
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditCustomer(c);
    setName(c.name); setPhone(c.phone || ''); setCity(c.city || ''); setInitialBalance(c.initial_balance || '');
    setShowAddCity(false);
    if (c.city && !cities.includes(c.city)) {
      setCities(prev => Array.from(new Set([...prev, c.city])).sort((a, b) => a.localeCompare(b)));
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { setStatusMsg('❌ Name required'); setTimeout(() => setStatusMsg(''), 3000); return; }
    const payload = { name: name.trim(), phone: phone.trim(), city: city.trim(), initial_balance: initialBalance };

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

  const handleSaveBalance = async () => {
    if (!editBalCust) return;
    await ipcRenderer.invoke('update-customer-balance', { id: editBalCust.id, initial_balance: editBalAmount });
    setEditBalCust(null);
    load();
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
              <th style={{ ...th, textAlign: 'right' }}>Initial Balance</th>
              <th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No customers found</td></tr>
            ) : customers.map(c => {
              const initBal = parseFloat(c.initial_balance) || 0;
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...td, color: '#b5b5c3', fontWeight: 600 }}>#{c.id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                  <td style={td}>{c.phone || '-'}</td>
                  <td style={td}>{c.city || '-'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                    {initBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <button onClick={() => { setEditBalCust(c); setEditBalAmount(c.initial_balance || 0); }} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#3699ff', cursor: 'pointer' }} title="Edit Initial Balance">✎</button>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button style={{ background: '#e0e7ff', color: '#4338ca', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 8 }} onClick={() => onSelectCustomerLedger?.(c)}>📋 Ledger</button>
                    <button style={{ background: '#f5f8fa', color: '#3699ff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 8 }} onClick={() => openEdit(c)}>Edit</button>
                    <button style={{ background: '#fff5f8', color: '#f64e60', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }} onClick={() => handleDelete(c)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Initial Balance Quick Modal */}
      {editBalCust && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 380, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Set Initial Balance</h3>
            <p style={{ margin: '0 0 12px', color: '#4b5563' }}>Customer: <strong>{editBalCust.name}</strong></p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#3f4254' }}>Opening Balance (Positive = They owe us)</label>
              <input type="number" step="0.01" value={editBalAmount} onChange={e => setEditBalAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setEditBalCust(null)} style={{ padding: '8px 16px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSaveBalance} style={{ padding: '8px 16px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

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
                <select
                  ref={cityRef}
                  value={showAddCity ? '__add_new__' : city}
                  onChange={e => {
                    if (e.target.value === '__add_new__') {
                      setShowAddCity(true);
                      setNewCityName('');
                      setTimeout(() => newCityRef.current?.focus(), 0);
                    } else {
                      setShowAddCity(false);
                      setCity(e.target.value);
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && !showAddCity) balRef.current?.focus(); }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none', background: '#fff', cursor: 'pointer' }}
                >
                  <option value="">Select City...</option>
                  {cities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__add_new__">+ Add new city / place...</option>
                </select>
                {showAddCity && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      ref={newCityRef}
                      type="text"
                      value={newCityName}
                      onChange={e => setNewCityName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCity(); } if (e.key === 'Escape') { setShowAddCity(false); } }}
                      placeholder="Type new city or place name"
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCity}
                      style={{ padding: '8px 14px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddCity(false); setNewCityName(''); }}
                      style={{ padding: '8px 14px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#3f4254' }}>Initial Opening Balance</label>
                <input ref={balRef} type="number" step="0.01" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} placeholder="0.00" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />
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
