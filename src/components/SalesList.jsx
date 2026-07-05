import React, { useState, useEffect, useMemo, useRef } from 'react';
import './SalesList.css';

const { ipcRenderer } = window.require('electron');

function SalesList({ currentUser, onEditSale, onNewSale, onExit, isActive }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const selectedRowRef = useRef(null);

  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { if (isActive) load(); }, [isActive]);

  const load = async () => {
    setLoading(true);
    try { setRows(await ipcRenderer.invoke('get-sales') || []); } catch {}
    setLoading(false);
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedItems([]); return; }
    setExpandedId(id);
    try { setExpandedItems(await ipcRenderer.invoke('get-sale-items', id) || []); } catch {}
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter(r => {
      const matchSearch = !search || (r.invoice_no || '').toLowerCase().includes(s) || (r.customer_name || '').toLowerCase().includes(s);
      const matchDate = showAll || (r.sale_date || '').startsWith(filterDate);
      return matchSearch && matchDate;
    });
  }, [rows, search, filterDate, showAll]);

  const netAmount = (r) => Math.max(0, (r.total_amount || 0) + (r.misc_charges || 0) - (r.discount || 0));
  const totalRevenue = filtered.reduce((s, r) => s + netAmount(r), 0);
  const totalPackets = filtered.reduce((s, r) => s + (r.total_packets || 0), 0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isActive || filtered.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => Math.min(p + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => Math.max(p - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (onEditSale && filtered[selectedIndex]) onEditSale(filtered[selectedIndex]); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onEditSale, isActive]);

  useEffect(() => { setSelectedIndex(0); }, [filtered.length, search]);
  useEffect(() => { selectedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [selectedIndex]);

  const handleDelete = async (sale) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this sale?');
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-sale', sale.id);
    load();
  };

  const paymentColor = (m) => ({ Cash: '#16a34a', Credit: '#dc2626', 'Bank Transfer': '#3699ff', Cheque: '#f59e0b' }[m] || '#6b7280');

  return (
    <div className="sales-list">
      <div className="dashboard-header">
        <h2 className="title">Sales History</h2>
        <div className="header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pkts</span>
            <strong style={{ color: '#16a34a' }}>{totalPackets.toLocaleString()}</strong>
            <span style={{ color: '#e5e7eb', margin: '0 4px' }}>|</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Revenue</span>
            <strong style={{ color: '#1d4ed8' }}>PKR {Math.round(totalRevenue).toLocaleString()}</strong>
          </div>
          <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setShowAll(false); }}
            className="search-input" style={{ width: 135, padding: '8px 10px' }} />
          <button className="btn btn-secondary sm" onClick={() => setShowAll(true)}>All</button>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice / customer..." className="search-input" />
          </div>
          <button className="btn btn-secondary sm" onClick={load}>🔄</button>
          {onNewSale && <button className="btn btn-primary sm" onClick={onNewSale}>+ New Sale</button>}
          {onExit && <button className="btn btn-tertiary sm" onClick={onExit}>Exit</button>}
        </div>
      </div>

      <div className="table-wrapper">
        {loading ? (
          <div className="loading-state">Loading sales...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No sales found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Payment</th>
                <th style={{ textAlign: 'center' }}>Packets</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => (
                <React.Fragment key={s.id}>
                  <tr
                    ref={idx === selectedIndex ? selectedRowRef : null}
                    className={`clickable-row ${idx === selectedIndex ? 'selected-row' : ''}`}
                    onClick={() => toggleExpand(s.id)}
                  >
                    <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
                      {expandedId === s.id ? '▼' : '▶'}
                    </td>
                    <td className="font-bold">{s.invoice_no}</td>
                    <td>{(s.sale_date || '').split('T')[0]}</td>
                    <td>{s.customer_name || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Walk-in</span>}</td>
                    <td>
                      <span style={{ background: paymentColor(s.payment_method) + '18', color: paymentColor(s.payment_method), padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>
                        {s.payment_method}
                      </span>
                    </td>
                    <td className="center-text"><strong>{s.total_packets}</strong></td>
                    <td className="right-text"><strong>PKR {Math.round(netAmount(s)).toLocaleString()}</strong></td>
                    <td className="center-text" onClick={e => e.stopPropagation()}>
                      {onEditSale && (
                        <button className="btn-icon" title="Edit" onClick={() => onEditSale(s)}>✏️</button>
                      )}
                      <button className="btn-icon" title="Delete" onClick={e => handleDelete(s.id, e)} style={{ color: '#dc2626' }}>🗑️</button>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #e0e7ff' }}>
                        <div style={{ padding: '8px 16px 12px 40px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <th style={subTh}>Code</th>
                                <th style={subTh}>Description</th>
                                <th style={{ ...subTh, textAlign: 'center' }}>Packets</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Rate</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Amount</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Profit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expandedItems.map((it, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={subTd}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5' }}>{it.item_code}</span></td>
                                  <td style={subTd}>{it.item_description}</td>
                                  <td style={{ ...subTd, textAlign: 'center' }}>{it.packets}</td>
                                  <td style={{ ...subTd, textAlign: 'right' }}>PKR {parseFloat(it.sale_rate).toLocaleString()}</td>
                                  <td style={{ ...subTd, textAlign: 'right', fontWeight: 600 }}>PKR {Math.round(it.amount).toLocaleString()}</td>
                                  <td style={{ ...subTd, textAlign: 'right', fontWeight: 600, color: parseFloat(it.profit) >= 0 ? '#16a34a' : '#dc2626' }}>PKR {Math.round(it.profit).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {(parseFloat(s.discount) > 0 || parseFloat(s.misc_charges) > 0 || s.notes) && (
                            <div style={{ marginTop: 6, display: 'flex', gap: 16, color: '#6b7280', fontSize: '0.8rem' }}>
                              {parseFloat(s.discount) > 0 && <span>Discount: PKR {parseFloat(s.discount).toLocaleString()}</span>}
                              {parseFloat(s.misc_charges) > 0 && <span>Misc: PKR {parseFloat(s.misc_charges).toLocaleString()}</span>}
                              {s.notes && <span>📝 {s.notes}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f8fafc' }}>
                <td colSpan={5} style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Totals ({filtered.length} sales)</td>
                <td style={{ padding: '10px 20px', textAlign: 'center', fontWeight: 700 }}>{totalPackets.toLocaleString()}</td>
                <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700 }}>PKR {Math.round(totalRevenue).toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const subTh = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#374151' };
const subTd = { padding: '5px 10px', color: '#3f4254' };

export default SalesList;
