import React, { useState, useEffect, useRef, useMemo } from 'react';
import './NewPurchase.css';
import { printPurchaseReturn, savePurchaseReturnPDF } from '../utils/printPurchaseReturn';
import SuccessAnimation from './SuccessAnimation';
import StockSearchModal from './StockSearchModal';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', brand: '', packingQty: 0, currentStock: 0, packets: '', preDiscPrice: '', flatDiscount: 0, discPct: 0 };
}

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function PurchaseReturn({ currentUser, returnToEdit, onSaveSuccess, onCancelEdit, isActive }) {
  const isEditing = !!returnToEdit;

  const todayDMY = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`;
  };

  const [returnDate, setReturnDate] = useState(todayDMY);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [godown, setGodown] = useState('1-SHOP');
  const [bltNumber, setBltNumber] = useState('');
  const [freightAccountName, setFreightAccountName] = useState('');
  const [ctnQty, setCtnQty] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [miscCharges, setMiscCharges] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [stockSearchModalOpen, setStockSearchModalOpen] = useState(false);
  
  const [suppliersList, setSuppliersList] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [mfgDiscounts, setMfgDiscounts] = useState([]);
  const [activeDrop, setActiveDrop] = useState(null);

  const dateRef = useRef(null);
  const invoiceRef = useRef(null);
  const supplierRef = useRef(null);
  const bltRef = useRef(null);
  const freightRef = useRef(null);
  const ctnQtyRef = useRef(null);
  const notesRef = useRef(null);

  const codeRefs = useRef({});
  const packetsRefs = useRef({});
  const rateRefs = useRef({});
  const tableContainerRef = useRef(null);
  const itemsRef = useRef([]);
  itemsRef.current = items;

  const loadNextReturnNo = async () => {
    try {
      const nextNo = await ipcRenderer.invoke('get-next-purchase-return-no');
      if (nextNo) setInvoiceNo(String(nextNo));
    } catch (err) {
      console.error('Failed to get next return no:', err);
    }
  };

  useEffect(() => {
    if (isEditing) {
      const r = returnToEdit;
      let dStr = '';
      if (r.return_date instanceof Date) {
        const dt = r.return_date;
        const d = String(dt.getDate()).padStart(2, '0');
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const y = dt.getFullYear();
        dStr = `${d}-${m}-${y}`;
      } else if (typeof r.return_date === 'string' && r.return_date.trim()) {
        const dateOnly = r.return_date.split('T')[0].split(' ')[0];
        const parts = dateOnly.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
            dStr = dateOnly;
          }
        }
      }
      if (dStr) setReturnDate(dStr);

      setInvoiceNo(String(r.return_no || r.invoice_no || '').replace(/^PR-/, ''));
      setSupplierName(r.supplier_name || '');
      setSupplierInvNo(r.supplier_inv_no || '');
      setVehicleNo(r.vehicle_no || '');
      setGodown(r.godown || '1-SHOP');
      setBltNumber(r.blt_number || '');
      setFreightAccountName(r.freight_account_name || '');
      setCtnQty(r.ctn_qty ? String(r.ctn_qty) : '');
      setNotes(r.notes || '');
      setDiscount(String(r.discount || ''));
      setMiscCharges(String(r.misc_charges || ''));

      ipcRenderer.invoke('get-purchase-return-items', r.id).then(rows => {
        const mapped = rows.map(row => ({
          id: nextId(),
          itemCode: row.item_code,
          description: row.item_description,
          brand: row.brand || '',
          packingQty: row.packing_qty || 0,
          currentStock: row.stock_packets !== undefined ? row.stock_packets : (row.packing_qty || 0),
          packets: String(row.packets),
          preDiscPrice: String(parseFloat(row.pre_disc_price || row.rate)),
          flatDiscount: parseFloat(row.flat_discount || 0),
          discPct: parseFloat(row.disc_pct || 0)
        }));
        mapped.push(makeRow());
        setItems(mapped);
        setTimeout(() => {
          const first = mapped[0];
          if (first) {
            setActiveRowId(first.id);
            codeRefs.current[first.id]?.focus();
          }
        }, 80);
      });
    } else {
      loadNextReturnNo();
      setTimeout(() => supplierRef.current?.focus(), 80);
    }
  }, [returnToEdit]);

  useEffect(() => {
    const loadDropdowns = () => {
      Promise.all([
        ipcRenderer.invoke('get-suppliers-ledger'),
        ipcRenderer.invoke('get-manufacturers'),
        ipcRenderer.invoke('get-expense-accounts'),
        ipcRenderer.invoke('get-raw-manufacturer-brands')
      ]).then(([supps, mfgs, exps, mfDiscs]) => {
        const suppNames = (supps || []).map(s => s.name);
        const mfgNames = (mfgs || []).map(m => m.name);
        const combined = Array.from(new Set([...suppNames, ...mfgNames])).filter(Boolean).sort();
        setSuppliersList(combined);
        setExpenseAccounts(exps || []);
        setMfgDiscounts(mfDiscs || []);
      }).catch(err => console.error('Error loading dropdowns:', err));
    };
    loadDropdowns();
    window.addEventListener('focus', loadDropdowns);
    return () => window.removeEventListener('focus', loadDropdowns);
  }, []);

  const handleDateChange = (e, setter, currentVal) => {
    let val = e.target.value;
    if (val.length < currentVal.length) {
      setter(val);
      return;
    }
    val = val.replace(/[^0-9-]/g, '');
    if (val.length === 2 && !val.includes('-')) val += '-';
    if (val.length === 5 && val.split('-').length === 2) val += '-';
    if (val.length <= 10) setter(val);
  };

  const handleHeaderKD = (e, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (field === 'invoice') dateRef.current?.focus();
    else if (field === 'returnDate') supplierRef.current?.focus();
    else if (field === 'supplier') bltRef.current?.focus();
    else if (field === 'blt') freightRef.current?.focus();
    else if (field === 'freight') ctnQtyRef.current?.focus();
    else if (field === 'ctnQty') notesRef.current?.focus();
    else if (field === 'notes') {
      const first = itemsRef.current[0];
      if (first) {
        setActiveRowId(first.id);
        setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
      }
    }
  };

  useEffect(() => {
    if (!activeRowId) return;
    const item = items.find(r => r.id === activeRowId);
    if (item && item.itemCode && (item.currentStock === undefined || item.currentStock === 0)) {
      ipcRenderer.invoke('get-product-by-code', item.itemCode).then(p => {
        if (p && p.stock_packets !== undefined) {
          setItems(prev => prev.map(r => r.id === activeRowId ? { ...r, currentStock: p.stock_packets } : r));
        }
      }).catch(console.error);
    }
  }, [activeRowId]);

  const handleCodeFocus = (rowId) => {
    setActiveRowId(rowId);
    setTimeout(() => {
      if (codeRefs.current[rowId]) {
        codeRefs.current[rowId].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 30);
  };

  const handleCodeChange = async (rowId, val) => {
    setActiveRowId(rowId);
    setItems(prev => prev.map(r =>
      r.id === rowId ? { ...r, itemCode: val, description: '', brand: '', packingQty: 0, currentStock: 0, preDiscPrice: '', flatDiscount: 0, discPct: 0 } : r
    ));
    if (!val.trim()) { setActiveDrop(null); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setActiveDrop(results?.length > 0 ? { rowId, results } : null);
  };

  const fillRow = (rowId, product) => {
    setActiveRowId(rowId);
    const pkts = product.packing_qty || 0;
    const baseRate = parseFloat(product.purchase_rate) || 0;
    let flatD = 0;
    let pctD = 0;

    if (supplierName && product.brand) {
      const rule = mfgDiscounts.find(d =>
        d.company_name.toLowerCase() === supplierName.toLowerCase() &&
        d.brand_name.toLowerCase() === product.brand.toLowerCase()
      );
      if (rule) {
        pctD = parseFloat(rule.purchase_discount_pct) || 0;
        flatD = parseFloat(rule.discount_amount) || 0;
      }
    }

    setItems(prev => prev.map(r =>
      r.id === rowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        brand: product.brand || '',
        packingQty: pkts,
        currentStock: product.stock_packets !== undefined ? product.stock_packets : 0,
        packets: String(pkts),
        preDiscPrice: String(baseRate),
        flatDiscount: flatD,
        discPct: pctD
      } : r
    ));
    setActiveDrop(null);
    setTimeout(() => packetsRefs.current[rowId]?.focus(), 30);
  };

  const updateRow = (rowId, field, val) => {
    setItems(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, [field]: val };
    }));
  };

  const removeRow = (rowId) => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(r => r.id === rowId);
      const focusTarget = prev[idx - 1] || prev[idx + 1];
      if (focusTarget) {
        setActiveRowId(focusTarget.id);
        setTimeout(() => codeRefs.current[focusTarget.id]?.focus(), 50);
      }
      return prev.filter(r => r.id !== rowId);
    });
  };

  const addEmptyRow = () => {
    setItems(prev => {
      const last = prev[prev.length - 1];
      if (!last?.description && !last?.itemCode) {
        setActiveRowId(last.id);
        setTimeout(() => {
          codeRefs.current[last.id]?.focus();
          codeRefs.current[last.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 30);
        return prev;
      }
      const nr = makeRow();
      setActiveRowId(nr.id);
      setTimeout(() => {
        codeRefs.current[nr.id]?.focus();
        codeRefs.current[nr.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
      return [...prev, nr];
    });
  };

  const ctrlD = (e, idx) => {
    e.preventDefault();
    const rows = itemsRef.current;
    const cur = rows[idx];
    const isEmpty = !cur.itemCode && !cur.description &&
      (!cur.packets || cur.packets === '0') &&
      (!cur.preDiscPrice || cur.preDiscPrice === '0');
    if (isEmpty && idx > 0) {
      removeRow(rows[idx - 1].id);
    } else {
      removeRow(cur.id);
    }
  };

  const handleCodeKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      const drop = activeDrop?.rowId === rowId ? activeDrop.results : [];
      const codeVal = rows[idx]?.itemCode?.trim().toLowerCase() || '';
      if (drop.length > 0) {
        const exact = drop.find(r => r.item_code.toLowerCase() === codeVal);
        fillRow(rowId, exact || drop[0]);
      } else packetsRefs.current[rowId]?.focus();
    }
    if (e.key === 'Escape') setActiveDrop(null);
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = rows[idx+1]; if(n) codeRefs.current[n.id]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); const n = rows[idx-1]; if(n) codeRefs.current[n.id]?.focus(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

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
    setReturnDate(todayDMY());
    setSupplierName('');
    setSupplierInvNo('');
    setBltNumber('');
    setVehicleNo('');
    setGodown('1-SHOP');
    setFreightAccountName('');
    setCtnQty('');
    setNotes('');
    setDiscount('');
    setMiscCharges('');
    setItems([makeRow()]);
    setStatusMsg('');
    setActiveDrop(null);
    loadNextReturnNo();
    setTimeout(() => supplierRef.current?.focus(), 50);
  };

  const { totals, rowMath } = useMemo(() => {
    const mathMap = {};
    let sub = 0;
    let pkts = 0;
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;
    let grossSub = 0;
    let totalItemDisc = 0;

    items.forEach(r => {
      const q = parseInt(r.packets) || 0;
      const base = parseFloat(r.preDiscPrice) || 0;
      const flat = parseFloat(r.flatDiscount) || 0;
      const dPct = parseFloat(r.discPct) || 0;
      const rDisc = base * (dPct / 100);
      const netRate = Math.max(0, base - rDisc - flat);
      const rowTotal = netRate * q;
      const rowGross = base * q;

      mathMap[r.id] = { pPrice: netRate, rowDiscTotal: (flat + rDisc) * q, rowTotal, netRate };
      if (r.description && q > 0) {
        sub += rowTotal;
        grossSub += rowGross;
        pkts += q;
        totalItemDisc += (flat + rDisc) * q;
      }
    });

    const grand = sub + misc - disc;

    return {
      totals: {
        grossSub,
        netSub: sub,
        pkts,
        misc,
        totalItemDisc,
        flatDisc: disc,
        grand,
        count: items.filter(r => r.description && parseInt(r.packets) > 0).length
      },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount]);

  const handleSubmit = async () => {
    if (!supplierName.trim()) {
      setStatusMsg('Error: Supplier name required');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0 && parseFloat(r.preDiscPrice) > 0);
    if (!valid.length) {
      setStatusMsg('Error: Add at least one valid item');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      let dbReturnDate = '';
      if (returnDate && returnDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = returnDate.split('-');
        dbReturnDate = `${y}-${m}-${d}`;
      } else {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        dbReturnDate = `${y}-${m}-${d}`;
      }

      const payload = {
        returnDate: dbReturnDate,
        invoiceNo,
        supplierName,
        notes,
        supplierInvNo,
        vehicleNo,
        godown,
        bltNumber,
        freightAccountName,
        ctnQty: parseInt(ctnQty) || 0,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        items: valid.map(r => {
          const math = rowMath[r.id];
          return {
            itemCode: r.itemCode,
            itemDescription: r.description,
            packingQty: r.packingQty,
            packets: parseInt(r.packets),
            rate: math.netRate,
            amount: math.rowTotal,
            preDiscPrice: parseFloat(r.preDiscPrice) || 0,
            flatDiscount: r.flatDiscount,
            discPct: r.discPct,
            discountAmount: math.rowDiscTotal,
            netRate: math.netRate
          };
        })
      };

      const result = isEditing
        ? await ipcRenderer.invoke('update-purchase-return', { ...payload, id: returnToEdit.id })
        : await ipcRenderer.invoke('save-purchase-return', payload);

      if (result.success) {
        setStatusMsg(isEditing ? '✓ Return updated!' : '✓ Return saved!');
        setShowSuccessAnim(true);
      } else {
        setStatusMsg(`Error: ${result.error || 'Failed'}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  const getHeaderData = () => ({
    invoiceNo,
    returnDate,
    supplierName,
    bltNumber,
    freightAccountName,
    ctnQty,
    notes,
    discount,
    miscCharges
  });

  const handlePrint = () => {
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0);
    if (!valid.length) {
      setStatusMsg('Error: Add items before printing');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    printPurchaseReturn(getHeaderData(), valid);
  };

  const handleSavePDF = async () => {
    const valid = items.filter(r => r.description && parseInt(r.packets) > 0);
    if (!valid.length) {
      setStatusMsg('Error: Add items before saving PDF');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    const res = await savePurchaseReturnPDF(getHeaderData(), valid);
    if (res?.success) {
      setStatusMsg(`✓ PDF saved!`);
      setTimeout(() => setStatusMsg(''), 3000);
    } else if (res?.error) {
      setStatusMsg(`Error: ${res.error}`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if (e.key === 'F8') { e.preventDefault(); setStockSearchModalOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSubmit(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); handlePrint(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, returnDate, discount, miscCharges, notes, isEditing]);

  const focusItemCodeInput = () => {
    setTimeout(() => {
      const rows = itemsRef.current || [];
      const emptyRow = rows.find(r => !r.itemCode && !r.description) || rows[rows.length - 1] || rows[0];
      if (emptyRow && codeRefs.current[emptyRow.id]) {
        codeRefs.current[emptyRow.id].focus();
        codeRefs.current[emptyRow.id].select?.();
      }
    }, 50);
  };

  const handleCloseStockSearch = () => {
    setStockSearchModalOpen(false);
    focusItemCodeInput();
  };

  const handleSelectStockItem = (product) => {
    if (!product) return;
    setItems(prev => {
      const emptyIdx = prev.findIndex(r => !r.itemCode && !r.description);
      let targetRowId;
      let nextItems;
      if (emptyIdx !== -1) {
        targetRowId = prev[emptyIdx].id;
        nextItems = [...prev];
      } else {
        const nr = makeRow();
        targetRowId = nr.id;
        nextItems = [...prev, nr];
      }

      const pkts = product.packing_qty || 0;
      const baseRate = parseFloat(product.purchase_rate) || 0;
      let flatD = 0;
      let pctD = 0;

      if (supplierName && product.brand) {
        const rule = mfgDiscounts.find(d =>
          d.company_name.toLowerCase() === supplierName.toLowerCase() &&
          d.brand_name.toLowerCase() === product.brand.toLowerCase()
        );
        if (rule) {
          pctD = parseFloat(rule.purchase_discount_pct) || 0;
          flatD = parseFloat(rule.discount_amount) || 0;
        }
      }

      const updated = nextItems.map(r => r.id === targetRowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        brand: product.brand || '',
        packingQty: pkts,
        currentStock: product.stock_packets !== undefined ? product.stock_packets : 0,
        packets: String(pkts),
        preDiscPrice: String(baseRate),
        flatDiscount: flatD,
        discPct: pctD
      } : r);

      setTimeout(() => packetsRefs.current[targetRowId]?.focus(), 50);
      return updated;
    });
    setStockSearchModalOpen(false);
  };

  return (
    <div className="new-purchase-page">
      {/* Page Header */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="title" style={{ color: '#ef4444' }}>
          {isEditing ? `Edit Purchase Return #${returnToEdit.id}` : 'New Purchase Return'}
        </h2>
        <div className="status-msg">
          {statusMsg && (
            <span className={statusMsg.startsWith('Error') ? 'error' : 'success'}>{statusMsg}</span>
          )}
        </div>
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Return Date relocated on top left side of Exit button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Return Date:</label>
            <input
              ref={dateRef}
              type="text"
              value={returnDate}
              onChange={e => handleDateChange(e, setReturnDate, returnDate)}
              onKeyDown={e => handleHeaderKD(e, 'returnDate')}
              placeholder="DD-MM-YYYY"
              className="form-input center-text"
              style={{ padding: '4px 8px', fontSize: '0.85rem', width: 100, height: 28 }}
            />
          </div>
          <button type="button" onClick={() => setStockSearchModalOpen(true)} className="btn btn-secondary sm" style={{ background: '#0284c7', color: 'white', borderColor: '#0284c7', padding: '2px 8px', fontSize: '0.75rem', height: 26, lineHeight: '20px' }}>
            🔍 Search (F8)
          </button>
          <button type="button" onClick={handlePrint} className="btn btn-secondary sm" style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
            🖨️ Print (Ctrl+P)
          </button>
          <button type="button" onClick={handleSavePDF} className="btn btn-secondary sm" style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}>
            📄 Save PDF
          </button>
          <button type="button" onClick={onCancelEdit} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f64e60', color: 'white', borderColor: '#f64e60' }}>
            Exit
          </button>
          <button type="button" onClick={resetForm} className="btn btn-secondary sm" disabled={isSubmitting}>
            Reset
          </button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary sm" disabled={isSubmitting} style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update (Ctrl+S)' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </header>

      <div className="purchase-form" style={{ overflow: 'hidden' }}>

        {/* Card 1: Return Header Details */}
        <section className="form-card" style={{ padding: '12px 16px', background: '#fffdfd', border: '1px solid #fecaca' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Return Inv #</label>
              <input
                ref={invoiceRef}
                type="text"
                value={invoiceNo ? invoiceNo.toString().replace(/^PR-/, '') : ''}
                onChange={e => setInvoiceNo(e.target.value.replace(/^PR-/, ''))}
                onKeyDown={e => handleHeaderKD(e, 'invoice')}
                placeholder="1, 2, 3..."
                className="form-input center-text"
                style={{ padding: '4px 8px', fontSize: '0.85rem', fontWeight: 800, color: '#b91c1c', background: '#fee2e2', borderColor: '#fca5a5' }}
              />
            </div>

            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Supplier Name *</label>
              <select
                ref={supplierRef}
                value={supplierName}
                onChange={e => {
                  const newVal = e.target.value;
                  setSupplierName(newVal);
                  setItems(prev => prev.map(r => {
                    if (!r.itemCode || !r.brand) return r;
                    let pctD = 0, flatD = 0;
                    if (newVal) {
                      const rule = mfgDiscounts.find(d =>
                        d.company_name.toLowerCase() === newVal.toLowerCase() &&
                        d.brand_name.toLowerCase() === r.brand.toLowerCase()
                      );
                      if (rule) {
                        pctD = parseFloat(rule.purchase_discount_pct) || 0;
                        flatD = parseFloat(rule.discount_amount) || 0;
                      }
                    }
                    return { ...r, discPct: pctD, flatDiscount: flatD };
                  }));
                }}
                onKeyDown={e => handleHeaderKD(e, 'supplier')}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <option value="">-- Select Supplier --</option>
                {suppliersList.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ width: 90 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Bilty No</label>
              <input ref={bltRef} type="text" value={bltNumber} onChange={e => setBltNumber(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'blt')} placeholder="BLT #" className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>

            <div className="form-group" style={{ width: 220 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Freight Account Name</label>
              <select
                ref={freightRef}
                value={freightAccountName}
                onChange={e => setFreightAccountName(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'freight')}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: '0.85rem', width: '100%' }}
              >
                <option value="">-- Select Freight Acc --</option>
                {expenseAccounts.map(a => (
                  <option key={a.id} value={a.account_name}>{a.account_name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ width: 75 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>CTN Qty</label>
              <input
                ref={ctnQtyRef}
                type="text"
                inputMode="numeric"
                value={ctnQty}
                onChange={e => setCtnQty(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={e => handleHeaderKD(e, 'ctnQty')}
                placeholder="Ctns"
                className="form-input center-text"
                style={{ padding: '4px 8px', fontSize: '0.85rem', fontWeight: 700, background: '#fff1f2', color: '#991b1b', borderColor: '#fca5a5' }}
              />
            </div>

            <div className="form-group flex-grow" style={{ minWidth: 160 }}>
              <label style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Notes / Remarks</label>
              <input ref={notesRef} type="text" value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'notes')} placeholder="Return remarks..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
          </div>
        </section>

        {/* Card 2: Return Items Table */}
        {(() => {
          const activeItem = items.find(r => r.id === activeRowId) || items.find(r => r.itemCode || r.description) || items[0];
          return (
            <section className="form-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
              <div className="card-header" style={{ padding: '8px 14px', borderBottom: '1px solid #ebedf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ margin: 0, color: '#ef4444' }}>Return Items ({totals.count})</h3>
                
                {/* Available Stock & Purchase Rate Info Boxes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6 }}>
                    <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700 }}>Available Stock:</span>
                    <strong style={{ fontSize: '0.92rem', color: '#065f46', fontWeight: 800 }}>
                      {activeItem?.currentStock !== undefined ? `${activeItem.currentStock} pcs` : '—'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
                    <span style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 700 }}>Purchase Rate:</span>
                    <strong style={{ fontSize: '0.92rem', color: '#075985', fontWeight: 800 }}>
                      {activeItem?.preDiscPrice && parseFloat(activeItem.preDiscPrice) > 0 ? `PKR ${parseFloat(activeItem.preDiscPrice).toLocaleString()}` : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              <div ref={tableContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#fef2f2', zIndex: 10, borderBottom: '1px solid #cbd5e1' }}>
                    <tr style={{ height: 28, fontSize: '0.75rem', color: '#991b1b' }}>
                      <th style={{ width: 24, textAlign: 'center', padding: '0 2px' }}>No.</th>
                      <th style={{ width: 135, padding: '0 4px' }}>Item Code</th>
                      <th style={{ padding: '0 4px', textAlign: 'left' }}>Description</th>
                      <th style={{ width: 50, textAlign: 'center', padding: '0 2px' }}>Qty</th>
                      <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>Pre-Disc</th>
                      <th style={{ width: 50, textAlign: 'right', padding: '0 4px' }}>Disc%</th>
                      <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Flat Disc</th>
                      <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>Net Rate</th>
                      <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Discount</th>
                      <th style={{ width: 80, textAlign: 'right', padding: '0 4px' }}>Amount</th>
                      <th style={{ width: 24, padding: '0' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, idx) => {
                      const math = rowMath[row.id] || { pPrice: 0, rowTotal: 0, netRate: 0, rowDiscTotal: 0 };
                      return (
                        <tr key={row.id} style={{ height: 32, borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#1e1e2d', fontSize: '0.85rem' }}>
                            {(row.description || row.itemCode) ? idx + 1 : ''}
                          </td>

                          <td style={{ position: 'relative', padding: '0 4px' }}>
                            <input
                              ref={el => codeRefs.current[row.id] = el}
                              type="text"
                              value={row.itemCode}
                              onChange={e => handleCodeChange(row.id, e.target.value)}
                              onKeyDown={e => handleCodeKD(e, row.id, idx)}
                              onFocus={() => handleCodeFocus(row.id)}
                              onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                              placeholder="Scan / Code"
                              className="form-input fast-entry"
                              style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                            />

                          </td>

                          <td style={{ padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 }}>
                            <span style={{ fontSize: '0.84rem', color: '#3f4254', whiteSpace: 'nowrap' }}>
                              {row.description || <span style={{ color: '#d1d5db' }}>—</span>}
                            </span>
                          </td>

                          <td style={{ textAlign: 'center', padding: '0 2px' }}>
                            <input
                              ref={el => packetsRefs.current[row.id] = el}
                              type="text"
                              inputMode="numeric"
                              value={row.packets}
                              onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\d]/g, ''))}
                              onKeyDown={e => handlePktsKD(e, row.id, idx)}
                              onFocus={e => { setActiveRowId(row.id); e.target.select(); }}
                              placeholder="0"
                              className="form-input center-text packing-field"
                              style={{ width: 46, margin: '0 auto', display: 'block', height: 24, padding: 2, background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
                            />
                          </td>

                          <td style={{ padding: '0 4px' }}>
                            <input
                              ref={el => rateRefs.current[row.id] = el}
                              type="text"
                              inputMode="decimal"
                              value={row.preDiscPrice}
                              onChange={e => updateRow(row.id, 'preDiscPrice', e.target.value.replace(/[^\d.]/g, ''))}
                              onKeyDown={e => handleRateKD(e, row.id, idx)}
                              onFocus={e => { setActiveRowId(row.id); e.target.select(); }}
                              placeholder="0"
                              className="form-input center-text highlight-rate"
                              style={{ height: 24, padding: 2 }}
                            />
                          </td>

                          <td style={{ padding: '0 4px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.discPct || ''}
                              onChange={e => updateRow(row.id, 'discPct', parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                              onFocus={e => { setActiveRowId(row.id); e.target.select(); }}
                              placeholder="0%"
                              className="form-input center-text"
                              style={{ height: 24, padding: 2 }}
                            />
                          </td>

                          <td style={{ padding: '0 4px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.flatDiscount || ''}
                              onChange={e => updateRow(row.id, 'flatDiscount', parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                              onFocus={e => { setActiveRowId(row.id); e.target.select(); }}
                              placeholder="0"
                              className="form-input center-text"
                              style={{ height: 24, padding: 2 }}
                            />
                          </td>

                          <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: '#4b5563', padding: '0 4px' }}>
                            {math.netRate > 0 ? Math.round(math.netRate).toLocaleString() : '—'}
                          </td>

                          <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 500, color: '#6b7280', padding: '0 4px' }}>
                            {math.rowDiscTotal > 0 ? Math.round(math.rowDiscTotal).toLocaleString() : '—'}
                          </td>

                          <td className="amount-cell" style={{ textAlign: 'right', fontWeight: 700, color: '#991b1b', fontSize: '0.88rem', padding: '0 4px' }}>
                            {math.rowTotal > 0 ? Math.round(math.rowTotal).toLocaleString() : '—'}
                          </td>

                          <td className="action-cell" style={{ padding: '0' }}>
                            {(row.description || row.itemCode) && (
                              <button type="button" onClick={() => removeRow(row.id)} className="btn-remove"
                                disabled={items.length <= 1} tabIndex={-1} title="Remove (Ctrl+D)">✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ position: 'sticky', bottom: 0, background: '#fff5f5', borderTop: '2px solid #fca5a5', zIndex: 10 }}>
                    <tr style={{ height: 30, fontSize: '0.85rem' }}>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 800, color: '#991b1b', padding: '0 6px' }}>Total Pcs:</td>
                      <td style={{ textAlign: 'center', fontWeight: 900, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '0 2px' }}>{totals.pkts}</td>
                      <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, color: '#991b1b', padding: '0 6px' }}>Net Subtotal:</td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#991b1b', padding: '0 4px' }}>
                        {totals.netSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bottom Summary Bar with all fields in ONE SINGLE ROW */}
              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 10, padding: '8px 14px', background: '#fef2f2', borderTop: '1px solid #fecaca', alignItems: 'center', flexShrink: 0, overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: '#fff', borderRadius: 4, border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#991b1b' }}>Gross Amount:</span>
                  <strong style={{ fontSize: '0.88rem', color: '#7f1d1d' }}>{totals.grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: '#fff', borderRadius: 4, border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Total Disc:</span>
                  <strong style={{ fontSize: '0.88rem', color: '#7f1d1d' }}>{(totals.totalItemDisc + totals.flatDisc).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: '#fff', borderRadius: 4, border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#991b1b' }}>Net Subtotal:</span>
                  <strong style={{ fontSize: '0.88rem', color: '#7f1d1d' }}>{totals.netSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>− Disc:</span>
                  <input
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    className="form-input center-text"
                    placeholder="0"
                    style={{ width: 65, height: 26, padding: '2px 4px', fontSize: '0.85rem', borderColor: '#fca5a5' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#059669' }}>+ Misc:</span>
                  <input
                    type="number"
                    value={miscCharges}
                    onChange={e => setMiscCharges(e.target.value)}
                    className="form-input center-text"
                    placeholder="0"
                    style={{ width: 65, height: 26, padding: '2px 4px', fontSize: '0.85rem', borderColor: '#fca5a5' }}
                  />
                </div>

                <div style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 600 }}>=</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#991b1b' }}>Grand Total:</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7f1d1d', background: '#fff', padding: '3px 12px', border: '2px solid #ef4444', borderRadius: 6 }}>
                    PKR {Math.round(totals.grand).toLocaleString()}
                  </span>
                </div>
              </div>

            </section>
          );
        })()}
      </div>

      <SuccessAnimation
        show={showSuccessAnim}
        title={isEditing ? "Return Updated!" : "Return Saved!"}
        subtitle={isEditing ? "Purchase return updated successfully ✓" : "Purchase return transaction posted ✓"}
        onClose={() => {
          setShowSuccessAnim(false);
          setStatusMsg('');
          setIsSubmitting(false);
          onSaveSuccess?.();
        }}
      />
      <StockSearchModal
        isOpen={stockSearchModalOpen}
        onClose={handleCloseStockSearch}
        onSelectItem={handleSelectStockItem}
        title="Purchase Return Stock Search"
      />
    </div>
  );
}

export default PurchaseReturn;
