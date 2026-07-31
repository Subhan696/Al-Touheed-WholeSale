import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ManufacturerDiscounts.css';

const { ipcRenderer } = window.require('electron');

const nextId = () => Math.random().toString(36).substr(2, 9);
const makeRow = () => ({ id: nextId(), manufacturer: '', supplier_id: '', brand: '', discount_pct: '', discount_amount: '' });

// Pastel colors for grouping
const groupColors = [
  '#f8fafc', // Default
  '#f0fdf4', // Light green
  '#eff6ff', // Light blue
  '#fffbeb', // Light yellow
  '#fdf2f8', // Light pink
  '#faf5ff', // Light purple
  '#fef2f2', // Light red
];

function ManufacturerDiscounts({ openWindow }) {
  const [manufacturers, setManufacturers] = useState([]);
  const [mfgListFull, setMfgListFull] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [rows, setRows] = useState([makeRow()]);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [showManageModal, setShowManageModal] = useState(false);
  const [newMfgName, setNewMfgName] = useState('');

  const gridRefs = useRef({});
  const manageInputRef = useRef(null);

  const [activeBrandDropdown, setActiveBrandDropdown] = useState(null);
  const [highlightedBrandIdx, setHighlightedBrandIdx] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const m = await ipcRenderer.invoke('get-manufacturers');
      setManufacturers(m.map(x => x.name));
      setMfgListFull(m);

      const b = await ipcRenderer.invoke('get-brands');
      setAllBrands(b.map(x => x.name));

      const s = await ipcRenderer.invoke('get-suppliers-list').catch(() => []);
      setSuppliersList(s || []);
      const supplierByName = {};
      (s || []).forEach(sup => { supplierByName[sup.name.trim().toLowerCase()] = sup.id; });

      const d = await ipcRenderer.invoke('get-manufacturer-brands');
      if (d && d.length > 0) {
        const mapped = d.map(r => {
          const mfgName = r.company_name || '';
          // Fall back to auto-matching a supplier with the same name, so
          // existing rows saved before the supplier link existed self-heal.
          const autoMatchId = supplierByName[mfgName.trim().toLowerCase()];
          return {
            id: nextId(),
            manufacturer: mfgName,
            supplier_id: r.supplier_id ? String(r.supplier_id) : (autoMatchId ? String(autoMatchId) : ''),
            brand: r.brand_name || '',
            discount_pct: r.purchase_discount_pct ? String(r.purchase_discount_pct) : '',
            discount_amount: r.discount_amount ? String(r.discount_amount) : ''
          };
        });
        mapped.push(makeRow());
        setRows(mapped);
      } else {
        setRows([makeRow()]);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const commitBrandSplit = useCallback((rowId) => {
    setRows(prev => {
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;

      const currentRow = newRows[idx];
      const brandsArr = currentRow.brand.split(',').map(b => b.trim()).filter(b => b);

      if (brandsArr.length > 1) {
        newRows[idx] = { ...currentRow, brand: brandsArr[0] };

        const generatedRows = brandsArr.slice(1).map(b => ({
          id: nextId(),
          manufacturer: currentRow.manufacturer,
          supplier_id: currentRow.supplier_id,
          brand: b,
          discount_pct: currentRow.discount_pct,
          discount_amount: currentRow.discount_amount
        }));

        newRows.splice(idx + 1, 0, ...generatedRows);
      }

      const lastRow = newRows[newRows.length - 1];
      if (lastRow.manufacturer || lastRow.supplier_id || lastRow.brand || lastRow.discount_pct || lastRow.discount_amount) {
        newRows.push(makeRow());
      }
      return newRows;
    });
  }, []);

  const prevActiveRef = useRef(null);
  useEffect(() => {
    if (prevActiveRef.current && prevActiveRef.current !== activeBrandDropdown) {
      commitBrandSplit(prevActiveRef.current);
    }
    prevActiveRef.current = activeBrandDropdown;
  }, [activeBrandDropdown, commitBrandSplit]);

  useEffect(() => {
    loadData();
    const handleClickOutside = (e) => {
      if (!e.target.closest('.md-cell-brand')) {
        setActiveBrandDropdown(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [loadData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validRows = rows
        .map(r => {
          let mfg = r.manufacturer ? r.manufacturer.trim() : '';
          if (!mfg && r.supplier_id) {
            const sup = suppliersList.find(s => String(s.id) === String(r.supplier_id));
            if (sup) mfg = sup.name;
          }
          return { ...r, manufacturer: mfg };
        })
        .filter(r => r.manufacturer && r.brand.trim());

      await ipcRenderer.invoke('save-manufacturer-discounts-bulk', validRows);
      setStatusMsg('Saved successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
      loadData();
    } catch (e) {
      setStatusMsg('Error saving data.');
      setTimeout(() => setStatusMsg(''), 3000);
    }
    setIsSaving(false);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows]); // Dependency array needs rows for handleSave to access the latest state

  const handleRowChange = (id, field, value) => {
    setRows(prev => {
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === id);
      if (idx === -1) return prev;

      newRows[idx] = { ...newRows[idx], [field]: value };

      // If supplier changed, sync the manufacturer name
      if (field === 'supplier_id') {
        const match = suppliersList.find(s => String(s.id) === String(value));
        if (match) newRows[idx].manufacturer = match.name;
      }

      // If manufacturer changed and no supplier is picked yet, try to auto-match
      // a supplier account with the same name — user can still override it.
      if (field === 'manufacturer' && !newRows[idx].supplier_id) {
        const match = suppliersList.find(s => s.name.trim().toLowerCase() === value.trim().toLowerCase());
        if (match) newRows[idx].supplier_id = String(match.id);
      }

      const lastRow = newRows[newRows.length - 1];
      if (lastRow.manufacturer || lastRow.supplier_id || lastRow.brand || lastRow.discount_pct || lastRow.discount_amount) {
        newRows.push(makeRow());
      }
      return newRows;
    });
  };

  const handleBrandToggle = (id, brandName) => {
    setRows(prev => {
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === id);
      if (idx === -1) return prev;

      let currentBrands = newRows[idx].brand.split(',').map(b => b.trim()).filter(b => b);
      if (currentBrands.includes(brandName)) {
        currentBrands = currentBrands.filter(b => b !== brandName);
      } else {
        currentBrands.push(brandName);
      }

      newRows[idx] = { ...newRows[idx], brand: currentBrands.join(', ') };
      return newRows;
    });
  };

  const handleDeleteRow = (id) => {
    setRows(prev => {
      if (prev.length === 1) return [makeRow()];
      const next = prev.filter(r => r.id !== id);
      const lastRow = next[next.length - 1];
      if (lastRow.manufacturer || lastRow.supplier_id || lastRow.brand || lastRow.discount_pct || lastRow.discount_amount) {
        next.push(makeRow());
      }
      return next;
    });
  };

  const searchBufferRef = useRef('');
  const searchTimeoutRef = useRef(null);

  const handleKeyDown = (e, rowId, field) => {
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === -1) return;

    let targetIdx = idx;
    let targetField = field;
    const fields = ['manufacturer', 'supplier_id', 'brand', 'discount_pct', 'discount_amount'];
    const fieldIdx = fields.indexOf(field);

    if (e.key === 'Escape' && field === 'brand') {
      setActiveBrandDropdown(null);
      return;
    }

    if (field === 'brand' && activeBrandDropdown === rowId) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedBrandIdx(prev => Math.min(prev + 1, allBrands.length - 1));
        const el = document.getElementById(`md-brand-item-${Math.min(highlightedBrandIdx + 1, allBrands.length - 1)}`);
        el?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedBrandIdx(prev => Math.max(prev - 1, 0));
        const el = document.getElementById(`md-brand-item-${Math.max(highlightedBrandIdx - 1, 0)}`);
        el?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const brandToToggle = allBrands[highlightedBrandIdx];
        if (brandToToggle) handleBrandToggle(rowId, brandToToggle);
        return;
      }

      // Type-to-jump logic (like native select)
      if (e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) {
        e.preventDefault();
        searchBufferRef.current += e.key.toLowerCase();

        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
          searchBufferRef.current = '';
        }, 1000);

        const matchIdx = allBrands.findIndex(b => b.toLowerCase().startsWith(searchBufferRef.current));
        if (matchIdx !== -1) {
          setHighlightedBrandIdx(matchIdx);
          const el = document.getElementById(`md-brand-item-${matchIdx}`);
          el?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
    }

    if (e.key === 'Tab' && field === 'brand') {
      e.preventDefault();
      setActiveBrandDropdown(null);
      setTimeout(() => gridRefs.current[`${rowId}-discount_pct`]?.focus(), 0);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (fieldIdx < fields.length - 1) {
        targetField = fields[fieldIdx + 1];
      } else {
        targetIdx = Math.min(idx + 1, rows.length - 1);
        targetField = 'manufacturer'; // Go to next row's manufacturer column
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      targetIdx = Math.min(idx + 1, rows.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      targetIdx = Math.max(idx - 1, 0);
    } else if (e.key === 'ArrowRight' && e.altKey) {
      e.preventDefault();
      targetField = fields[Math.min(fieldIdx + 1, fields.length - 1)];
    } else if (e.key === 'ArrowLeft' && e.altKey) {
      e.preventDefault();
      targetField = fields[Math.max(fieldIdx - 1, 0)];
    }

    if (targetIdx !== idx || targetField !== field) {
      const targetId = rows[targetIdx].id;
      setTimeout(() => gridRefs.current[`${targetId}-${targetField}`]?.focus(), 0);
    }
  };

  const [mfgError, setMfgError] = useState('');
  const [editingMfgId, setEditingMfgId] = useState(null);
  const [editingMfgName, setEditingMfgName] = useState('');

  const handleAddMfg = async () => {
    setMfgError('');
    if (!newMfgName.trim()) return;
    await ipcRenderer.invoke('add-manufacturer', newMfgName.trim());
    setNewMfgName('');
    await loadData();
    setTimeout(() => manageInputRef.current?.focus(), 0);
  };

  const handleUpdateMfg = async (id) => {
    setMfgError('');
    if (!editingMfgName.trim()) return;
    const res = await ipcRenderer.invoke('update-supplier', { id, name: editingMfgName.trim() });
    if (res && res.success === false && res.error) {
      setMfgError(res.error);
      return;
    }
    setEditingMfgId(null);
    setEditingMfgName('');
    await loadData();
  };

  const handleDeleteMfg = async (id) => {
    setMfgError('');
    const res = await ipcRenderer.invoke('delete-supplier', id);
    if (res && res.success === false && res.error) {
      setMfgError(res.error);
      return;
    }
    await loadData();
  };

  // Pre-calculate groups and colors
  let currentColorIdx = 0;
  const decoratedRows = rows.map((r, idx) => {
    const prev = idx > 0 ? rows[idx - 1] : null;
    const next = idx < rows.length - 1 ? rows[idx + 1] : null;

    // If it's a blank row at the end, default white
    if (!r.manufacturer && !r.brand) {
      return { ...r, _bg: '#ffffff', _hideMfg: false };
    }

    // Change color when manufacturer changes
    if (idx > 0 && r.manufacturer !== prev?.manufacturer) {
      currentColorIdx++;
    }

    const _bg = groupColors[(currentColorIdx % (groupColors.length - 1)) + 1];

    const isStart = !prev || r.manufacturer !== prev.manufacturer;
    const isEnd = !next || r.manufacturer !== next.manufacturer;
    const _hideMfg = !isStart && r.manufacturer !== '';

    return { ...r, _bg, _hideMfg, isStart, isEnd };
  });

  return (
    <div className="manufacturer-discounts-page">
      <div className="md-header">
        <div>
          <h2 className="md-title">Manufacturer Discounts</h2>
          <p className="md-subtitle">Link each brand to its supplier account so stock &amp; ledger reports group correctly. Select multiple brands to auto-split them into rows! Empty row at bottom for new manufacturers.</p>
        </div>
        <div className="md-actions">
          {statusMsg && <span className="md-status">{statusMsg}</span>}
          {rows.filter(r => r.brand && !r.supplier_id).length > 0 && (
            <span style={{ color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px', fontSize: '0.82rem', fontWeight: 600 }}>
              ⚠️ {rows.filter(r => r.brand && !r.supplier_id).length} brand(s) not linked to a supplier
            </span>
          )}
          <button className="md-btn md-btn-secondary" onClick={() => { setShowManageModal(true); setTimeout(() => manageInputRef.current?.focus(), 100); }}>⚙️ Manage Manufacturers List</button>
          <button className="md-btn md-btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save All Discounts'}
          </button>
        </div>
      </div>

      <div className="md-grid-container">
        <table className="md-grid-table md-grid-grouped">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: '36%' }}>Supplier</th>
              <th style={{ width: '36%' }}>Brand (Check multiple!)</th>
              <th style={{ width: '14%' }}>Disc (%)</th>
              <th style={{ width: '14%' }}>Disc Amount</th>
              <th style={{ width: 60 }}>Act</th>
            </tr>
          </thead>
          <tbody>
            {decoratedRows.map((r, i) => (
              <tr key={r.id} style={{ backgroundColor: r._bg }} className={`${r.isStart ? 'md-group-start' : ''} ${r.isEnd ? 'md-group-end' : ''} ${r._hideMfg ? 'md-mfg-hide' : ''}`}>
                <td className="center-text">{i + 1}</td>
                <td className="md-cell-mfg" style={{ position: 'relative' }}>
                  <select
                    ref={el => gridRefs.current[`${r.id}-supplier_id`] = el}
                    value={r.supplier_id}
                    onChange={e => handleRowChange(r.id, 'supplier_id', e.target.value)}
                    onKeyDown={e => handleKeyDown(e, r.id, 'supplier_id')}
                    className="md-select-input"
                    style={!r.supplier_id && r.brand ? { border: '1px solid #f59e0b', background: '#fffbeb' } : undefined}
                    title={!r.supplier_id && r.brand ? 'No supplier linked — this brand will show as "Unmapped" on stock reports' : ''}
                  >
                    <option value="">— Select Supplier —</option>
                    {suppliersList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {!r.supplier_id && r.brand && (
                    <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: '#f59e0b', fontSize: '0.9rem' }} title="Unmapped">⚠️</span>
                  )}
                </td>
                <td className="md-cell-brand" style={{ position: 'relative' }}>
                  <input
                    ref={el => gridRefs.current[`${r.id}-brand`] = el}
                    type="text"
                    value={r.brand}
                    readOnly
                    placeholder="Type or select..."
                    onClick={() => { setActiveBrandDropdown(r.id); setHighlightedBrandIdx(0); searchBufferRef.current = ''; }}
                    onFocus={() => { setActiveBrandDropdown(r.id); setHighlightedBrandIdx(0); searchBufferRef.current = ''; }}
                    onKeyDown={e => handleKeyDown(e, r.id, 'brand')}
                  />
                  {activeBrandDropdown === r.id && (
                    <div className="md-brands-dropdown">
                      {allBrands.map((b, bIdx) => {
                        const isChecked = r.brand.split(',').map(x => x.trim()).includes(b);
                        const isHighlighted = bIdx === highlightedBrandIdx;
                        return (
                          <div
                            key={b}
                            id={`md-brand-item-${bIdx}`}
                            className={`md-brand-item ${isHighlighted ? 'md-brand-item-highlight' : ''}`}
                            onClick={() => handleBrandToggle(r.id, b)}
                          >
                            <input type="checkbox" checked={isChecked} readOnly style={{ width: 'auto' }} />
                            <span>{b}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    ref={el => gridRefs.current[`${r.id}-discount_pct`] = el}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={r.discount_pct}
                    onChange={e => handleRowChange(r.id, 'discount_pct', e.target.value)}
                    onKeyDown={e => handleKeyDown(e, r.id, 'discount_pct')}
                  />
                </td>
                <td>
                  <input
                    ref={el => gridRefs.current[`${r.id}-discount_amount`] = el}
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.discount_amount}
                    onChange={e => handleRowChange(r.id, 'discount_amount', e.target.value)}
                    onKeyDown={e => handleKeyDown(e, r.id, 'discount_amount')}
                  />
                </td>
                <td className="center-text">
                  <button tabIndex="-1" className="md-btn-del" onClick={() => handleDeleteRow(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showManageModal && (
        <div className="modal-overlay" onClick={() => { setShowManageModal(false); setEditingMfgId(null); setMfgError(''); }} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
            background: 'white', padding: '24px', borderRadius: '8px', width: '420px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <button className="modal-close" onClick={() => { setShowManageModal(false); setEditingMfgId(null); setMfgError(''); }} style={{ float: 'right', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700 }}>🏭 Manage Suppliers List</h3>
            {mfgError && (
              <div style={{ color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: '0.85rem', marginBottom: 14, fontWeight: 500 }}>
                ⚠️ {mfgError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input ref={manageInputRef} type="text" value={newMfgName}
                onChange={e => setNewMfgName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddMfg(); }}
                placeholder="New Supplier Name..." style={{ flex: 1, padding: "8px 10px", border: "1px solid #e4e6ef", borderRadius: 5, fontSize: "0.9rem" }} />
              <button className="md-btn md-btn-primary" onClick={handleAddMfg}>Add</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {suppliersList.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {editingMfgId === item.id ? (
                        <>
                          <td style={{ padding: '6px 0' }}>
                            <input
                              type="text"
                              value={editingMfgName}
                              onChange={e => setEditingMfgName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleUpdateMfg(item.id); else if (e.key === 'Escape') setEditingMfgId(null); }}
                              autoFocus
                              style={{ width: '90%', padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: 4, fontSize: '0.9rem' }}
                            />
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: 'nowrap', padding: '6px 0' }}>
                            <button onClick={() => handleUpdateMfg(item.id)} style={{ background: "#10b981", color: "#fff", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem", marginRight: 4 }}>Save</button>
                            <button onClick={() => setEditingMfgId(null)} style={{ background: "#94a3b8", color: "#fff", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '8px 0', fontSize: '0.95rem' }}>{item.name}</td>
                          <td style={{ textAlign: "right", whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setEditingMfgId(item.id); setEditingMfgName(item.name); }} style={{ background: "#e0f2fe", color: "#0369a1", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem", marginRight: 4 }}>Edit</button>
                            <button onClick={() => handleDeleteMfg(item.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}>Delete</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {suppliersList.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>No suppliers found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManufacturerDiscounts;