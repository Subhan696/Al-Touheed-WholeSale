import React, { useState, useEffect, useRef, useMemo } from 'react';
import './NewPurchase.css';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', packingQty: 0, packets: '', rate: '', amount: 0 };
}

function descForProduct(p) {
  let d = p.description || '';
  if (p.category) d += ` — ${p.category}`;
  if (p.size_range) d += ` (${p.size_range})`;
  return d;
}

function NewPurchase({ currentUser, purchaseToEdit, onSaveSuccess, onCancelEdit, isActive }) {
  const isEditing = !!purchaseToEdit;

  const todayDMY = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2,'0')}-${String(t.getMonth()+1).padStart(2,'0')}-${t.getFullYear()}`;
  };

  const [purchaseDate, setPurchaseDate] = useState(todayDMY);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [miscCharges, setMiscCharges] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdjOpen, setIsAdjOpen] = useState(false);
  const [activeDrop, setActiveDrop] = useState(null);

  const dateRef = useRef(null);
  const invoiceRef = useRef(null);
  const supplierRef = useRef(null);
  const notesRef = useRef(null);
  const codeRefs = useRef({});
  const packetsRefs = useRef({});
  const rateRefs = useRef({});
  const itemsRef = useRef([]);
  itemsRef.current = items;

  useEffect(() => {
    if (isEditing) {
      const p = purchaseToEdit;
      const raw = p.purchase_date?.split('T')[0] || '';
      if (raw) {
        const [y, m, d] = raw.split('-');
        setPurchaseDate(`${d}-${m}-${y}`);
      }
      setInvoiceNo(p.invoice_no || '');
      setSupplierName(p.supplier_name || '');
      setNotes(p.notes || '');
      setDiscount(String(p.discount || ''));
      setMiscCharges(String(p.misc_charges || ''));
      ipcRenderer.invoke('get-purchase-items', p.id).then(rows => {
        const mapped = rows.map(r => ({
          id: nextId(),
          itemCode: r.item_code,
          description: r.item_description,
          packingQty: r.packing_qty || 0,
          packets: String(r.packets),
          rate: String(parseFloat(r.rate)),
          amount: parseFloat(r.amount)
        }));
        mapped.push(makeRow());
        setItems(mapped);
      });
    } else {
      setTimeout(() => dateRef.current?.focus(), 80);
    }
  }, [purchaseToEdit]);

  const handleDateChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw.length > 8) return;
    let val = raw;
    if (raw.length >= 5) val = raw.slice(0,2) + '-' + raw.slice(2,4) + '-' + raw.slice(4);
    else if (raw.length >= 3) val = raw.slice(0,2) + '-' + raw.slice(2);
    setPurchaseDate(val);
  };

  const handleHeaderKD = (e, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (field === 'date') invoiceRef.current?.focus();
    else if (field === 'invoice') supplierRef.current?.focus();
    else if (field === 'supplier') notesRef.current?.focus();
    else if (field === 'notes') {
      const first = itemsRef.current[0];
      if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
    }
  };

  const handleCodeChange = async (rowId, val) => {
    setItems(prev => prev.map(r =>
      r.id === rowId ? { ...r, itemCode: val, description: '', packingQty: 0, rate: '', amount: 0 } : r
    ));
    if (!val.trim()) { setActiveDrop(null); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setActiveDrop(results?.length > 0 ? { rowId, results } : null);
  };

  const fillRow = (rowId, product) => {
    const pkts = product.packing_qty || 0;
    const rate = parseFloat(product.purchase_rate) || 0;
    setItems(prev => prev.map(r =>
      r.id === rowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        packingQty: pkts,
        packets: String(pkts),
        rate: String(rate),
        amount: pkts * rate
      } : r
    ));
    setActiveDrop(null);
    setTimeout(() => packetsRefs.current[rowId]?.focus(), 30);
  };

  const updateRow = (rowId, field, val) => {
    setItems(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const u = { ...r, [field]: val };
      u.amount = (parseInt(field === 'packets' ? val : u.packets) || 0)
               * (parseFloat(field === 'rate' ? val : u.rate) || 0);
      return u;
    }));
  };

  const removeRow = (rowId) => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(r => r.id === rowId);
      const focusTarget = prev[idx - 1] || prev[idx + 1];
      if (focusTarget) setTimeout(() => codeRefs.current[focusTarget.id]?.focus(), 50);
      return prev.filter(r => r.id !== rowId);
    });
  };

  const ctrlD = (e, idx) => {
    e.preventDefault();
    const rows = itemsRef.current;
    const cur = rows[idx];
    const isEmpty = !cur.itemCode && !cur.description &&
      (!cur.packets || cur.packets === '0') &&
      (!cur.rate || cur.rate === '0');
    if (isEmpty && idx > 0) {
      removeRow(rows[idx - 1].id);
    } else {
      removeRow(cur.id);
    }
  };

  const addEmptyRow = () => {
    setItems(prev => {
      const last = prev[prev.length - 1];
      if (!last?.description && !last?.itemCode) {
        setTimeout(() => codeRefs.current[last.id]?.focus(), 30);
        return prev;
      }
      const nr = makeRow();
      setTimeout(() => codeRefs.current[nr.id]?.focus(), 50);
      return [...prev, nr];
    });
  };

  const handleCodeKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      const drop = activeDrop?.rowId === rowId ? activeDrop.results : [];
      if (drop.length > 0) fillRow(rowId, drop[0]);
      else packetsRefs.current[rowId]?.focus();
    }
    if (e.key === 'Escape') setActiveDrop(null);
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = rows[idx+1]; if(n) codeRefs.current[n.id]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); const n = rows[idx-1]; if(n) codeRefs.current[n.id]?.focus(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  // Enter in Packing → SKIP rate → next row code
  const handlePktsKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= rows.length - 1) addEmptyRow();
      else codeRefs.current[rows[idx+1].id]?.focus();
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = rows[idx+1]; if(n) packetsRefs.current[n.id]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); const n = rows[idx-1]; if(n) packetsRefs.current[n.id]?.focus(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  const handleRateKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= rows.length - 1) addEmptyRow();
      else codeRefs.current[rows[idx+1].id]?.focus();
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = rows[idx+1]; if(n) rateRefs.current[n.id]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); const n = rows[idx-1]; if(n) rateRefs.current[n.id]?.focus(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  const resetForm = () => {
    setPurchaseDate(todayDMY());
    setInvoiceNo('');
    setSupplierName('');
    setNotes('');
    setDiscount('');
    setMiscCharges('');
    setItems([makeRow()]);
    setStatusMsg('');
    setActiveDrop(null);
    setTimeout(() => dateRef.current?.focus(), 50);
  };

  const totals = useMemo(() => {
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0);
    const sub  = valid.reduce((s, r) => s + r.amount, 0);
    const pkts = valid.reduce((s, r) => s + (parseInt(r.packets) || 0), 0);
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;
    return { sub, pkts, misc, disc, grand: sub + misc - disc, count: valid.length };
  }, [items, miscCharges, discount]);

  const handleSubmit = async () => {
    if (!supplierName.trim()) {
      setStatusMsg('Error: Supplier name required');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0 && parseFloat(r.rate) > 0);
    if (!valid.length) {
      setStatusMsg('Error: Add at least one valid item');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    setIsSubmitting(true);
    try {
      // DD-MM-YYYY → YYYY-MM-DD for DB
      let dbDate = purchaseDate;
      if (purchaseDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = purchaseDate.split('-');
        dbDate = `${y}-${m}-${d}`;
      }
      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        items: valid.map(r => ({
          itemCode: r.itemCode,
          itemDescription: r.description,
          packingQty: r.packingQty,
          packets: parseInt(r.packets),
          rate: parseFloat(r.rate),
          amount: r.amount
        }))
      };
      const result = isEditing
        ? await ipcRenderer.invoke('update-purchase', { ...payload, id: purchaseToEdit.id })
        : await ipcRenderer.invoke('save-purchase', payload);
      if (result.success) {
        setStatusMsg(isEditing ? '✓ Purchase updated!' : '✓ Purchase saved!');
        setTimeout(() => { setStatusMsg(''); onSaveSuccess?.(); }, 1200);
      } else {
        setStatusMsg(`Error: ${result.error || 'Failed'}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); handleSubmit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, purchaseDate, discount, miscCharges, notes, isEditing]);

  return (
    <div className="new-purchase-page">

      {/* Page Header */}
      <header className="page-header">
        <h2 className="title">{isEditing ? `Edit Purchase #${purchaseToEdit.id}` : 'New Purchase Entry'}</h2>
        <div className="status-msg">
          {statusMsg && (
            <span className={statusMsg.startsWith('Error') ? 'error' : 'success'}>{statusMsg}</span>
          )}
        </div>
        <div className="header-actions">
          <button type="button" onClick={isEditing ? onCancelEdit : resetForm} className="btn btn-secondary sm" disabled={isSubmitting}>
            {isEditing ? 'Cancel' : 'Reset'}
          </button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update (Ctrl+S)' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </header>

      <div className="purchase-form">

        {/* Card 1: Purchase Details */}
        <section className="form-card">
          <h3 className="card-title">Purchase Details</h3>
          <div className="details-row">
            <div className="form-group small-width">
              <label>Date</label>
              <input
                ref={dateRef}
                type="text"
                value={purchaseDate}
                onChange={handleDateChange}
                onKeyDown={e => handleHeaderKD(e, 'date')}
                placeholder="DD-MM-YYYY"
                className="form-input center-text"
              />
            </div>
            <div className="form-group small-width">
              <label>Invoice No</label>
              <input
                ref={invoiceRef}
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'invoice')}
                placeholder="Inv #"
                className="form-input"
              />
            </div>
            <div className="form-group medium-width">
              <label>Supplier Name *</label>
              <input
                ref={supplierRef}
                type="text"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'supplier')}
                placeholder="Enter supplier name..."
                className="form-input"
              />
            </div>
            <div className="form-group flex-grow">
              <label>Notes</label>
              <input
                ref={notesRef}
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'notes')}
                placeholder="Remarks..."
                className="form-input"
              />
            </div>
          </div>
        </section>

        {/* Card 2: Items Table */}
        <section className="form-card">
          <div className="card-header">
            <h3 className="card-title">Purchase Items</h3>
          </div>
          <div className="items-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34, textAlign: 'center' }}>#</th>
                  <th style={{ width: '14%' }}>Item Code</th>
                  <th>Description</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Packing</th>
                  <th style={{ width: '13%', textAlign: 'center' }}>Rate/Pkt</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#1e1e2d', fontSize: '0.92rem' }}>
                      {(row.description || row.itemCode) ? idx + 1 : ''}
                    </td>

                    {/* Item code + search dropdown */}
                    <td style={{ position: 'relative' }}>
                      <input
                        ref={el => codeRefs.current[row.id] = el}
                        type="text"
                        value={row.itemCode}
                        onChange={e => handleCodeChange(row.id, e.target.value)}
                        onKeyDown={e => handleCodeKD(e, row.id, idx)}
                        onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                        placeholder="Scan / Type"
                        className="form-input fast-entry"
                      />
                      {activeDrop?.rowId === row.id && activeDrop.results.length > 0 && (
                        <div className="np-dropdown">
                          {activeDrop.results.slice(0, 8).map(p => (
                            <div key={p.id} className="np-suggestion"
                              onMouseDown={e => { e.preventDefault(); fillRow(row.id, p); }}>
                              <strong style={{ fontFamily: 'monospace', color: '#3699ff', minWidth: 90, flexShrink: 0 }}>{p.item_code}</strong>
                              <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                              {p.packing_qty > 0 && (
                                <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 3, padding: '0 5px', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                  {p.packing_qty}pcs
                                </span>
                              )}
                              <span style={{ color: '#5e6278', fontWeight: 700, minWidth: 64, textAlign: 'right', flexShrink: 0 }}>
                                {parseFloat(p.purchase_rate || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Description */}
                    <td>
                      <span style={{ fontSize: '0.87rem', color: '#3f4254', lineHeight: 1.3 }}>
                        {row.description || <span style={{ color: '#d1d5db' }}>—</span>}
                      </span>
                    </td>

                    {/* Packing — auto-filled with packing_qty, editable */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        ref={el => packetsRefs.current[row.id] = el}
                        type="text"
                        inputMode="numeric"
                        value={row.packets}
                        onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\d]/g, ''))}
                        onKeyDown={e => handlePktsKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="form-input center-text packing-field"
                        style={{ width: 64, margin: '0 auto', display: 'block' }}
                      />
                    </td>

                    {/* Rate — auto-filled, editable, not in keyboard flow */}
                    <td>
                      <input
                        ref={el => rateRefs.current[row.id] = el}
                        type="text"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={e => updateRow(row.id, 'rate', e.target.value.replace(/[^\d.]/g, ''))}
                        onKeyDown={e => handleRateKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="form-input center-text highlight-rate"
                        tabIndex={-1}
                      />
                    </td>

                    {/* Amount */}
                    <td className="amount-cell">
                      {row.amount > 0
                        ? Math.round(row.amount).toLocaleString()
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>

                    {/* Delete */}
                    <td className="action-cell">
                      {(row.description || row.itemCode) && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="btn-remove"
                          disabled={items.length <= 1}
                          tabIndex={-1}
                          title="Remove (Ctrl+D)"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="total-label">Total Items:</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: '#1e1e2d' }}>
                    {totals.pkts}
                  </td>
                  <td colSpan={2} style={{ textAlign: 'right' }}>
                    <span className="total-amount">PKR {Math.round(totals.sub).toLocaleString()}</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Adjustments + Grand Total panel */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <div style={{ width: 290, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setIsAdjOpen(v => !v)}
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}
                >
                  <span>Additional Adjustments {isAdjOpen ? '▼' : '▶'}</span>
                  {(parseFloat(miscCharges) || parseFloat(discount)) ? (
                    <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 10 }}>Active</span>
                  ) : null}
                </button>
                {isAdjOpen && (
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: '0.85rem', color: '#374151' }}>Misc Charges (+)</label>
                      <input
                        type="number"
                        value={miscCharges}
                        onChange={e => setMiscCharges(e.target.value)}
                        placeholder="0"
                        style={{ width: 90, textAlign: 'right', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.88rem', fontWeight: 600, color: '#059669', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: '#374151' }}>Discount (-)</label>
                      <input
                        type="number"
                        value={discount}
                        onChange={e => setDiscount(e.target.value)}
                        placeholder="0"
                        style={{ width: 90, textAlign: 'right', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.88rem', fontWeight: 600, color: '#ef4444', fontFamily: 'inherit' }}
                      />
                    </div>
                  </div>
                )}
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>Grand Total</span>
                  <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                    PKR {Math.round(totals.grand).toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default NewPurchase;
