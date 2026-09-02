import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';
import { printPurchaseReturn, savePurchaseReturnPDF } from '../utils/printPurchaseReturn';

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
    rawStr = val.split('T')[0].split(' ')[0];
  } else {
    rawStr = String(val).split('T')[0].split(' ')[0];
  }
  const parts = rawStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    }
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
  }
  return rawStr;
};

function PurchaseReturnList({ currentUser, onEditReturn, isActive }) {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const version = useDataVersion('purchase-returns');

  useEffect(() => { load(); }, [version]);
  const load = async () => { try { setReturns(await ipcRenderer.invoke('get-purchase-returns') || []); } catch {} };

  const handlePrintRow = async (r) => {
    try {
      const items = await ipcRenderer.invoke('get-purchase-return-items', r.id) || [];
      printPurchaseReturn(r, items);
    } catch (err) {
      console.error('Print error:', err);
    }
  };

  const handlePDFRow = async (r) => {
    try {
      const items = await ipcRenderer.invoke('get-purchase-return-items', r.id) || [];
      savePurchaseReturnPDF(r, items);
    } catch (err) {
      console.error('PDF error:', err);
    }
  };

  const filtered = returns.filter(r =>
    !search ||
    r.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.return_no?.toString().includes(search) ||
    r.blt_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '2px solid #e4e6ef', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Purchase Returns ({filtered.length})</h2>
        <input placeholder="Search supplier, return # or BLT #..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 280, fontFamily: 'inherit' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa', zIndex: 10 }}>
            <tr>
              <th style={th}>Return No</th>
              <th style={th}>Date</th>
              <th style={th}>Supplier</th>
              <th style={th}>BLT No</th>
              <th style={{ ...th, textAlign: 'center' }}>CTN Qty</th>
              <th style={{ ...th, textAlign: 'center' }}>Total Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Total Amount</th>
              <th style={{ ...th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>No returns found</td></tr>
              : filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}><span style={{ fontWeight: 700, color: '#f64e60' }}>#{r.return_no ? r.return_no.toString().replace(/^PR-/, '') : ''}</span></td>
                  <td style={td}>{formatDateDMY(r.return_date || r.created_at)}</td>
                  <td style={td}>{r.supplier_name}</td>
                  <td style={td}>{r.blt_number || '—'}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{r.ctn_qty || 0}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>{r.total_qty || 0}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>PKR {parseFloat(r.total_amount).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => handlePrintRow(r)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }} title="Print Purchase Return">🖨️ Print</button>
                    <button onClick={() => handlePDFRow(r)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }} title="Save PDF">📄 PDF</button>
                    {onEditReturn && <button onClick={() => onEditReturn(r)} style={{ background: '#ffa800', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 4 }}>Edit</button>}
                    <button onClick={async () => {
                      if (currentUser?.role !== 'superadmin') {
                        await ipcRenderer.invoke('alert-dialog', '🔒 Permission Denied: Only Super Admin can delete purchase returns.');
                        return;
                      }
                      const conf = await ipcRenderer.invoke('confirm-dialog', 'Delete this return?');
                      if (conf) { await ipcRenderer.invoke('delete-purchase-return', r.id); load(); }
                    }} style={{ background: '#f64e60', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Del</button>
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
