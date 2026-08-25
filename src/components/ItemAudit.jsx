import React, { useState, useEffect, useRef } from 'react';
import { parseLocalDate } from '../utils/dateUtils';
import './ItemAudit.css';

const { ipcRenderer } = window.require('electron');

function descForProduct(p) {
  if (!p) return '';
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function ItemAudit({ initialItemCode, onExit }) {
  const [search, setSearch] = useState(initialItemCode || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (initialItemCode) {
      loadAudit(initialItemCode);
    }
  }, [initialItemCode]);

  const handleSearchChange = async (val) => {
    setSearch(val);
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      try {
        const res = await ipcRenderer.invoke('search-products', trimmed);
        setSuggestions(res || []);
        setShowSuggestions((res || []).length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const loadAudit = async (code) => {
    const targetCode = (code || search).trim();
    if (!targetCode) return;

    setLoading(true);
    setShowSuggestions(false);
    try {
      const res = await ipcRenderer.invoke('get-item-audit-data', { itemCode: targetCode });
      if (res && res.success) {
        setAuditData(res);
        if (res.product) {
          setSearch(res.product.item_code);
        }
      } else {
        setAuditData(null);
      }
    } catch (err) {
      console.error('Error loading item audit:', err);
      setAuditData(null);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        loadAudit(suggestions[0].item_code);
      } else {
        loadAudit(search);
      }
    }
  };

  const filteredTimeline = React.useMemo(() => {
    if (!auditData || !auditData.timeline) return [];
    if (eventTypeFilter === 'ALL') return auditData.timeline;
    if (eventTypeFilter === 'PURCHASES') return auditData.timeline.filter(e => e.type === 'purchase');
    if (eventTypeFilter === 'SALES') return auditData.timeline.filter(e => e.type === 'sale');
    if (eventTypeFilter === 'RETURNS') return auditData.timeline.filter(e => e.type === 'sales_return' || e.type === 'purchase_return');
    return auditData.timeline;
  }, [auditData, eventTypeFilter]);

  const getEventBadge = (type) => {
    switch (type) {
      case 'creation':
        return <span className="audit-badge badge-creation">✨ Created</span>;
      case 'purchase':
        return <span className="audit-badge badge-purchase">📥 Purchased</span>;
      case 'sale':
        return <span className="audit-badge badge-sale">📤 Sold</span>;
      case 'sales_return':
        return <span className="audit-badge badge-sales-return">↩️ Sale Return</span>;
      case 'purchase_return':
        return <span className="audit-badge badge-purchase-return">🔙 Pur. Return</span>;
      default:
        return <span className="audit-badge">{type}</span>;
    }
  };

  const product = auditData?.product;
  const summary = auditData?.summary;

  return (
    <div className="item-audit-page">
      {/* Header Bar */}
      <div className="dashboard-header">
        <div className="header-title-group">
          <h2 className="title">🔍 Item History</h2>
          <p className="subtitle">Track creation date, stock arrivals, sales, returns, rates, users, and full stock lifecycle.</p>
        </div>

        <div className="header-actions">
          {/* Item Search Input */}
          <div className="search-box audit-search-box">
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search code or description & press Enter..."
              className="search-input"
              autoFocus
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="autocomplete-dropdown audit-dropdown">
                {suggestions.slice(0, 10).map(p => (
                  <div
                    key={p.id}
                    className="suggestion-item"
                    onMouseDown={() => loadAudit(p.item_code)}
                  >
                    <span className="code-pill">{p.item_code}</span>
                    <span className="desc-text">{descForProduct(p)}</span>
                    <span className="stock-pill">{p.stock_packets ?? p.available_stock ?? p.stock_qty ?? 0} pcs</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary sm" onClick={() => loadAudit(search)}>Search History</button>
          {onExit && <button className="btn btn-tertiary sm" onClick={onExit}>Exit</button>}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading item history data...</div>
      ) : !auditData ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>Select or search an item to view history trail</h3>
          <p>Enter any item code or description above to see when it was added, arrived stock, sales, returns, rates, and user logs.</p>
        </div>
      ) : (
        <div className="audit-content">
          {/* Master Item Header Card */}
          <div className="audit-header-card">
            <div className="item-main-info">
              <div className="item-code-badge">{product?.item_code || search}</div>
              <div className="item-details">
                <h3 className="item-title">{descForProduct(product) || 'Product Audit Record'}</h3>
                <div className="item-meta-tags">
                  {product?.category && <span className="meta-tag">Cat: <strong>{product.category}</strong></span>}
                  {product?.brand && <span className="meta-tag">Brand: <strong>{product.brand}</strong></span>}
                  {product?.gender && <span className="meta-tag">Gender: <strong>{product.gender}</strong></span>}
                  {product?.size_range && <span className="meta-tag">Size: <strong>{product.size_range}</strong></span>}
                  {product?.packing_qty && <span className="meta-tag">Packing: <strong>{product.packing_qty} pcs/pkt</strong></span>}
                  {product?.created_at && (() => {
                    const cd = parseLocalDate(product.created_at);
                    const cdStr = `${String(cd.getDate()).padStart(2, '0')}/${String(cd.getMonth() + 1).padStart(2, '0')}/${cd.getFullYear()}, ${cd.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;
                    return (
                      <span className="meta-tag feeded-tag">
                        📅 Created on: <strong>{cdStr}</strong>
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="audit-metrics-grid">
              <div className="metric-box">
                <span className="metric-label">Current Stock</span>
                <span className={`metric-value ${summary?.currentStock > 0 ? 'text-green' : 'text-red'}`}>
                  {summary?.currentStock || 0} <small>pcs</small>
                </span>
                {product?.packing_qty > 1 && (
                  <span className="metric-sub">
                    ({Math.floor((summary?.currentStock || 0) / product.packing_qty)} pkts)
                  </span>
                )}
              </div>

              <div className="metric-box">
                <span className="metric-label">Total Arrived (Purchased)</span>
                <span className="metric-value text-blue">{summary?.netPurchasedQty || 0} <small>pcs</small></span>
                <span className="metric-sub">Gross: {summary?.totalPurchasedQty || 0} pcs</span>
              </div>

              <div className="metric-box">
                <span className="metric-label">Total Sold</span>
                <span className="metric-value text-purple">{summary?.netSoldQty || 0} <small>pcs</small></span>
                <span className="metric-sub">Gross: {summary?.totalSoldQty || 0} pcs</span>
              </div>

              <div className="metric-box">
                <span className="metric-label">Total Sales Revenue</span>
                <span className="metric-value">{Math.round(summary?.totalSalesRevenue || 0).toLocaleString()}</span>
                <span className="metric-sub">Profit: {Math.round(summary?.totalProfit || 0).toLocaleString()}</span>
              </div>

              <div className="metric-box rates-box">
                <span className="metric-label">Master Rates Info</span>
                <div className="rates-list">
                  <div>Purch: <strong>{Math.round(parseFloat(product?.purchase_rate) || 0)}</strong></div>
                  <div>Cost: <strong style={{ color: '#1d4ed8' }}>{Math.round(summary?.latestArrivedNetRate || parseFloat(product?.actual_cost) || parseFloat(product?.purchase_rate) || 0)}</strong></div>
                  <div>Sale: <strong style={{ color: '#059669' }}>{Math.round(parseFloat(product?.sale_rate) || 0)}</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar & Timeline */}
          <div className="audit-timeline-container">
            <div className="timeline-toolbar">
              <div className="filter-group">
                <button
                  className={`btn sm ${eventTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setEventTypeFilter('ALL')}
                >
                  All Events ({auditData.timeline?.length || 0})
                </button>
                <button
                  className={`btn sm ${eventTypeFilter === 'PURCHASES' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setEventTypeFilter('PURCHASES')}
                >
                  📥 Purchases
                </button>
                <button
                  className={`btn sm ${eventTypeFilter === 'SALES' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setEventTypeFilter('SALES')}
                >
                  📤 Sales / Invoices
                </button>
                <button
                  className={`btn sm ${eventTypeFilter === 'RETURNS' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setEventTypeFilter('RETURNS')}
                >
                  ↩️ Returns
                </button>
              </div>

              <div className="timeline-summary-pill">
                Showing {filteredTimeline.length} events
              </div>
            </div>

            {/* Compact Fit-Width Table */}
            <div className="table-wrapper audit-table-wrapper">
              {filteredTimeline.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px' }}>
                  <p>No activity records match the selected filter.</p>
                </div>
              ) : (
                <table className="data-table audit-table">
                  <thead>
                    <tr>
                      <th style={{ width: '13%', fontWeight: 800 }}>Date & Time</th>
                      <th style={{ width: '11%', fontWeight: 800 }}>Event Type</th>
                      <th style={{ width: '9%', fontWeight: 800 }}>Ref / Inv #</th>
                      <th style={{ width: '21%', fontWeight: 800 }}>Party (Customer/Supplier)</th>
                      <th style={{ width: '7%', fontWeight: 800 }}>User</th>
                      <th style={{ textAlign: 'center', width: '6%', fontWeight: 800 }}>Qty</th>
                      <th style={{ textAlign: 'right', width: '8%', fontWeight: 800 }}>Pur. Rate</th>
                      <th style={{ textAlign: 'right', width: 80, fontWeight: 800 }}>Sale Rate</th>
                      <th style={{ textAlign: 'right', width: 65, fontWeight: 800 }}>Disc</th>
                      <th style={{ textAlign: 'right', width: 90, fontWeight: 800 }}>Total Amt</th>
                      <th style={{ textAlign: 'center', width: 80, fontWeight: 800 }}>Stock Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTimeline.map((ev) => {
                      const dt = parseLocalDate(ev.date);
                      const dtStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}, ${dt.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;

                      // Purchase rate calculation
                      const purRateVal = ev.type === 'purchase'
                        ? (ev.netRate || ev.rate)
                        : ev.type === 'sale'
                          ? (ev.purchaseRate || product?.purchase_rate || 0)
                          : ev.type === 'purchase_return'
                            ? ev.rate
                            : (product?.purchase_rate || 0);

                      // Sale rate calculation
                      const saleRateVal = ev.type === 'sale'
                        ? ev.rate
                        : ev.type === 'purchase'
                          ? (ev.saleRate || product?.sale_rate || 0)
                          : ev.type === 'sales_return'
                            ? ev.rate
                            : (product?.sale_rate || 0);

                      return (
                        <tr key={ev.id} className={`audit-row row-${ev.type}`}>
                          <td style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{dtStr}</td>
                          <td>{getEventBadge(ev.type)}</td>
                          <td style={{ fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>
                            {ev.refNo}
                            {ev.origRef && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>({ev.origRef})</div>}
                          </td>
                          <td style={{ fontWeight: 700, color: '#1e40af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.party}>
                            {ev.party}
                          </td>
                          <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{ev.user || '-'}</td>
                          <td className="center-text" style={{ fontWeight: 800 }}>
                            {ev.type === 'creation' ? '—' : (
                              <span className={ev.type === 'purchase' || ev.type === 'sales_return' ? 'qty-in' : 'qty-out'}>
                                {ev.type === 'purchase' || ev.type === 'sales_return' ? '+' : '-'}{ev.qty}
                              </span>
                            )}
                          </td>

                          {/* Purchase Rate Column */}
                          <td className="right-text" style={{ fontWeight: 700, color: '#be123c' }}>
                            {purRateVal ? Math.round(purRateVal).toLocaleString() : '—'}
                          </td>

                          {/* Sale Rate Column */}
                          <td className="right-text" style={{ fontWeight: 700, color: '#047857' }}>
                            {saleRateVal ? Math.round(saleRateVal).toLocaleString() : '—'}
                          </td>

                          {/* Discount Column */}
                          <td className="right-text" style={{ color: ev.discount ? '#ea580c' : '#9ca3af', fontWeight: ev.discount ? 700 : 400 }}>
                            {ev.discount ? `-${Math.round(ev.discount).toLocaleString()}` : '—'}
                          </td>

                          {/* Total Amount Column */}
                          <td className="right-text" style={{ fontWeight: 800, color: '#0f172a' }}>
                            {ev.amount ? Math.round(ev.amount).toLocaleString() : '—'}
                          </td>

                          {/* Stock Balance Column */}
                          <td className="center-text">
                            <span className="stock-bal-badge">
                              {ev.stockBalance} pcs
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(ItemAudit);
