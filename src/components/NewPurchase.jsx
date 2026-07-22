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

function NewPurchase({ currentUser, purchaseToEdit, onSaveSuccess, onCancelEdit, isActive }) {
  const isEditing = !!purchaseToEdit;

  const todayDMY = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`;
  };

  const [purchaseDate, setPurchaseDate] = useState(todayDMY);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [supplierDate, setSupplierDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [godown, setGodown] = useState('1-SHOP');
  const [notes, setNotes] = useState('');
  const [bltNumber, setBltNumber] = useState('');
  const [discount, setDiscount] = useState('');
  const [miscCharges, setMiscCharges] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [purchaseExpenseTotal, setPurchaseExpenseTotal] = useState('');
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [isAdjOpen, setIsAdjOpen] = useState(false);
  const [activeDrop, setActiveDrop] = useState(null);
  
  // Auto Mode
  const [autoMode, setAutoMode] = useState(true);
  const [autoImported, setAutoImported] = useState(false);

  // Session Import
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);
  const [fromSession, setFromSession] = useState('');
  const [toSession, setToSession] = useState('');
  const [importingSession, setImportingSession] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [mfgDiscounts, setMfgDiscounts] = useState([]);

  const [showAuth, setShowAuth] = useState(false);
  const [authPass, setAuthPass] = useState('');
  const authInputRef = useRef(null);

  useEffect(() => {
    if (showAuth) setTimeout(() => authInputRef.current?.focus(), 50);
  }, [showAuth]);

  const dateRef = useRef(null);
  const invoiceRef = useRef(null);
  const supplierRef = useRef(null);
  const bltRef = useRef(null);
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
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
        setTimeout(() => {
          refsObj.current[targetId]?.focus();
        }, 50);
      }
    }
  };

  useEffect(() => {
    if (isEditing) {
      const p = purchaseToEdit;
      const raw = p.purchase_date instanceof Date ? p.purchase_date.toISOString().split('T')[0] : (typeof p.purchase_date === 'string' ? p.purchase_date.split('T')[0] : '');
      if (raw) {
        const [y, m, d] = raw.split('-');
        setPurchaseDate(`${d}-${m}-${y}`);
      }
      setInvoiceNo(p.invoice_no || '');
      setSupplierName(p.supplier_name || '');
      setSupplierInvNo(p.supplier_inv_no || '');
      setSupplierDate(p.supplier_date || '');
      setVehicleNo(p.vehicle_no || '');
      setGodown(p.godown || '1-SHOP');
      setBltNumber(p.blt_number || '');
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
          preDiscPrice: String(parseFloat(r.pre_disc_price || r.rate)),
          flatDiscount: parseFloat(r.flat_discount || 0),
          discPct: parseFloat(r.disc_pct || 0)
        }));
        const newRow = makeRow();
        mapped.push(newRow);
        setItems(mapped);
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index: mapped.length - 1, align: 'center' });
          setTimeout(() => codeRefs.current[newRow.id]?.focus(), 50);
        }, 100);
      });
      ipcRenderer.invoke('get-purchase-expenses', p.id).then(rows => {
        ipcRenderer.invoke('get-expense-accounts').then(accounts => {
          const mapped = accounts.map(a => {
            const existing = rows.find(r => r.expense_account_id === a.id);
            if (existing) {
              return { ...a, expense_account_id: a.id, cartons: existing.cartons || '', amount: existing.amount || '' };
            }
            return { ...a, expense_account_id: a.id, cartons: '', amount: '' };
          });
          setPurchaseExpenses(mapped);
          const total = mapped.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
          setPurchaseExpenseTotal(total > 0 ? String(total) : '');
        });
      }).catch(() => {});
    } else {
      setTimeout(() => invoiceRef.current?.focus(), 80);
    }
  }, [purchaseToEdit]);

  useEffect(() => {
    const loadDropdowns = () => {
      ipcRenderer.invoke('get-manufacturers').then(res => setCompanies(res.map(c => c.name))).catch(() => { });
      ipcRenderer.invoke('get-raw-manufacturer-brands').then(res => setMfgDiscounts(res || [])).catch(() => { });
      ipcRenderer.invoke('get-expense-accounts').then(res => {
        setExpenseAccounts(res || []);
        if (!isEditing) {
          setPurchaseExpenses(prev => {
            const existingIds = new Set(prev.map(p => p.expense_account_id));
            const newAccs = (res || []).filter(a => !existingIds.has(a.id));
            if (newAccs.length === 0 && prev.length > 0) return prev;
            return [...prev, ...newAccs.map(a => ({ ...a, expense_account_id: a.id, cartons: '', amount: '' }))];
          });
        }
      }).catch(() => {});
    };

    loadDropdowns();
    window.addEventListener('focus', loadDropdowns);
    return () => window.removeEventListener('focus', loadDropdowns);
  }, [isEditing]);

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
    else if (field === 'supplier') bltRef.current?.focus();
    else if (field === 'blt') notesRef.current?.focus();
    else if (field === 'notes') {
      if (autoMode && !autoImported && !isEditing) {
        // Auto Mode: import last session automatically
        autoImportLastSession();
      } else {
        const first = itemsRef.current[0];
        if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
      }
    }
  };

  const autoImportLastSession = async () => {
    try {
      let fromId, toId, sessionMsg;
      
      if (fromSession) {
        // User already selected a session range via the Import Session modal
        fromId = parseInt(fromSession);
        toId = toSession ? parseInt(toSession) : fromId;
        sessionMsg = fromId === toId ? `Session ${fromId}` : `Sessions ${fromId} to ${toId}`;
      } else {
        // Default: fetch and use the last session
        const sess = await ipcRenderer.invoke('get-item-sessions');
        if (!sess || sess.length === 0) {
          setStatusMsg('No sessions found for today');
          setTimeout(() => setStatusMsg(''), 3000);
          const first = itemsRef.current[0];
          if (first) setTimeout(() => codeRefs.current[first.id]?.focus(), 30);
          return;
        }
        fromId = sess[0].session_id;
        toId = fromId;
        sessionMsg = `Session ${fromId}`;
      }

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
        setStatusMsg(`\u2713 Auto-imported ${products.length} items from ${sessionMsg}`);
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
    if (!val.trim()) { setActiveDrop(null); return; }
    const results = await ipcRenderer.invoke('search-products', val);
    setActiveDrop(results?.length > 0 ? { rowId, results } : null);
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
      const row = rows[idx];
      // Empty code field = done adding items -> open freight
      if (!row.itemCode && !row.description) {
        setShowExpensesModal(true);
        return;
      }
      const drop = activeDrop?.rowId === rowId ? activeDrop.results : [];
      if (drop.length > 0) fillRow(rowId, drop[0]);
      else packetsRefs.current[rowId]?.focus();
    }
    if (e.key === 'Escape') setActiveDrop(null);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusInput(idx + 1, codeRefs); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusInput(idx - 1, codeRefs); }
    if (e.key === 'Tab' && e.shiftKey) {
      if (idx > 0) {
        e.preventDefault();
        const prevRowId = rows[idx - 1].id;
        packetsRefs.current[prevRowId]?.focus();
        packetsRefs.current[prevRowId]?.select();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') ctrlD(e, idx);
  };

  // Enter in Packing → next row (skip locked codes in auto mode)
  const handlePktsKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= rows.length - 1) {
        addEmptyRow();
      } else {
        // Skip to next row's qty if next row is locked, otherwise next code
        if (autoMode && autoImported && rows[idx + 1]?.locked) {
          focusInput(idx + 1, packetsRefs);
        } else {
          focusInput(idx + 1, codeRefs);
        }
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
    setSupplierName('');
    setSupplierInvNo('');
    setBltNumber('');
    setSupplierDate('');
    setVehicleNo('');
    setGodown('1-SHOP');
    setNotes('');
    setDiscount('');
    setMiscCharges('');
    setPurchaseExpenseTotal('');
    setPurchaseExpenses(expenseAccounts.map(a => ({ ...a, cartons: '', amount: '' })));
    setItems([makeRow()]);
    setStatusMsg('');
    setActiveDrop(null);
    setShowAuth(false);
    setAuthPass('');
    setAutoImported(false);
    setTimeout(() => invoiceRef.current?.focus(), 50);
  };

  const { totals, rowMath } = useMemo(() => {
    const mathMap = {};
    let sub = 0;
    let pkts = 0;
    const misc = parseFloat(miscCharges) || 0;
    const expTotal = parseFloat(purchaseExpenseTotal) || 0;
    const disc = parseFloat(discount) || 0;

    let grossSub = 0;
    let totalItemDisc = 0;

    items.forEach(r => {
      const q = parseInt(r.packets) || 0;
      const base = parseFloat(r.preDiscPrice) || 0;
      const flat = parseFloat(r.flatDiscount) || 0;
      const pPrice = Math.max(0, base - flat);
      const dPct = parseFloat(r.discPct) || 0;
      const rDisc = pPrice * (dPct / 100);
      const rowTotal = (pPrice - rDisc) * q;
      const rowGross = base * q;

      mathMap[r.id] = { pPrice, rowDiscTotal: rDisc * q, rowTotal, netRate: 0 };
      if (r.description && q > 0) {
        sub += rowTotal;
        grossSub += rowGross;
        pkts += q;
        totalItemDisc += (flat + rDisc) * q;
      }
    });

    const netAdjustment = misc + expTotal - disc;

    items.forEach(r => {
      const math = mathMap[r.id];
      if (r.description && parseInt(r.packets) > 0 && sub > 0) {
        const ratio = math.rowTotal / sub;
        const assignedAdjustment = netAdjustment * ratio;
        math.netRate = (math.rowTotal + assignedAdjustment) / parseInt(r.packets);
      } else if (parseInt(r.packets) > 0) {
        math.netRate = math.rowTotal / parseInt(r.packets);
      }
    });

    return {
      totals: { 
        grossSub,
        netSub: sub,
        pkts, 
        misc, 
        expTotal,
        totalItemDisc,
        flatDisc: disc,
        grand: sub + misc + expTotal - disc, 
        count: items.filter(r => r.description && parseInt(r.packets) > 0).length 
      },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount, purchaseExpenseTotal]);

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
        supplierInvNo, supplierDate, vehicleNo, godown, bltNumber,
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        purchaseExpenseTotal: parseFloat(purchaseExpenseTotal) || 0,
        expenses: purchaseExpenses.map(e => ({
          expense_account_id: e.expense_account_id,
          account_name: e.account_name,
          cartons: parseInt(e.cartons) || 0,
          rate: parseFloat(e.default_rate) || 0,
          amount: parseFloat(e.amount) || 0
        })).filter(e => e.amount > 0),
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
        })
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSubmit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, purchaseDate, discount, miscCharges, notes, isEditing]);

  const loadSessions = async () => {
    try {
      const sess = await ipcRenderer.invoke('get-item-sessions');
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

  const handleImportSessionRange = async () => {
    if (!fromSession) return;
    setImportingSession(true);
    try {
      const fromId = parseInt(fromSession);
      const toId = toSession ? parseInt(toSession) : fromId;
      const products = await ipcRenderer.invoke('get-products-by-session-range', { from: fromId, to: toId });
      
      if (products && products.length > 0) {
        const existingCodes = new Set(itemsRef.current.map(i => i.itemCode).filter(Boolean));
        const newProducts = products.filter(p => !existingCodes.has(p.item_code));

        if (newProducts.length === 0) {
          setStatusMsg(`All items from selected session(s) are already added.`);
          setTimeout(() => setStatusMsg(''), 3000);
          setShowSessionModal(false);
          setFromSession(''); 
          setToSession('');
          setImportingSession(false);
          return;
        }

        const newRows = newProducts.map(p => {
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
            locked: autoMode
          };
        });
        
        setItems(prev => {
          const cleaned = prev.filter(r => r.itemCode || r.description || r.packets || r.preDiscPrice);
          return [...cleaned, ...newRows, makeRow()];
        });
        if (autoMode) setAutoImported(true);
        
        const sessionMsg = fromId === toId ? `Session ${fromId}` : `Sessions ${fromId} to ${toId}`;
        setStatusMsg(`✓ Imported ${newProducts.length} new items from ${sessionMsg}`);
        setTimeout(() => setStatusMsg(''), 3000);

        // Focus the first newly imported item's quantity input
        setTimeout(() => {
          if (newRows.length > 0 && packetsRefs.current[newRows[0].id]) {
            packetsRefs.current[newRows[0].id].focus();
          }
        }, 150);
        
      } else {
        const sessionMsg = fromId === toId ? `Session ${fromId}` : `Sessions ${fromId} to ${toId}`;
        setStatusMsg(`No items found for ${sessionMsg}`);
        setTimeout(() => setStatusMsg(''), 3000);
      }
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
        <div className="header-actions" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setAutoMode(m => !m)}
            className="btn btn-secondary sm"
            disabled={isEditing}
            style={{ background: autoMode ? '#22c55e' : '#94a3b8', color: 'white', borderColor: autoMode ? '#22c55e' : '#94a3b8', minWidth: 70 }}
          >
            ⚡ {autoMode ? 'Auto ON' : 'Auto OFF'}
          </button>
          <button type="button" onClick={openSessionModal} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}>
            📦 Import Session
          </button>
          <button type="button" onClick={onCancelEdit} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f64e60', color: 'white', borderColor: '#f64e60' }}>
            Exit
          </button>
          <button type="button" onClick={resetForm} className="btn btn-secondary sm" disabled={isSubmitting}>
            Reset
          </button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update (Ctrl+S)' : 'Save (Ctrl+S)'}
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
              <label style={{ fontSize: '0.75rem' }}>BLT Number</label>
              <input ref={bltRef} type="text" value={bltNumber} onChange={e => setBltNumber(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'blt')} placeholder="BLT #" className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Remarks</label>
              <input ref={notesRef} type="text" value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'notes')} placeholder="Remarks..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
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
                        onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                        readOnly={!!row.locked}
                        className="form-input"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, ...(row.locked ? { background: '#f1f5f9', color: '#64748b', cursor: 'default' } : {}) }}
                      />
                      {activeDrop?.rowId === row.id && activeDrop.results.length > 0 && (
                        <div className="np-dropdown">
                          {activeDrop.results.slice(0, 8).map(p => (
                            <div key={p.id} className="np-suggestion"
                              onMouseDown={e => { e.preventDefault(); fillRow(row.id, p); }}>
                              <strong style={{ fontFamily: 'monospace', color: '#3699ff', minWidth: 90, flexShrink: 0 }}>{p.item_code}</strong>
                              <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                              <span style={{ color: '#5e6278', fontWeight: 700, minWidth: 64, textAlign: 'right', flexShrink: 0 }}>
                                {parseFloat(p.purchase_rate || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Subtotal</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.netSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>− Disc:</span>
                <input
                  type="number"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 70, height: 28, padding: '2px 6px', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>+ Misc:</span>
                <input
                  type="number"
                  value={miscCharges}
                  onChange={e => setMiscCharges(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 70, height: 28, padding: '2px 6px', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>+ Freight:</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', background: '#e2e8f0', padding: '2px 8px', borderRadius: 3, minWidth: 50, textAlign: 'right', display: 'inline-block' }}>
                  {purchaseExpenseTotal ? parseFloat(purchaseExpenseTotal).toLocaleString() : '0'}
                </span>
                <button type="button" onClick={() => setShowExpensesModal(true)} style={{ padding: '2px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', height: 24 }}>
                  Edit
                </button>
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
      {/* Purchase Expenses Modal */}
      {showExpensesModal && (() => {
        const expModalSelectRef = React.createRef();
        const expModalCartonsRef = React.createRef();
        
        const handleAddExpense = () => {
          const selectEl = document.getElementById('exp-modal-select');
          const cartonsEl = document.getElementById('exp-modal-cartons');
          const accId = parseInt(selectEl?.value);
          const cartons = parseInt(cartonsEl?.value);
          if (!accId || !cartons) return;
          
          const account = expenseAccounts.find(a => a.id === accId);
          if (!account) return;
          
          const amount = (cartons * parseFloat(account.default_rate)).toFixed(2);
          
          // Check if this account already exists, if so update it
          const existing = purchaseExpenses.findIndex(e => e.expense_account_id === accId);
          if (existing >= 0) {
            const updated = [...purchaseExpenses];
            updated[existing] = { ...updated[existing], cartons: String(cartons), amount };
            setPurchaseExpenses(updated);
          } else {
            setPurchaseExpenses(prev => [...prev, {
              expense_account_id: accId,
              account_name: account.account_name,
              default_rate: account.default_rate,
              cartons: String(cartons),
              amount
            }]);
          }
          
          // Reset inputs and focus Done button
          if (cartonsEl) cartonsEl.value = '';
          setTimeout(() => document.getElementById('exp-modal-done')?.focus(), 50);
        };
        
        const handleRemoveExpense = (accId) => {
          setPurchaseExpenses(prev => prev.filter(e => e.expense_account_id !== accId));
        };
        
        const modalTotal = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, width: 520, padding: 0, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ background: '#1e293b', padding: '14px 20px', color: 'white' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Purchase Expenses</h3>
            </div>

            {/* Add Expense Row */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>Freight Account</label>
                <select
                  id="exp-modal-select"
                  autoFocus
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.95rem', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('exp-modal-cartons')?.focus();
                    }
                  }}
                >
                  <option value="">-- Select --</option>
                  {expenseAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_name} (Rate: {parseFloat(a.default_rate).toLocaleString()})</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>Cartons</label>
                <input
                  id="exp-modal-cartons"
                  type="number"
                  placeholder="Qty"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.95rem', borderRadius: 4, border: '1px solid #cbd5e1', textAlign: 'center' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExpense();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddExpense}
                style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', height: 32 }}
              >
                Add
              </button>
            </div>

            {/* Added Expenses List */}
            <div style={{ padding: '0 20px', maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px 4px', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Account</th>
                    <th style={{ textAlign: 'center', padding: '10px 4px', width: 70, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Ctns</th>
                    <th style={{ textAlign: 'right', padding: '10px 4px', width: 80, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '10px 4px', width: 100, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                    <th style={{ width: 36, padding: '10px 0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseExpenses.filter(e => parseFloat(e.amount) > 0).map(exp => (
                    <tr key={exp.expense_account_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 4px', fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>{exp.account_name}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', color: '#475569' }}>{exp.cartons}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', color: '#64748b' }}>{parseFloat(exp.default_rate).toLocaleString()}</td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 0', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpense(exp.expense_account_id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, padding: 0, lineHeight: 1 }}
                          title="Remove"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                  {purchaseExpenses.filter(e => parseFloat(e.amount) > 0).length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                        No expenses added yet. Select a freight account and enter cartons above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Total: <span style={{ color: '#059669' }}>{modalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowExpensesModal(false)}
                  style={{ padding: '8px 18px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="exp-modal-done"
                  onClick={() => {
                    setPurchaseExpenseTotal(String(modalTotal));
                    setShowExpensesModal(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setPurchaseExpenseTotal(String(modalTotal));
                      setShowExpensesModal(false);
                    }
                  }}
                  style={{ padding: '8px 18px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
      {showSessionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSessionModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: 480, padding: 0, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>📦 Import Session Items</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>Pull items from a stock entry session into this purchase</p>
              </div>
              <button onClick={() => setShowSessionModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              
              {/* Session picker */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Session *</label>
                  <input
                    type="number"
                    list="recent-sessions-list"
                    autoFocus
                    placeholder="e.g. 1"
                    value={fromSession}
                    onChange={e => setFromSession(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && fromSession) { e.preventDefault(); handleImportSessionRange(); }
                    }}
                    className="session-select"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>To (Range)</label>
                  <input
                    type="number"
                    list="recent-sessions-list"
                    placeholder="Same as above"
                    value={toSession}
                    onChange={e => setToSession(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && fromSession) { e.preventDefault(); handleImportSessionRange(); }
                    }}
                    className="session-select"
                  />
                </div>
              </div>

              <datalist id="recent-sessions-list">
                {recentSessions.map(s => (
                  <option key={s.session_id} value={s.session_id}>
                    Session {s.session_id} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </datalist>

              {/* Info hint */}
              {recentSessions.length === 0 && (
                <div style={{ padding: '16px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fbbf24', fontSize: '0.85rem', color: '#92400e', textAlign: 'center' }}>
                  ⚠️ No sessions found today. Add items via the New Item page first.
                </div>
              )}
              {fromSession && (
                <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>✅</span>
                  <span>Ready to import {toSession && toSession !== fromSession ? `Sessions ${fromSession} to ${toSession}` : `Session ${fromSession}`}. Press <strong>Enter</strong> or click Import.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowSessionModal(false)}
                style={{ padding: '9px 20px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >Cancel</button>
              <button
                type="button"
                onClick={handleImportSessionRange}
                disabled={!fromSession || importingSession}
                style={{ padding: '9px 24px', background: !fromSession ? '#94a3b8' : '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: fromSession ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.9rem', transition: 'background 0.15s' }}
              >
                {importingSession ? '⏳ Importing...' : '📥 Import Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal */}
      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Confirm Save</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 12 }}>Please enter your password to save purchase.</p>
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

    </div>
  );
}

export default NewPurchase;
