import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import './NewPurchase.css';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', packets: '', rate: '', amount: 0 };
}

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

const VirtuosoTableComponents = {
  Table: (props) => <table {...props} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
  TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />),
  TableRow: (props) => <tr {...props} style={{ height: 32, fontSize: '0.95rem' }} />
};

function OpenPurchase({ currentUser, purchaseToEdit, onSaveSuccess, onCancelEdit, isActive }) {
  const isEditing = !!purchaseToEdit;

  const todayDMY = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`;
  };

  const [purchaseDate, setPurchaseDate] = useState(todayDMY);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('Opening Stock');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDrop, setActiveDrop] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  
  // Session Import & All Stock
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);
  const [fromSession, setFromSession] = useState('');
  const [toSession, setToSession] = useState('');
  const [importingSession, setImportingSession] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  
  const [showAuth, setShowAuth] = useState(false);
  const [authPass, setAuthPass] = useState('');
  const authInputRef = useRef(null);

  useEffect(() => {
    if (showAuth) setTimeout(() => authInputRef.current?.focus(), 50);
  }, [showAuth]);

  const dateRef = useRef(null);
  const invoiceRef = useRef(null);
  const supplierRef = useRef(null);
  const notesRef = useRef(null);
  const codeRefs = useRef({});
  const packetsRefs = useRef({});
  const rateRefs = useRef({});
  const itemsRef = useRef([]);
  itemsRef.current = items;
  
  const virtuosoRef = useRef(null);

  const focusInput = (idx, refsObj) => {
    const rows = itemsRef.current;
    if (idx >= 0 && idx < rows.length) {
      const targetId = rows[idx].id;
      if (refsObj.current[targetId]) {
        refsObj.current[targetId].focus();
      } else {
        // Element is virtualized (out of view), scroll to it first
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
        // Use a tiny timeout to allow Virtuoso to render the new DOM node
        let attempts = 0;
        const tryFocus = () => {
          if (refsObj.current[targetId]) {
            refsObj.current[targetId].focus();
          } else if (attempts < 5) {
            attempts++;
            setTimeout(tryFocus, 50);
          }
        };
        setTimeout(tryFocus, 50);
      }
    }
  };

  useEffect(() => {
    if (isEditing) {
      const p = purchaseToEdit;
      let raw = '';
      if (p.purchase_date instanceof Date) {
        const d = String(p.purchase_date.getDate()).padStart(2, '0');
        const m = String(p.purchase_date.getMonth() + 1).padStart(2, '0');
        const y = p.purchase_date.getFullYear();
        raw = `${y}-${m}-${d}`;
      } else if (typeof p.purchase_date === 'string') {
        raw = p.purchase_date.split('T')[0];
      }
      if (raw) {
        const [y, m, d] = raw.split('-');
        setPurchaseDate(`${d}-${m}-${y}`);
      }
      setInvoiceNo(p.invoice_no || '');
      setSupplierName(p.supplier_name || 'Opening Stock');
      setNotes(p.notes || '');
      ipcRenderer.invoke('get-purchase-items', p.id).then(rows => {
        const mapped = rows.map(r => ({
          id: nextId(),
          itemCode: r.item_code,
          description: r.item_description,
          packets: String(r.packets),
          rate: String(parseFloat(r.pre_disc_price || r.rate)),
          amount: parseFloat(r.amount),
          isFixed: true
        }));
        
        let focusIdx = 0;
        let lastSavedIdx = -1;
        for (let i = 0; i < mapped.length; i++) {
          if (parseInt(mapped[i].packets || 0) > 0) {
            lastSavedIdx = i;
          }
        }
        if (lastSavedIdx >= 0) {
          focusIdx = -1;
          for (let i = lastSavedIdx + 1; i < mapped.length; i++) {
            if (parseInt(mapped[i].packets || 0) === 0) {
              focusIdx = i;
              break;
            }
          }
        }

        const newRow = makeRow();
        mapped.push(newRow);
        setItems(mapped);
        
        setTimeout(() => {
          if (focusIdx >= 0) {
            virtuosoRef.current?.scrollToIndex({ index: focusIdx, align: 'center' });
            setTimeout(() => packetsRefs.current[mapped[focusIdx].id]?.focus(), 50);
          } else {
            virtuosoRef.current?.scrollToIndex({ index: mapped.length - 1, align: 'center' });
            setTimeout(() => codeRefs.current[newRow.id]?.focus(), 50);
          }
        }, 100);
      });
    } else {
      setTimeout(() => invoiceRef.current?.focus(), 80);
    }
  }, [purchaseToEdit]);

  const handleDateChange = (e) => {
    let val = e.target.value;
    // Allow user to delete back
    if (val.length < purchaseDate.length) {
      setPurchaseDate(val);
      return;
    }

    // Auto-insert hyphen
    val = val.replace(/[^0-9-]/g, '');
    if (val.length === 2 && !val.includes('-')) val += '-';
    if (val.length === 5 && val.split('-').length === 2) val += '-';
    // Limit length to DD-MM-YYYY (10 chars)
    if (val.length <= 10) setPurchaseDate(val);
  };

  const handleHeaderKD = (e, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (field === 'invoice') dateRef.current?.focus();
    else if (field === 'date') supplierRef.current?.focus();
    else if (field === 'supplier') notesRef.current?.focus();
    else if (field === 'notes') {
      const first = itemsRef.current[0];
      if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
    }
  };

  const handleCodeChange = async (rowId, val) => {
    setItems(prev => prev.map(r =>
      r.id === rowId ? { ...r, itemCode: val, description: '', rate: '', amount: 0 } : r
    ));
    if (!val.trim()) { setActiveDrop(null); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setActiveDrop(results?.length > 0 ? { rowId, results } : null);
  };

  const fillRow = (rowId, product) => {
    const baseRate = parseFloat(product.purchase_rate) || 0;
    const pkts = product.packing_qty || 1;

    setItems(prev => prev.map(r =>
      r.id === rowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        packets: String(pkts),
        rate: String(baseRate),
        amount: baseRate * pkts
      } : r
    ));
    setActiveDrop(null);
    setTimeout(() => packetsRefs.current[rowId]?.focus(), 30);
  };

  const updateRow = (rowId, field, val) => {
    setItems(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: val };
      // Recalculate amount when packets or rate changes
      if (field === 'packets' || field === 'rate') {
        const q = parseInt(field === 'packets' ? val : updated.packets) || 0;
        const rt = parseFloat(field === 'rate' ? val : updated.rate) || 0;
        updated.amount = q * rt;
      }
      return updated;
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
      if (drop.length > 0) {
        fillRow(rowId, drop[0]);
      } else {
        packetsRefs.current[rowId]?.focus();
      }
    }
    if (e.key === 'Escape') setActiveDrop(null);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusInput(idx + 1, codeRefs); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusInput(idx - 1, codeRefs); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  const handlePktsKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[idx].isFixed) {
        if (idx < rows.length - 1) focusInput(idx + 1, packetsRefs);
      } else {
        if (idx >= rows.length - 1) addEmptyRow();
        else focusInput(idx + 1, codeRefs);
      }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusInput(idx + 1, packetsRefs); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusInput(idx - 1, packetsRefs); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  const handleRateKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= rows.length - 1) addEmptyRow();
      else focusInput(idx + 1, codeRefs);
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusInput(idx + 1, rateRefs); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusInput(idx - 1, rateRefs); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  const resetForm = () => {
    setPurchaseDate(todayDMY());
    setInvoiceNo('');
    setSupplierName('Opening Stock');
    setNotes('');
    setItems([makeRow()]);
    setStatusMsg('');
    setActiveDrop(null);
    setShowAuth(false);
    setAuthPass('');
    setTimeout(() => invoiceRef.current?.focus(), 50);
  };

  const totals = useMemo(() => {
    let sub = 0;
    let pkts = 0;
    items.forEach(r => {
      const q = parseInt(r.packets || 0);
      const rt = parseFloat(r.rate || 0);
      const rowTotal = q * rt;
      if (r.description && q >= 0) {
        sub += rowTotal;
        pkts += q;
      }
    });
    return {
      netSub: sub,
      pkts,
      grand: sub,
      count: items.filter(r => r.description && parseInt(r.packets || 0) >= 0).length
    };
  }, [items]);

  const handleSubmit = async () => {
    if (!supplierName.trim()) {
      setStatusMsg('Error: Supplier name required');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    const valid = items.filter(r => r.description && parseInt(r.packets || 0) >= 0);
    if (!valid.length) {
      setStatusMsg('Error: Add at least one valid item');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    
    if (!showAuth) {
      setShowAuth(true);
      return;
    }

    setIsSubmitting(true);
    
    const authCheck = await ipcRenderer.invoke('login', { username: currentUser.username, password: authPass });
    if (!authCheck.success) {
      setStatusMsg('Error: Incorrect password');
      setIsSubmitting(false);
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    try {
      // DD-MM-YYYY → YYYY-MM-DD for DB
      let dbDate = purchaseDate;
      if (purchaseDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = purchaseDate.split('-');
        dbDate = `${y}-${m}-${d}`;
      }
      const payload = {
        purchaseDate: dbDate, invoiceNo, supplierName, notes,
        supplierInvNo: '', supplierDate: '', vehicleNo: '', godown: '1-SHOP',
        discount: 0,
        miscCharges: 0,
        purchaseExpenseTotal: 0,
        expenses: [],
        items: valid.map(r => {
          const q = parseInt(r.packets || 0);
          const rt = parseFloat(r.rate || 0);
          const amt = q * rt;
          return {
            itemCode: r.itemCode,
            itemDescription: r.description,
            packingQty: 0,
            packets: q,
            rate: rt,
            amount: amt,
            preDiscPrice: rt,
            flatDiscount: 0,
            discPct: 0,
            discountAmount: 0,
            netRate: rt
          };
        })
      };
      const result = isEditing
        ? await ipcRenderer.invoke('update-purchase', { ...payload, id: purchaseToEdit.id })
        : await ipcRenderer.invoke('save-purchase', payload);
      if (result.success) {
        setStatusMsg(isEditing ? '✓ Opening stock updated!' : '✓ Opening stock saved!');
        setTimeout(() => { setStatusMsg(''); onSaveSuccess?.(); }, 1200);
      } else {
        setStatusMsg(`Error: ${result.error || 'Failed'}`);
      }
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      if (showAuth && !statusMsg.startsWith('Error')) {
         setShowAuth(false);
         setAuthPass('');
      }
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive || showAuth) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSubmit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, purchaseDate, notes, showAuth, isEditing]);

  const loadSessions = async (showAll = showAllSessions) => {
    try {
      const sess = await ipcRenderer.invoke('get-item-sessions', { showAll });
      setRecentSessions(sess || []);
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  const openSessionModal = () => {
    loadSessions();
    setFromSession('');
    setToSession('');
    setShowSessionModal(true);
  };

  const appendProductsToGrid = (products, successMessage) => {
    if (products && products.length > 0) {
      const newRows = products.map(p => ({
        id: nextId(),
        itemCode: p.item_code,
        description: descForProduct(p),
        packets: '0', // requested qty 0
        rate: String(p.purchase_rate || 0),
        amount: 0,
        isFixed: true
      }));
      
      setItems(prev => {
        const cleaned = prev.filter(r => r.itemCode || r.description || r.packets || r.rate);
        return [...cleaned, ...newRows, makeRow()];
      });
      
      setStatusMsg(`✓ ${successMessage}`);
      setTimeout(() => setStatusMsg(''), 3000);

      setTimeout(() => {
        if (newRows.length > 0 && packetsRefs.current[newRows[0].id]) {
          packetsRefs.current[newRows[0].id].focus();
        }
      }, 150);
    } else {
      setStatusMsg(`No items found`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleImportSessionRange = async () => {
    if (!fromSession) return;
    setImportingSession(true);
    try {
      const fromId = parseInt(fromSession);
      const toId = toSession ? parseInt(toSession) : fromId;
      const products = await ipcRenderer.invoke('get-products-by-session-range', { from: fromId, to: toId });
      
      const sessionMsg = fromId === toId ? `Session ${fromId}` : `Sessions ${fromId} to ${toId}`;
      appendProductsToGrid(products, `Imported ${products.length} items from ${sessionMsg}`);
      
      setShowSessionModal(false);
      setFromSession(''); 
      setToSession(''); 
    } catch (err) {
      console.error(err);
      setStatusMsg('Error importing session');
    } finally {
      setImportingSession(false);
    }
  };

  const handleImportAllStock = async () => {
    setImportingSession(true);
    try {
      const products = await ipcRenderer.invoke('get-products');
      products.sort((a, b) => a.id - b.id);
      appendProductsToGrid(products, `Imported all ${products.length} stock items`);
    } catch (err) {
      console.error(err);
      setStatusMsg('Error importing all stock');
    } finally {
      setImportingSession(false);
    }
  };

  const handleImportPDFStock = async () => {
    setImportingSession(true);
    try {
      // Let's invoke a new handler 'select-json-file'
      const filePath = await ipcRenderer.invoke('select-json-file');
      if (filePath) {
        const rawData = await ipcRenderer.invoke('read-file', filePath);
        const parsed = JSON.parse(rawData);
        const products = await ipcRenderer.invoke('get-products');
        
        // Map products by item code
        const pMap = new Map(products.map(p => [p.item_code, p]));
        
        const productsToAdd = [];
        for (const item of parsed) {
           const p = pMap.get(item.itemCode);
           if (p) {
               productsToAdd.push({ ...p, importedQty: item.qty });
           }
        }
        
        if (productsToAdd.length > 0) {
            // Modify appendProductsToGrid to use importedQty if available
            const newRows = productsToAdd.map(p => ({
              id: nextId(),
              itemCode: p.item_code,
              description: descForProduct(p),
              packets: String(p.importedQty || 0),
              rate: String(p.purchase_rate || 0),
              amount: (p.importedQty || 0) * (parseFloat(p.purchase_rate) || 0),
              isFixed: true
            }));
            
            setItems(prev => {
              const last = prev[prev.length - 1];
              const keep = (last && !last.itemCode && !last.description) ? prev.slice(0, -1) : prev;
              return [...keep, ...newRows, makeRow()];
            });
            setStatusMsg(`Imported ${newRows.length} items from PDF data`);
            setTimeout(() => {
                const totalAmt = newRows.reduce((s, r) => s + r.amount, 0);
                // recalculate... handled by useMemo usually
            }, 100);
        } else {
            setStatusMsg('No matching products found in database');
        }
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('Error importing PDF stock');
    } finally {
      setImportingSession(false);
    }
  };

  const handleAddMissingStock = async () => {
    setImportingSession(true);
    try {
      const products = await ipcRenderer.invoke('get-products');
      products.sort((a, b) => a.id - b.id);
      const existingCodes = new Set(itemsRef.current.map(i => i.itemCode));
      const missingProducts = products.filter(p => !existingCodes.has(p.item_code));
      if (missingProducts.length > 0) {
        appendProductsToGrid(missingProducts, `Added ${missingProducts.length} missing stock items`);
      } else {
        setStatusMsg('All stock items are already in the list');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('Error fetching missing stock');
    } finally {
      setImportingSession(false);
    }
  };

  return (
    <div className="new-purchase-page">

      {/* Page Header */}
      <header className="page-header">
        <h2 className="title">{isEditing ? `Edit Opening Stock #${purchaseToEdit.id}` : '📦 Opening Stock Entry'}</h2>
        <div className="status-msg">
          {statusMsg && (
            <span className={statusMsg.startsWith('Error') ? 'error' : 'success'}>{statusMsg}</span>
          )}
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: 8 }}>
          {!isEditing ? (
            <button type="button" onClick={handleImportAllStock} className="btn btn-secondary sm" disabled={isSubmitting || importingSession} style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}>
              📦 Import All Stock
            </button>
          ) : (
            <button type="button" onClick={handleAddMissingStock} className="btn btn-secondary sm" disabled={isSubmitting || importingSession} style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}>
              ➕ Add Missing Stock
            </button>
          )}
          <button type="button" onClick={handleImportPDFStock} className="btn btn-secondary sm" disabled={isSubmitting || importingSession} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
            📄 Import PDF Data
          </button>
          <button type="button" onClick={openSessionModal} className="btn btn-secondary sm" disabled={isSubmitting || isEditing || importingSession} style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}>
            📦 Import Session
          </button>
          <button type="button" onClick={onCancelEdit} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f64e60', color: 'white', borderColor: '#f64e60' }}>
            Exit
          </button>
          <button type="button" onClick={resetForm} className="btn btn-secondary sm" disabled={isSubmitting}>
            Reset
          </button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </header>

      <div className="purchase-form" style={{ overflow: 'hidden' }}>

        {/* Card 1: Purchase Details */}
        <section className="form-card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>Invoice No</label>
              <input ref={invoiceRef} type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'invoice')} placeholder="Inv #" className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>Supplier Date</label>
              <input ref={dateRef} type="text" value={purchaseDate} onChange={handleDateChange} onKeyDown={e => handleHeaderKD(e, 'date')} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Supplier / Source *</label>
              <input ref={supplierRef} type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'supplier')} placeholder="Opening Stock" className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Remarks</label>
              <input ref={notesRef} type="text" value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'notes')} placeholder="Opening stock from old system..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
          </div>
        </section>
        {/* Card 2: Items Table */}
        <section className="form-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Opening Stock Items</h3>
          </div>
          <div className="items-table" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <TableVirtuoso
              ref={virtuosoRef}
              data={items}
              style={{ flex: 1, border: '1px solid #e2e8f0', background: 'white' }}
              components={VirtuosoTableComponents}
              fixedHeaderContent={() => (
                <tr style={{ fontSize: '0.75rem', height: 28, borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 40, textAlign: 'center', padding: '0 2px' }}>No.</th>
                  <th style={{ width: '15%', padding: '0 4px' }}>Alias Name</th>
                  <th style={{ padding: '0 4px' }}>Item Name</th>
                  <th style={{ width: 80, textAlign: 'center', padding: '0 2px' }}>Qty</th>
                  <th style={{ width: 100, textAlign: 'right', padding: '0 4px' }}>Rate</th>
                  <th style={{ width: 120, textAlign: 'right', padding: '0 4px' }}>Amount</th>
                  <th style={{ width: 30, padding: '0' }}></th>
                </tr>
              )}
              itemContent={(idx, row) => {
                const q = parseInt(row.packets) || 0;
                const rt = parseFloat(row.rate) || 0;
                const rowTotal = q * rt;
                const isFocused = focusedRowId === row.id;
                const trBg = isFocused ? '#e0f2fe' : 'transparent';
                
                return (
                  <>
                    <td style={{ textAlign: 'center', padding: '0 2px', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      {(row.description || row.itemCode) ? idx + 1 : ''}
                    </td>

                    {/* Alias Name */}
                    <td style={{ position: 'relative', padding: '0 2px', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      <input
                        ref={el => codeRefs.current[row.id] = el}
                        type="text"
                        value={row.itemCode}
                        onChange={e => handleCodeChange(row.id, e.target.value)}
                        onKeyDown={e => handleCodeKD(e, row.id, idx)}
                        onFocus={() => setFocusedRowId(row.id)}
                        onBlur={() => {
                          setTimeout(() => {
                            setFocusedRowId(prev => prev === row.id ? null : prev);
                          }, 10);
                          setTimeout(() => setActiveDrop(null), 200);
                        }}
                        className="form-input"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, background: row.isFixed ? '#f1f5f9' : '#fff' }}
                        disabled={row.isFixed}
                      />
                    </td>

                    {/* Item Name */}
                    <td style={{ padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      {row.description}
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      <input
                        ref={el => packetsRefs.current[row.id] = el}
                        type="text"
                        inputMode="numeric"
                        value={row.packets}
                        onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\d]/g, ''))}
                        onKeyDown={e => handlePktsKD(e, row.id, idx)}
                        onFocus={e => { e.target.select(); setFocusedRowId(row.id); }}
                        onBlur={() => {
                          setTimeout(() => {
                            setFocusedRowId(prev => prev === row.id ? null : prev);
                          }, 10);
                        }}
                        className="form-input center-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, background: '#fdfdbd' }}
                      />
                    </td>

                    {/* Rate */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      <input
                        ref={el => rateRefs.current[row.id] = el}
                        type="text"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={e => updateRow(row.id, 'rate', e.target.value.replace(/[^\d.]/g, ''))}
                        onKeyDown={e => handleRateKD(e, row.id, idx)}
                        onFocus={e => { e.target.select(); setFocusedRowId(row.id); }}
                        onBlur={() => {
                          setTimeout(() => {
                            setFocusedRowId(prev => prev === row.id ? null : prev);
                          }, 10);
                        }}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, background: row.isFixed ? '#f1f5f9' : '#fff' }}
                        disabled={row.isFixed}
                      />
                    </td>

                    {/* Amount */}
                    <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', background: isFocused ? '#e0f2fe' : '#f3f4f6' }}>
                      {rowTotal > 0 ? rowTotal.toFixed(2) : ''}
                    </td>

                    {/* Delete */}
                    <td style={{ textAlign: 'center', padding: '0', borderBottom: '1px solid #e2e8f0', background: trBg }}>
                      {(row.description || row.itemCode) && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="btn-remove"
                          style={{ width: 20, height: 20, padding: 0, fontSize: '0.7rem' }}
                          disabled={items.length <= 1}
                          tabIndex={-1}
                        >✕</button>
                      )}
                    </td>
                  </>
                );
              }}
            />
            <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20, fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
              <span style={{ color: '#475569' }}>Items: {totals.count}</span>
              <span>Total Qty: {totals.pkts}</span>
            </div>
          </div>

            {/* Bottom Summary Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, padding: '10px 16px', background: '#f1f5f9', borderRadius: 6, alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Items</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.count}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Total Qty</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.pkts}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>=</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>Grand Total:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', background: '#fff', padding: '4px 14px', border: '2px solid #334155', borderRadius: 4 }}>
                  {Math.round(totals.grand).toLocaleString()}
                </span>
              </div>
            </div>
        </section>
      </div>
      {/* Password Confirmation Modal */}
      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Confirm Save</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 12 }}>Please enter your password to save opening stock.</p>
            <input 
              ref={authInputRef}
              type="password" 
              value={authPass} 
              onChange={e => setAuthPass(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') { e.preventDefault(); setShowAuth(false); setAuthPass(''); }
              }}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, marginBottom: 16 }}
              placeholder="Password"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowAuth(false); setAuthPass(''); }} style={{ padding: '6px 12px', background: '#f1f1f1', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '6px 12px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} disabled={isSubmitting}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showSessionModal && (
        <div className="modal-overlay" onClick={() => setShowSessionModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3>Import Items from Session</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 15 }}>
              Select a session below to automatically add all items created during that session to this opening stock.
            </p>
            <div className="form-group" style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>From Session</label>
                <select
                  value={fromSession}
                  onChange={e => setFromSession(e.target.value)}
                  className="form-input"
                >
                  <option value="">-- Choose Session --</option>
                  {recentSessions.map(s => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.session_id} (Started: {new Date(s.started_at).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>To Session (Optional)</label>
                <select
                  value={toSession}
                  onChange={e => setToSession(e.target.value)}
                  className="form-input"
                >
                  <option value="">-- Single Session --</option>
                  {recentSessions.map(s => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.session_id} (Started: {new Date(s.started_at).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" onClick={() => setShowSessionModal(false)} className="btn btn-secondary">Cancel</button>
              <button
                type="button"
                onClick={handleImportSessionRange}
                className="btn btn-primary"
                disabled={!fromSession || importingSession}
              >
                {importingSession ? 'Importing...' : 'Import Items'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default OpenPurchase;
