import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { printManufacturerStock, saveManufacturerStockPDF } from '../utils/printManufacturerStock';

const { ipcRenderer } = window.require('electron');

const fmt = (n) => Math.round(n || 0).toLocaleString();
const fmt2 = (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Memoized category section component to prevent re-rendering item rows when balance visibility toggles
const CategorySection = memo(({ cat, priceMode, fmt, fmt2 }) => (
  <React.Fragment>
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
));

// Memoized supplier row component for better performance
const SupplierRow = memo(({ sup, collapsed, toggleCollapsed, priceMode, supplierBalances, showSupplierBalance, fmt, fmt2 }) => {
  const isCollapsed = collapsed[sup.name] !== undefined ? !!collapsed[sup.name] : (sup._defaultCollapsed ?? false);
  const balKey = sup.name.trim().toLowerCase();
  const rawBalance = supplierBalances[balKey];
  const hasBal = showSupplierBalance && rawBalance !== undefined;
  const netBalance = (rawBalance !== undefined ? rawBalance : 0) - (sup.totalValue || 0);

  return (
    <table className="ssr-table" key={sup.name}>
      <thead>
        <tr className="ssr-supplier-row" onClick={() => toggleCollapsed(sup.name)}>
          <th colSpan={2}>{isCollapsed ? '▶' : '▼'} {sup.name}</th>
          <th className="ssr-val" style={{ width: 80 }}>Qty: {fmt(sup.totalQty)}</th>
          <th className="ssr-val" style={{ width: 140 }}>
            {hasBal ? (
              <span style={{ color: rawBalance > 0 ? '#15803d' : rawBalance < 0 ? '#dc2626' : '#e2e8f0', fontWeight: 800 }}>
                Sup Bal: {fmt2(Math.abs(rawBalance))} {rawBalance > 0 ? 'Cr (Dene Hain)' : rawBalance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
              </span>
            ) : ''}
          </th>
          <th className="ssr-val" style={{ width: 110 }}>Value: {fmt(sup.totalValue)}</th>
          <th className="ssr-val" style={{ width: 160 }}>
            {hasBal ? (
              <span style={{ color: netBalance > 0 ? '#15803d' : netBalance < 0 ? '#dc2626' : '#e2e8f0', fontWeight: 800 }}>
                Stock in Hand: {fmt2(Math.abs(netBalance))} {netBalance > 0 ? 'Cr (Dene Hain)' : netBalance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
              </span>
            ) : ''}
          </th>
        </tr>
        {!isCollapsed && (
          <tr>
            <th style={{ width: 140 }}>Item Code</th>
            <th>Description / Brand</th>
            <th className="ssr-val" style={{ width: 80 }}>Qty</th>
            <th className="ssr-val" style={{ width: 140 }}>{priceMode === 'actual' ? 'Actual Cost' : 'Purchase Price'}</th>
            <th className="ssr-val" style={{ width: 110 }}>Sale Price</th>
            <th className="ssr-val" style={{ width: 140 }}>Value</th>
          </tr>
        )}
      </thead>
      {!isCollapsed && (
        <tbody>
          {sup.categories.map(cat => (
            <CategorySection key={cat.name} cat={cat} priceMode={priceMode} fmt={fmt} fmt2={fmt2} />
          ))}
          <tr className="ssr-subtotal-row">
            <td colSpan={2} style={{ textAlign: 'right' }}>Supplier Total:</td>
            <td className="ssr-val" style={{ width: 80 }}>{fmt(sup.totalQty)}</td>
            <td className="ssr-val" style={{ width: 140 }}>
              {hasBal ? (
                <span style={{ color: rawBalance > 0 ? '#15803d' : rawBalance < 0 ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                  Sup Bal: {fmt2(Math.abs(rawBalance))} {rawBalance > 0 ? 'Cr (Dene Hain)' : rawBalance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
                </span>
              ) : ''}
            </td>
            <td className="ssr-val" style={{ width: 110 }}>{fmt(sup.totalValue)}</td>
            <td className="ssr-val" style={{ width: 160 }}>
              {hasBal ? (
                <span style={{ color: netBalance > 0 ? '#15803d' : netBalance < 0 ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                  Stock in Hand: {fmt2(Math.abs(netBalance))} {netBalance > 0 ? 'Cr (Dene Hain)' : netBalance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
                </span>
              ) : ''}
            </td>
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
  const [showSupplierBalance, setShowSupplierBalance] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSuppliers, setSelectedSuppliers] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [selectedYears, setSelectedYears] = useState(new Set());
  const [collapsed, setCollapsed] = useState({});
  const [sortField, setSortField] = useState(null); // 'qty' | 'purchasePrice' | 'salePrice' | 'itemCode' | 'description'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Debounce search input to avoid lagging UI while typing fast
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 150);
    return () => clearTimeout(handler);
  }, [search]);

  // Dropdown popover state (kept compact — no permanent full-width panel)
  const [openDropdown, setOpenDropdown] = useState(null); // 'suppliers' | 'categories' | 'years' | null
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [yearSearch, setYearSearch] = useState('');
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

      // Filters default to NO suppliers selected by default on initial load for instant performance.
      setSelectedSuppliers(new Set());
      setSelectedCategories(new Set(rows.map(r => r.category || 'Uncategorized')));
      setSelectedYears(new Set(rows.map(r => r.year ? String(r.year).trim() : 'Unspecified')));
      setSearch('');
      setDebouncedSearch('');

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
    printManufacturerStock(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance);
  };

  const handleSavePDF = async () => {
    const res = await saveManufacturerStockPDF(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance);
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

  const allYears = useMemo(() => {
    const set = new Set(reportData.map(r => r.year ? String(r.year).trim() : 'Unspecified'));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
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

  // Helper to score match relevance when searching
  const getMatchRank = (r, query) => {
    if (!query) return 99;
    const code = String(r.item_code || '').trim().toLowerCase();
    if (code === query) return 1;              // Exact item code match
    if (code.startsWith(query)) return 2;      // Item code starts with search query
    if (code.includes(query)) return 3;        // Item code contains search query
    const desc = String(r.description || '').toLowerCase();
    const brand = String(r.brand || '').toLowerCase();
    const yr = String(r.year || '').toLowerCase();
    if (desc.includes(query) || brand.includes(query) || yr.includes(query)) return 4; // Description/brand/year match
    return 99;
  };

  // Filtered + grouped rows
  const { groups, grandQty, grandValue } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = reportData.filter(r => {
      const supplier = r.supplier_name || 'Unassigned';
      const category = r.category || 'Uncategorized';
      const itemYear = r.year ? String(r.year).trim() : 'Unspecified';
      if (selectedSuppliers.size > 0) {
        if (!selectedSuppliers.has(supplier)) return false;
      } else if (!q) {
        return false;
      }
      if (!selectedCategories.has(category)) return false;
      if (!selectedYears.has(itemYear)) return false;
      if (q) {
        const hay = `${r.item_code} ${r.description} ${r.brand} ${r.year || ''}`.toLowerCase();
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
      const rank = getMatchRank(r, q);

      if (!bySupplier[supplier]) {
        bySupplier[supplier] = { name: supplier, totalQty: 0, totalValue: 0, categories: {} };
      }
      const sup = bySupplier[supplier];
      if (!sup.categories[category]) {
        sup.categories[category] = { name: category, totalQty: 0, totalValue: 0, items: [] };
      }
      const cat = sup.categories[category];

      cat.items.push({ ...r, qty, rate, value, matchRank: rank });
      cat.totalQty += qty;
      cat.totalValue += value;
      sup.totalQty += qty;
      sup.totalValue += value;
      gQty += qty;
      gVal += value;
    });

    const groupList = Object.values(bySupplier)
      .map(sup => {
        const sortedCategories = Object.values(sup.categories).map(cat => ({
          ...cat,
          items: cat.items.sort((a, b) => {
            if (q && a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;

            // Apply sorting based on selected field
            if (sortField) {
              const multiplier = sortDirection === 'asc' ? 1 : -1;
              switch (sortField) {
                case 'qty':
                  return (a.qty - b.qty) * multiplier;
                case 'purchasePrice':
                  const aPurchase = priceMode === 'actual' ? (a.latest_net_rate || a.actual_rate || 0) : (a.list_rate || 0);
                  const bPurchase = priceMode === 'actual' ? (b.latest_net_rate || b.actual_rate || 0) : (b.list_rate || 0);
                  return (aPurchase - bPurchase) * multiplier;
                case 'salePrice':
                  return ((a.sale_rate || 0) - (b.sale_rate || 0)) * multiplier;
                case 'itemCode':
                  return String(a.item_code).localeCompare(String(b.item_code), undefined, { numeric: true }) * multiplier;
                case 'description':
                  const aDesc = `${a.description || ''} ${a.category || ''} ${a.size_range || ''} ${a.gender || ''}`.replace(/\s+/g, ' ').trim();
                  const bDesc = `${b.description || ''} ${b.category || ''} ${b.size_range || ''} ${b.gender || ''}`.replace(/\s+/g, ' ').trim();
                  return aDesc.localeCompare(bDesc) * multiplier;
                default:
                  break;
              }
            }

            return String(a.item_code).localeCompare(String(b.item_code), undefined, { numeric: true });
          })
        })).sort((a, b) => {
          if (q) {
            const aMin = Math.min(...a.items.map(i => i.matchRank));
            const bMin = Math.min(...b.items.map(i => i.matchRank));
            if (aMin !== bMin) return aMin - bMin;
          }
          return a.name.localeCompare(b.name);
        });

        return {
          ...sup,
          _defaultCollapsed: false,
          categories: sortedCategories
        };
      })
      .sort((a, b) => {
        if (q) {
          const aMin = Math.min(...a.categories.flatMap(c => c.items.map(i => i.matchRank)));
          const bMin = Math.min(...b.categories.flatMap(c => c.items.map(i => i.matchRank)));
          if (aMin !== bMin) return aMin - bMin;
        }
        return a.name.localeCompare(b.name);
      });

    return { groups: groupList, grandQty: gQty, grandValue: gVal };
  }, [reportData, priceMode, debouncedSearch, selectedSuppliers, selectedCategories, selectedYears, sortField, sortDirection]);

  const toggleCollapsed = useCallback((name) => setCollapsed(prev => ({ ...prev, [name]: !prev[name] })), []);

  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const getSortLabel = (field) => {
    const labels = {
      itemCode: 'Item Code',
      description: 'Description',
      qty: 'Qty',
      purchasePrice: priceMode === 'actual' ? 'Actual Cost' : 'Purchase Price',
      salePrice: 'Sale Price'
    };
    return labels[field] || field;
  };

  const clearFilters = useCallback(() => {
    setSelectedSuppliers(new Set());
    setSelectedCategories(new Set(allCategories));
    setSelectedYears(new Set(allYears));
    setSearch('');
    setDebouncedSearch('');
    setSupplierSearch('');
    setCategorySearch('');
    setYearSearch('');
    setCollapsed({});
  }, [allCategories, allYears]);

  const suppliersFilterActive = useMemo(() => selectedSuppliers.size > 0 && selectedSuppliers.size < allSuppliers.length, [selectedSuppliers, allSuppliers]);
  const categoriesFilterActive = useMemo(() => selectedCategories.size < allCategories.length, [selectedCategories, allCategories]);
  const yearsFilterActive = useMemo(() => selectedYears.size < allYears.length, [selectedYears, allYears]);
  const activeFilterCount = useMemo(
    () => (selectedSuppliers.size > 0 ? 1 : 0) + (categoriesFilterActive ? 1 : 0) + (yearsFilterActive ? 1 : 0) + (search.trim() ? 1 : 0),
    [selectedSuppliers, categoriesFilterActive, yearsFilterActive, search]
  );

  const visibleSupplierOptions = useMemo(() =>
    allSuppliers.filter(s => s.toLowerCase().includes(supplierSearch.toLowerCase())),
    [allSuppliers, supplierSearch]
  );

  const visibleCategoryOptions = useMemo(() =>
    allCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())),
    [allCategories, categorySearch]
  );

  const visibleYearOptions = useMemo(() =>
    allYears.filter(y => y.toLowerCase().includes(yearSearch.toLowerCase())),
    [allYears, yearSearch]
  );

  // Memoize filtered supplier balances for the summary table
  const filteredSupplierBalances = useMemo(() => {
    if (!showSupplierBalance) return [];
    return Object.entries(supplierBalances)
      .filter(([name]) => !suppliersFilterActive || selectedSuppliers.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [supplierBalances, suppliersFilterActive, selectedSuppliers, showSupplierBalance]);

  const totalSupplierBalance = useMemo(() => {
    if (!showSupplierBalance || filteredSupplierBalances.length === 0) return 0;
    return filteredSupplierBalances.reduce((sum, [, bal]) => sum + (parseFloat(bal) || 0), 0);
  }, [showSupplierBalance, filteredSupplierBalances]);

  const { totalPayable, totalReceivable, netSupplierBalance } = useMemo(() => {
    let payable = 0;
    let receivable = 0;
    filteredSupplierBalances.forEach(([, bal]) => {
      const num = parseFloat(bal) || 0;
      if (num > 0) payable += num;
      else if (num < 0) receivable += Math.abs(num);
    });
    return {
      totalPayable: payable,
      totalReceivable: receivable,
      netSupplierBalance: payable - receivable
    };
  }, [filteredSupplierBalances]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: '12px 20px', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>Stock in Hand — Supplier Wise</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {statusMsg && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: statusMsg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{statusMsg}</span>}
          <button onClick={loadReport} className="btn btn-secondary" disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
          <button onClick={handlePrint} className="btn btn-primary" style={{ background: '#3b82f6', borderColor: '#3b82f6' }}>Print Report</button>
          <button onClick={handleSavePDF} className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}>Save PDF</button>
        </div>
      </div>

      {unmappedCount > 0 && (
        <div className="no-print" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 16px', color: '#92400e', fontSize: '0.85rem' }}>
          {unmappedCount} item{unmappedCount === 1 ? '' : 's'} in stock have a brand not linked to a supplier — grouped under "Unmapped: [brand]" below.
          Fix it on the Manufacturer Discounts page.
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
            Purchase Price
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

        {/* Supplier Balance show/hide toggle */}
        <button
          onClick={() => setShowSupplierBalance(prev => !prev)}
          style={{
            padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            border: `1px solid ${showSupplierBalance ? '#0369a1' : '#cbd5e1'}`,
            background: showSupplierBalance ? '#e0f2fe' : '#fff',
            color: showSupplierBalance ? '#0369a1' : '#64748b'
          }}
          title="Toggle visibility of supplier balance in UI, Print, and PDF"
        >
          {showSupplierBalance ? 'Supplier Balance: Shown' : 'Supplier Balance: Hidden'}
        </button>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 2px' }} />

        {/* Suppliers dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown(d => d === 'suppliers' ? null : 'suppliers')}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${selectedSuppliers.size > 0 ? '#0369a1' : '#cbd5e1'}`,
              background: selectedSuppliers.size > 0 ? '#e0f2fe' : '#fff', color: selectedSuppliers.size > 0 ? '#0369a1' : '#334155'
            }}
          >
            Suppliers {selectedSuppliers.size === 0 ? '(None)' : (selectedSuppliers.size === allSuppliers.length ? '(All)' : `(${selectedSuppliers.size}/${allSuppliers.length})`)} ▾
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

        {/* Year dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown(d => d === 'years' ? null : 'years')}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${yearsFilterActive ? '#0369a1' : '#cbd5e1'}`,
              background: yearsFilterActive ? '#e0f2fe' : '#fff', color: yearsFilterActive ? '#0369a1' : '#334155'
            }}
          >
            Year {yearsFilterActive ? `(${selectedYears.size}/${allYears.length})` : '(All)'} ▾
          </button>
          {openDropdown === 'years' && (
            <div style={dropdownPanelStyle}>
              <input
                autoFocus
                value={yearSearch}
                onChange={e => setYearSearch(e.target.value)}
                placeholder="Filter year..."
                style={dropdownSearchStyle}
              />
              <div style={{ display: 'flex', gap: 10, padding: '4px 10px 6px' }}>
                <button onClick={() => setSelectedYears(new Set(allYears))} style={linkBtnStyle}>Select all</button>
                <button onClick={() => setSelectedYears(new Set())} style={linkBtnStyle}>Clear</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {visibleYearOptions.length === 0 && (
                  <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.82rem' }}>No matches</div>
                )}
                {visibleYearOptions.map(y => (
                  <label key={y} style={dropdownItemStyle}>
                    <input
                      type="checkbox"
                      checked={selectedYears.has(y)}
                      onChange={() => toggleValue(setSelectedYears, selectedYears, y)}
                    />
                    {y}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown(d => d === 'sort' ? null : 'sort')}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${sortField ? '#0369a1' : '#cbd5e1'}`,
              background: sortField ? '#e0f2fe' : '#fff', color: sortField ? '#0369a1' : '#334155'
            }}
          >
            Sort: {sortField ? `${getSortLabel(sortField)} ${sortDirection === 'asc' ? '↑' : '↓'}` : 'Default'} ▾
          </button>
          {openDropdown === 'sort' && (
            <div style={dropdownPanelStyle}>
              <div style={{ padding: '4px 10px 6px', fontWeight: 600, fontSize: '0.82rem', color: '#64748b' }}>Sort by:</div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {[
                  { field: 'itemCode', label: 'Item Code' },
                  { field: 'description', label: 'Description' },
                  { field: 'qty', label: 'Qty' },
                  { field: 'purchasePrice', label: priceMode === 'actual' ? 'Actual Cost' : 'Purchase Price' },
                  { field: 'salePrice', label: 'Sale Price' }
                ].map(({ field, label }) => (
                  <label key={field} style={dropdownItemStyle}>
                    <input
                      type="radio"
                      name="sortField"
                      checked={sortField === field}
                      onChange={() => { setSortField(field); setSortDirection('asc'); setOpenDropdown(null); }}
                    />
                    {label}
                    {sortField === field && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                        style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
                      >
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </button>
                    )}
                  </label>
                ))}
                <button
                  onClick={() => { setSortField(null); setSortDirection('asc'); setOpenDropdown(null); }}
                  style={{ ...linkBtnStyle, width: '100%', textAlign: 'center', padding: '6px', marginTop: '4px', borderTop: '1px solid #e2e8f0' }}
                >
                  Clear Sort
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 2px' }} />

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Item code, description, brand, year..."
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: '0.82rem', width: 220 }}
        />

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} style={{ ...linkBtnStyle, fontSize: '0.82rem', marginLeft: 'auto' }}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Report */}
      <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20, flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading report data...</div>
        ) : selectedSuppliers.size === 0 && !search.trim() ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: '0.95rem' }}>
            📦 <strong>No suppliers selected.</strong> Please select a supplier from the <strong>Suppliers</strong> dropdown above or type an item code in search to view stock.
          </div>
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
              Stock in Hand — Supplier Wise ({priceMode === 'actual' ? 'Actual Cost' : 'Purchase Price'})
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
                showSupplierBalance={showSupplierBalance}
                fmt={fmt}
                fmt2={fmt2}
              />
            ))}

            <table className="ssr-table">
              <tbody>
                <tr className="ssr-grand-row">
                  <td colSpan={2} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                  <td className="ssr-val" style={{ width: 80 }}>{fmt(grandQty)}</td>
                  <td className="ssr-val" style={{ width: 140 }}>
                    {showSupplierBalance && filteredSupplierBalances.length > 0 ? (
                      <span style={{ color: totalSupplierBalance > 0 ? '#86efac' : totalSupplierBalance < 0 ? '#fca5a5' : '#e2e8f0', fontWeight: 800 }}>
                        Sup Bal: {fmt2(Math.abs(totalSupplierBalance))} {totalSupplierBalance > 0 ? 'Cr (Dene Hain)' : totalSupplierBalance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
                      </span>
                    ) : ''}
                  </td>
                  <td className="ssr-val" style={{ width: 110 }}>{fmt(grandValue)}</td>
                  <td className="ssr-val" style={{ width: 160 }}>
                    {showSupplierBalance && filteredSupplierBalances.length > 0 ? (
                      <span style={{ color: (totalSupplierBalance - grandValue) > 0 ? '#86efac' : (totalSupplierBalance - grandValue) < 0 ? '#fca5a5' : '#e2e8f0', fontWeight: 800 }}>
                        Stock in Hand: {fmt2(Math.abs(totalSupplierBalance - grandValue))} ${(totalSupplierBalance - grandValue) > 0 ? 'Cr (Dene Hain)' : (totalSupplierBalance - grandValue) < 0 ? 'Dr (Lene Hain)' : 'Nil'}
                      </span>
                    ) : ''}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Supplier Balances Summary */}
            {showSupplierBalance && filteredSupplierBalances.length > 0 && (
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
                      <td style={{ fontWeight: 600, textTransform: 'uppercase' }}>{(name || '').toUpperCase()}</td>
                      <td>
                        <span style={{
                          padding: '3px 8px', borderRadius: 5, fontWeight: 700, fontSize: '0.8rem',
                          background: balance > 0 ? '#dcfce7' : balance < 0 ? '#fee2e2' : '#f1f5f9',
                          color: balance > 0 ? '#15803d' : balance < 0 ? '#b91c1c' : '#475569'
                        }}>
                          {balance > 0 ? 'Dene Hain (Cr)' : balance < 0 ? 'Lene Hain (Dr)' : 'Nil'}
                        </span>
                      </td>
                      <td className="ssr-val" colSpan={4} style={{ fontWeight: 800, color: balance > 0 ? '#15803d' : balance < 0 ? '#dc2626' : '#475569' }}>
                        {fmt2(Math.abs(balance))} {balance > 0 ? 'Cr (Dene Hain)' : balance < 0 ? 'Dr (Lene Hain)' : 'Nil'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                    <td colSpan={2} style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                      TOTAL PAYABLE — DENE HAIN (Cr):
                    </td>
                    <td className="ssr-val" colSpan={4} style={{ color: '#15803d', fontSize: '0.95rem', fontWeight: 900 }}>
                      {fmt2(totalPayable)} Cr
                    </td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                    <td colSpan={2} style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                      TOTAL RECEIVABLE — LENE HAIN (Dr):
                    </td>
                    <td className="ssr-val" colSpan={4} style={{ color: '#dc2626', fontSize: '0.95rem', fontWeight: 900 }}>
                      {fmt2(totalReceivable)} Dr
                    </td>
                  </tr>
                  <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 900 }}>
                    <td colSpan={2} style={{ textAlign: 'right', fontSize: '0.95rem' }}>
                      STOCK IN HAND ({netSupplierBalance >= 0 ? 'TOTAL PAYABLE — DENE HAIN' : 'TOTAL RECEIVABLE — LENE HAIN'}):
                    </td>
                    <td className="ssr-val" colSpan={4} style={{ color: netSupplierBalance >= 0 ? '#86efac' : '#fca5a5', fontSize: '1rem', fontWeight: 900 }}>
                      {fmt2(Math.abs(netSupplierBalance))} {netSupplierBalance >= 0 ? 'Cr (Dene Hain)' : 'Dr (Lene Hain)'}
                    </td>
                  </tr>
                </tfoot>
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