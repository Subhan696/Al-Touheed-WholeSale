import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import './NewPurchase.css';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', brand: '', packingQty: 0, packets: '', preDiscPrice: '', flatDiscount: 0, discPct: 0 };
}

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

const VirtuosoTableComponents = {
  Table: (props) => <table {...props} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
  TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />),
  TableRow: (props) => <tr {...props} style={{ height: 32, fontSize: '0.95rem' }} />
};

function FastPurchase({ currentUser, isActive }) {
  const todayDMY = () => {
    const parts = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }).split('/');
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const [purchaseDate, setPurchaseDate] = useState(todayDMY);
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [mfgDiscounts, setMfgDiscounts] = useState([]);
  const [autoImported, setAutoImported] = useState(false);

  const dateRef = useRef(null);
  const supplierRef = useRef(null);
  const amountRef = useRef(null);
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
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
        setTimeout(() => {
          refsObj.current[targetId]?.focus();
        }, 50);
      }
    }
  };

  useEffect(() => {
    const loadDropdowns = () => {
      ipcRenderer.invoke('get-manufacturers').then(res => setCompanies(res.map(c => c.name))).catch(() => { });
      ipcRenderer.invoke('get-raw-manufacturer-brands').then(res => setMfgDiscounts(res || [])).catch(() => { });
    };
    loadDropdowns();
    setTimeout(() => supplierRef.current?.focus(), 100);
  }, []);

  const rowMath = useMemo(() => {
    const math = {};
    items.forEach(row => {
      const pPrice = parseFloat(row.preDiscPrice) || 0;
      const qty = parseInt(row.packets) || 0;
      const pctDisc = parseFloat(row.discPct) || 0;
      const flatDisc = parseFloat(row.flatDiscount) || 0;

      const rowTotal = pPrice * qty;
      const discAmount = (rowTotal * pctDisc / 100) + flatDisc;
      const rowDiscTotal = Math.min(discAmount, rowTotal);
      const netTotal = rowTotal - rowDiscTotal;
      const netRate = qty > 0 ? netTotal / qty : 0;

      math[row.id] = { pPrice, rowDiscTotal, rowTotal, netRate };
    });
    return math;
  }, [items]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, row) => {
      const math = rowMath[row.id];
      return sum + (math ? math.rowTotal : 0);
    }, 0);
  }, [items, rowMath]);

  const handleDateChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 8) {
      let formatted = val;
      if (val.length >= 3) formatted = val.slice(0, 2) + '-' + val.slice(2);
      if (val.length >= 5) formatted = formatted.slice(0, 5) + '-' + val.slice(5);
      setPurchaseDate(formatted);
    }
  };

  const handleHeaderKD = (e, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (field === 'supplier') {
      amountRef.current?.focus();
    } else if (field === 'amount') {
      // Import last session on amount enter
      autoImportLastSession();
    } else if (field === 'date') {
      supplierRef.current?.focus();
    }
  };

  const autoImportLastSession = async () => {
    try {
      const sess = await ipcRenderer.invoke('get-item-sessions');
      if (!sess || sess.length === 0) {
        setStatusMsg('No sessions found for today');
        setTimeout(() => setStatusMsg(''), 3000);
        const first = itemsRef.current[0];
        if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
        return;
      }
      const fromId = sess[0].session_id;
      const toId = fromId;
      const sessionMsg = `Session ${fromId}`;

      const products = await ipcRenderer.invoke('get-products-by-session-range', { from: fromId, to: toId });
      if (products && products.length > 0) {
        const newRows = products.map(p => {
          let flatD = 0, pctD = 0;
          if (supplierName && p.brand) {
            const rule = mfgDiscounts.find(d => d.company_name.toLowerCase() === supplierName.toLowerCase() && d.brand_name.toLowerCase() === p.brand.toLowerCase());
            if (rule) {
              pctD = parseFloat(rule.purchase_discount_pct) || 0;
              flatD = parseFloat(rule.discount_amount) || 0;
            }
          }
          return {
            id: nextId(),
            itemCode: p.item_code,
            description: descForProduct(p),
            brand: p.brand || '',
            packingQty: p.packing_qty || 0,
            packets: '0',
            preDiscPrice: String(p.purchase_rate || 0),
            flatDiscount: flatD,
            discPct: pctD,
            locked: true
          };
        });
        setItems(prev => {
          const cleaned = prev.filter(r => r.itemCode || r.description || r.packets || r.preDiscPrice);
          return [...cleaned, ...newRows, makeRow()];
        });
        setAutoImported(true);
        setStatusMsg(`✓ Auto-imported ${products.length} items from ${sessionMsg}`);
        setTimeout(() => setStatusMsg(''), 3000);
        // Focus the first imported row's qty
        setTimeout(() => {
          if (newRows.length > 0) {
            virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start' });
            setTimeout(() => packetsRefs.current[newRows[0].id]?.focus(), 50);
          }
        }, 150);
      } else {
        setStatusMsg(`No items found for ${sessionMsg}`);
        setTimeout(() => setStatusMsg(''), 3000);
        const first = itemsRef.current[0];
        if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('Error auto-importing session');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleCodeChange = async (rowId, val) => {
    setItems(prev => prev.map(r =>
      r.id === rowId ? { ...r, itemCode: val, description: '', packingQty: 0, preDiscPrice: '', flatDiscount: 0, discPct: 0 } : r
    ));
    if (!val.trim()) { return; }
    const results = await ipcRenderer.invoke('search-products', val);
    if (results && results.length > 0) {
      const product = results[0];
      fillRow(rowId, product);
    }
  };

  const fillRow = (rowId, product) => {
    const pkts = product.packing_qty || 0;
    let baseRate = parseFloat(product.purchase_rate) || 0;
    let flatD = 0;
    let pctD = 0;

    if (supplierName && product.brand) {
      const rule = mfgDiscounts.find(d => d.company_name.toLowerCase() === supplierName.toLowerCase() && d.brand_name.toLowerCase() === product.brand.toLowerCase());
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
        packets: String(pkts),
        preDiscPrice: String(baseRate),
        flatDiscount: flatD,
        discPct: pctD
      } : r
    ));
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
      (!cur.preDiscPrice || cur.preDiscPrice === '0');
    if (isEmpty && idx > 0) {
      removeRow(rows[idx - 1].id);
    } else {
      removeRow(cur.id);
    }
  };

  const addEmptyRow = () => {
    setItems(prev => [...prev, makeRow()]);
    setTimeout(() => {
      const newId = itemsRef.current[itemsRef.current.length - 1].id;
      codeRefs.current[newId]?.focus();
    }, 50);
  };

  const handleCodeKD = (e, rowId, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = itemsRef.current.find(r => r.id === rowId);
      if (row && row.locked) {
        packetsRefs.current[rowId]?.focus();
      } else {
        packetsRefs.current[rowId]?.focus();
      }
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      addEmptyRow();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      ctrlD(e, idx);
    }
  };

  const handlePktsKD = (e, rowId, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      rateRefs.current[rowId]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusInput(idx - 1, codeRefs);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusInput(idx + 1, codeRefs);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      ctrlD(e, idx);
    }
  };

  const handleRateKD = (e, rowId, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEmptyRow();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      packetsRefs.current[rowId]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusInput(idx + 1, packetsRefs);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      ctrlD(e, idx);
    }
  };

  const executeSaveAndPrint = async () => {
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
      const payload = {
        purchaseDate,
        invoiceNo: 'FAST-' + Date.now(),
        supplierName,
        items: valid.map(r => {
          const math = rowMath[r.id];
          return {
            itemCode: r.itemCode,
            itemDescription: r.description,
            packingQty: r.packingQty,
            packets: parseInt(r.packets),
            rate: math.rowTotal / parseInt(r.packets),
            amount: math.rowTotal,
            preDiscPrice: parseFloat(r.preDiscPrice) || 0,
            flatDiscount: r.flatDiscount,
            discPct: r.discPct,
            discountAmount: math.rowDiscTotal,
            netRate: math.netRate
          };
        }),
        discount: 0,
        miscCharges: 0,
        purchaseExpenseTotal: 0,
        expenses: [],
        notes: 'Fast Purchase',
        supplierInvNo: '',
        supplierDate: purchaseDate,
        vehicleNo: '',
        godown: '1-SHOP',
        bltNumber: ''
      };

      const result = await ipcRenderer.invoke('save-purchase', payload);
      if (result.success) {
        setStatusMsg('✓ Purchase saved! Printing barcodes...');

        // Load barcode data and print
        const purchaseItems = await ipcRenderer.invoke('get-purchase-barcode-data', result.id);
        const barcodeItems = purchaseItems.map(item => {
          let packing = parseInt(item.packing_qty) || 1;
          if (packing < 1) packing = 1;
          let qtyPieces = parseInt(item.quantity) || 0;
          let labelsCount = Math.ceil(qtyPieces / packing);
          if (labelsCount === 0) labelsCount = 1;

          let brand = (item.brand || '').trim();
          let desc = (item.description || '').trim();
          let cat = (item.category || '').trim();
          let size = (item.size_range || '').trim();
          let gender = (item.gender || '').trim();

          let nameParts = [];
          if (brand && !desc.toUpperCase().startsWith(brand.toUpperCase())) {
            nameParts.push(brand);
          }
          nameParts.push(desc);
          nameParts.push(cat);
          nameParts.push(size);
          nameParts.push(gender);

          let itemName = nameParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unknown';

          return {
            ...item,
            item_name: itemName,
            sale_rate: Math.round(parseFloat(item.sale_rate) || 0),
            quantity: labelsCount,
            packing: packing
          };
        });

        // Store barcode items for printing
        sessionStorage.setItem('fastPurchaseBarcodeItems', JSON.stringify(barcodeItems));

        // Navigate to barcode print with pre-loaded items
        window.location.hash = '#barcode-print';

        setTimeout(() => {
          setStatusMsg('');
          // Reset form
          setItems([makeRow()]);
          setSupplierName('');
          setAmount('');
          setAutoImported(false);
          setTimeout(() => supplierRef.current?.focus(), 100);
        }, 1500);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        executeSaveAndPrint();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, purchaseDate, amount]);

  const totals = useMemo(() => {
    let count = 0, pkts = 0, grossSub = 0, totalItemDisc = 0, flatDisc = 0, netSub = 0;
    items.forEach(r => {
      if (r.description && parseInt(r.packets) > 0) {
        count++;
        pkts += parseInt(r.packets) || 0;
        const math = rowMath[r.id];
        grossSub += math.rowTotal;
        totalItemDisc += math.rowDiscTotal;
        flatDisc += parseFloat(r.flatDiscount) || 0;
      }
    });
    netSub = grossSub - totalItemDisc;
    const grand = netSub; // No discount/misc charges in fast purchase
    return { count, pkts, grossSub, totalItemDisc, flatDisc, netSub, grand };
  }, [items, rowMath]);

  return (
    <div className="new-purchase-page">

      {/* Page Header */}
      <header className="page-header">
        <h2 className="title">Fast Purchase Entry</h2>
        <div className="status-msg">
          {statusMsg && (
            <span className={statusMsg.startsWith('Error') ? 'error' : 'success'}>{statusMsg}</span>
          )}
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => {
            setItems([makeRow()]);
            setSupplierName('');
            setAmount('');
            setAutoImported(false);
            setTimeout(() => supplierRef.current?.focus(), 100);
          }} className="btn btn-secondary sm" disabled={isSubmitting}>
            Reset
          </button>
          <button type="button" onClick={executeSaveAndPrint} className="btn btn-primary sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save & Print (Ctrl+P)'}
          </button>
        </div>
      </header>

      <div className="purchase-form" style={{ overflow: 'hidden' }}>

        {/* Card 1: Purchase Details */}
        <section className="form-card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>Date</label>
              <input ref={dateRef} type="text" value={purchaseDate} onChange={handleDateChange} onKeyDown={e => handleHeaderKD(e, 'date')} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Supplier Name *</label>
              <select ref={supplierRef} value={supplierName} onChange={e => {
                const newVal = e.target.value;
                setSupplierName(newVal);

                // Recalculate discounts for existing rows
                setItems(prev => {
                  let changed = false;
                  const next = prev.map(r => {
                    if (!r.itemCode || !r.brand) return r;
                    let pctD = 0;
                    let flatD = 0;
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
                    if (r.discPct !== pctD || r.flatDiscount !== flatD) {
                      changed = true;
                      return { ...r, discPct: pctD, flatDiscount: flatD };
                    }
                    return r;
                  });
                  return changed ? next : prev;
                });
              }} onKeyDown={e => handleHeaderKD(e, 'supplier')} className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
                <option value="">-- Select Supplier --</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ width: 120 }}>
              <label style={{ fontSize: '0.75rem' }}>Amount</label>
              <input 
                ref={amountRef}
                type="text" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                onKeyDown={e => handleHeaderKD(e, 'amount')} 
                placeholder="Amount" 
                className="form-input right-text" 
                style={{ padding: '4px 8px', fontSize: '0.85rem' }} 
              />
            </div>
          </div>
        </section>

        {/* Card 2: Items Table */}
        <section className="form-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Purchase Items</h3>
          </div>
          <div className="items-table" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <TableVirtuoso
              ref={virtuosoRef}
              data={items}
              style={{ flex: 1, border: '1px solid #e2e8f0', background: 'white' }}
              components={VirtuosoTableComponents}
              fixedHeaderContent={() => (
                <tr style={{ fontSize: '0.75rem', height: 28, borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 24, textAlign: 'center', padding: '0 2px' }}>No.</th>
                  <th style={{ width: '10%', padding: '0 4px' }}>Alias Name</th>
                  <th style={{ padding: '0 4px' }}>Item Name</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '0 2px' }}>Qty</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>P.Price</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Flat Disc</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>P.Net</th>
                  <th style={{ width: 50, textAlign: 'right', padding: '0 4px' }}>Disc%</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Discount</th>
                  <th style={{ width: 80, textAlign: 'right', padding: '0 4px' }}>Total</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>Net Rate</th>
                  <th style={{ width: 24, padding: '0' }}></th>
                </tr>
              )}
              itemContent={(idx, row) => {
                const math = rowMath[row.id] || { pPrice: 0, rowDiscTotal: 0, rowTotal: 0, netRate: 0 };
                return (
                  <>
                    <td style={{ textAlign: 'center', padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      {(row.description || row.itemCode) ? idx + 1 : ''}
                    </td>

                    {/* Alias Name */}
                    <td style={{ position: 'relative', padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        ref={el => codeRefs.current[row.id] = el}
                        type="text"
                        value={row.itemCode}
                        onChange={e => { if (!row.locked) handleCodeChange(row.id, e.target.value); }}
                        onKeyDown={e => {
                          if (row.locked && e.key === 'Enter') { e.preventDefault(); packetsRefs.current[row.id]?.focus(); return; }
                          handleCodeKD(e, row.id, idx);
                        }}
                        readOnly={!!row.locked}
                        className="form-input"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, ...(row.locked ? { background: '#f1f5f9', color: '#64748b', cursor: 'default' } : {}) }}
                      />
                    </td>

                    {/* Item Name */}
                    <td style={{ padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid #e2e8f0' }}>
                      {row.description}
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        ref={el => packetsRefs.current[row.id] = el}
                        type="text"
                        inputMode="numeric"
                        value={row.packets}
                        onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\d]/g, ''))}
                        onKeyDown={e => handlePktsKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        className="form-input center-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, background: '#fdfdbd' }}
                      />
                    </td>

                    {/* Pre-Disc Price */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        ref={el => rateRefs.current[row.id] = el}
                        type="text"
                        inputMode="decimal"
                        value={row.preDiscPrice}
                        onChange={e => updateRow(row.id, 'preDiscPrice', e.target.value.replace(/[^\d.]/g, ''))}
                        onKeyDown={e => handleRateKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2 }}
                      />
                    </td>

                    {/* Flat Discount */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.flatDiscount}
                        onChange={e => updateRow(row.id, 'flatDiscount', e.target.value.replace(/[^\d.]/g, ''))}
                        onFocus={e => e.target.select()}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, width: '100%' }}
                        tabIndex={-1}
                      />
                    </td>

                    {/* P. Price */}
                    <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
                      {math.pPrice > 0 ? math.pPrice.toFixed(2) : '0.00'}
                    </td>

                    {/* Disc% */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.discPct}
                        onChange={e => updateRow(row.id, 'discPct', e.target.value.replace(/[^\d.]/g, ''))}
                        onFocus={e => e.target.select()}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, width: '100%' }}
                        tabIndex={-1}
                      />
                    </td>

                    {/* Discount Amount */}
                    <td style={{ textAlign: 'right', padding: '0 4px', borderBottom: '1px solid #e2e8f0' }}>
                      {math.rowDiscTotal > 0 ? math.rowDiscTotal.toFixed(2) : ''}
                    </td>

                    {/* Total (Exc. Tax) */}
                    <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 700, background: '#f3f4f6', borderBottom: '1px solid #e2e8f0' }}>
                      {math.rowTotal > 0 ? math.rowTotal.toFixed(2) : ''}
                    </td>

                    {/* Net Rate */}
                    <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 700, color: '#b91c1c', borderBottom: '1px solid #e2e8f0' }}>
                      {math.netRate > 0 ? math.netRate.toFixed(2) : ''}
                    </td>

                    {/* Delete */}
                    <td style={{ textAlign: 'center', padding: '0', borderBottom: '1px solid #e2e8f0' }}>
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
              <span style={{ marginLeft: 60, paddingRight: 40, background: '#e2e8f0', padding: '2px 8px', borderRadius: 4 }}>
                Subtotal: {totals.netSub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Bottom Summary Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, padding: '10px 16px', background: '#f1f5f9', borderRadius: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Gross Amount</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>Total Disc.</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{(totals.totalItemDisc + totals.flatDisc).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Net Subtotal</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.netSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
    </div>
  );
}

export default FastPurchase;