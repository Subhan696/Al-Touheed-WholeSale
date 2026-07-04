import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';
import './StockList.css';

const { ipcRenderer } = window.require('electron');

function StockList({ isActive, currentUser }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [adjItem, setAdjItem] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const stockVer = useDataVersion('stock');
  const productVer = useDataVersion('products');

  useEffect(() => { loadStock(); }, [stockVer, productVer]);

  const loadStock = async () => {
    try { setItems(await ipcRenderer.invoke('get-stock-list') || []); } catch {}
  };

  const handleAdjust = async () => {
    if (!adjItem || !adjQty) return;
    await ipcRenderer.invoke('adjust-stock', { itemCode: adjItem.item_code, qty: parseInt(adjQty), notes: adjNotes });
    setAdjItem(null); setAdjQty(''); setAdjNotes('');
    loadStock();
  };

  const filtered = items.filter(p =>
    !search || p.item_code.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase())
  );

  const canAdjust = currentUser?.role === 'admin' || (currentUser?.permissions || []).includes('manage_products');

  const chipClass = (stock) => stock > 5 ? 'chip-ok' : stock > 0 ? 'chip-low' : 'chip-zero';

  return (
    <div className="stock-container">
      <div className="stock-header">
        <h2>Stock Inventory</h2>
        <input className="search-bar" placeholder="Search item code or description..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', width: 260, fontFamily: 'inherit' }} />
        <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{filtered.length} items</span>
      </div>
      <div className="stock-table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Size Range</th>
              <th style={{ textAlign: 'right' }}>Purch. Rate</th>
              <th style={{ textAlign: 'right' }}>Sale Rate</th>
              <th style={{ textAlign: 'center' }}>Stock (Packets)</th>
              {canAdjust && <th style={{ textAlign: 'center' }}>Adjust</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={canAdjust ? 8 : 7} style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>No items</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3699ff' }}>{p.item_code}</span></td>
                <td>{p.description}</td>
                <td>{p.category}</td>
                <td>{p.size_range || '—'}</td>
                <td style={{ textAlign: 'right' }}>PKR {parseFloat(p.purchase_rate).toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>PKR {parseFloat(p.sale_rate).toLocaleString()}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`stock-chip ${chipClass(p.stock_packets)}`}>{p.stock_packets} pkts</span>
                </td>
                {canAdjust && (
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => setAdjItem(p)} style={{ background: '#ffa800', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>± Adjust</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjItem && (
        <div className="adj-modal" onClick={() => setAdjItem(null)}>
          <div className="adj-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700 }}>Adjust Stock</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#7e8299' }}>{adjItem.item_code} — {adjItem.description}</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5e6278', display: 'block', marginBottom: 4 }}>Packets (+ to add, - to remove)</label>
              <input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="e.g. +10 or -5"
                style={{ width: '100%', padding: '10px', border: '1px solid #e4e6ef', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit' }} autoFocus />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5e6278', display: 'block', marginBottom: 4 }}>Notes</label>
              <input type="text" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Reason for adjustment..."
                style={{ width: '100%', padding: '10px', border: '1px solid #e4e6ef', borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAdjItem(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdjust}>Save Adjustment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockList;
