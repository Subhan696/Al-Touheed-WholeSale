import React, { useState, useEffect, useRef, useMemo } from 'react';

const { ipcRenderer } = window.require('electron');

function StockSearchModal({ isOpen, onClose, onSelectItem, title = "Stock Inventory Search", stockVer, productVer }) {
  const [stockSearchFilters, setStockSearchFilters] = useState({ search: '', brand: '', category: '', size: '' });
  const [stockSearchItems, setStockSearchItems] = useState([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [stockModalSelectedIndex, setStockModalSelectedIndex] = useState(0);

  const stockSearchInputRef = useRef(null);
  const stockModalRowRefs = useRef({});

  const loadStockForSearch = async () => {
    setStockSearchLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-stock-list-chunked', { limit: 100, offset: 0 });
      if (res && res.items) {
        setStockSearchItems(res.items);
        setStockSearchLoading(false);
        if (res.total > 100) {
          const remaining = await ipcRenderer.invoke('get-stock-list');
          setStockSearchItems(remaining || []);
        }
      } else {
        setStockSearchLoading(false);
      }
    } catch (e) {
      setStockSearchLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStockSearchFilters({ search: '', brand: '', category: '', size: '' });
      setStockModalSelectedIndex(0);
      loadStockForSearch();
      setTimeout(() => stockSearchInputRef.current?.focus(), 50);
    }
  }, [isOpen, stockVer, productVer]);

  const filteredStockItems = useMemo(() => {
    const s = stockSearchFilters.search.toLowerCase().trim();
    const b = stockSearchFilters.brand.toLowerCase().trim();
    const c = stockSearchFilters.category.toLowerCase().trim();
    const sz = stockSearchFilters.size.toLowerCase().trim();

    let res = stockSearchItems.filter(p => {
      if (s && !(p.item_code || '').toLowerCase().includes(s) && !(p.description || '').toLowerCase().includes(s)) return false;
      if (b && !(p.brand || '').toLowerCase().includes(b)) return false;
      if (c && !(p.category || '').toLowerCase().includes(c)) return false;
      if (sz && !(p.size_range || '').toLowerCase().includes(sz)) return false;
      return true;
    });

    if (s) {
      res.sort((a, b) => {
        const aCode = (a.item_code || '').toLowerCase();
        const bCode = (b.item_code || '').toLowerCase();
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
  }, [stockSearchItems, stockSearchFilters]);

  useEffect(() => {
    if (isOpen) {
      setStockModalSelectedIndex(filteredStockItems.length > 0 ? 0 : -1);
    }
  }, [filteredStockItems, isOpen]);

  useEffect(() => {
    if (isOpen && stockModalSelectedIndex >= 0) {
      const el = stockModalRowRefs.current[stockModalSelectedIndex];
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [stockModalSelectedIndex, isOpen]);

  const totalStockSearchValue = useMemo(() => {
    return filteredStockItems.reduce((sum, p) => sum + ((p.stock_packets || 0) * (parseFloat(p.purchase_rate) || 0)), 0);
  }, [filteredStockItems]);

  const handleSelectItem = (product) => {
    if (!product) return;
    onSelectItem(product);
    onClose();
  };

  // Esc key listener in capture phase for stock search modal
  useEffect(() => {
    if (!isOpen) return;

    const handleStockSearchEsc = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleStockSearchEsc, true);
    return () => window.removeEventListener('keydown', handleStockSearchEsc, true);
  }, [isOpen, onClose]);

  const handleStockModalKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStockModalSelectedIndex(prev => Math.min(prev + 1, Math.min(filteredStockItems.length - 1, 149)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStockModalSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredStockItems.length > 0) {
        const idx = stockModalSelectedIndex >= 0 ? stockModalSelectedIndex : 0;
        if (filteredStockItems[idx]) {
          handleSelectItem(filteredStockItems[idx]);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '95%',
          maxWidth: '1200px',
          height: '88vh',
          background: '#fff',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header & Filters */}
        <div style={{ background: '#1e293b', color: '#fff', padding: '14px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>📦</span>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                {title}
              </h3>
              <span style={{ background: '#38bdf8', color: '#0f172a', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>
                F8
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filter controls */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={stockSearchInputRef}
              autoFocus
              type="text"
              placeholder="Search Item Code or Description..."
              value={stockSearchFilters.search}
              onChange={e => {
                setStockSearchFilters(f => ({ ...f, search: e.target.value }));
                setStockModalSelectedIndex(0);
              }}
              onKeyDown={handleStockModalKeyDown}
              style={{
                flex: '2',
                minWidth: '220px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Brand..."
              value={stockSearchFilters.brand}
              onChange={e => {
                setStockSearchFilters(f => ({ ...f, brand: e.target.value }));
                setStockModalSelectedIndex(0);
              }}
              onKeyDown={handleStockModalKeyDown}
              style={{
                flex: '1',
                minWidth: '120px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Category..."
              value={stockSearchFilters.category}
              onChange={e => {
                setStockSearchFilters(f => ({ ...f, category: e.target.value }));
                setStockModalSelectedIndex(0);
              }}
              onKeyDown={handleStockModalKeyDown}
              style={{
                flex: '1',
                minWidth: '120px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Size..."
              value={stockSearchFilters.size}
              onChange={e => {
                setStockSearchFilters(f => ({ ...f, size: e.target.value }));
                setStockModalSelectedIndex(0);
              }}
              onKeyDown={handleStockModalKeyDown}
              style={{
                flex: '1',
                minWidth: '100px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            {(stockSearchFilters.search || stockSearchFilters.brand || stockSearchFilters.category || stockSearchFilters.size) && (
              <button
                type="button"
                onClick={() => setStockSearchFilters({ search: '', brand: '', category: '', size: '' })}
                style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.85rem', color: '#cbd5e1' }}>
            <span>
              Showing {filteredStockItems.length > 150 ? `top 150 of ${filteredStockItems.length}` : `${filteredStockItems.length}`} matching items
            </span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>
              Total Stock Value: PKR {totalStockSearchValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '12px 20px' }}>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 2 }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>Item Code</th>
                  <th style={{ padding: '10px 12px' }}>Description</th>
                  <th style={{ padding: '10px 12px' }}>Category</th>
                  <th style={{ padding: '10px 12px' }}>Size Range</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Purch. Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Sale Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Stock (Pcs)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stock Value</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {stockSearchLoading ? (
                  <tr>
                    <td colSpan={9} className="empty-state" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                      Loading stock inventory...
                    </td>
                  </tr>
                ) : filteredStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                      No items match search criteria
                    </td>
                  </tr>
                ) : (
                  filteredStockItems.slice(0, 150).map((p, idx) => {
                    const isSelected = idx === stockModalSelectedIndex;
                    const stockPcs = p.stock_packets || 0;
                    const chipStyle = stockPcs > 5
                      ? { background: '#dcfce7', color: '#166534' }
                      : stockPcs > 0
                        ? { background: '#fef9c3', color: '#854d0e' }
                        : { background: '#fee2e2', color: '#991b1b' };

                    return (
                      <tr
                        key={p.id || p.item_code}
                        ref={el => stockModalRowRefs.current[idx] = el}
                        onClick={() => setStockModalSelectedIndex(idx)}
                        onDoubleClick={() => handleSelectItem(p)}
                        style={{
                          background: isSelected ? '#e0f2fe' : 'transparent',
                          borderLeft: isSelected ? '4px solid #0284c7' : '4px solid transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}>
                            {p.item_code}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.description}</div>
                          {p.brand && <div style={{ fontSize: '11px', color: '#64748b' }}>Brand: {p.brand}</div>}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                            {p.category || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>{p.size_range || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>PKR {(parseFloat(p.purchase_rate) || 0).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>
                          PKR {(parseFloat(p.sale_rate) || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-block', ...chipStyle }}>
                            {stockPcs}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                          PKR {(stockPcs * (parseFloat(p.purchase_rate) || 0)).toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectItem(p);
                            }}
                            style={{
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}
                          >
                            + Add
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            💡 <strong>Tip:</strong> Click <strong>+ Add</strong> or <strong>Double-Click</strong> any row to add item. Press <strong>Esc</strong> to close.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 20px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default StockSearchModal;
