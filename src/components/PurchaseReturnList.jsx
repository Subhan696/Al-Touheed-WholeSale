import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';

const { ipcRenderer } = window.require('electron');

function PurchaseReturnList({ currentUser, onEditReturn, isActive }) {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const version = useDataVersion('purchase-returns');

  useEffect(() => { load(); }, [version]);
  const load = async () => { try { setReturns(await ipcRenderer.invoke('get-purchase-returns') || []); } catch {} };

  const filtered = returns.filter(r =>
    !search || r.supplier_name?.toLowerCase().includes(search.toLowerCase()) || r.return_no?.toString().includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '2px solid #e4e6ef', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Purchase Returns ({filtered.length})</h2>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 240, fontFamily: 'inherit' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
            <tr>
              <th style={th}>Return No</th><th style={th}>Date</th><th style={th}>Supplier</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th><th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No returns</td></tr>
              : filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}><span style={{ fontWeight: 700, color: '#f64e60' }}>#{r.return_no}</span></td>
                  <td style={td}>{r.return_date instanceof Date ? r.return_date.toISOString().split('T')[0] : (typeof r.return_date === 'string' ? r.return_date.split('T')[0] : '')}</td>
                  <td style={td}>{r.supplier_name}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>PKR {parseFloat(r.total_amount).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {onEditReturn && <button onClick={() => onEditReturn(r)} style={{ background: '#3699ff', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }}>Edit</button>}
                    <button onClick={async () => { const conf = await ipcRenderer.invoke('confirm-dialog', 'Delete this return?'); if (conf) { await ipcRenderer.invoke('delete-purchase-return', r.id); load(); } }} style={{ background: '#f64e60', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Del</button>
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

export default PurchaseReturnList;
