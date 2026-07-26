import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SalesList.css';

const { ipcRenderer } = window.require('electron');

function SalesList({ currentUser, onEditSale, onNewSale, onExit, isActive }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRowRef = useRef(null);

  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (isActive) {
      load();
    }
  }, [isActive]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('get-sales');
      setRows(data || []);
    } catch {}
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter(r => {
      const matchSearch = !search || 
        (r.invoice_no || '').toLowerCase().includes(s) ||
        (r.customer_name || '').toLowerCase().includes(s);

      const dateStr = r.sale_date instanceof Date 
        ? new Date(r.sale_date.getTime() - r.sale_date.getTimezoneOffset() * 60000).toISOString().split('T')[0] 
        : (typeof r.sale_date === 'string' ? r.sale_date.split('T')[0] : '');
      const matchDate = showAll || dateStr === filterDate;

      return matchSearch && matchDate;
    });
  }, [rows, search, filterDate, showAll]);

  // total_amount in DB is already the Grand Total (subTotal - discount + miscCharges)
  const netAmount = (r) => Math.max(0, parseFloat(r.total_amount) || 0);

  const total = filtered.reduce((sum, r) => sum + netAmount(r), 0);
  const totalPackets = filtered.reduce((sum, r) => sum + (parseInt(r.total_packets) || 0), 0);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isActive) return;
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (onEditSale && filtered[selectedIndex]) {
          onEditSale(filtered[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onEditSale, isActive]);

  // Reset selected index when filtered data changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, search]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div className="sales-list">
      <div className="dashboard-header">
        <h2 className="title">Sales</h2>
        <div className="header-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by invoice or customer..." className="search-input" />
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={e => {
              setFilterDate(e.target.value);
              setShowAll(false);
            }}
            className="search-input"
            style={{ width: '130px', padding: '6px 10px' }}
          />
          <button className="btn btn-secondary sm" onClick={() => setShowAll(true)}>Retrieve</button>
          <button className="btn btn-secondary sm" onClick={load}>🔄 Refresh</button>
          {onNewSale && <button className="btn btn-primary sm" onClick={onNewSale}>+ New Sale</button>}
          {onExit && <button className="btn btn-tertiary sm" onClick={onExit}>Exit</button>}
        </div>
      </div>

      <div className="table-wrapper">
        {loading ? (
          <div className="loading-state">Loading sales...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>No sales found.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>User</th>
                <th style={{ textAlign: 'center' }}>Total Qty</th>
                <th style={{ textAlign: 'right' }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const totalQty = s.total_packets || 0;
                const displayDateTime = s.created_at || s.sale_date;
                const saleDateTime = new Date(displayDateTime);
                return (
                  <tr
                    key={s.id}
                    ref={idx === selectedIndex ? selectedRowRef : null}
                    onClick={() => onEditSale && onEditSale(s)}
                    className={`sales-row ${onEditSale ? 'clickable-row' : ''} ${idx === selectedIndex ? 'selected-row' : ''}`}
                  >
                    <td className="font-bold">{s.invoice_no || `INV-${s.id}`}</td>
                    <td>
                      {`${String(saleDateTime.getDate()).padStart(2, '0')}-${String(saleDateTime.getMonth() + 1).padStart(2, '0')}-${saleDateTime.getFullYear()}, ${saleDateTime.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`}
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e40af' }}>{s.customer_name || 'Walk-in'}</td>
                    <td>{s.username || '-'}</td>
                    <td className="center-text">{totalQty}</td>
                    <td className="right-text">PKR {Math.round(netAmount(s)).toLocaleString()}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f8fafc' }}>
                <td colSpan={4} className="right-text"><strong>Total Sales</strong></td>
                <td className="center-text"><strong>{totalPackets}</strong></td>
                <td className="right-text"><strong>PKR {Math.round(total).toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default React.memo(SalesList, (prev, next) => prev.isActive === next.isActive && prev.currentUser === next.currentUser);
