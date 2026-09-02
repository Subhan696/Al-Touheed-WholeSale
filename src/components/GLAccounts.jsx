import React, { useState, useEffect } from 'react';
import './GL.css';

const { ipcRenderer } = window.require('electron');

export default function GLAccounts({ currentUser }) {
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ id: null, account_name: '', short_name: '', account_type: 'Bank', opening_balance: 0, balance_type: 'Dr' });
  const [searchTerm, setSearchTerm] = useState('');

  const accountTypes = ['Bank', 'Cash', 'Supplier', 'Customer', 'Expense', 'Income', 'Equity'];

  useEffect(() => {
    fetchAccounts();
    const handleUpdate = () => fetchAccounts();
    ipcRenderer.on('gl-accounts', handleUpdate);
    return () => ipcRenderer.removeListener('gl-accounts', handleUpdate);
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await ipcRenderer.invoke('get-gl-accounts');
      setAccounts(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await ipcRenderer.invoke('update-gl-account', formData);
      } else {
        await ipcRenderer.invoke('add-gl-account', formData);
      }
      setShowForm(false);
      setFormData({ id: null, account_name: '', short_name: '', account_type: 'Bank', opening_balance: 0, balance_type: 'Dr' });
      fetchAccounts();
    } catch (err) {
      alert('Error saving account: ' + err.message);
    }
  };

  const normalizeBalanceType = (bt) => {
    const s = String(bt || 'Dr').replace(/\./g, '').trim().toUpperCase();
    return s.startsWith('C') ? 'Cr' : 'Dr';
  };

  const handleEdit = (acc) => {
    setFormData({
      id: acc.id,
      account_name: acc.account_name || '',
      short_name: acc.short_name || '',
      account_type: acc.account_type || 'Expense',
      opening_balance: acc.opening_balance ?? 0,
      balance_type: normalizeBalanceType(acc.balance_type),
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (currentUser?.role !== 'superadmin') {
      await ipcRenderer.invoke('alert-dialog', '🔒 Permission Denied: Only Super Admin can delete accounts.');
      return;
    }
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Are you sure you want to delete this account?');
    if (confirmed) {
      try {
        await ipcRenderer.invoke('delete-gl-account', id);
        fetchAccounts();
      } catch (err) {
        await ipcRenderer.invoke('alert-dialog', 'Cannot delete account (it might be used in vouchers).');
      }
    }
  };

  const filtered = accounts.filter(a => {
    const q = searchTerm.toLowerCase();
    return (a.account_name || '').toLowerCase().includes(q) || (a.short_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-4 bg-slate-50 flex flex-col h-full" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div className="flex-none">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-slate-800">Chart of Accounts</h1>
          <button 
            onClick={() => { setShowForm(true); setFormData({ id: null, account_name: '', short_name: '', account_type: 'Bank', opening_balance: 0, balance_type: 'Dr' }); }}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
          >
            Add New Account
          </button>
        </div>

        {showForm && (
          <div className="bg-white p-4 rounded shadow mb-4 border border-slate-200">
            <h2 className="text-xl font-bold mb-4">{formData.id ? 'Edit' : 'Add'} Account</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Account Name *</label>
                <input required type="text" value={formData.account_name} onChange={e => setFormData({...formData, account_name: e.target.value.toUpperCase()})} className="w-full border p-2 rounded focus:outline-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Short Name / Code (Cashier Display)</label>
                <input type="text" value={formData.short_name} onChange={e => setFormData({...formData, short_name: e.target.value.toUpperCase()})} placeholder="e.g. MEEZAN, HBL, MCB" className="w-full border p-2 rounded focus:outline-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Account Type *</label>
                <select value={formData.account_type} onChange={e => setFormData({...formData, account_type: e.target.value})} className="w-full border p-2 rounded focus:outline-blue-500">
                  {accountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Opening Balance</label>
                <input type="number" step="0.01" value={formData.opening_balance} onChange={e => setFormData({...formData, opening_balance: e.target.value})} className="w-full border p-2 rounded focus:outline-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Balance Type</label>
                <select value={formData.balance_type} onChange={e => setFormData({...formData, balance_type: e.target.value})} className="w-full border p-2 rounded focus:outline-blue-500">
                  <option value="Dr">Debit (Dr)</option>
                  <option value="Cr">Credit (Cr)</option>
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 border rounded hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Save Account</button>
              </div>
            </form>
          </div>
        )}

        <div className="mb-4">
          <input type="text" placeholder="Search accounts or short names..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full md:w-1/3 border p-2 rounded shadow-sm focus:outline-blue-500" />
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-y-auto flex-1 border border-slate-200">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-slate-800 text-white sticky top-0 z-10">
            <tr>
              <th className="py-2 px-4 text-left bg-slate-800 sticky top-0 z-10">ID</th>
              <th className="py-2 px-4 text-left bg-slate-800 sticky top-0 z-10">Account Name</th>
              <th className="py-2 px-4 text-left bg-slate-800 sticky top-0 z-10">Short Code</th>
              <th className="py-2 px-4 text-left bg-slate-800 sticky top-0 z-10">Type</th>
              <th className="py-2 px-4 text-right bg-slate-800 sticky top-0 z-10">Opening Bal</th>
              <th className="py-2 px-4 text-center bg-slate-800 sticky top-0 z-10">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(acc => (
              <tr key={acc.id} className="border-b hover:bg-slate-50">
                <td className="py-2 px-4">{acc.id}</td>
                <td className="py-2 px-4 font-semibold text-blue-700">{acc.account_name}</td>
                <td className="py-2 px-4 font-bold text-slate-700">
                  {acc.short_name ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-extrabold">{acc.short_name}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 px-4">{acc.account_type}</td>
                <td className="py-2 px-4 text-right">{Number(acc.opening_balance || 0).toLocaleString()} {acc.balance_type}</td>
                <td className="py-2 px-4 text-center">
                  <button onClick={() => handleEdit(acc)} className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button onClick={() => handleDelete(acc.id)} className="text-red-600 hover:underline">Del</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" className="text-center py-4 text-slate-500">No accounts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
