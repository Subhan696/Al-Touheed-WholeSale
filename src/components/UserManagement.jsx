import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

const ALL_PERMISSIONS = [
  'manage_products', 'view_products', 'view_stock',
  'manage_purchases', 'view_purchases', 'manage_purchase_returns',
  'create_sale', 'view_sales', 'manage_sales_returns',
  'view_reports', 'manage_users',
];

const PERMISSION_LABELS = {
  manage_products: 'New / Edit Items',
  view_products: 'Product List',
  view_stock: 'Stock Inventory',
  manage_purchases: 'New Purchase',
  view_purchases: 'Purchase List',
  manage_purchase_returns: 'Purchase Returns',
  create_sale: 'New Sale',
  view_sales: 'Sales History',
  manage_sales_returns: 'Sales Returns',
  view_reports: 'Reports',
  manage_users: 'User Management',
};

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [permissions, setPermissions] = useState([]);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => { try { setUsers(await ipcRenderer.invoke('get-users') || []); } catch {} };

  const openAdd = () => { setEditUser(null); setUsername(''); setPassword(''); setRole('operator'); setPermissions([]); setShowForm(true); };
  const openEdit = (u) => {
    setEditUser(u); setUsername(u.username); setPassword(''); setRole(u.role);
    setPermissions(u.permissions ? u.permissions.split(',').filter(Boolean) : []);
    setShowForm(true);
  };

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const setAllPerms = () => setPermissions([...ALL_PERMISSIONS]);
  const clearPerms = () => setPermissions([]);

  const handleSave = async () => {
    if (!username) { setStatusMsg('❌ Username required'); setTimeout(() => setStatusMsg(''), 3000); return; }
    if (!editUser && !password) { setStatusMsg('❌ Password required for new user'); setTimeout(() => setStatusMsg(''), 3000); return; }
    const payload = { username, role, permissions: permissions.join(',') };
    if (password) payload.password = password;
    const result = editUser
      ? await ipcRenderer.invoke('update-user', { ...payload, id: editUser.id })
      : await ipcRenderer.invoke('create-user', payload);
    if (result.success) { setShowForm(false); load(); setStatusMsg('✅ Saved'); setTimeout(() => setStatusMsg(''), 3000); }
    else { setStatusMsg(`❌ ${result.error}`); setTimeout(() => setStatusMsg(''), 3000); }
  };

  const handleDelete = async (user) => {
    if (user.id === currentUser?.id) { await ipcRenderer.invoke('alert-dialog', 'Cannot delete your own account.'); return; }
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this user?');
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-user', user.id);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>User Management ({users.length})</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusMsg && <span style={{ color: statusMsg.includes('❌') ? '#f64e60' : '#3699ff', fontWeight: 600 }}>{statusMsg}</span>}
          <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
        </div>
      </div>

      {/* Users table */}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
            <tr>
              <th style={th}>Username</th><th style={th}>Role</th>
              <th style={th}>Permissions</th><th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No users</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.role === 'admin' ? '#3699ff' : '#3699ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                      {u.username[0].toUpperCase()}
                    </div>
                    <strong>{u.username}</strong>
                    {u.id === currentUser?.id && <span style={{ background: '#3699ff22', color: '#3699ff', fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8 }}>You</span>}
                  </div>
                </td>
                <td style={td}><span style={{ background: u.role === 'admin' ? '#3699ff22' : '#3699ff22', color: u.role === 'admin' ? '#3699ff' : '#3699ff', padding: '3px 10px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>{u.role}</span></td>
                <td style={td}>
                  {u.role === 'admin' ? (
                    <span style={{ color: '#aaa', fontStyle: 'italic', fontSize: '0.85rem' }}>Full access</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(u.permissions || '').split(',').filter(Boolean).map(p => (
                        <span key={p} style={{ background: '#f3f6f9', color: '#5e6278', fontSize: '0.72rem', fontWeight: 600, padding: '2px 6px', borderRadius: 6, border: '1px solid #e4e6ef' }}>{PERMISSION_LABELS[p] || p}</span>
                      ))}
                      {!u.permissions && <span style={{ color: '#f64e60', fontSize: '0.8rem' }}>No permissions</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => openEdit(u)} style={{ background: '#3699ff22', color: '#3699ff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }}>Edit</button>
                  {u.id !== currentUser?.id && <button onClick={() => handleDelete(u.id)} style={{ background: '#f64e6022', color: '#f64e60', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Del</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 700, fontSize: '1.1rem' }}>{editUser ? `Edit User: ${editUser.username}` : 'New User'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder={editUser ? '••••••••' : ''} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select value={role} onChange={e => { setRole(e.target.value); if (e.target.value === 'admin') setPermissions([]); }} style={inputStyle}>
                  <option value="admin">Admin (Full Access)</option>
                  <option value="operator">Operator (Limited)</option>
                </select>
              </div>
              {role === 'operator' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={labelStyle}>Permissions</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={setAllPerms} style={{ background: '#3699ff22', color: '#3699ff', border: 'none', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>All</button>
                      <button onClick={clearPerms} style={{ background: '#f64e6022', color: '#f64e60', border: 'none', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>None</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {ALL_PERMISSIONS.map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${permissions.includes(p) ? '#3699ff' : '#e4e6ef'}`, borderRadius: 6, cursor: 'pointer', background: permissions.includes(p) ? '#e8f9fc' : '#f9fafb', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={permissions.includes(p)} onChange={() => togglePerm(p)} style={{ accentColor: '#3699ff' }} />
                        {PERMISSION_LABELS[p]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', border: '1px solid #e4e6ef', background: '#f3f6f9', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '9px 24px' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef' };
const td = { padding: '10px 12px', color: '#3f4254' };
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#5e6278', textTransform: 'uppercase', marginBottom: 5 };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: '#f9fafb', boxSizing: 'border-box' };

export default UserManagement;
