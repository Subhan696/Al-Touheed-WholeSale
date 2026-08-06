import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';

const { ipcRenderer } = window.require('electron');

const formatDateDMY = (val) => {
  if (!val) return '—';
  let rawStr = '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${d}-${m}-${y}`;
  }
  if (typeof val === 'string') {
    rawStr = val.split('T')[0];
  } else {
    rawStr = String(val).split('T')[0];
  }
  const parts = rawStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d) {
      return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
    }
  }
  return rawStr;
};

function PurchaseList({ currentUser, onEditPurchase, isActive }) {
  const [purchases, setPurchases] = useState([]);
  const [search, setSearch] = useState('');
  const version = useDataVersion('purchases');
  const [showBulkPost, setShowBulkPost] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkPass, setBulkPass] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const fromRef = React.useRef(null);
  const toRef = React.useRef(null);
  const passRef = React.useRef(null);

  useEffect(() => {
    if (showBulkPost) setTimeout(() => fromRef.current?.focus(), 50);
  }, [showBulkPost]);

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowBulkPost(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive]);

  useEffect(() => { load(); }, [version]);

  const load = async () => {
    try { setPurchases(await ipcRenderer.invoke('get-purchases') || []); } catch {}
  };

  const handleDelete = async (p) => {
    if (window.confirm(`Delete purchase #${p.id}?`)) {
      await ipcRenderer.invoke('delete-purchase', p.id);
      load();
    }
  };

  const handlePost = async (p) => {
    if (window.confirm(`Post purchase #${p.id}? Once posted, stock will be updated.`)) {
      await ipcRenderer.invoke('post-purchase', p.id);
      load();
    }
  };

  const handleBulkSubmit = async () => {
    if (!bulkFrom || !bulkTo || !bulkPass) {
      setBulkMsg('Error: Please fill all fields');
      return;
    }
    setIsPosting(true);
    const authCheck = await ipcRenderer.invoke('login', { username: currentUser.username, password: bulkPass });
    if (!authCheck.success) {
      setBulkMsg('Error: Incorrect password');
      setIsPosting(false);
      return;
    }
    const result = await ipcRenderer.invoke('post-purchase-bulk', { fromId: parseInt(bulkFrom), toId: parseInt(bulkTo) });
    if (result.success) {
      setToastMsg(`Successfully posted purchases from ID #${bulkFrom} to #${bulkTo}!`);
      setTimeout(() => setToastMsg(''), 3000);
      setShowBulkPost(false);
      setBulkFrom('');
      setBulkTo('');
      setBulkPass('');
      setBulkMsg('');
      load();
    }
    setIsPosting(false);
  };

  const filtered = purchases.filter(p =>
    !search || 
    p.supplier_name?.toLowerCase().includes(search.toLowerCase()) || 
    p.invoice_no?.toLowerCase().includes(search.toLowerCase()) ||
    p.blt_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '2px solid #e4e6ef', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Purchase List <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({filtered.length})</span></h2>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input placeholder="Search supplier, invoice or BLT #..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 280, fontFamily: 'inherit' }} />
          <button onClick={() => setShowBulkPost(true)} style={{ background: '#50cd89', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginLeft: 12 }}>Post Multiple (Ctrl+E)</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Date</th>
              <th style={th}>Invoice</th>
              <th style={th}>Supplier</th>
              <th style={{ ...th, textAlign: 'center' }}>Blt No.</th>
              <th style={{ ...th, textAlign: 'center' }}>Ctn Qty</th>
              <th style={{ ...th, textAlign: 'center' }}>Total Qty (Pcs)</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
              <th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No purchases</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontWeight: 'bold', color: '#3699ff' }}>#{p.id}</td>
                <td style={td}>{formatDateDMY(p.purchase_date || p.created_at)}</td>
                <td style={td}>{p.invoice_no || '—'}</td>
                <td style={td}>{p.supplier_name}</td>
                <td style={{ ...td, textAlign: 'center', color: '#555' }}>{p.blt_number || p.blt_no || p.bilty_no || '—'}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: '#555' }}>{p.ctn_qty || p.ctn_bag || 0}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: '#555' }}>{p.total_qty || 0}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>PKR {parseFloat(p.total_amount).toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {p.is_posted === 1 ? (
                    <span style={{ background: '#e8fff3', color: '#50cd89', padding: '4px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>Posted</span>
                  ) : (
                    <span style={{ background: '#fff4de', color: '#ffa800', padding: '4px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>Unposted</span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {onEditPurchase && <button onClick={() => onEditPurchase(p)} style={btnEdit}>Edit</button>}
                  <button onClick={() => handleDelete(p)} style={btnDel}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Post Modal */}
      {showBulkPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Post Multiple Purchases</h3>
            {bulkMsg && <div style={{ color: 'red', marginBottom: 12, fontSize: '0.9rem' }}>{bulkMsg}</div>}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: 4 }}>From ID</label>
                <input 
                  ref={fromRef}
                  type="number" 
                  value={bulkFrom} 
                  onChange={e => setBulkFrom(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); toRef.current?.focus(); }
                    if (e.key === 'Escape') { e.preventDefault(); setShowBulkPost(false); setBulkMsg(''); }
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: 4 }}>To ID</label>
                <input 
                  ref={toRef}
                  type="number" 
                  value={bulkTo} 
                  onChange={e => setBulkTo(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); passRef.current?.focus(); }
                    if (e.key === 'Escape') { e.preventDefault(); setShowBulkPost(false); setBulkMsg(''); }
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} 
                />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: 4 }}>Your Password</label>
              <input 
                ref={passRef}
                type="password" 
                value={bulkPass} 
                onChange={e => setBulkPass(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleBulkSubmit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setShowBulkPost(false); setBulkMsg(''); }
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowBulkPost(false); setBulkMsg(''); }} style={{ padding: '8px 12px', background: '#f1f1f1', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleBulkSubmit} style={{ padding: '8px 12px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} disabled={isPosting}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#50cd89', color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000, animation: 'fadeIn 0.3s ease' }}>
          {toastMsg}
        </div>
      )}

    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef' };
const td = { padding: '8px 12px', color: '#3f4254' };
const btnEdit = { background: '#3699ff', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 };
const btnDel = { background: '#f64e60', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 };

export default PurchaseList;
