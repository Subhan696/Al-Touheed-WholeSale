import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

const ALL_PERMISSIONS = [
  'manage_products', 'view_products', 'view_stock',
  'manage_purchases', 'view_purchases', 'manage_purchase_returns',
  'create_sale', 'view_sales', 'manage_sales_returns',
  'view_reports', 'manage_users', 'use_master_cashier'
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
  use_master_cashier: 'Master Cashier Window'
};

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [permissions, setPermissions] = useState([]);
  const [email, setEmail] = useState('');
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Gmail SMTP settings (admin only)
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [gmailAddress, setGmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [emailTestStatus, setEmailTestStatus] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  useEffect(() => { load(); loadEmailSettings(); }, []);
  const load = async () => { try { setUsers(await ipcRenderer.invoke('get-users') || []); } catch { } };
  const loadEmailSettings = async () => {
    try {
      const s = await ipcRenderer.invoke('get-email-settings');
      if (s) { setGmailAddress(s.gmailAddress || ''); setAppPassword(s.appPassword || ''); }
    } catch { }
  };

  const openAdd = () => { setEditUser(null); setUsername(''); setPassword(''); setRole('operator'); setPermissions([]); setEmail(''); setOtpEnabled(false); setShowForm(true); };
  const openEdit = (u) => {
    setEditUser(u); setUsername(u.username); setPassword(''); setRole(u.role);
    setPermissions(u.permissions ? u.permissions.split(',').filter(Boolean) : []);
    setEmail(u.email || '');
    setOtpEnabled(u.otp_enabled || false);
    setShowForm(true);
  };

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const setAllPerms = () => setPermissions([...ALL_PERMISSIONS]);
  const clearPerms = () => setPermissions([]);

  const handleSave = async () => {
    if (!username) { setStatusMsg('❌ Username required'); setTimeout(() => setStatusMsg(''), 3000); return; }
    if (!editUser && !password) { setStatusMsg('❌ Password required for new user'); setTimeout(() => setStatusMsg(''), 3000); return; }
    if (otpEnabled && !email) { setStatusMsg('❌ Email required when OTP is enabled'); setTimeout(() => setStatusMsg(''), 3000); return; }
    const payload = { username, role, permissions: permissions.join(','), email, otpEnabled };
    if (password) payload.password = password;
    const result = editUser
      ? await ipcRenderer.invoke('update-user', { ...payload, id: editUser.id })
      : await ipcRenderer.invoke('create-user', payload);
    if (result.success) { setShowForm(false); load(); setStatusMsg('✅ Saved'); setTimeout(() => setStatusMsg(''), 3000); }
    else { setStatusMsg(`❌ ${result.error}`); setTimeout(() => setStatusMsg(''), 3000); }
  };

  const handleDelete = async (user) => {
    if (currentUser?.role !== 'superadmin') {
      await ipcRenderer.invoke('alert-dialog', '🔒 Permission Denied: Only Super Admin can delete user accounts.');
      return;
    }
    if (user.id === currentUser?.id) { await ipcRenderer.invoke('alert-dialog', 'Cannot delete your own account.'); return; }
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this user?');
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-user', user.id);
    load();
  };

  const handleSaveEmailSettings = async () => {
    setIsSavingEmail(true);
    await ipcRenderer.invoke('save-email-settings', { gmailAddress, appPassword });
    setIsSavingEmail(false);
    setEmailTestStatus('✅ Settings saved');
    setTimeout(() => setEmailTestStatus(''), 3000);
  };

  const handleTestEmail = async () => {
    if (!gmailAddress || !appPassword) { setEmailTestStatus('❌ Fill in Gmail address and App Password first'); setTimeout(() => setEmailTestStatus(''), 3000); return; }
    setIsTesting(true);
    setEmailTestStatus('📧 Sending test email...');
    const result = await ipcRenderer.invoke('test-email-settings', { gmailAddress, appPassword });
    setIsTesting(false);
    if (result.success) { setEmailTestStatus('✅ Test email sent successfully!'); }
    else { setEmailTestStatus(`❌ ${result.error}`); }
    setTimeout(() => setEmailTestStatus(''), 5000);
  };

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isAdmin = currentUser?.role === 'admin' || isSuperAdmin;

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
        <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Admin Access Required</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
          Only <strong>Admin</strong> and <strong>Super Admin</strong> accounts can access User Management.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>User Management ({users.length})</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusMsg && <span style={{ color: statusMsg.includes('❌') ? '#f64e60' : '#3699ff', fontWeight: 600 }}>{statusMsg}</span>}
          {isSuperAdmin && (
            <button className="btn" onClick={() => setShowEmailSettings(!showEmailSettings)} style={{ background: '#f3f6f9', border: '1px solid #e4e6ef', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', padding: '7px 14px', borderRadius: 6, fontFamily: 'inherit' }}>
              📧 Gmail Settings
            </button>
          )}
          {isSuperAdmin && <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>}
        </div>
      </div>

      {/* Gmail SMTP Settings */}
      {isSuperAdmin && showEmailSettings && (
        <div style={{ background: '#f8f9ff', border: '1px solid #d0d5f7', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#3f4254' }}>📧 Gmail SMTP Settings (for OTP)</h3>
            <button onClick={() => setShowEmailSettings(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
          <p style={{ margin: 0, color: '#888', fontSize: '0.82rem' }}>
            Use a <strong>Gmail App Password</strong> (not your regular password). Generate one at{' '}
            <span style={{ color: '#3699ff', fontWeight: 600 }}>myaccount.google.com/apppasswords</span>
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Gmail Address</label>
              <input type="email" value={gmailAddress} onChange={e => setGmailAddress(e.target.value)} style={inputStyle} placeholder="yourname@gmail.com" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>App Password</label>
              <input type="password" value={appPassword} onChange={e => setAppPassword(e.target.value)} style={inputStyle} placeholder="xxxx xxxx xxxx xxxx" />
            </div>
            <button onClick={handleSaveEmailSettings} disabled={isSavingEmail} style={{ ...btnStyle, background: '#3699ff', color: '#fff' }}>
              {isSavingEmail ? 'Saving...' : '💾 Save'}
            </button>
            <button onClick={handleTestEmail} disabled={isTesting} style={{ ...btnStyle, background: '#28a74522', color: '#28a745', border: '1px solid #28a745' }}>
              {isTesting ? 'Sending...' : '🧪 Test'}
            </button>
          </div>
          {emailTestStatus && (
            <div style={{ color: emailTestStatus.includes('❌') ? '#f64e60' : emailTestStatus.includes('📧') ? '#888' : '#28a745', fontWeight: 600, fontSize: '0.85rem' }}>
              {emailTestStatus}
            </div>
          )}
        </div>
      )}

      {/* Users table */}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
            <tr>
              <th style={th}>Username</th><th style={th}>Role</th>
              <th style={th}>Email</th><th style={th}>OTP</th>
              <th style={th}>Permissions</th><th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No users</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.role === 'superadmin' ? '#b45309' : u.role === 'admin' ? '#0284c7' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                      {u.username[0].toUpperCase()}
                    </div>
                    <strong>{u.username}</strong>
                    {u.id === currentUser?.id && <span style={{ background: '#3699ff22', color: '#3699ff', fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8 }}>You</span>}
                  </div>
                </td>
                <td style={td}>
                  {u.role === 'superadmin' ? (
                    <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 800 }}>⚡ SUPER ADMIN</span>
                  ) : u.role === 'admin' ? (
                    <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 10px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 800 }}>💼 ADMIN</span>
                  ) : (
                    <span style={{ background: '#f3f6f9', color: '#5e6278', border: '1px solid #e4e6ef', padding: '3px 10px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700 }}>👤 OPERATOR</span>
                  )}
                </td>
                <td style={td}>
                  <span style={{ color: u.email ? '#3f4254' : '#ccc', fontSize: '0.85rem' }}>
                    {u.email || '—'}
                  </span>
                </td>
                <td style={td}>
                  {u.otp_enabled ? (
                    <span style={{ background: '#28a74522', color: '#28a745', padding: '3px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}>ON</span>
                  ) : (
                    <span style={{ color: '#ccc', fontSize: '0.8rem' }}>OFF</span>
                  )}
                </td>
                <td style={td}>
                  {u.role === 'superadmin' ? (
                    <span style={{ color: '#b45309', fontWeight: 700, fontStyle: 'italic', fontSize: '0.85rem' }}>⚡ Master System Control</span>
                  ) : u.role === 'admin' ? (
                    <span style={{ color: '#0369a1', fontWeight: 700, fontStyle: 'italic', fontSize: '0.85rem' }}>💼 Operational Full Access</span>
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
                  {isSuperAdmin ? (
                    <>
                      <button onClick={() => openEdit(u)} style={{ background: '#3699ff22', color: '#3699ff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }}>Edit</button>
                      {u.id !== currentUser?.id && <button onClick={() => handleDelete(u.id)} style={{ background: '#f64e6022', color: '#f64e60', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Del</button>}
                    </>
                  ) : u.id === currentUser?.id ? (
                    <button onClick={() => openEdit(u)} style={{ background: '#3699ff22', color: '#3699ff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Edit My Profile</button>
                  ) : (
                    <span style={{ color: '#aaa', fontSize: '0.8rem', fontStyle: 'italic' }}>Protected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 700, fontSize: '1.1rem' }}>{editUser ? (editUser.id === currentUser?.id ? `Edit My Profile (${editUser.username})` : `Edit User: ${editUser.username}`) : 'New User'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder={editUser ? '••••••••' : ''} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Email (for OTP)</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="user@example.com" />
                </div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select value={role} disabled={!isSuperAdmin} onChange={e => {
                    setRole(e.target.value);
                    if (e.target.value === 'superadmin' || e.target.value === 'admin') setPermissions(permissions.filter(p => p === 'use_master_cashier'));
                  }} style={{ ...inputStyle, opacity: !isSuperAdmin ? 0.7 : 1, cursor: !isSuperAdmin ? 'not-allowed' : 'pointer' }}>
                    <option value="superadmin">⚡ Super Admin (Master System Control)</option>
                    <option value="admin">💼 Admin (Store Manager)</option>
                    <option value="operator">👤 Operator (Limited Permissions)</option>
                  </select>
                </div>
              </div>

              {/* OTP Toggle */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `2px solid ${otpEnabled ? '#28a745' : '#e4e6ef'}`, borderRadius: 8, cursor: 'pointer', background: otpEnabled ? '#28a74510' : '#f9fafb', fontSize: '0.88rem', fontWeight: 600, transition: 'all 0.2s' }}>
                  <input type="checkbox" checked={otpEnabled} onChange={() => setOtpEnabled(!otpEnabled)} style={{ accentColor: '#28a745', width: 18, height: 18 }} />
                  🔐 Enable OTP Login
                </label>
                {otpEnabled && !email && <span style={{ color: '#f64e60', fontSize: '0.8rem', fontWeight: 600 }}>⚠️ Email required</span>}
              </div>

              {/* Master Cashier checkbox - always visible */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${permissions.includes('use_master_cashier') ? '#3699ff' : '#e4e6ef'}`, borderRadius: 6, cursor: 'pointer', background: permissions.includes('use_master_cashier') ? '#e8f9fc' : '#f9fafb', fontSize: '0.85rem', width: 'fit-content' }}>
                  <input type="checkbox" checked={permissions.includes('use_master_cashier')} onChange={() => togglePerm('use_master_cashier')} style={{ accentColor: '#3699ff' }} />
                  Enable Master Cashier Window (Grid Layout)
                </label>
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
                    {ALL_PERMISSIONS.filter(p => p !== 'use_master_cashier').map(p => (
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
const btnStyle = { padding: '9px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' };

export default UserManagement;
