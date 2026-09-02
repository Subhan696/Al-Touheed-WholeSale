import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';
import { getLocalDateString } from '../utils/dateUtils';
import SuccessAnimation from './SuccessAnimation';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState(() => getLocalDateString());
  const [showAll, setShowAll] = useState(false);
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

  useEffect(() => { load(); }, [version, filterDate, showAll]);

  const load = async () => {
    setLoading(true);
    try {
      const payload = showAll ? {} : { startDate: filterDate, endDate: filterDate };
      const res = await ipcRenderer.invoke('get-purchases', payload) || [];
      setPurchases(res);
    } catch { } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (p) => {
    if (currentUser?.role !== 'superadmin') {
      await ipcRenderer.invoke('alert-dialog', '🔒 Permission Denied: Only Super Admin can delete purchases.');
      return;
    }
    const confirmed = await ipcRenderer.invoke('confirm-dialog', `Delete purchase #${p.id}?`);
    if (confirmed) {
      await ipcRenderer.invoke('delete-purchase', p.id);
      load();
    }
  };

  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [animMeta, setAnimMeta] = useState({ title: 'Purchase Posted!', subtitle: 'Stock updated successfully ✓' });

  const handlePost = async (p) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', `Post purchase #${p.id}? Once posted, stock will be updated.`);
    if (confirmed) {
      await ipcRenderer.invoke('post-purchase', p.id);
      setAnimMeta({ title: 'Purchase Posted!', subtitle: `Purchase #${p.id} posted & stock updated ✓` });
      setShowSuccessAnim(true);
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
      setAnimMeta({ title: 'Purchases Posted!', subtitle: `Bulk stock updated from #${bulkFrom} to #${bulkTo} ✓` });
      setShowSuccessAnim(true);
      setShowBulkPost(false);
      setBulkFrom('');
      setBulkTo('');
      setBulkPass('');
      setBulkMsg('');
      load();
    }
    setIsPosting(false);
  };

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return purchases.filter(p => {
      const matchSearch = !q ||
        p.supplier_name?.toLowerCase().includes(q) ||
        p.invoice_no?.toLowerCase().includes(q) ||
        p.blt_number?.toLowerCase().includes(q) ||
        String(p.id).includes(q);

      return matchSearch;
    });
  }, [purchases, search]);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '2px solid #e4e6ef', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
          Purchase List <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 500 }}>({filtered.length} {showAll ? 'total' : `on ${formatDateDMY(filterDate)}`})</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Search supplier, invoice or BLT #..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 240, fontFamily: 'inherit' }} />
          <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setShowAll(false); }} style={{ padding: '6px 10px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit' }} />
          <button onClick={() => setShowAll(true)} className="btn btn-secondary" style={{ height: 34, fontSize: '0.85rem', background: showAll ? '#3699ff' : '#e4e6ef', color: showAll ? '#fff' : '#3f4254' }}>Retrieve All</button>
          <button onClick={load} className="btn btn-secondary" style={{ height: 34, fontSize: '0.85rem' }}>🔄 Refresh</button>
          <button onClick={() => setShowBulkPost(true)} className="btn" style={{ background: '#50cd89', color: '#fff', height: 34, fontSize: '0.85rem', fontWeight: 600 }}>Post Multiple (Ctrl+E)</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa', zIndex: 1 }}>
            <tr>
              <th style={{ ...th, width: 70 }}>ID</th>
              <th style={{ ...th, width: 100 }}>Date</th>
              <th style={{ ...th, width: 85 }}>Invoice</th>
              <th style={th}>Supplier</th>
              <th style={{ ...th, textAlign: 'center', width: 90 }}>Blt No.</th>
              <th style={{ ...th, textAlign: 'center', width: 75 }}>Ctn Qty</th>
              <th style={{ ...th, textAlign: 'center', width: 100 }}>Total Qty (Pcs)</th>
              <th style={{ ...th, textAlign: 'right', width: 120 }}>Total</th>
              <th style={{ ...th, textAlign: 'center', width: 90 }}>Status</th>
              <th style={{ ...th, textAlign: 'center', width: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 60, textAlign: 'center', color: '#888', fontWeight: 600 }}>Loading purchases...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No purchases</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontWeight: 'bold', color: '#3699ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{p.id}</td>
                <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDateDMY(p.purchase_date || p.created_at)}</td>
                <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.invoice_no || '—'}</td>
                <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.supplier_name}</td>
                <td style={{ ...td, textAlign: 'center', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.blt_number || p.blt_no || p.bilty_no || '—'}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: '#555' }}>{p.ctn_qty || p.ctn_bag || 0}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: '#555' }}>{p.total_qty || 0}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{parseFloat(p.total_amount).toLocaleString()}</td>
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

      <SuccessAnimation
        show={showSuccessAnim}
        title={animMeta.title}
        subtitle={animMeta.subtitle}
        onClose={() => setShowSuccessAnim(false)}
      />

    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef' };
const td = { padding: '8px 12px', color: '#3f4254' };
const btnEdit = { background: '#3699ff', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 };
const btnDel = { background: '#f64e60', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 };

export default PurchaseList;
