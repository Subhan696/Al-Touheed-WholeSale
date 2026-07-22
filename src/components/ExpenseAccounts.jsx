import React, { useState, useEffect, useRef } from 'react';
import './NewItemForm.css'; // Reuse basic table styles

const { ipcRenderer } = window.require('electron');

export default function ExpenseAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [accountName, setAccountName] = useState('');
  const [defaultRate, setDefaultRate] = useState('');
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const rateRef = useRef(null);
  const nameRef = useRef(null);

  const loadData = async () => {
    try {
      const res = await ipcRenderer.invoke('get-expense-accounts');
      setAccounts(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    setTimeout(() => nameRef.current?.focus(), 100);
    const refresh = () => loadData();
    ipcRenderer.on('data-updated', (e, topic) => {
      if (topic === 'expense_accounts') refresh();
    });
    return () => {
      ipcRenderer.removeListener('data-updated', refresh);
    };
  }, []);

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 3000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!accountName.trim()) return;
    
    try {
      if (editId) {
        const res = await ipcRenderer.invoke('update-expense-account', { id: editId, account_name: accountName, default_rate: parseFloat(defaultRate) || 0 });
        if (res.success) {
            showMsg('Updated successfully');
            loadData();
        } else {
            showMsg(res.error || 'Failed to update', 'error');
        }
      } else {
        const res = await ipcRenderer.invoke('add-expense-account', { account_name: accountName, default_rate: parseFloat(defaultRate) || 0 });
        if (res.success) {
            showMsg('Added successfully');
            loadData();
        } else {
            showMsg(res.error || 'Failed to add', 'error');
        }
      }
      setAccountName('');
      setDefaultRate('');
      setEditId(null);
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch (err) {
      showMsg(err.message || 'Error saving', 'error');
    }
  };

  const handleEdit = (a) => {
    setEditId(a.id);
    setAccountName(a.account_name);
    setDefaultRate(String(a.default_rate));
  };

  const handleDelete = async (id) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this expense account?');
    if (!confirmed) return;
    try {
      const res = await ipcRenderer.invoke('delete-expense-account', id);
      if (!res.success) {
          showMsg(res.error || 'Cannot delete account. It might be in use.', 'error');
      } else {
          showMsg('Deleted successfully');
          loadData();
      }
    } catch(err) {
      showMsg('Cannot delete account. It is already in use by past purchases.', 'error');
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const handleCancel = () => {
    setEditId(null);
    setAccountName('');
    setDefaultRate('');
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 32, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Freight & Expenses</h2>
        <p style={{ color: '#64748b', margin: '8px 0 0 0', fontSize: '0.95rem' }}>Define default rates for cartons and other purchase expenses.</p>
      </div>
      
      {msg.text && (
        <div style={{ 
          marginBottom: 20, 
          padding: '12px 16px', 
          background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4', 
          color: msg.type === 'error' ? '#b91c1c' : '#15803d', 
          borderRadius: 6,
          border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
        </div>
      )}

      <div style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#334155', fontWeight: 600 }}>{editId ? 'Edit Account' : 'Add New Account'}</h3>
        </div>
        <form onSubmit={handleSave} style={{ display: 'flex', gap: 16, padding: 24, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Account Name</label>
            <input 
              ref={nameRef}
              type="text" 
              value={accountName}
              onChange={e => setAccountName(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  rateRef.current?.focus();
                }
              }}
              placeholder="e.g. FREIGHT CTN EXP"
              className="form-input"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
              required
              autoFocus
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Default Rate</label>
            <input 
              ref={rateRef}
              type="number" 
              value={defaultRate}
              onChange={e => setDefaultRate(e.target.value)}
              placeholder="e.g. 940"
              className="form-input right-text"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, height: 40 }}>
            <button type="submit" style={{ padding: '0 20px', background: editId ? '#f59e0b' : '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
              {editId ? 'Update' : 'Add Account'}
            </button>
            {editId && (
              <button type="button" onClick={handleCancel} style={{ padding: '0 20px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ width: 60, textAlign: 'center', padding: '12px 16px', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>#</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Account Name</th>
              <th style={{ width: 140, textAlign: 'right', padding: '12px 16px', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Default Rate</th>
              <th style={{ width: 160, textAlign: 'center', padding: '12px 16px', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, idx) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ textAlign: 'center', color: '#94a3b8', padding: '12px 16px' }}>{idx + 1}</td>
                <td style={{ fontWeight: 600, color: '#334155', padding: '12px 16px' }}>{a.account_name}</td>
                <td style={{ textAlign: 'right', color: '#0f172a', fontWeight: 700, padding: '12px 16px' }}>{parseFloat(a.default_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                  <button onClick={() => handleEdit(a)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', marginRight: 8, fontWeight: 600, fontSize: '0.85rem' }}>Edit</button>
                  <button onClick={() => handleDelete(a.id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Delete</button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚚</div>
                  <div>No expense accounts defined yet.</div>
                  <div style={{ fontSize: '0.9rem', marginTop: 4 }}>Add your first freight account above.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
