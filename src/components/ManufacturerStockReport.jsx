import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { printManufacturerStock, saveManufacturerStockPDF } from '../utils/printManufacturerStock';

const { ipcRenderer } = window.require('electron');

const fmt = (n) => Math.round(n || 0).toLocaleString();
const fmt2 = (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Memoized supplier row component for better performance
const SupplierRow = memo(({ sup, collapsed, toggleCollapsed, priceMode, supplierBalances, fmt, fmt2 }) => {
  const isCollapsed = !!collapsed[sup.name];
  const balKey = sup.name.trim().toLowerCase();
  const balance = supplierBalances[balKey];

  return (
    <table className="ssr-table" key={sup.name}>
      <thead>
        <tr className="ssr-supplier-row" onClick={() => toggleCollapsed(sup.name)}>
          <th colSpan={2}>{isCollapsed ? '▶' : '▼'} {sup.name}</th>
          <th className="ssr-val">Qty: {fmt(sup.totalQty)}</th>
          <th className="ssr-val"></th>
          <th className="ssr-val"></th>
          <th className="ssr-val">
            Value: {fmt(sup.totalValue)}
            {balance !== undefined && (
              <span style={{ marginLeft: 16, fontWeight: 400 }}>
                | Balance: {fmt2(Math.abs(balance))} {balance >= 0 ? 'Cr' : 'Dr'}
              </span>
            )}
          </th>
        </tr>
        {!isCollapsed && (
          <tr>
            <th style={{ width: 100 }}>Item Code</th>
            <th>Description / Brand</th>
            <th className="ssr-val" style={{ width: 80 }}>Qty</th>
            <th className="ssr-val" style={{ width: 100 }}>{priceMode === 'actual' ? 'Actual Cost' : 'List Price'}</th>
            <th className="ssr-val" style={{ width: 100 }}>Sale Price</th>
            <th className="ssr-val" style={{ width: 120 }}>Value</th>
          </tr>
        )}
      </thead>
      {!isCollapsed && (
        <tbody>
          {sup.categories.map(cat => (
            <React.Fragment key={cat.name}>
              <tr className="ssr-cat-row">
                <td colSpan={2}>{cat.name}</td>
                <td className="ssr-val">{fmt(cat.totalQty)}</td>
                <td className="ssr-val"></td>
                <td className="ssr-val"></td>
                <td className="ssr-val">{fmt(cat.totalValue)}</td>
              </tr>
              {cat.items.map(item => (
                <tr key={item.item_code}>
                  <td>{item.item_code}</td>
                  <td style={{ color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {`${item.description || ''} ${item.category || ''} ${item.size_range || ''} ${item.gender || ''}`.replace(/\s+/g, ' ').trim() || '—'}
                  </td>
                  <td className="ssr-val">{fmt(item.qty)}</td>
                  <td className="ssr-val">{fmt2(Math.round((priceMode === 'actual' ? (item.latest_net_rate || item.actual_rate || 0) : (item.list_rate || 0)) * 100) / 100)}</td>
                  <td className="ssr-val">{fmt2(Math.round((item.sale_rate || 0) * 100) / 100)}</td>
                  <td className="ssr-val">{fmt(item.value)}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
          <tr className="ssr-subtotal-row">
            <td colSpan={2} style={{ textAlign: 'right' }}>Supplier Total:</td>
            <td className="ssr-val">{fmt(sup.totalQty)}</td>
            <td className="ssr-val"></td>
            <td className="ssr-val"></td>
            <td className="ssr-val">{fmt(sup.totalValue)}</td>
          </tr>
        </tbody>
      )}
    </table>
  );
});

function SupplierStockReport() {
  const [reportData, setReportData] = useState([]);
  const [supplierBalances, setSupplierBalances] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters — explicit Sets of currently-selected values. Always initialized
  // to "everything" whenever fresh data loads, so "select all" is a real,
  // visible state rather than an implicit null.
  const [priceMode, setPriceMode] = useState('actual'); // 'list' | 'actual'
  const [search, setSearch] = useState('');
  const [selectedSuppliers, setSelectedSuppliers] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [collapsed, setCollapsed] = useState({});

  // Dropdown popover state (kept compact — no permanent full-width panel)
  const [openDropdown, setOpenDropdown] = useState(null); // 'suppliers' | 'categories' | null
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const toolbarRef = useRef(null);

  useEffect(() => {
    loadReport();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const [stockData, ledgerData] = await Promise.all([
        ipcRenderer.invoke('get-supplier-stock-report'),
        ipcRenderer.invoke('get-suppliers-ledger').catch(() => [])
      ]);
      const rows = Array.isArray(stockData) ? stockData : [];
      setReportData(rows);

      // Filters default to "everything selected" on every fresh load.
      setSelectedSuppliers(new Set(rows.map(r => r.supplier_name || 'Unassigned')));
      setSelectedCategories(new Set(rows.map(r => r.category || 'Uncategorized')));
      setSearch('');

      const balMap = {};
      (ledgerData || []).forEach(s => {
        balMap[(s.name || '').trim().toLowerCase()] = s.net_balance;
      });
      setSupplierBalances(balMap);
    } catch (err) {
      console.error('Failed to load supplier stock report', err);
    }
    setLoading(false);
  }, []);

  const [statusMsg, setStatusMsg] = useState('');

  const handlePrint = () => {
    printManufacturerStock(groups, grandQty, grandValue, priceMode, supplierBalances);
  };

  const handleSavePDF = async () => {
    const res = await saveManufacturerStockPDF(groups, grandQty, grandValue, priceMode, supplierBalances);
    if (res?.success) {
      setStatusMsg(`✓ PDF saved!`);
      setTimeout(() => setStatusMsg(''), 3000);
    } else if (res?.error) {
      setStatusMsg(`Error: ${res.error}`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  // Unique filter option lists derived from the data itself
  const allSuppliers = useMemo(() => {
    const set = new Set(reportData.map(r => r.supplier_name || 'Unassigned'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reportData]);

  const allCategories = useMemo(() => {
    const set = new Set(reportData.map(r => r.category || 'Uncategorized'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reportData]);

  const unmappedCount = useMemo(
    () => reportData.filter(r => (r.supplier_name || '').startsWith('Unmapped:')).length,
    [reportData]
  );

  const toggleValue = useCallback((setter, current, value) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }, []);

  // Filtered + grouped rows
  const { groups, grandQty, grandValue } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = reportData.filter(r => {
      const supplier = r.supplier_name || 'Unassigned';
      const category = r.category || 'Uncategorized';
      if (!selectedSuppliers.has(supplier)) return false;
      if (!selectedCategories.has(category)) return false;
      if (q) {
        const hay = `${r.item_code} ${r.description} ${r.brand}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const bySupplier = {};
    let gQty = 0, gVal = 0;

    filtered.forEach(r => {
      const supplier = r.supplier_name || 'Unassigned';
      const category = r.category || 'Uncategorized';
      const qty = parseInt(r.stock_packets) || 0;
      const rate = priceMode === 'actual'
        ? (parseFloat(r.actual_rate) || 0)
        : (parseFloat(r.list_rate) || 0);
      const value = qty * rate;

      if (!bySupplier[supplier]) {
        bySupplier[supplier] = { name: supplier, totalQty: 0, totalValue: 0, categories: {} };
      }
      const sup = bySupplier[supplier];
      if (!sup.categories[category]) {
        sup.categories[category] = { name: category, totalQty: 0, totalValue: 0, items: [] };
      }
      const cat = sup.categories[category];

      cat.items.push({ ...r, qty, rate, value });
      cat.totalQty += qty;
      cat.totalValue += value;
      sup.totalQty += qty;
      sup.totalValue += value;
      gQty += qty;
      gVal += value;
    });

    const groupList = Object.values(bySupplier)
      .map(sup => ({ ...sup, categories: Object.values(sup.categories).sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { groups: groupList, grandQty: gQty, grandValue: gVal };
  }, [reportData, priceMode, search, selectedSuppliers, selectedCategories]);

  const toggleCollapsed = useCallback((name) => setCollapsed(prev => ({ ...prev, [name]: !prev[name] })), []);

  const clearFilters = useCallback(() => {
    setSelectedSuppliers(new Set(allSuppliers));
    setSelectedCategories(new Set(allCategories));
    setSearch('');
    setSupplierSearch('');
    setCategorySearch('');
  }, [allSuppliers, allCategories]);

  const suppliersFilterActive = useMemo(() => selectedSuppliers.size < allSuppliers.length, [selectedSuppliers, allSuppliers]);
  const categoriesFilterActive = useMemo(() => selectedCategories.size < allCategories.length, [selectedCategories, allCategories]);
  const activeFilterCount = useMemo(
    () => (suppliersFilterActive ? 1 : 0) + (categoriesFilterActive ? 1 : 0) + (search.trim() ? 1 : 0),
    [suppliersFilterActive, categoriesFilterActive, search]
  );

  const visibleSupplierOptions = useMemo(() =>
    allSuppliers.filter(s => s.toLowerCase().includes(supplierSearch.toLowerCase())),
    [allSuppliers, supplierSearch]
  );

  const visibleCategoryOptions = useMemo(() =>
    allCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())),
    [allCategories, categorySearch]
  );

  // Memoize filtered supplier balances for the summary table
  const filteredSupplierBalances = useMemo(() => {
    return Object.entries(supplierBalances)
      .filter(([name]) => !suppliersFilterActive || selectedSuppliers.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [supplierBalances, suppliersFilterActive, selectedSuppliers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: '12px 20px', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>Stock in Hand — Supplier Wise</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {statusMsg && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: statusMsg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{statusMsg}</span>}
          <button onClick={loadReport} className="btn btn-secondary" disabled={loading}>{loading ? 'Loading...' : '↻ Refresh'}</button>
          <button onClick={handlePrint} className="btn btn-primary" style={{ background: '#3b82f6', borderColor: '#3b82f6' }}>🖨️ Print Report</button>
          <button onClick={handleSavePDF} className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}>📄 Save PDF</button>
        </div>
      </div>

      {unmappedCount > 0 && (
        <div className="no-print" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 16px', color: '#92400e', fontSize: '0.85rem' }}>
          ⚠️ {unmappedCount} item{unmappedCount === 1 ? '' : 's'} in stock have a brand not linked to a supplier — grouped under "Unmapped: [brand]" below.
          Fix it on the <b>Manufacturer Discounts</b> page.
        </div>
      )}

      {/* Compact filter toolbar — a single slim row, not a full-page panel */}
      <div
        ref={toolbarRef}
        className="no-print"
        style={{
          background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative'
        }}
      >
        {/* Valuation segmented control */}
        <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
          <button
            onClick={() => setPriceMode('list')}
            style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: priceMode === 'list' ? '#0369a1' : '#fff', color: priceMode === 'list' ? '#fff' : '#334155'
            }}
          >
            List Price
          </button>
          <button
            onClick={() => setPriceMode('actual')}
            style={{
              padding: '6px 12px', border: 'none', borderLeft: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: priceMode === 'actual' ? '#0369a1' : '#fff', color: priceMode === 'actual' ? '#fff' : '#334155'
            }}
          >
            Actual Cost
          </button>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 2px' }} />

        {/* Suppliers dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown(d => d === 'suppliers' ? null : 'suppliers')}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${suppliersFilterActive ? '#0369a1' : '#cbd5e1'}`,
              background: suppliersFilterActive ? '#e0f2fe' : '#fff', color: suppliersFilterActive ? '#0369a1' : '#334155'
            }}
          >
            Suppliers {suppliersFilterActive ? `(${selectedSuppliers.size}/${allSuppliers.length})` : '(All)'} ▾
          </button>
          {openDropdown === 'suppliers' && (
            <div style={dropdownPanelStyle}>
              <input
                autoFocus
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                placeholder="Filter suppliers..."
                style={dropdownSearchStyle}
              />
              <div style={{ display: 'flex', gap: 10, padding: '4px 10px 6px' }}>
                <button onClick={() => setSelectedSuppliers(new Set(allSuppliers))} style={linkBtnStyle}>Select all</button>
                <button onClick={() => setSelectedSuppliers(new Set())} style={linkBtnStyle}>Clear</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {visibleSupplierOptions.length === 0 && (
                  <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.82rem' }}>No matches</div>
                )}
                {visibleSupplierOptions.map(s => (
                  <label key={s} style={{ ...dropdownItemStyle, color: s.startsWith('Unmapped:') ? '#b45309' : '#334155' }}>
                    <input
                      type="checkbox"
                      checked={selectedSuppliers.has(s)}
                      onChange={() => toggleValue(setSelectedSuppliers, selectedSuppliers, s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Categories dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown(d => d === 'categories' ? null : 'categories')}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${categoriesFilterActive ? '#0369a1' : '#cbd5e1'}`,
              background: categoriesFilterActive ? '#e0f2fe' : '#fff', color: categoriesFilterActive ? '#0369a1' : '#334155'
            }}
          >
            Categories {categoriesFilterActive ? `(${selectedCategories.size}/${allCategories.length})` : '(All)'} ▾
          </button>
          {openDropdown === 'categories' && (
            <div style={dropdownPanelStyle}>
              <input
                autoFocus
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                placeholder="Filter categories..."
                style={dropdownSearchStyle}
              />
              <div style={{ display: 'flex', gap: 10, padding: '4px 10px 6px' }}>
                <button onClick={() => setSelectedCategories(new Set(allCategories))} style={linkBtnStyle}>Select all</button>
                <button onClick={() => setSelectedCategories(new Set())} style={linkBtnStyle}>Clear</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {visibleCategoryOptions.length === 0 && (
                  <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.82rem' }}>No matches</div>
                )}
                {visibleCategoryOptions.map(c => (
                  <label key={c} style={dropdownItemStyle}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(c)}
                      onChange={() => toggleValue(setSelectedCategories, selectedCategories, c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 2px' }} />

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Item code, description, brand..."
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: '0.82rem', width: 220 }}
        />

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} style={{ ...linkBtnStyle, fontSize: '0.82rem', marginLeft: 'auto' }}>
            ✕ Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Report */}
      <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20, flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading report data...</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No stock matches the current filters.</div>
        ) : (
          <div className="printable-report">
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .printable-report, .printable-report * { visibility: visible; }
                .printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
                .no-print { display: none !important; }
              }
              .ssr-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 0.9rem; }
              .ssr-table th, .ssr-table td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; }
              .ssr-table th { background: #f8fafc; font-weight: 700; color: #334155; }
              .ssr-supplier-row { background: #0369a1; color: #fff; cursor: pointer; }
              .ssr-supplier-row td { font-weight: 700; border-color: #0369a1; }
              .ssr-cat-row td { background: #e0f2fe; font-weight: 700; color: #0369a1; }
              .ssr-val { text-align: right !important; }
              .ssr-subtotal-row td { background: #f1f5f9; font-weight: 700; }
              .ssr-grand-row td { background: #1e293b; color: #fff; font-weight: 800; font-size: 1.02rem; }
            `}</style>

            <h1 style={{ display: 'none', margin: '0 0 20px', textAlign: 'center' }} className="print-heading">
              Stock in Hand — Supplier Wise ({priceMode === 'actual' ? 'Actual Cost' : 'List Price'})
            </h1>
            <style>{`@media print { .print-heading { display: block !important; } }`}</style>

            {groups.map(sup => (
              <SupplierRow
                key={sup.name}
                sup={sup}
                collapsed={collapsed}
                toggleCollapsed={toggleCollapsed}
                priceMode={priceMode}
                supplierBalances={supplierBalances}
                fmt={fmt}
                fmt2={fmt2}
              />
            ))}

            <table className="ssr-table">
              <tbody>
                <tr className="ssr-grand-row">
                  <td colSpan={2} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                  <td className="ssr-val">{fmt(grandQty)}</td>
                  <td className="ssr-val"></td>
                  <td className="ssr-val"></td>
                  <td className="ssr-val">{fmt(grandValue)}</td>
                </tr>
                {filteredSupplierBalances.length > 0 && (
                  <>
                    <tr className="ssr-subtotal-row">
                      <td colSpan={2} style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 700 }}>
                        Supp. Balance:
                      </td>
                      <td colSpan={4} className="ssr-val" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        {fmt2(Math.abs(filteredSupplierBalances.reduce((sum, [, bal]) => sum + bal, 0)))}{' '}
                        {filteredSupplierBalances.reduce((sum, [, bal]) => sum + bal, 0) >= 0 ? 'Cr' : 'Dr'}
                      </td>
                    </tr>
                    <tr className="ssr-subtotal-row">
                      <td colSpan={2} style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 700 }}>
                        Balance:
                      </td>
                      <td colSpan={4} className="ssr-val" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        {fmt2(Math.abs(filteredSupplierBalances.reduce((sum, [, bal]) => sum + bal, 0)))}{' '}
                        {filteredSupplierBalances.reduce((sum, [, bal]) => sum + bal, 0) >= 0 ? 'Cr' : 'Dr'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {/* Supplier Balances Summary */}
            {filteredSupplierBalances.length > 0 && (
              <table className="ssr-table" style={{ marginTop: 20 }}>
                <thead>
                  <tr>
                    <th colSpan={4} style={{ background: '#f8fafc', fontSize: '1rem', padding: '10px' }}>
                      Supplier Ledger Balances {suppliersFilterActive ? `(Filtered)` : ''}
                    </th>
                  </tr>
                  <tr>
                    <th>Supplier</th>
                    <th>Balance Type</th>
                    <th className="ssr-val" colSpan={4}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupplierBalances.map(([name, balance]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{balance >= 0 ? 'Cr' : 'Dr'}</td>
                      <td className="ssr-val" colSpan={4}>{fmt2(Math.abs(balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const linkBtnStyle = {
  border: 'none', background: 'none', color: '#0369a1', fontSize: '0.78rem', fontWeight: 600,
  cursor: 'pointer', padding: '2px 4px'
};

const dropdownPanelStyle = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, background: '#fff',
  border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
  width: 260, paddingTop: 8, paddingBottom: 4
};

const dropdownSearchStyle = {
  margin: '0 10px 6px', width: 'calc(100% - 20px)', padding: '6px 8px',
  border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem'
};

const dropdownItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem',
  padding: '6px 12px', cursor: 'pointer'
};

export default SupplierStockReport;