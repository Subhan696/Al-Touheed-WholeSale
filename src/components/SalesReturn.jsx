import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDataVersion } from '../context/DataContext';
import './NewSale.css';
import { PAKISTAN_CITIES } from '../utils/pakistanCities';
import StockSearchModal from './StockSearchModal';

const { ipcRenderer } = window.require('electron');

const LiveClock = React.memo(({ initialDate, isLive }) => {
  const [now, setNow] = useState(initialDate || new Date());
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  const d = isLive ? now : (initialDate || new Date());
  return (
    <span className="topbar-dt">
      {`${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}, ${d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`}
    </span>
  );
});

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function nextId() { return Math.random().toString(36).substr(2, 9); }

function SalesReturn({ currentUser, returnToEdit, onSaveSuccess, onExit, onViewReturnsList, onNewReturn, isActive, onCustomerNameChange }) {
  const isEditing = !!returnToEdit;
  const stockVer = useDataVersion('stock');
  const productVer = useDataVersion('products');

  const [returnNo, setReturnNo] = useState('');
  const [returnDate, setReturnDate] = useState(new Date());

  const [customerId, setCustomerId] = useState(null);

  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    onCustomerNameChange?.(customerName);
  }, [customerName, onCustomerNameChange]);

  const [customerPhone, setCustomerPhone] = useState('');

  const [customerCity, setCustomerCity] = useState('');
  const [cities, setCities] = useState(PAKISTAN_CITIES);
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const newCityRef = useRef(null);

  const loadCities = async () => {
    try {
      const result = await ipcRenderer.invoke('get-cities');
      const names = (result || []).map(r => r.name);
      const merged = Array.from(new Set([...names, ...PAKISTAN_CITIES])).sort((a, b) => a.localeCompare(b));
      setCities(merged.length ? merged : PAKISTAN_CITIES);
    } catch { }
  };

  const handleAddCity = async () => {
    const trimmed = newCityName.trim();
    if (!trimmed) return;
    try {
      await ipcRenderer.invoke('add-city', trimmed);
      await loadCities();
      setCustomerCity(trimmed);
      setNewCityName('');
      setShowAddCity(false);
    } catch { }
  };
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(''); // Extra Flat Discount
  const [extraDiscountPct, setExtraDiscountPct] = useState(''); // Extra Disc %
  const [miscCharges, setMiscCharges] = useState('');


  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  const [focusedItemIdx, setFocusedItemIdx] = useState(null);

  // Scan Entry
  const [scanCode, setScanCode] = useState('');
  const [scanResults, setScanResults] = useState([]);
  const [showScanDrop, setShowScanDrop] = useState(false);

  // Row inline search
  const [activeCodeRow, setActiveCodeRow] = useState(null);
  const [codeRowResults, setCodeRowResults] = useState([]);
  const [showCodeRowDrop, setShowCodeRowDrop] = useState(false);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerModalSelectedIndex, setCustomerModalSelectedIndex] = useState(-1);

  useEffect(() => {
    if (customerModalOpen) {
      setCustomerSearch('');
      setCustomerResults([]);
      setCustomerModalSelectedIndex(-1);
    }
  }, [customerModalOpen]);

  useEffect(() => {
    if (customerModalSelectedIndex >= 0) {
      customerModalItemRefs.current[customerModalSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [customerModalSelectedIndex]);

  const [inlineCustomerResults, setInlineCustomerResults] = useState([]);
  const [inlineCustomerSelectedIndex, setInlineCustomerSelectedIndex] = useState(-1);

  useEffect(() => {
    if (inlineCustomerSelectedIndex >= 0) {
      inlineCustomerItemRefs.current[inlineCustomerSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [inlineCustomerSelectedIndex]);


  // Stock Search Modal
  const [stockSearchModalOpen, setStockSearchModalOpen] = useState(false);

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const customerNameRef = useRef(null);
  const tableWrapRef = useRef(null);
  const scanRef = useRef(null);

  const customerModalItemRefs = useRef([]);
  const newCustPhoneRef = useRef(null);
  const newCustCityRef = useRef(null);
  const customerPhoneRef = useRef(null);
  const customerNotesRef = useRef(null);
  const inlineCustomerItemRefs = useRef([]);


  const codeRefs = useRef({});
  const packetsRefs = useRef({});
  const rateRefs = useRef({});
  const discountRefs = useRef({});

  // Initialize
  useEffect(() => {
    if (isEditing) {
      const r = returnToEdit;
      setReturnDate(r.return_date ? new Date(r.return_date) : new Date());
      setReturnNo(r.return_no || '');
      setInvoiceNo(r.invoice_no || '');
      setCustomerName(r.customer_name || '');
      setNotes(r.notes || '');
      setDiscount(r.discount != null && parseFloat(r.discount) !== 0 ? String(r.discount) : (r.discount === 0 || r.discount === '0' ? '0' : ''));
      setExtraDiscountPct(r.extra_disc_pct != null && parseFloat(r.extra_disc_pct) !== 0 ? String(r.extra_disc_pct) : (r.extra_disc_pct === 0 || r.extra_disc_pct === '0' ? '0' : ''));
      setMiscCharges(r.misc_charges != null && parseFloat(r.misc_charges) !== 0 ? String(r.misc_charges) : (r.misc_charges === 0 || r.misc_charges === '0' ? '0' : ''));

      ipcRenderer.invoke('get-sales-return-items', r.id).then(rows => {
        setItems(rows.map(row => ({
          id: nextId(),
          itemCode: row.item_code,
          itemDescription: row.item_description,
          packets: row.packets,
          saleRate: parseFloat(row.price),
          discount: parseFloat(row.discount) || 0,
          amount: parseFloat(row.amount)
        })));
      });
    } else {
      ipcRenderer.invoke('get-next-return-no').then(n => setReturnNo(n)).catch(() => { });
    }
  }, [returnToEdit]);

  const handleSubmitRef = useRef();
  useEffect(() => { handleSubmitRef.current = handleSubmit; });

  // Keyboard Shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!isActive || stockSearchModalOpen) return;
      if (e.key === 'F8') { e.preventDefault(); setStockSearchModalOpen(true); }
      if (e.key === 'F4') { e.preventDefault(); setCustomerModalOpen(true); }
      if (e.key === 'F9' && onNewReturn) { e.preventDefault(); onNewReturn(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (handleSubmitRef.current) handleSubmitRef.current(); }
      if (e.key === 'Escape') {
        if (showScanDrop) setShowScanDrop(false);
        else if (showCodeRowDrop) setShowCodeRowDrop(false);
        else if (onExit) onExit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, stockSearchModalOpen, showScanDrop, showCodeRowDrop, customerModalOpen, onNewReturn, onExit]);

  const focusedItem = focusedItemIdx !== null ? items[focusedItemIdx] : null;


  useEffect(() => {
    setTimeout(() => {
      const active = document.activeElement;
      const isInRow = active?.classList.contains('qty-field') ||
        active?.classList.contains('rate-field') ||
        active?.classList.contains('code-field');
      if (!isInRow) scanRef.current?.focus();
      const wrap = tableWrapRef.current;
      if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
    }, 80);
  }, [items.length]);

  const roundToFive = (num) => Math.round((parseFloat(num) || 0) / 5) * 5;

  // Totals
  const totals = useMemo(() => {
    const subTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const itemDiscounts = items.reduce((s, i) => {
      const p = Math.abs(parseInt(i.packets) || 0);
      return s + (p * (parseFloat(i.discount) || 0));
    }, 0);

    const totalQty = items.reduce((s, i) => {
      return s + Math.abs(parseInt(i.packets) || 0);
    }, 0);

    const totalPackets = Math.round(items.reduce((s, i) => {
      const qty = Math.abs(parseInt(i.packets) || 0);
      const packing = parseFloat(i.packingQty) || 1;
      return s + (packing > 0 ? (qty / packing) : qty);
    }, 0));

    const extraDiscountAmt = parseFloat(discount) || 0;
    const miscAmt = parseFloat(miscCharges) || 0;

    const preExtraPctTotal = subTotal + miscAmt - itemDiscounts;
    const extraDiscountPctAmt = roundToFive(preExtraPctTotal * (parseFloat(extraDiscountPct) || 0) / 100);

    const totalDiscountAmt = itemDiscounts + extraDiscountAmt + extraDiscountPctAmt;
    const grandTotal = subTotal + miscAmt - totalDiscountAmt;

    return { subTotal, itemDiscounts, totalDiscountAmt, totalQty, totalPackets, grandTotal };
  }, [items, discount, extraDiscountPct, miscCharges]);

  const calcAmount = (item) => {
    const p = Math.abs(parseInt(item.packets) || 0);
    const r = parseFloat(item.saleRate) || 0;
    return p * r;
  };

  const makeRow = () => ({
    id: nextId(), itemCode: '', itemDescription: '', packets: '', saleRate: 0, discount: 0, amount: 0, purchaseRate: 0, stock: null
  });

  // --- Inline Row Editing ---
  const handleCodeChange = async (idx, val) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, itemCode: val, itemDescription: '', amount: 0 } : item));
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      setActiveCodeRow(idx);
      try {
        const res = await ipcRenderer.invoke('search-products', trimmed);
        setCodeRowResults(res || []);
        setShowCodeRowDrop((res || []).length > 0);
      } catch { setCodeRowResults([]); setShowCodeRowDrop(false); }
    } else {
      setShowCodeRowDrop(false);
    }
  };

  const fillRow = (idx, product) => {
    const pkts = product.packing_qty || 1;
    const rate = parseFloat(product.sale_rate) || 0;
    const purRate = Math.round((parseFloat(product.actual_cost) || parseFloat(product.purchase_rate) || 0) * 100) / 100;
    const baseDisc = parseFloat(product.discount) || 0;

    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const draftItem = {
        ...item,
        itemCode: product.item_code,
        itemDescription: descForProduct(product),
        packets: pkts,
        saleRate: rate,
        discount: baseDisc,
        packingQty: pkts,
        purchaseRate: purRate,
        stock: product.available_stock ?? product.stock_qty ?? null
      };
      draftItem.amount = calcAmount(draftItem);
      return draftItem;
    }));

    setShowCodeRowDrop(false);
    setActiveCodeRow(null);
    setFocusedItemIdx(idx);
    setTimeout(() => {
      if (idx < itemsRef.current.length - 1) {
        codeRefs.current[idx + 1]?.focus();
      } else {
        scanRef.current?.focus();
      }
    }, 30);

    ipcRenderer.invoke('get-stock-single', product.item_code)
      .then(st => setItems(prev => prev.map((item, i) => i === idx ? { ...item, stock: st } : item)))
      .catch(() => { });
  };

  const handleCodeKD = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const codeVal = e.target.value?.trim()?.toLowerCase() || items[idx]?.itemCode?.trim()?.toLowerCase();
      if (showCodeRowDrop && codeRowResults.length > 0) {
        const exact = codeRowResults.find(r => r.item_code.toLowerCase() === codeVal);
        fillRow(idx, exact || codeRowResults[0]);
        return;
      }
      if (idx < itemsRef.current.length - 1) {
        codeRefs.current[idx + 1]?.focus();
      } else {
        scanRef.current?.focus();
      }
      return;
    }
    if (e.key === 'Escape') { setShowCodeRowDrop(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < itemsRef.current.length - 1) codeRefs.current[idx + 1]?.focus();
      else scanRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); codeRefs.current[idx - 1]?.focus(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      setItems(prev => prev.filter((_, i) => i !== idx));
      if (idx > 0) setTimeout(() => codeRefs.current[idx - 1]?.focus(), 50);
      else setTimeout(() => scanRef.current?.focus(), 50);
    }
  };

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
      return { ...item, discount: val };
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
      if (field === 'packets') { rateRefs.current[idx]?.focus(); return; }
      if (field === 'rate') { discountRefs.current[idx]?.focus(); return; }
      if (field === 'discount') {
        if (idx >= rows.length - 1) scanRef.current?.focus();
        else codeRefs.current[idx + 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (field === 'packets') {
        if (idx < rows.length - 1) packetsRefs.current[idx + 1]?.focus();
        else scanRef.current?.focus();
      } else if (field === 'rate') {
        if (idx < rows.length - 1) rateRefs.current[idx + 1]?.focus();
        else scanRef.current?.focus();
      } else if (field === 'discount') {
        if (idx < rows.length - 1) discountRefs.current[idx + 1]?.focus();
        else scanRef.current?.focus();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (field === 'packets' && idx > 0) packetsRefs.current[idx - 1]?.focus();
      if (field === 'rate' && idx > 0) rateRefs.current[idx - 1]?.focus();
      if (field === 'discount' && idx > 0) discountRefs.current[idx - 1]?.focus();
    }
  };

  // --- Bottom Scan Area ---
  const handleScanChange = async (val) => {
    setScanCode(val);
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      try {
        const res = await ipcRenderer.invoke('search-products', trimmed);
        setScanResults(res || []);
        setShowScanDrop((res || []).length > 0);
      } catch { setScanResults([]); setShowScanDrop(false); }
    } else {
      setShowScanDrop(false);
    }
  };

  const addProduct = (product) => {
    const pkts = product.packing_qty || 1;
    const rate = parseFloat(product.sale_rate) || 0;
    const baseDisc = parseFloat(product.discount) || 0;
    const purRate = Math.round((parseFloat(product.actual_cost) || parseFloat(product.purchase_rate) || 0) * 100) / 100;

    // Find the empty placeholder row if it exists at the end
    const hasEmptyRow = itemsRef.current.length > 0 && !itemsRef.current[itemsRef.current.length - 1].itemCode;
    const insertIdx = hasEmptyRow ? itemsRef.current.length - 1 : itemsRef.current.length;

    const draftItem = {
      id: nextId(),
      itemCode: product.item_code,
      itemDescription: descForProduct(product),
      packets: pkts,
      saleRate: rate,
      discount: baseDisc,
      packingQty: pkts,
      purchaseRate: purRate,
      stock: product.available_stock ?? product.stock_qty ?? null
    };
    draftItem.amount = calcAmount(draftItem);

    setItems(prev => {
      const next = [...prev];
      if (hasEmptyRow) next[insertIdx] = draftItem;
      else next.push(draftItem);
      return next;
    });

    setFocusedItemIdx(insertIdx);
    setScanCode('');
    setScanResults([]);
    setShowScanDrop(false);
    setTimeout(() => {
      scanRef.current?.focus();
    }, 60);

    ipcRenderer.invoke('get-stock-single', product.item_code)
      .then(st => setItems(prev => prev.map((item, i) => i === insertIdx ? { ...item, stock: st } : item)))
      .catch(() => { });
  };

  const handleScanKD = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const codeVal = scanCode.trim().toLowerCase();
      if (!codeVal) return;
      if (showScanDrop && scanResults.length > 0) {
        const exact = scanResults.find(r => r.item_code.toLowerCase() === codeVal);
        addProduct(exact || scanResults[0]);
        return;
      }
      try {
        const res = await ipcRenderer.invoke('search-products', codeVal);
        if (res && res.length > 0) addProduct(res[0]);
      } catch { }
    }
    if (e.key === 'Escape') { setShowScanDrop(false); }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = itemsRef.current;
      if (rows.length > 0) codeRefs.current[rows.length - 1]?.focus();
    }
  };

  // Submitting
  const handleSubmit = async () => {
    const validItems = items.filter(i => i.itemCode && i.itemCode.trim() !== '');
    if (validItems.length === 0) {
      setMessage('Add at least one item');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setIsSubmitting(true);

    const dbItems = validItems.map(i => ({
      itemCode: i.itemCode,
      itemDescription: i.itemDescription,
      packets: parseInt(i.packets) || 0,
      price: parseFloat(i.saleRate) || 0,
      discount: parseFloat(i.discount) || 0,
      amount: parseFloat(i.amount) || 0
    }));

    const dStr = `${returnDate.getFullYear()}-${String(returnDate.getMonth() + 1).padStart(2, '0')}-${String(returnDate.getDate()).padStart(2, '0')}`;
    const payload = {
      returnDate: dStr,
      returnNo, invoiceNo, customerName, items: dbItems, notes, userId: currentUser?.id,
      discount: parseFloat(discount) || 0,
      extraDiscountPct: parseFloat(extraDiscountPct) || 0,
      miscCharges: parseFloat(miscCharges) || 0,
      totalAmount: totals.grandTotal
    };

    try {
      const result = isEditing
        ? await ipcRenderer.invoke('update-sales-return', { ...payload, id: returnToEdit.id })
        : await ipcRenderer.invoke('save-sales-return', payload);

      if (result.success) {
        if (onSaveSuccess) onSaveSuccess();
      } else {
        setMessage(result.error || 'Failed to save');
        setIsSubmitting(false);
      }
    } catch (e) {
      setMessage(e.message || 'Error saving return');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sale-page">
      {stockSearchModalOpen && (
        <StockSearchModal
          isOpen={stockSearchModalOpen}
          onClose={() => {
            setStockSearchModalOpen(false);
            setTimeout(() => scanRef.current?.focus(), 50);
          }}
          onSelectItem={(product) => {
            addProduct(product);
            setStockSearchModalOpen(false);
          }}
          stockVer={stockVer}
          productVer={productVer}
          title="Stock Inventory Search"
        />
      )}

      {/* Topbar */}
      <div className="sale-topbar">
        <div className="topbar-left">
          <span className="topbar-inv">{isEditing ? `Edit Return: ${returnNo}` : `New Return: ${returnNo}`}</span>
          <LiveClock initialDate={returnDate} isLive={!isEditing} />
          {!isEditing && onNewReturn && (
            <button type="button" className="topbar-btn topbar-btn-primary" onClick={onNewReturn} style={{ marginLeft: 10 }}>+ New Return</button>
          )}
          <span className={`topbar-title ${isEditing ? 'transparent' : 'pink'}`}>{isEditing ? 'Edit Return' : 'Sales Return'}</span>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-btn" onClick={() => setCustomerModalOpen(true)} title="Search Customer (F4)" style={{ background: '#3b82f6', color: '#fff' }}>CUST</button>
          <button type="button" className="topbar-btn" onClick={() => setStockSearchModalOpen(true)} title="Stock Search (F8)" style={{ background: '#0284c7', color: '#fff', padding: '2px 8px', fontSize: '0.75rem', height: 26, lineHeight: '20px' }}>Search</button>
          <button type="button" className="topbar-btn topbar-btn-secondary" onClick={() => isEditing ? onExit() : window.location.reload()}>{isEditing ? 'Cancel' : 'Reset'}</button>
          {onViewReturnsList && <button type="button" className="topbar-btn topbar-btn-secondary" onClick={onViewReturnsList}>View Returns List</button>}
          <button type="button" className="topbar-btn topbar-btn-primary" onClick={handleSubmit} disabled={isSubmitting} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
            {isSubmitting ? 'Saving...' : 'Save Return'}
          </button>
        </div>
      </div>

      {/* Customer section */}
      <div className="customer-section">
        <button type="button" className="customer-toggle" onClick={() => setCustomerOpen(v => !v)}>
          Return Details {customerOpen ? '▼' : '▶'}
          {!customerOpen && customerName && <strong style={{ color: '#1e1e2d', marginLeft: 8 }}>{customerName}</strong>}
        </button>
        <div className={`customer-details ${customerOpen ? 'open' : ''}`} style={{ maxHeight: customerOpen ? '90px' : '0' }}>
          <div className="customer-fields" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div className="field">
              <label>Customer Name</label>
              <input ref={customerNameRef} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in" />
            </div>
            <div className="field">
              <label>Original Invoice #</label>
              <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-XXXX" />
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanRef.current?.focus(); } }} placeholder="Optional..." />
            </div>
          </div>
        </div>
      </div>

      {message && <div className="message" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>{message}</div>}

      {/* Customer Modal (F4) */}

      {customerModalOpen && (

        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCustomerModalOpen(false)}>

          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

            <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem' }}>Select / Create Customer</h3>

            <input autoFocus type="text" placeholder="Search phone or name..." value={customerSearch} onChange={async (e) => {

              const val = e.target.value; setCustomerSearch(val);

              setCustomerModalSelectedIndex(-1);

              if (!val.trim()) { setCustomerResults([]); return; }

              try { const res = await ipcRenderer.invoke('get-customers', { searchTerm: val }); setCustomerResults(res || []); } catch { }

            }} onKeyDown={(e) => {

              if (e.key === 'ArrowDown') {

                e.preventDefault();

                if (customerResults.length > 0) {

                  setCustomerModalSelectedIndex(prev => (prev < customerResults.length - 1 ? prev + 1 : prev));

                }

              } else if (e.key === 'ArrowUp') {

                e.preventDefault();

                if (customerResults.length > 0) {

                  setCustomerModalSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));

                }

              } else if (e.key === 'Enter') {

                e.preventDefault();

                if (customerResults.length > 0) {

                  const idx = customerModalSelectedIndex >= 0 ? customerModalSelectedIndex : 0;

                  const c = customerResults[idx];

                  if (c) {

                    setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustomerCity(c.city || '');

                    setCustomerModalOpen(false);

                    setCustomerModalSelectedIndex(-1);

                  }

                }

              }

            }} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none', marginBottom: 16 }} />



            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e4e6ef', borderRadius: 6, marginBottom: 16 }}>

              {customerResults.map((c, idx) => (

                <div key={c.id} ref={el => customerModalItemRefs.current[idx] = el} style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: idx === (customerModalSelectedIndex >= 0 ? customerModalSelectedIndex : 0) ? '#e2e8f0' : '#fff' }} onMouseEnter={e => e.currentTarget.style.background = '#f5f8fa'} onMouseLeave={e => e.currentTarget.style.background = idx === (customerModalSelectedIndex >= 0 ? customerModalSelectedIndex : 0) ? '#e2e8f0' : '#fff'} onClick={() => {

                  setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustomerCity(c.city || '');

                  setCustomerModalOpen(false);

                  setCustomerModalSelectedIndex(-1);

                }}>

                  <div style={{ fontWeight: 600 }}>{c.name}</div>

                  <div style={{ fontSize: '0.85rem', color: '#7e8299' }}>{c.phone || 'No phone'} | {c.city || 'No city'}</div>

                </div>

              ))}

              {customerResults.length === 0 && customerSearch && (

                <div style={{ padding: '10px 14px', color: '#7e8299' }}>No existing customer found. Fill below to create new.</div>

              )}

            </div>



            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div>

                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Name *</label>

                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') newCustPhoneRef.current?.focus(); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />

              </div>

              <div style={{ display: 'flex', gap: 10 }}>

                <div style={{ flex: 1 }}>

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Phone</label>

                  <input ref={newCustPhoneRef} type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') newCustCityRef.current?.focus(); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />

                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>City</label>
                  <select
                    ref={newCustCityRef}
                    value={showAddCity ? '__add_new__' : customerCity}
                    onChange={e => {
                      if (e.target.value === '__add_new__') {
                        setShowAddCity(true);
                        setNewCityName('');
                        setTimeout(() => newCityRef.current?.focus(), 50);
                      } else {
                        setShowAddCity(false);
                        setCustomerCity(e.target.value);
                      }
                    }}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && !showAddCity) {
                        e.preventDefault();
                        if (!customerName.trim()) { setCustomerModalOpen(false); return; }
                        if (!customerId) {
                          try {
                            const res = await ipcRenderer.invoke('add-customer', { name: customerName.trim(), phone: customerPhone.trim(), city: customerCity.trim() });
                            if (res.success) setCustomerId(res.id);
                          } catch (err) { }
                        }
                        setCustomerModalOpen(false);
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none', background: '#fff', cursor: 'pointer' }}
                  >
                    <option value="">Select City...</option>
                    {cities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__add_new__">+ Add new city / place...</option>
                  </select>
                  {showAddCity && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        ref={newCityRef}
                        type="text"
                        value={newCityName}
                        onChange={e => setNewCityName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCity(); } if (e.key === 'Escape') { setShowAddCity(false); } }}
                        placeholder="Type new city or place name"
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCity}
                        style={{ padding: '8px 14px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddCity(false); setNewCityName(''); }}
                        style={{ padding: '8px 14px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

              </div>

            </div>



            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>

              <button onClick={() => setCustomerModalOpen(false)} style={{ padding: '8px 16px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>

              <button onClick={async () => {

                if (!customerName.trim()) {

                  setCustomerModalOpen(false);

                  return;

                }

                if (!customerId) {

                  try {

                    const res = await ipcRenderer.invoke('add-customer', { name: customerName.trim(), phone: customerPhone.trim(), city: customerCity.trim() });

                    if (res.success) setCustomerId(res.id);

                  } catch (e) { }

                }

                setCustomerModalOpen(false);

              }} style={{ padding: '8px 16px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Select & Create</button>

            </div>

          </div>

        </div>

      )}



      {/* Body */}
                    <div className="sale-body">
                      <div className="sale-table-wrap" ref={tableWrapRef}>
                        <table className="sale-table">
                          <thead>
                            <tr>
                              <th style={{ width: 36 }}>#</th>
                              <th style={{ width: '13%' }}>Code</th>
                              <th>Description</th>
                              <th className="center" style={{ width: '9%' }}>Qty</th>
                              <th className="right" style={{ width: '10%' }}>Rate</th>
                              <th className="right" style={{ width: '10%' }}>Disc.</th>
                              <th className="right" style={{ width: '12%' }}>Amount</th>
                              <th style={{ width: 36 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item, idx) => (
                              <tr key={item.id} className={focusedItemIdx === idx ? 'row-active' : ''} style={{ backgroundColor: '#fee2e2' }}>
                                <td className="center" style={{ fontWeight: 700, color: '#6b7280', fontSize: '0.85rem' }}>{idx + 1}</td>

                                <td style={{ position: 'relative' }}>
                                  <input
                                    ref={el => codeRefs.current[idx] = el}
                                    type="text"
                                    value={item.itemCode}
                                    onChange={e => handleCodeChange(idx, e.target.value)}
                                    onKeyDown={e => handleCodeKD(e, idx)}
                                    onFocus={() => setFocusedItemIdx(idx)}
                                    onBlur={() => setTimeout(() => { if (activeCodeRow === idx) setShowCodeRowDrop(false); }, 200)}
                                    className="code-field"
                                    placeholder="Code"
                                  />
                                </td>

                                <td><span className="desc-main">{item.itemDescription}</span></td>

                                <td className="center">
                                  <input
                                    ref={el => packetsRefs.current[idx] = el}
                                    type="text"
                                    inputMode="numeric"
                                    value={item.packets}
                                    onChange={e => updatePackets(idx, e.target.value.replace(/[^\d-]/g, ''))}
                                    onKeyDown={e => handleRowKD(e, idx, 'packets')}
                                    onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                                    className="qty-field center packing-input"
                                  />
                                </td>

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

                                <td className="right">
                                  <input
                                    ref={el => discountRefs.current[idx] = el}
                                    type="text"
                                    inputMode="decimal"
                                    value={item.discount}
                                    onChange={e => updateDiscount(idx, e.target.value.replace(/[^\d.]/g, ''))}
                                    onKeyDown={e => handleRowKD(e, idx, 'discount')}
                                    onFocus={e => { setFocusedItemIdx(idx); e.target.select(); }}
                                    className="rate-field right discount-input"
                                  />
                                </td>

                                <td className="right amount-cell" style={{ background: 'transparent' }}>
                                  <span className="amount-badge" style={{ color: '#dc2626', background: 'transparent' }}>
                                    {item.amount !== 0 ? Math.round(item.amount).toLocaleString() : '—'}
                                  </span>
                                </td>

                                <td className="center">
                                  <button className="btn-icon" tabIndex={-1} onClick={() => setItems(p => p.filter((_, j) => j !== idx))}>✖</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Scan input */}
                        <div className="scan-entry">
                          <div className="scan-cell">
                            <input
                              ref={scanRef}
                              type="text"
                              value={scanCode}
                              onChange={e => handleScanChange(e.target.value)}
                              onKeyDown={handleScanKD}
                              onFocus={() => setFocusedItemIdx(null)}
                              onClick={e => { e.target.focus(); e.target.select(); }}
                              placeholder="Scan / type here..."
                              className="scan-input-inline"
                              autoFocus
                            />
                            {showScanDrop && scanResults.length > 0 && (
                              <div className="autocomplete-dropdown" style={{ bottom: '100%', top: 'auto', marginBottom: '4px', maxWidth: '500px' }}>
                                {scanResults.slice(0, 10).map(p => (
                                  <div key={p.id} className="suggestion-item" onMouseDown={e => { e.preventDefault(); addProduct(p); }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', marginRight: 8 }}>{p.item_code}</span>
                                    {descForProduct(p)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <footer className="sale-footer" style={{ borderTopColor: '#fecaca', background: '#fff1f2' }}>
                      <div className="footer-left-group">
                        <div className="footer-stock-box" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                          <span className="footer-box-label">Stock</span>
                          {focusedItem
                            ? <strong style={{ fontSize: '1rem', color: focusedItem.stock === 0 ? '#dc2626' : '#991b1b' }}>{focusedItem.stock ?? 'N/A'}</strong>
                            : <span className="footer-placeholder">—</span>}
                        </div>
                        <div className="footer-purchase-box" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                          <span className="footer-box-label">Purchase</span>
                          {focusedItem
                            ? <strong style={{ fontSize: '1rem', color: '#991b1b' }}>PKR {focusedItem.purchaseRate != null && !isNaN(focusedItem.purchaseRate) ? (Math.round(parseFloat(focusedItem.purchaseRate) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}</strong>
                            : <span className="footer-placeholder">—</span>}
                        </div>
                      </div>

                      <div className="footer-subtotal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', lineHeight: '1.2' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '0.95rem', color: '#6b7280' }}>Subtotal</span>
                          <span style={{ fontWeight: '700', fontSize: '1.2rem', color: '#111827' }}>{Math.round(totals.subTotal).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#4b5563', fontWeight: '700', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {totals.totalPackets} pkts / {totals.totalQty} pcs
                        </div>
                      </div>

                      <div className="footer-discount">
                        <span>Misc (+)</span>
                        <input type="number" className="discount-input" value={miscCharges}
                          onChange={e => setMiscCharges(e.target.value)} placeholder="+"
                          style={{ color: '#059669', borderColor: '#059669' }} />
                      </div>

                      <div className="footer-discount">
                        <span>Extra Disc (-)</span>
                        <input type="number" className="discount-input" value={discount}
                          onChange={e => setDiscount(e.target.value)} placeholder="-" />
                      </div>

                      <div className="footer-discount">
                        <span>Extra Disc % (-)</span>
                        <input type="number" className="discount-input" value={extraDiscountPct}
                          onChange={e => setExtraDiscountPct(e.target.value)} placeholder="%" />
                      </div>

                      <div className="footer-total-qty">
                        <span>Flat Disc</span>
                        <strong>{Math.round(totals.totalDiscountAmt).toLocaleString()}</strong>
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
