import React, { useState, useEffect, useRef, useMemo } from 'react';
import './NewSale.css';

const { ipcRenderer } = window.require('electron');

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function NewSale({ currentUser, saleToEdit, onSaveSuccess, onExit, onNewSale, isActive }) {
  const isEditing = !!saleToEdit;

  const [invoiceNo, setInvoiceNo]         = useState('');
  const [saleDate, setSaleDate]           = useState(new Date());
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discount, setDiscount]           = useState(0);
  const [miscCharges, setMiscCharges]     = useState(0);
  const [notes, setNotes]                 = useState('');
  const [items, setItems]                 = useState([]);
  const [message, setMessage]             = useState('');
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [customerOpen, setCustomerOpen]   = useState(false);
  // Tracks which row is selected — persists after blur so footer always shows info
  const [focusedItemIdx, setFocusedItemIdx] = useState(null);

  // Scan entry (bottom input)
  const [scanCode, setScanCode]         = useState('');
  const [scanResults, setScanResults]   = useState([]);
  const [showScanDrop, setShowScanDrop] = useState(false);

  // Return modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSearch, setReturnSearch]       = useState('');
  const [returnResults, setReturnResults]     = useState([]);

  // Per-row code editing
  const [activeCodeRow, setActiveCodeRow]     = useState(null);
  const [codeRowResults, setCodeRowResults]   = useState([]);
  const [showCodeRowDrop, setShowCodeRowDrop] = useState(false);

  const scanRef     = useRef(null);
  const codeRefs    = useRef({});
  const packetsRefs = useRef({});
  const rateRefs    = useRef({});
  const itemsRef    = useRef([]);
  itemsRef.current  = items;

  // ── Load / clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isEditing) {
      const s = saleToEdit;
      setSaleDate(new Date(s.created_at || s.sale_date));
      setInvoiceNo(s.invoice_no || '');
      setCustomerName(s.customer_name || '');
      setCustomerPhone(s.customer_phone || '');
      setPaymentMethod(s.payment_method || 'Cash');
      setDiscount(s.discount || 0);
      setMiscCharges(s.misc_charges || 0);
      setNotes(s.notes || '');
      ipcRenderer.invoke('get-sale-items', s.id).then(async rows => {
        const mapped = rows.map(r => ({
          itemCode:        r.item_code,
          itemDescription: r.item_description,
          packingQty:      r.packing_qty || 0,
          packets:         Math.abs(r.packets),
          saleRate:        parseFloat(r.sale_rate),
          purchaseRate:    parseFloat(r.purchase_rate),
          discount:        parseFloat(r.discount) || 0,
          isReturn:        parseInt(r.packets) < 0,
          amount:          parseFloat(r.amount),
          stock:           r.available_stock ?? null
        }));
        setItems(mapped);
        for (let i = 0; i < mapped.length; i++) {
          try {
            const st = await ipcRenderer.invoke('get-stock-single', mapped[i].itemCode);
            setItems(prev => prev.map((item, idx) => idx === i ? { ...item, stock: st } : item));
          } catch(e) {}
        }
      });
    } else {
      ipcRenderer.invoke('get-next-invoice-no').then(n => setInvoiceNo(n)).catch(() => {});
      const t = setInterval(() => setSaleDate(new Date()), 1000);
      return () => clearInterval(t);
    }
  }, [saleToEdit]);

  // Auto-scroll and refocus scan after item count changes
  useEffect(() => {
    setTimeout(() => {
      const active = document.activeElement;
      const isInRow = active?.classList.contains('qty-field')  ||
                      active?.classList.contains('rate-field') ||
                      active?.classList.contains('code-field');
      if (!isInRow) scanRef.current?.focus();
      const wrap = document.querySelector('.sale-table-wrap');
      if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
    }, 80);
  }, [items.length]);

  // ── Scan input (bottom) ───────────────────────────────────────────────────
  const handleScanChange = async (val) => {
    setScanCode(val);
    if (!val.trim()) { setScanResults([]); setShowScanDrop(false); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setScanResults(results || []);
    setShowScanDrop((results || []).length > 0);
  };

  const handleReturnSearch = async (val) => {
    setReturnSearch(val);
    if (!val.trim()) { setReturnResults([]); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setReturnResults(results || []);
  };

  const addReturnProduct = (product) => {
    const pkts    = product.packing_qty || 1;
    const rate    = parseFloat(product.sale_rate)    || 0;
    const purRate = parseFloat(product.purchase_rate) || 0;
    const disc    = parseFloat(product.discount) || 0;
    const newIdx  = itemsRef.current.length;
    setItems(prev => [...prev, {
      itemCode:        product.item_code,
      itemDescription: descForProduct(product),
      packingQty:      pkts,
      packets:         pkts,
      saleRate:        rate,
      purchaseRate:    purRate,
      discount:        disc,
      isReturn:        true,
      amount:          -Math.abs(pkts) * (rate - disc),
      stock:           product.available_stock ?? product.stock_qty ?? null
    }]);
    setFocusedItemIdx(newIdx);
    setShowReturnModal(false);
    setReturnSearch('');
    setReturnResults([]);
    setTimeout(() => {
      if (packetsRefs.current[newIdx]) packetsRefs.current[newIdx].focus();
    }, 100);

    ipcRenderer.invoke('get-stock-single', product.item_code)
      .then(st => setItems(prev => prev.map((item, i) => i === newIdx ? { ...item, stock: st } : item)))
      .catch(() => {});
  };

  const handleReturnKD = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (returnResults.length > 0) { addReturnProduct(returnResults[0]); return; }
      if (returnSearch.trim()) {
        setMessage(`Product not found: ${returnSearch}`);
        setTimeout(() => setMessage(''), 3000);
      }
    }
    if (e.key === 'Escape') { 
      setShowReturnModal(false); 
      setReturnSearch('');
    }
  };

  const addProduct = (product) => {
    const pkts    = product.packing_qty || 1;
    const rate    = parseFloat(product.sale_rate)    || 0;
    const purRate = parseFloat(product.purchase_rate) || 0;
    const newIdx  = itemsRef.current.length;
    setItems(prev => [...prev, {
      itemCode:        product.item_code,
      itemDescription: descForProduct(product),
      packingQty:      pkts,
      packets:         pkts,
      saleRate:        rate,
      purchaseRate:    purRate,
      discount:        parseFloat(product.discount) || 0,
      isReturn:        false,
      amount:          pkts * (rate - (parseFloat(product.discount) || 0)),
      stock:           product.available_stock ?? product.stock_qty ?? null
    }]);
    setFocusedItemIdx(newIdx);
    setScanCode('');
    setScanResults([]);
    setShowScanDrop(false);

    ipcRenderer.invoke('get-stock-single', product.item_code)
      .then(st => setItems(prev => prev.map((item, i) => i === newIdx ? { ...item, stock: st } : item)))
      .catch(() => {});

    // Return focus to scan so next item can be typed immediately
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const handleScanKD = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanResults.length > 0) { addProduct(scanResults[0]); return; }
      if (scanCode.trim()) {
        setMessage(`Product not found: ${scanCode}`);
        setTimeout(() => setMessage(''), 3000);
      }
      return;
    }
    if (e.key === 'Escape') { setShowScanDrop(false); return; }
    if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      // Mirror garments: ArrowUp goes to code field of last row
      codeRefs.current[items.length - 1]?.focus();
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      if (items.length > 0) {
        e.preventDefault();
        packetsRefs.current[items.length - 1]?.focus();
        packetsRefs.current[items.length - 1]?.select();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (items.length > 0) {
        setItems(prev => prev.slice(0, -1));
        setMessage('Last item removed');
        setTimeout(() => setMessage(''), 2000);
      }
    }
  };

  // ── Per-row code editing ──────────────────────────────────────────────────
  const handleCodeChange = async (idx, val) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, itemCode: val } : item));
    setActiveCodeRow(idx);
    if (!val.trim()) { setCodeRowResults([]); setShowCodeRowDrop(false); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setCodeRowResults(results || []);
    setShowCodeRowDrop((results || []).length > 0);
  };

  const fillRow = (idx, product) => {
    const pkts    = product.packing_qty || 1;
    const rate    = parseFloat(product.sale_rate)    || 0;
    const purRate = parseFloat(product.purchase_rate) || 0;
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      itemCode:        product.item_code,
      itemDescription: descForProduct(product),
      packingQty:      pkts,
      packets:         pkts,
      saleRate:        rate,
      purchaseRate:    purRate,
      discount:        parseFloat(product.discount) || 0,
      isReturn:        false,
      amount:          pkts * (rate - (parseFloat(product.discount) || 0)),
      stock:           product.available_stock ?? product.stock_qty ?? null
    } : item));
    setShowCodeRowDrop(false);
    setActiveCodeRow(null);
    setFocusedItemIdx(idx);
    setTimeout(() => packetsRefs.current[idx]?.focus(), 30);

    ipcRenderer.invoke('get-stock-single', product.item_code)
      .then(st => setItems(prev => prev.map((item, i) => i === idx ? { ...item, stock: st } : item)))
      .catch(() => {});
  };

  const handleCodeKD = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showCodeRowDrop && codeRowResults.length > 0) { fillRow(idx, codeRowResults[0]); return; }
      // No dropdown — move to packing
      packetsRefs.current[idx]?.focus();
      return;
    }
    if (e.key === 'Escape') { setShowCodeRowDrop(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); packetsRefs.current[idx]?.focus(); return; }
    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); codeRefs.current[idx - 1]?.focus(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      setItems(prev => prev.filter((_, i) => i !== idx));
      if (idx > 0) setTimeout(() => codeRefs.current[idx - 1]?.focus(), 50);
      else setTimeout(() => scanRef.current?.focus(), 50);
    }
  };

  // ── Packing / Rate row editing ────────────────────────────────────────────
  const calcAmount = (item) => {
    const p = parseInt(item.packets) || 0;
    const actualP = item.isReturn ? -Math.abs(p) : Math.abs(p);
    const r = parseFloat(item.saleRate) || 0;
    const d = parseFloat(item.discount) || 0;
    return actualP * (r - d);
  };

  function makeRow() {
    return { id: nextId(), itemCode: '', itemDescription: '', packingQty: 0, packets: '', saleRate: 0, purchaseRate: 0, discount: 0, isReturn: false, amount: 0 };
  }

  const updatePackets = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, packets: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const updateRate = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, saleRate: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const updateDiscount = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, discount: val };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const toggleReturn = (idx) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, isReturn: !item.isReturn };
      return { ...newItem, amount: calcAmount(newItem) };
    }));
  };

  const handleRowKD = (e, idx, field) => {
    const rows = itemsRef.current;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      setItems(prev => prev.filter((_, i) => i !== idx));
      if (idx > 0) setTimeout(() => codeRefs.current[idx - 1]?.focus(), 50);
      else setTimeout(() => scanRef.current?.focus(), 50);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'packets') { scanRef.current?.focus(); return; }
      if (field === 'rate') {
        if (idx >= rows.length - 1) scanRef.current?.focus();
        else packetsRefs.current[idx + 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Stay in same column — packing stays packing, rate stays rate
      if (field === 'packets') {
        if (idx < rows.length - 1) packetsRefs.current[idx + 1]?.focus();
        else scanRef.current?.focus();
      } else {
        if (idx < rows.length - 1) rateRefs.current[idx + 1]?.focus();
        else scanRef.current?.focus();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Stay in same column
      if (field === 'packets' && idx > 0) packetsRefs.current[idx - 1]?.focus();
      if (field === 'rate'    && idx > 0) rateRefs.current[idx - 1]?.focus();
    }
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const subTotal     = items.reduce((s, i) => s + i.amount, 0);
    const totalPackets = items.reduce((s, i) => {
      const p = parseInt(i.packets) || 0;
      return s + (i.isReturn ? -Math.abs(p) : Math.abs(p));
    }, 0);
    const discountAmt  = parseFloat(discount)    || 0;
    const miscAmt      = parseFloat(miscCharges) || 0;
    const grandTotal   = Math.max(0, subTotal + miscAmt - discountAmt);
    return { subTotal, totalPackets, grandTotal };
  }, [items, discount, miscCharges]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (items.length === 0) { setMessage('Add at least one item'); return; }
    setIsSubmitting(true);
    const payload = {
      saleDate:    new Date(saleDate.getTime() - saleDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      invoiceNo, customerName, customerPhone, 
      items: items.map(i => ({...i, packets: i.isReturn ? -Math.abs(parseInt(i.packets) || 0) : Math.abs(parseInt(i.packets) || 0)})),
      discount:    parseFloat(discount)    || 0,
      miscCharges: parseFloat(miscCharges) || 0,
      paymentMethod, notes,
      userId: currentUser?.id
    };
    try {
      const result = isEditing
        ? await ipcRenderer.invoke('update-sale', { ...payload, id: saleToEdit.id })
        : await ipcRenderer.invoke('save-sale', payload);
      if (result.success) onSaveSuccess?.();
      else { setMessage(result.error || 'Failed to save'); setIsSubmitting(false); }
    } catch (err) {
      setMessage(err.message || 'Error');
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        handleSubmit();
      }
      if (e.key === 'Escape') { e.preventDefault(); onExit?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, invoiceNo, customerName, discount, miscCharges, paymentMethod, notes, isEditing]);

  const focusedItem = focusedItemIdx !== null ? items[focusedItemIdx] : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="sale-page">

      {/* Topbar */}
      <div className="sale-topbar">
        <div className="topbar-left">
          <span className="topbar-inv">Invoice: <strong>{invoiceNo}</strong></span>
          <span className="topbar-dt">
            {`${String(saleDate.getDate()).padStart(2,'0')}-${String(saleDate.getMonth()+1).padStart(2,'0')}-${saleDate.getFullYear()}, ${saleDate.toLocaleString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).toUpperCase()}`}
          </span>
          {!isEditing && onNewSale && (
            <button type="button" className="topbar-btn topbar-btn-secondary" onClick={onNewSale} style={{ marginLeft: 10 }}>+ New Sale</button>
          )}
          <span className="topbar-title yellow">New Sale</span>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" style={{ background: '#ef4444', color: '#fff' }} onClick={() => setShowReturnModal(true)}>Add Return Item</button>
          <button type="button" className="topbar-btn topbar-btn-tertiary" onClick={onExit}>Exit</button>
          <button type="button" className="topbar-btn topbar-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Sale' : 'Save Sale'}
          </button>
        </div>
      </div>

      {/* Customer section — collapsible */}
      <div className="customer-section">
        <button type="button" className="customer-toggle" onClick={() => setCustomerOpen(v => !v)}>
          Customer Details {customerOpen ? '▼' : '▶'}
          {!customerOpen && customerName && <strong style={{ color: '#1e1e2d', marginLeft: 8 }}>{customerName}</strong>}
        </button>
        <div className={`customer-details ${customerOpen ? 'open' : ''}`} style={{ maxHeight: customerOpen ? '90px' : '0' }}>
          <div className="customer-fields" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div className="field">
              <label>Customer Name</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="03XX-XXXXXXX" />
            </div>
            <div className="field">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                style={{ padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.8rem', height: 28 }}>
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Credit</option>
              </select>
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional..." />
            </div>
          </div>
        </div>
      </div>

      {message && <div className="message">{message}</div>}

      {/* Body */}
      <div className="sale-body">
        <div className="sale-table-wrap">
          <table className="sale-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: '13%' }}>Code</th>
                <th>Description</th>
                <th className="center" style={{ width: '9%' }}>Packing</th>
                <th className="right"  style={{ width: '10%' }}>Rate</th>
                <th className="right"  style={{ width: '10%' }}>Disc.</th>
                <th className="right"  style={{ width: '12%' }}>Amount</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">Scan or type an item code below to add.</td>
                </tr>
              )}
              {items.map((item, idx) => (
                <tr key={idx} className={focusedItemIdx === idx ? 'row-active' : ''} style={{ backgroundColor: item.isReturn ? '#fee2e2' : undefined }}>

                  {/* Row number */}
                  <td className="center" style={{ fontWeight: 700, color: '#6b7280', fontSize: '0.85rem' }}>{idx + 1}</td>

                  {/* Editable code field */}
                  <td style={{ position: 'relative' }}>
                    <input
                      ref={el => codeRefs.current[idx] = el}
                      type="text"
                      value={item.itemCode}
                      onChange={e => handleCodeChange(idx, e.target.value)}
                      onKeyDown={e => handleCodeKD(e, idx)}
                      onFocus={() => setFocusedItemIdx(idx)}
                      onBlur={() => setTimeout(() => {
                        if (activeCodeRow === idx) setShowCodeRowDrop(false);
                      }, 200)}
                      className="code-field"
                      placeholder="Code"
                    />
                    {showCodeRowDrop && activeCodeRow === idx && codeRowResults.length > 0 && (
                      <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, minWidth: 420 }}>
                        {codeRowResults.slice(0, 8).map(p => (
                          <div key={p.id} className="suggestion-item"
                            onMouseDown={e => { e.preventDefault(); fillRow(idx, p); }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', marginRight: 8, minWidth: 80 }}>{p.item_code}</span>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{descForProduct(p)}</span>
                            {p.packing_qty > 0 && (
                              <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 3, padding: '0 5px', fontSize: '0.7rem', fontWeight: 700, marginLeft: 6 }}>{p.packing_qty}pcs</span>
                            )}
                            <span style={{ fontWeight: 700, color: '#059669', marginLeft: 10, minWidth: 70, textAlign: 'right' }}>PKR {Math.round(p.sale_rate).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Description */}
                  <td>
                    <span className="desc-main">{item.itemDescription}</span>
                  </td>

                  {/* Packing (editable, blue) */}
                  <td className="center">
                    <input
                      ref={el => packetsRefs.current[idx] = el}
                      type="text"
                      inputMode="numeric"
                      value={item.packets}
                      onChange={e => updatePackets(idx, e.target.value.replace(/[^\d]/g, ''))}
                      onKeyDown={e => handleRowKD(e, idx, 'packets')}
                      onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                      className="qty-field center packing-input"
                    />
                  </td>

                  </td>

                  {/* Rate (editable, yellow) */}
                  <td className="right">
                    <input
                      ref={el => rateRefs.current[idx] = el}
                      type="text"
                      inputMode="decimal"
                      value={item.saleRate}
                      onChange={e => updateRate(idx, e.target.value.replace(/[^\d.]/g, ''))}
                      onKeyDown={e => handleRowKD(e, idx, 'rate')}
                      onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                      className="rate-field right sale-rate-input"
                    />
                  </td>

                  {/* Discount (editable) */}
                  <td className="right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.discount}
                      onChange={e => updateDiscount(idx, e.target.value.replace(/[^\d.]/g, ''))}
                      onKeyDown={e => handleRowKD(e, idx, 'discount')}
                      onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                      className="rate-field right discount-input"
                    />
                  </td>

                  {/* Amount */}
                  <td className="right amount-cell" style={{ background: item.isReturn ? 'transparent' : undefined }}>
                    <span className="amount-badge" style={{ color: item.isReturn ? '#dc2626' : undefined, background: item.isReturn ? 'transparent' : undefined }}>
                      {item.amount !== 0 ? Math.round(item.amount).toLocaleString() : '—'}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="center">
                    <button className="btn-icon" tabIndex={-1}
                      onClick={() => setItems(p => p.filter((_,j) => j !== idx))}>✖</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Scan input (bottom — always visible) */}
          <div className="scan-entry">
            <div className="scan-cell" style={{ flex: 1, position: 'relative' }}>
              <input
                ref={scanRef}
                type="text"
                value={scanCode}
                onChange={e => handleScanChange(e.target.value)}
                onKeyDown={handleScanKD}
                onBlur={() => setTimeout(() => setShowScanDrop(false), 200)}
                placeholder="Scan or type item code…"
                className="scan-input-inline"
                autoFocus
              />
              {showScanDrop && scanResults.length > 0 && (
                <div className="autocomplete-dropdown" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 200 }}>
                  {scanResults.slice(0, 8).map(p => (
                    <div key={p.id} className="suggestion-item"
                      onMouseDown={e => { e.preventDefault(); addProduct(p); }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', marginRight: 8, minWidth: 80 }}>{p.item_code}</span>
                      <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                      {p.packing_qty > 0 && (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 3, padding: '0 5px', fontSize: '0.72rem', fontWeight: 700, marginLeft: 6 }}>{p.packing_qty}pcs</span>
                      )}
                      <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8, minWidth: 70, textAlign: 'right' }}>PKR {Math.round(p.sale_rate).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="sale-footer">
        <div className="footer-left-group">
          <div className="footer-stock-box">
            <span className="footer-box-label">Stock</span>
            {focusedItem
              ? <strong style={{ fontSize: '1rem', color: focusedItem.stock === 0 ? '#dc2626' : '#111827' }}>{focusedItem.stock ?? 'N/A'}</strong>
              : <span className="footer-placeholder">—</span>}
          </div>
          <div className="footer-purchase-box">
            <span className="footer-box-label">Purchase</span>
            {focusedItem
              ? <strong style={{ fontSize: '1rem' }}>PKR {focusedItem.purchaseRate ?? '—'}</strong>
              : <span className="footer-placeholder">—</span>}
          </div>
        </div>
        <div className="footer-subtotal">
          <span>Subtotal</span>
          <span>{Math.round(totals.subTotal).toLocaleString()}</span>
        </div>
        <div className="footer-discount">
          <span>Misc (+)</span>
          <input type="number" className="discount-input" value={miscCharges}
            onChange={e => setMiscCharges(e.target.value)} placeholder="+"
            style={{ color: '#059669', borderColor: '#059669' }} />
        </div>
        <div className="footer-discount">
          <span>Discount (-)</span>
          <input type="number" className="discount-input" value={discount}
            onChange={e => setDiscount(e.target.value)} placeholder="-" />
        </div>
        <div className="footer-total-qty">
          <span>Total Items</span>
          <strong>{totals.totalPackets}</strong>
        </div>
        <div className="footer-grand">
          <span>Grand Total</span>
          <strong>{Math.round(totals.grandTotal).toLocaleString()}</strong>
        </div>
      </footer>

      {/* Return Item Modal */}
      {showReturnModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#fff', padding: '2rem', borderRadius: '8px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: '#dc2626' }}>Add Return Item</h3>
            <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '1rem' }}>Scan or type the item code to return it.</p>
            
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                autoFocus
                value={returnSearch}
                onChange={e => handleReturnSearch(e.target.value)}
                onKeyDown={handleReturnKD}
                placeholder="Scan or type item code..."
                style={{ width: '100%', padding: '0.75rem', fontSize: '1.1rem', border: '2px solid #ef4444', borderRadius: '4px', outline: 'none' }}
              />
              {returnResults.length > 0 && (
                <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1100, border: '1px solid #e5e7eb', maxHeight: '250px', overflowY: 'auto' }}>
                  {returnResults.slice(0, 8).map(p => (
                    <div key={p.id} className="suggestion-item"
                      onMouseDown={e => { e.preventDefault(); addReturnProduct(p); }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', marginRight: 8, minWidth: 80 }}>{p.item_code}</span>
                      <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                      <span style={{ fontWeight: 700, color: '#dc2626', marginLeft: 8, minWidth: 70, textAlign: 'right' }}>PKR {Math.round(p.sale_rate).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowReturnModal(false); setReturnSearch(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default NewSale;

