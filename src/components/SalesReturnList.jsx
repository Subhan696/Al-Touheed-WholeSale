import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDataVersion } from '../context/DataContext';
import { getLocalDateString, parseLocalDate } from '../utils/dateUtils';
import './SalesList.css';

const { ipcRenderer } = window.require('electron');

function SalesReturnList({ currentUser, onEditReturn, onNewReturn, onExit, isActive }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRowRef = useRef(null);
  const version = useDataVersion('sales-returns');

  const [filterDate, setFilterDate] = useState(() => getLocalDateString());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (isActive) {
      load();
    }
  }, [isActive, version]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('get-sales-returns');
      setRows(data || []);
    } catch { }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter(r => {
      const matchSearch = !search ||
        (r.return_no || '').toLowerCase().includes(s) ||
        (r.customer_name || '').toLowerCase().includes(s) ||
        (r.invoice_no || '').toLowerCase().includes(s);

      const dateStr = getLocalDateString(r.created_at || r.return_date);
      const matchDate = showAll || dateStr === filterDate;

      return matchSearch && matchDate;
    });
  }, [rows, search, filterDate, showAll]);

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
        if (onEditReturn && filtered[selectedIndex]) {
          onEditReturn(filtered[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onEditReturn, isActive]);

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

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this return?');
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-sales-return', id);
    load();
  };

  return (
    <div className="sales-list">
      <div className="dashboard-header">
        <h2 className="title">Sales Returns</h2>
        <div className="header-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by return # or customer..." className="search-input" />
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
          {onNewReturn && <button className="btn btn-primary sm" onClick={onNewReturn}>+ New Return</button>}
          {onExit && <button className="btn btn-tertiary sm" onClick={onExit}>Exit</button>}
        </div>
      </div>

      <div className="table-wrapper">
        {loading ? (
          <div className="loading-state">Loading returns...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>No returns found.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60, fontWeight: 800 }}>Return #</th>
                <th style={{ width: 140, fontWeight: 800 }}>Date & Time</th>
                <th style={{ width: 250, fontWeight: 800 }}>Customer</th>
                <th style={{ width: 80, fontWeight: 800 }}>User</th>
                <th style={{ textAlign: 'center', width: 70, fontWeight: 800 }}>Total Qty</th>
                <th style={{ textAlign: 'right', width: 100, fontWeight: 800 }}>Total Amount</th>
                <th style={{ textAlign: 'center', width: 35, fontWeight: 800 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const totalQty = r.total_packets || 0;
                const displayDateTime = r.created_at || r.return_date;
                const returnDateTime = parseLocalDate(displayDateTime);
                const isTimeAvailable = !!r.created_at || (typeof displayDateTime === 'string' && (displayDateTime.includes('T') || displayDateTime.includes(' ')));
                return (
                  <tr
                    key={r.id}
                    ref={idx === selectedIndex ? selectedRowRef : null}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => onEditReturn && onEditReturn(r)}
                    className={`sales-row ${onEditReturn ? 'clickable-row' : ''} ${idx === selectedIndex ? 'selected-row' : ''}`}
                  >
                    <td style={{ fontWeight: 800, color: '#dc2626' }}>{r.return_no || `RET-${r.id}`}</td>
                    <td style={{ fontWeight: 600, color: '#475569', fontSize: '0.86rem' }}>
                      {isTimeAvailable
                        ? `${String(returnDateTime.getDate()).padStart(2, '0')}-${String(returnDateTime.getMonth() + 1).padStart(2, '0')}-${returnDateTime.getFullYear()}, ${returnDateTime.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`
                        : `${String(returnDateTime.getDate()).padStart(2, '0')}-${String(returnDateTime.getMonth() + 1).padStart(2, '0')}-${returnDateTime.getFullYear()}`}
                    </td>
                    <td style={{ fontWeight: 700, color: '#1e40af' }}>{r.customer_name || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}</td>
                    <td style={{ fontWeight: 600, color: '#475569' }}>{r.username || '-'}</td>
                    <td className="center-text" style={{ fontWeight: 700 }}>{totalQty}</td>
                    <td className="right-text" style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.92rem' }}>{Math.round(netAmount(r)).toLocaleString()}</td>
                    <td className="center-text" onClick={e => e.stopPropagation()}>
                      <button className="btn-icon" onClick={e => handleDelete(r.id, e)} style={{ color: '#dc2626' }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid #fecdd3', background: '#fff5f5' }}>
                <td colSpan={4} className="right-text" style={{ fontWeight: 800 }}>Total Returns ({filtered.length})</td>
                <td className="center-text" style={{ fontWeight: 900, fontSize: '0.98rem' }}>{totalPackets}</td>
                <td className="right-text" style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.02rem' }}>{Math.round(total).toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default React.memo(SalesReturnList, (prev, next) => prev.isActive === next.isActive && prev.currentUser === next.currentUser);
