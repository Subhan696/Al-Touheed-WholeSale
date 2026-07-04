import React, { useState, useEffect, useRef, useMemo } from 'react';
import './NewSale.css';

const { ipcRenderer } = window.require('electron');

function SalesReturn({ currentUser, returnToEdit, onSaveSuccess, onExit, isActive }) {
  const isEditing = !!returnToEdit;

  const [returnNo, setReturnNo] = useState('');
  const [returnDate, setReturnDate] = useState(new Date());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [focusedItemIndex, setFocusedItemIndex] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [entryPackets, setEntryPackets] = useState('');
  const [entryRate, setEntryRate] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const searchRef = useRef(null);
  const packetsRef = useRef(null);
  const rateRef = useRef(null);
  const packetsRowRefs = useRef({});
  const rateRowRefs = useRef({});

  useEffect(() => {
    if (isEditing) {
      const r = returnToEdit;
      setReturnDate(new Date(r.return_date));
      setReturnNo(r.return_no || '');
      setInvoiceNo(r.invoice_no || '');
      setCustomerName(r.customer_name || '');
      setNotes(r.notes || '');
      ipcRenderer.invoke('get-sales-return-items', r.id).then(rows => {
        setItems(rows.map(row => ({
          itemCode: row.item_code,
          itemDescription: row.item_description,
          packets: row.packets,
          price: parseFloat(row.price),
          amount: parseFloat(row.amount)
        })));
      });
    } else {
      ipcRenderer.invoke('get-next-return-no').then(n => setReturnNo(n)).catch(() => {});
      const t = setInterval(() => setReturnDate(new Date()), 1000);
      return () => clearInterval(t);
    }
  }, [returnToEdit]);

  const handleSearch = async (val) => {
    setSearchTerm(val);
    setSelectedProduct(null);
    if (!val.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const r = await ipcRenderer.invoke('search-products', val);
    setSearchResults(r || []);
    setShowDropdown((r || []).length > 0);
  };

  const selectProduct = (p) => {
    setSelectedProduct(p);
    setSearchTerm(`${p.item_code} — ${p.description}`);
    setEntryRate(String(Math.round(p.sale_rate)));
    setShowDropdown(false);
    setTimeout(() => packetsRef.current?.focus(), 50);
  };

  const addItem = () => {
    if (!selectedProduct || !entryPackets || !entryRate) {
      setMessage('Select a product and enter packets and rate');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    const packets = parseInt(entryPackets);
    const price = parseFloat(entryRate);
    setItems(prev => {
      const existing = prev.findIndex(i => i.itemCode === selectedProduct.item_code);
      if (existing >= 0) {
        const updated = [...prev];
        const newPkts = updated[existing].packets + packets;
        updated[existing] = { ...updated[existing], packets: newPkts, amount: newPkts * updated[existing].price };
        return updated;
      }
      return [...prev, { itemCode: selectedProduct.item_code, itemDescription: selectedProduct.description, packets, price, amount: packets * price }];
    });
    setSearchTerm('');
    setSelectedProduct(null);
    setEntryPackets('');
    setEntryRate('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const updateItemPackets = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const pkts = parseInt(val) || 0;
      return { ...item, packets: pkts, amount: pkts * item.price };
    }));
  };

  const updateItemRate = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const price = parseFloat(val) || 0;
      return { ...item, price, amount: item.packets * price };
    }));
  };

  const totals = useMemo(() => {
    const grandTotal = items.reduce((s, i) => s + i.amount, 0);
    const totalPackets = items.reduce((s, i) => s + i.packets, 0);
    return { grandTotal, totalPackets };
  }, [items]);

  const handleSubmit = async () => {
    if (items.length === 0) { setMessage('Add at least one item'); return; }
    setIsSubmitting(true);
    const payload = {
      returnDate: new Date(returnDate.getTime() - returnDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      returnNo, invoiceNo, customerName, items, notes, userId: currentUser?.id
    };
    try {
      const result = isEditing
        ? await ipcRenderer.invoke('update-sales-return', { ...payload, id: returnToEdit.id })
        : await ipcRenderer.invoke('save-sales-return', payload);
      if (result.success) onSaveSuccess?.();
      else { setMessage(result.error || 'Failed to save'); setIsSubmitting(false); }
    } catch (e) { setMessage(e.message || 'Error'); setIsSubmitting(false); }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); handleSubmit(); }
      if (e.key === 'Escape') { e.preventDefault(); onExit?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, returnDate, returnNo, invoiceNo, customerName, notes, isEditing]);

  return (
    <div className="sale-page">
      {/* Topbar */}
      <div className="sale-topbar">
        <div className="topbar-left">
          <span className="topbar-inv">Return: <strong>{returnNo}</strong></span>
          <span className="topbar-dt">
            {`${String(returnDate.getDate()).padStart(2, '0')}-${String(returnDate.getMonth() + 1).padStart(2, '0')}-${returnDate.getFullYear()}, ${returnDate.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`}
          </span>
          <span className="topbar-title pink">Sales Return</span>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn topbar-btn-tertiary" onClick={onExit}>Exit</button>
          <button type="button" className="topbar-btn topbar-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Return' : 'Save Return'}
          </button>
        </div>
      </div>

      {/* Customer Details — collapsible */}
      <div className="customer-section">
        <button type="button" className="customer-toggle" onClick={() => setCustomerDetailsOpen(!customerDetailsOpen)}>
          Return Details {customerDetailsOpen ? '▼' : '▶'}
        </button>
        <div className={`customer-details ${customerDetailsOpen ? 'open' : ''}`}>
          <div className="customer-fields" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div className="field">
              <label>Customer Name</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name..." />
            </div>
            <div className="field">
              <label>Original Invoice #</label>
              <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Optional..." />
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
                <th>#</th>
                <th>Code</th>
                <th>Description</th>
                <th className="center">Packets</th>
                <th className="right">Rate/Pkt</th>
                <th className="right">Amount</th>
                <th className="center">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="empty">Search and add a product below</td></tr>
              )}
              {items.map((item, index) => (
                <tr key={index} className={focusedItemIndex === index ? 'row-active' : ''}>
                  <td className="center" style={{ color: 'black', fontSize: '1.2rem', fontWeight: 700, width: 30 }}>{index + 1}</td>
                  <td><span className="code-field" style={{ background: '#fee2e2' }}>{item.itemCode}</span></td>
                  <td><span className="desc-main">{item.itemDescription}</span></td>
                  <td className="center">
                    <input
                      type="number"
                      ref={el => packetsRowRefs.current[index] = el}
                      value={item.packets}
                      onChange={e => updateItemPackets(index, e.target.value)}
                      onFocus={() => { setFocusedItemIndex(index); setTimeout(() => packetsRowRefs.current[index]?.select(), 0); }}
                      onBlur={() => setFocusedItemIndex(null)}
                      className="qty-field center"
                      min="1"
                    />
                  </td>
                  <td className="right">
                    <input
                      type="number"
                      ref={el => rateRowRefs.current[index] = el}
                      value={item.price}
                      onChange={e => updateItemRate(index, e.target.value)}
                      onFocus={() => { setFocusedItemIndex(index); setTimeout(() => rateRowRefs.current[index]?.select(), 0); }}
                      onBlur={() => setFocusedItemIndex(null)}
                      className="rate-field right"
                    />
                  </td>
                  <td className="right" style={{ fontWeight: 600, color: '#dc2626' }}>
                    {Math.round(item.amount).toLocaleString()}
                  </td>
                  <td className="center">
                    <button className="btn-icon" onClick={() => setItems(p => p.filter((_, j) => j !== index))} tabIndex="-1">✖</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Product search entry */}
          <div className="scan-entry">
            <div className="scan-cell" style={{ flex: 3, width: 'auto', minWidth: 0, maxWidth: 'none' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={e => handleSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && searchResults.length > 0) selectProduct(searchResults[0]);
                    if (e.key === 'Escape') setShowDropdown(false);
                  }}
                  placeholder="🔍 Search by code or name..."
                  className="scan-input-inline"
                  autoFocus
                />
                {showDropdown && searchResults.length > 0 && (
                  <div className="autocomplete-dropdown" style={{ top: '100%', position: 'absolute', left: 0, right: 0, zIndex: 100 }}>
                    {searchResults.slice(0, 8).map(p => (
                      <div key={p.id} className="suggestion-item" onMouseDown={e => { e.preventDefault(); selectProduct(p); }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', marginRight: 8 }}>{p.item_code}</span>
                        {p.description}
                        <span style={{ float: 'right', fontWeight: 700, color: '#059669' }}>PKR {Math.round(p.sale_rate).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <input ref={packetsRef} type="number" value={entryPackets} onChange={e => setEntryPackets(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') rateRef.current?.focus(); }}
                placeholder="Packets" className="scan-input-inline" style={{ width: 90 }} />
              <input ref={rateRef} type="number" value={entryRate} onChange={e => setEntryRate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                placeholder="Rate" className="scan-input-inline" style={{ width: 90 }} />
              <button className="topbar-btn topbar-btn-primary" onClick={addItem} style={{ height: 38, padding: '0 16px' }}>+ Add</button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="sale-footer">
        <div className="footer-left-group">
          <div className="footer-stock-box">
            <span className="footer-box-label">Items</span>
            <strong>{items.length}</strong>
          </div>
        </div>
        <div className="footer-total-qty">
          <span>Total Pkts</span>
          <strong>{totals.totalPackets}</strong>
        </div>
        <div className="footer-grand" style={{ background: '#fecaca' }}>
          <span>Return Total</span>
          <strong style={{ color: '#991b1b' }}>{Math.round(totals.grandTotal).toLocaleString()}</strong>
        </div>
      </footer>
    </div>
  );
}

export default SalesReturn;
