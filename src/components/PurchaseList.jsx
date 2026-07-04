import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';

const { ipcRenderer } = window.require('electron');

function PurchaseList({ onEditPurchase, isActive }) {
  const [purchases, setPurchases] = useState([]);
  const [search, setSearch] = useState('');
  const version = useDataVersion('purchases');

  useEffect(() => { load(); }, [version]);

  const load = async () => {
    try { setPurchases(await ipcRenderer.invoke('get-purchases') || []); } catch {}
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete purchase from "${p.supplier_name}"?`)) return;
    await ipcRenderer.invoke('delete-purchase', p.id);
    load();
  };

  const filtered = purchases.filter(p =>
    !search || p.supplier_name?.toLowerCase().includes(search.toLowerCase()) || p.invoice_no?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '2px solid #e4e6ef', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Purchase List <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({filtered.length})</span></h2>
        <input placeholder="Search supplier or invoice..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 260, fontFamily: 'inherit' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Invoice</th>
              <th style={th}>Supplier</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No purchases</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>{p.purchase_date?.split('T')[0]}</td>
                <td style={td}>{p.invoice_no || '—'}</td>
                <td style={td}>{p.supplier_name}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>PKR {parseFloat(p.total_amount).toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {onEditPurchase && <button onClick={() => onEditPurchase(p)} style={btnEdit}>Edit</button>}
                  <button onClick={() => handleDelete(p)} style={btnDel}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef' };
const td = { padding: '8px 12px', color: '#3f4254' };
const btnEdit = { background: '#3699ff', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 };
const btnDel = { background: '#f64e60', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 };

export default PurchaseList;
