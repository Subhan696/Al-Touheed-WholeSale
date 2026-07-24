import React, { useState, useEffect, useMemo } from 'react';
import './SalesList.css';

const { ipcRenderer } = window.require('electron');

function SalesReturnList({ currentUser, onEditReturn, isActive }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { if (isActive) load(); }, [isActive]);

  const load = async () => {
    setLoading(true);
    try { setRows(await ipcRenderer.invoke('get-sales-returns') || []); } catch {}
    setLoading(false);
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedItems([]); return; }
    setExpandedId(id);
    try { setExpandedItems(await ipcRenderer.invoke('get-sales-return-items', id) || []); } catch {}
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter(r => {
      const matchSearch = !search || (r.return_no || '').toLowerCase().includes(s) || (r.customer_name || '').toLowerCase().includes(s) || (r.invoice_no || '').toLowerCase().includes(s);
      const dateStr = r.return_date instanceof Date ? new Date(r.return_date.getTime() - r.return_date.getTimezoneOffset() * 60000).toISOString().split('T')[0] : (typeof r.return_date === 'string' ? r.return_date.split('T')[0] : '');
      const matchDate = showAll || dateStr === filterDate;
      return matchSearch && matchDate;
    });
  }, [rows, search, filterDate, showAll]);

  const totalAmount = filtered.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const totalPackets = filtered.reduce((s, r) => s + parseInt(r.total_packets || 0), 0);

  const handleDelete = async (ret, e) => {
    e.stopPropagation();
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this return?');
    if (!confirmed) return;
    await ipcRenderer.invoke('delete-sales-return', ret.id);
    load();
  };

  return (
    <div className="sales-list">
      <div className="dashboard-header">
        <h2 className="title">Sales Returns</h2>
        <div className="header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '4px 10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pkts</span>
            <strong style={{ color: '#dc2626' }}>{totalPackets.toLocaleString()}</strong>
            <span style={{ color: '#e5e7eb', margin: '0 4px' }}>|</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total</span>
            <strong style={{ color: '#dc2626' }}>PKR {Math.round(totalAmount).toLocaleString()}</strong>
          </div>
          <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setShowAll(false); }}
            className="search-input" style={{ width: 135, padding: '8px 10px' }} />
          <button className="btn btn-secondary sm" onClick={() => setShowAll(true)}>All</button>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search return / customer..." className="search-input" />
          </div>
          <button className="btn btn-secondary sm" onClick={load}>🔄</button>
        </div>
      </div>

      <div className="table-wrapper">
        {loading ? (
          <div className="loading-state">Loading returns...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No returns found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Return #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Orig. Invoice</th>
                <th style={{ textAlign: 'center' }}>Packets</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="clickable-row" onClick={() => toggleExpand(r.id)}>
                    <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
                      {expandedId === r.id ? '▼' : '▶'}
                    </td>
                    <td style={{ fontWeight: 700, color: '#dc2626' }}>{r.return_no}</td>
                    <td>{r.return_date instanceof Date ? new Date(r.return_date.getTime() - r.return_date.getTimezoneOffset() * 60000).toISOString().split('T')[0] : (typeof r.return_date === 'string' ? r.return_date.split('T')[0] : '')}</td>
                    <td>{r.customer_name || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}</td>
                    <td>{r.invoice_no || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td className="center-text"><strong>{r.total_packets}</strong></td>
                    <td className="right-text" style={{ color: '#dc2626', fontWeight: 700 }}>PKR {Math.round(r.total_amount).toLocaleString()}</td>
                    <td className="center-text" onClick={e => e.stopPropagation()}>
                      {onEditReturn && <button className="btn-icon" onClick={() => onEditReturn(r)}>✏️</button>}
                      <button className="btn-icon" onClick={e => handleDelete(r.id, e)} style={{ color: '#dc2626' }}>🗑️</button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, background: '#fff5f5', borderBottom: '2px solid #fecdd3' }}>
                        <div style={{ padding: '8px 16px 12px 40px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #fecdd3' }}>
                                <th style={subTh}>Code</th>
                                <th style={subTh}>Description</th>
                                <th style={{ ...subTh, textAlign: 'center' }}>Packets</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Rate</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expandedItems.map((it, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #fef2f2' }}>
                                  <td style={subTd}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{it.item_code}</span></td>
                                  <td style={subTd}>{it.item_description}</td>
                                  <td style={{ ...subTd, textAlign: 'center' }}>{it.packets}</td>
                                  <td style={{ ...subTd, textAlign: 'right' }}>PKR {parseFloat(it.price).toLocaleString()}</td>
                                  <td style={{ ...subTd, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>PKR {Math.round(it.amount).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {r.notes && <div style={{ marginTop: 6, color: '#6b7280', fontSize: '0.8rem' }}>📝 {r.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              <tr style={{ borderTop: '2px solid #fecdd3', background: '#fff5f5' }}>
                <td colSpan={5} style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Totals ({filtered.length} returns)</td>
                <td style={{ padding: '10px 20px', textAlign: 'center', fontWeight: 700 }}>{totalPackets.toLocaleString()}</td>
                <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>PKR {Math.round(totalAmount).toLocaleString()}</td>
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

export default SalesReturnList;
