import React, { useState, useEffect, useMemo } from 'react';
import { useDataVersion } from '../context/DataContext';
import './StockList.css';
import './ProductList.css';

const { ipcRenderer } = window.require('electron');

function StockList({ isActive, currentUser }) {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ search: '', brand: '', category: '', size: '' });
  const [debouncedFilters, setDebouncedFilters] = useState({ search: '', brand: '', category: '', size: '' });
  const [adjItem, setAdjItem] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const stockVer = useDataVersion('stock');
  const productVer = useDataVersion('products');

  useEffect(() => { loadStock(); }, [stockVer, productVer]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => clearTimeout(handler);
  }, [filters]);

  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-stock-list-chunked', { limit: 100, offset: 0 });
      if (res && res.items) {
        setItems(res.items);
        setLoading(false);
        if (res.total > 100) {
          const remaining = await ipcRenderer.invoke('get-stock-list');
          setItems(remaining || []);
        }
      }
    } catch {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjItem || adjQty === '') return;
    const newQty = parseInt(adjQty);
    if (isNaN(newQty)) return;
    const difference = newQty - adjItem.stock_packets;
    if (difference === 0) {
      setAdjItem(null); setAdjQty(''); setAdjNotes('');
      return;
    }
    await ipcRenderer.invoke('adjust-stock', { itemCode: adjItem.item_code, qty: difference, notes: adjNotes || `Set stock to ${newQty}` });
    setAdjItem(null); setAdjQty(''); setAdjNotes('');
    loadStock();
  };

  const filtered = useMemo(() => {
    const s = debouncedFilters.search.toLowerCase();
    const b = debouncedFilters.brand.toLowerCase();
    const c = debouncedFilters.category.toLowerCase();
    const sz = debouncedFilters.size.toLowerCase();

    let res = items.filter(p => {
      if (s && !p.item_code.toLowerCase().includes(s) && !(p.description || '').toLowerCase().includes(s)) return false;
      if (b && !(p.brand || '').toLowerCase().includes(b)) return false;
      if (c && !(p.category || '').toLowerCase().includes(c)) return false;
      if (sz && !(p.size_range || '').toLowerCase().includes(sz)) return false;
      return true;
    });

    if (s) {
      res.sort((a, b) => {
        const aCode = a.item_code.toLowerCase();
        const bCode = b.item_code.toLowerCase();
        if (aCode === s && bCode !== s) return -1;
        if (bCode === s && aCode !== s) return 1;
        const aStarts = aCode.startsWith(s);
        const bStarts = bCode.startsWith(s);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        return 0;
      });
    }

    return res;
  }, [items, debouncedFilters]);

  const totalStockValue = useMemo(() => {
    return filtered.reduce((sum, p) => sum + (p.stock_packets * (parseFloat(p.purchase_rate) || 0)), 0);
  }, [filtered]);

  const canAdjust = currentUser?.role === 'admin' || (currentUser?.permissions || []).includes('manage_products');

  const chipClass = (stock) => stock > 5 ? 'chip-ok' : stock > 0 ? 'chip-low' : 'chip-zero';

  return (
    <div className="product-list-container">
      <div className="list-header">
        <h2>Stock Inventory</h2>
        <div className="search-filters-group">
          <input className="search-bar" placeholder="Search item code or desc..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          <input className="filter-bar" placeholder="Brand..." value={filters.brand} onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))} />
          <input className="filter-bar" placeholder="Category..." value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} />
          <input className="filter-bar" placeholder="Size..." value={filters.size} onChange={e => setFilters(f => ({ ...f, size: e.target.value }))} />
          <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 600, marginLeft: '8px' }}>
            {filtered.length > 100 ? `Showing top 100 of ${filtered.length} items` : `${filtered.length} items`}
            <span style={{ marginLeft: 16, color: '#2563eb' }}>
              Total Value: PKR {totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Size Range</th>
              <th className="text-right">Purch. Rate</th>
              <th className="text-right">Sale Rate</th>
              <th className="text-center">Stock (Pcs)</th>
              <th className="text-right">Stock Value</th>
              {canAdjust && <th className="text-center">Adjust</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canAdjust ? 9 : 8} className="empty-state" style={{ padding: '40px 0' }}>Loading stock data...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={canAdjust ? 9 : 8} className="empty-state">No items found</td></tr>
            ) : filtered.slice(0, 100).map(p => (
              <tr key={p.id}>
                <td><span className="badge badge-code">{p.item_code}</span></td>
                <td>{p.description}</td>
                <td><span className="badge badge-cat">{p.category || '—'}</span></td>
                <td>{p.size_range || '—'}</td>
                <td className="text-right">PKR {parseFloat(p.purchase_rate).toLocaleString()}</td>
                <td className="text-right" style={{ color: '#16a34a', fontWeight: 600 }}>PKR {parseFloat(p.sale_rate).toLocaleString()}</td>
                <td className="text-center">
                  <span className={`stock-chip ${chipClass(p.stock_packets)}`}>{p.stock_packets}</span>
                </td>
                <td className="text-right" style={{ fontWeight: 600 }}>
                  PKR {(p.stock_packets * (parseFloat(p.purchase_rate) || 0)).toLocaleString()}
                </td>
                {canAdjust && (
                  <td className="text-center">
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
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5e6278', display: 'block', marginBottom: 4 }}>New Stock Qty</label>
              <input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder={`Current: ${adjItem.stock_packets}`}
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

export default React.memo(StockList);
