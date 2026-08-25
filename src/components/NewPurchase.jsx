import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import SuccessAnimation from './SuccessAnimation';
import StockSearchModal from './StockSearchModal';
import './NewPurchase.css';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', baseDescription: '', category: '', size_range: '', gender: '', originalGender: '', brand: '', packingQty: 0, packets: '', preDiscPrice: '', flatDiscount: 0, discPct: 0 };
}

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function calcTotalPackets(items) {
  let total = 0;
  items.forEach(r => {
    const qty = parseInt(r.packets) || 0;
    const packing = parseInt(r.packingQty) || 1;
    if (r.description && qty > 0) {
      total += Math.floor(qty / packing);
    }
  });
  return total;
}

const VirtuosoTableComponents = {
  Table: (props) => <table {...props} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
  TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />),
  TableFoot: React.forwardRef((props, ref) => <tfoot {...props} ref={ref} style={{ position: 'sticky', bottom: 0, zIndex: 10, background: '#f8fafc', borderTop: '2px solid #cbd5e1' }} />),
  TableRow: (props) => <tr {...props} style={{ height: 32, fontSize: '0.95rem' }} />
};

function NewPurchase({ currentUser, purchaseToEdit, onSaveSuccess, onCancelEdit, isActive }) {
  const isEditing = !!purchaseToEdit;

  const todayDMY = () => {
    const parts = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }).split('/');
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const [purchaseDate, setPurchaseDate] = useState(todayDMY);
  const [supplierDate, setSupplierDate] = useState(todayDMY);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [godown, setGodown] = useState('1-SHOP');
  const [notes, setNotes] = useState('');
  const [bltNumber, setBltNumber] = useState('');
  const [discount, setDiscount] = useState('');
  const [miscCharges, setMiscCharges] = useState('');
  const [items, setItems] = useState(() => [makeRow()]);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [purchaseExpenseTotal, setPurchaseExpenseTotal] = useState('');
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [stockSearchModalOpen, setStockSearchModalOpen] = useState(false);
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
  const [checkingSession, setCheckingSession] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [supplierBalances, setSupplierBalances] = useState({});
  const [historicalSupplierBal, setHistoricalSupplierBal] = useState(null);
  const [mfgDiscounts, setMfgDiscounts] = useState([]);
  const [genders, setGenders] = useState([]);

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
      virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
      if (refsObj.current[targetId]) {
        refsObj.current[targetId].focus();
      } else {
        setTimeout(() => {
          refsObj.current[targetId]?.focus();
        }, 50);
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
      let rawSupplierDate = '';
      if (p.supplier_date instanceof Date) {
        // Use local date parts to avoid UTC conversion
        const d = String(p.supplier_date.getDate()).padStart(2, '0');
        const m = String(p.supplier_date.getMonth() + 1).padStart(2, '0');
        const y = p.supplier_date.getFullYear();
        rawSupplierDate = `${y}-${m}-${d}`;
      } else if (typeof p.supplier_date === 'string') {
        rawSupplierDate = p.supplier_date;
      }
      console.log('[FRONTEND LOAD] supplier_date from DB:', p.supplier_date, '→ rawSupplierDate:', rawSupplierDate);
      if (rawSupplierDate) {
        const [y, m, d] = rawSupplierDate.split('-');
        setSupplierDate(`${d}-${m}-${y}`);
      } else {
        setSupplierDate(''); // Keep empty if not set, don't default to today
      }
      setInvoiceNo(p.invoice_no || '');
      setSupplierName(p.supplier_name || '');
      setSupplierInvNo(p.supplier_inv_no || '');
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
          baseDescription: r.base_description || '',
          category: r.category || '',
          size_range: r.size_range || '',
          gender: r.gender || '',
          originalGender: r.gender || '',
          brand: r.brand || '',
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
      }).catch(() => { });

      if (p.supplier_name) {
        ipcRenderer.invoke('get-supplier-statement', { supplier_name: p.supplier_name }).then(data => {
          if (data && Array.isArray(data.transactions)) {
            let running = parseFloat(data.initial_balance) || 0;
            let targetBal = null;
            data.transactions.forEach(t => {
              running += (parseFloat(t.credit) || 0) - (parseFloat(t.debit) || 0);
              if (t.type === `PV-${p.id}` || (String(t.id) === String(p.id) && String(t.type).startsWith('PV-'))) {
                targetBal = running;
              }
            });
            if (targetBal !== null) {
              setHistoricalSupplierBal(targetBal);
            }
          }
        }).catch(() => {});
      }
    } else {
      setHistoricalSupplierBal(null);
      setTimeout(() => invoiceRef.current?.focus(), 80);
    }
  }, [purchaseToEdit]);

  useEffect(() => {
    const loadDropdowns = () => {
      ipcRenderer.invoke('get-manufacturers').then(res => setCompanies(res.map(c => c.name))).catch(() => { });
      ipcRenderer.invoke('get-suppliers-ledger').then(ledgerData => {
        const balMap = {};
        (ledgerData || []).forEach(s => {
          balMap[(s.name || '').trim().toLowerCase()] = s.net_balance !== undefined ? s.net_balance : s.balance;
        });
        setSupplierBalances(balMap);
      }).catch(() => { });
      ipcRenderer.invoke('get-raw-manufacturer-brands').then(res => setMfgDiscounts(res || [])).catch(() => { });
      ipcRenderer.invoke('get-genders').then(res => setGenders(res || [])).catch(() => { });
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
      }).catch(() => { });
    };

    loadDropdowns();
    window.addEventListener('focus', loadDropdowns);
    return () => window.removeEventListener('focus', loadDropdowns);
  }, [isEditing]);

  const handleDateChange = (e) => {
    let val = e.target.value;

    // Auto-insert hyphen
    val = val.replace(/[^0-9-]/g, '');

    // Handle in-place day replacement: D-MM-YYYY → 0D-MM-YYYY
    const dayReplace = val.match(/^(\d)-(\d{2}-\d{4})$/);
    if (dayReplace && parseInt(dayReplace[1]) >= 4) {
      setSupplierDate('0' + dayReplace[1] + '-' + dayReplace[2]);
      return;
    }

    // Allow user to delete back
    if (val.length < supplierDate.length) {
      setSupplierDate(val);
      return;
    }

    // Smart day formatting: single digit 4-9 auto-pads with 0 and adds hyphen
    if (val.length === 1 && parseInt(val) >= 4) {
      val = '0' + val + '-';
    }

    // If 2 digits and no hyphen, add hyphen (after day)
    if (val.length === 2 && !val.includes('-')) val += '-';
    // Smart month formatting: if single digit (2-9) after hyphen, pad with 0 and add hyphen
    if (val.length === 4 && val.includes('-') && !val.endsWith('-')) {
      const monthDigit = val.split('-')[1];
      if (monthDigit.length === 1 && parseInt(monthDigit) >= 2) {
        val = val.split('-')[0] + '-' + monthDigit.padStart(2, '0') + '-';
      }
    }
    // If 5 characters with 2 hyphens, add final hyphen for year
    if (val.length === 5 && val.split('-').length === 2) val += '-';

    // Limit length to DD-MM-YYYY (10 chars)
    if (val.length <= 10) setSupplierDate(val);
  };

  const handleDateBlur = () => {
    // Auto-pad single digit day on blur: "6-08-2026" → "06-08-2026"
    const m = supplierDate.match(/^(\d)-(\d{1,2}-\d{4})$/);
    if (m) setSupplierDate('0' + m[1] + '-' + m[2]);
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
        const sess = await ipcRenderer.invoke('get-item-sessions', { showAll: true });
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
        baseDescription: product.description || '',
        category: product.category || '',
        size_range: product.size_range || '',
        gender: product.gender || '',
        originalGender: product.gender || '',
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
      const newRow = { ...r, [field]: val };
      if (field === 'gender') {
        newRow.description = `${newRow.baseDescription || ''} ${newRow.category || ''} ${newRow.size_range || ''} ${newRow.gender || ''}`.replace(/\\s+/g, ' ').trim();
      }
      return newRow;
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
        virtuosoRef.current?.scrollToIndex({ index: prev.length - 1, align: 'center' });
        setTimeout(() => codeRefs.current[last.id]?.focus(), 30);
        return prev;
      }
      const nr = makeRow();
      const newLen = prev.length + 1;
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: newLen - 1, align: 'center' });
        setTimeout(() => codeRefs.current[nr.id]?.focus(), 50);
      }, 30);
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
      const codeVal = rows[idx]?.itemCode?.trim().toLowerCase() || '';
      if (drop.length > 0) {
        const exact = drop.find(r => r.item_code.toLowerCase() === codeVal);
        fillRow(rowId, exact || drop[0]);
      } else packetsRefs.current[rowId]?.focus();
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
    setSupplierDate(todayDMY());
    setInvoiceNo('');
    setSupplierName('');
    setSupplierInvNo('');
    setBltNumber('');
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
    let totalFlatDisc = 0;
    let totalPctDisc = 0;

    items.forEach(r => {
      const q = parseInt(r.packets) || 0;
      const base = parseFloat(r.preDiscPrice) || 0;
      const flat = parseFloat(r.flatDiscount) || 0;
      const dPct = parseFloat(r.discPct) || 0;
      const rDisc = base * (dPct / 100);
      const pPrice = Math.max(0, base - rDisc - flat);
      const rowTotal = pPrice * q;
      const rowGross = base * q;

      mathMap[r.id] = { pPrice, rowDiscTotal: (flat + rDisc) * q, rowTotal, netRate: 0 };
      if (r.description && q > 0) {
        sub += rowTotal;
        grossSub += rowGross;
        pkts += q;
        totalFlatDisc += flat * q;
        totalPctDisc += rDisc * q;
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
        totalFlatDisc,
        totalPctDisc,
        totalItemDisc,
        flatDisc: disc,
        grand: sub + misc - disc,
        count: items.filter(r => r.description && parseInt(r.packets) > 0).length
      },
      rowMath: mathMap
    };
  }, [items, miscCharges, discount, purchaseExpenseTotal]);

  const executeSave = async () => {
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

    const authCheck = await ipcRenderer.invoke('login', { username: currentUser.username, password: authPass });
    if (!authCheck.success) {
      setStatusMsg('Error: Incorrect password');
      setIsSubmitting(false);
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    try {
      // DD-MM-YYYY → YYYY-MM-DD for DB
      let dbSupplierDate = null;
      if (supplierDate && supplierDate.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        const [d, m, y] = supplierDate.split('-');
        dbSupplierDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      console.log('[FRONTEND] supplierDate input:', supplierDate, '→ dbSupplierDate:', dbSupplierDate);
      // For new purchases, use today's date for purchase_date (created_at will track actual save time)
      // For edits, preserve original purchase_date to avoid changing historical data
      let dbPurchaseDate = purchaseDate;
      if (!isEditing) {
        dbPurchaseDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      } else if (purchaseDate && purchaseDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = purchaseDate.split('-');
        dbPurchaseDate = `${y}-${m}-${d}`;
      }
      const payload = {
        purchaseDate: dbPurchaseDate,
        invoiceNo, supplierName, notes,
        supplierInvNo, supplierDate: dbSupplierDate, vehicleNo, godown, bltNumber,
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
            gender: r.gender,
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
        setShowAuth(false);
        setAuthPass('');
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

  const handleInitiateSave = () => {
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

    if (showAuth) {
      executeSave();
      return;
    }

    if (showExpensesModal) {
      const modalTotal = purchaseExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      setPurchaseExpenseTotal(String(modalTotal));
      setShowExpensesModal(false);
      setAuthPass('');
      setShowAuth(true);
      return;
    }

    setShowExpensesModal(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if (e.key === 'F8') { e.preventDefault(); setStockSearchModalOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleInitiateSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, items, supplierName, purchaseDate, discount, miscCharges, notes, isEditing, showExpensesModal, showAuth, purchaseExpenseTotal, purchaseExpenses, authPass]);

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

      const updated = nextItems.map(r => r.id === targetRowId ? {
        ...r,
        itemCode: product.item_code,
        description: descForProduct(product),
        baseDescription: product.description || '',
        category: product.category || '',
        size_range: product.size_range || '',
        gender: product.gender || '',
        originalGender: product.gender || '',
        brand: product.brand || '',
        packingQty: pkts,
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

  const handleImportSessionRange = async () => {
    if (!fromSession) return;
    setImportingSession(true);
    try {
      const fromId = parseInt(fromSession);
      const toId = toSession ? parseInt(toSession) : fromId;
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
            locked: autoMode
          };
        });

        setItems(prev => {
          const cleaned = prev.filter(r => r.itemCode || r.description || r.packets || r.preDiscPrice);
          return [...cleaned, ...newRows, makeRow()];
        });
        if (autoMode) setAutoImported(true);

        const sessionMsg = fromId === toId ? `Session ${fromId}` : `Sessions ${fromId} to ${toId}`;
        setStatusMsg(`✓ Imported ${products.length} items from ${sessionMsg}`);
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
        <div className="header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(() => {
            const isHist = isEditing && historicalSupplierBal !== null && supplierName.toLowerCase() === (purchaseToEdit?.supplier_name || '').toLowerCase();
            const balVal = isHist ? historicalSupplierBal : (supplierName ? supplierBalances[supplierName.trim().toLowerCase()] : null);
            if (balVal === null || balVal === undefined) return null;
            return (
              <div style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 6,
                background: balVal > 0 ? '#fee2e2' : balVal < 0 ? '#dcfce7' : '#f1f5f9',
                color: balVal > 0 ? '#dc2626' : balVal < 0 ? '#15803d' : '#475569',
                border: `1.5px solid ${balVal > 0 ? '#fca5a5' : balVal < 0 ? '#86efac' : '#cbd5e1'}`,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}>
                {isHist ? `Saved Bal (#${purchaseToEdit.id}):` : 'Bal:'} {Math.abs(balVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {balVal > 0 ? 'Cr (Payable)' : balVal < 0 ? 'Dr (Advance)' : 'Nil'}
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => setAutoMode(m => !m)}
            className="btn btn-secondary sm"
            disabled={isEditing}
            style={{
              background: autoMode ? '#22c55e' : '#94a3b8',
              color: 'white',
              borderColor: autoMode ? '#22c55e' : '#94a3b8',
              padding: '2px 8px',
              fontSize: '0.75rem',
              height: 26,
              lineHeight: '20px'
            }}
          >
            ⚡ {autoMode ? 'Auto ON' : 'Auto OFF'}
          </button>
          <button type="button" onClick={() => setStockSearchModalOpen(true)} className="btn btn-secondary sm" style={{ background: '#0284c7', color: 'white', borderColor: '#0284c7', padding: '2px 8px', fontSize: '0.75rem', height: 26, lineHeight: '20px' }}>
            🔍 Search (F8)
          </button>
          <button type="button" onClick={openSessionModal} className="btn btn-secondary sm" disabled={isSubmitting || isEditing} style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}>
            📦 Import Session
          </button>
          <button type="button" onClick={onCancelEdit} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f64e60', color: 'white', borderColor: '#f64e60' }}>
            Exit
          </button>
          <button type="button" onClick={resetForm} className="btn btn-secondary sm" disabled={isSubmitting}>
            Reset
          </button>
          <button type="button" onClick={handleInitiateSave} className="btn btn-primary sm" disabled={isSubmitting}>
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
              <label style={{ fontSize: '0.75rem' }}>Supplier Date</label>
              <input ref={dateRef} type="text" value={supplierDate} onChange={handleDateChange} onKeyDown={e => handleHeaderKD(e, 'date')} onFocus={e => e.target.setSelectionRange(0, 2)} onBlur={handleDateBlur} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
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
                  <th style={{ width: 70, padding: '0 4px' }}>Alias Name</th>
                  <th style={{ padding: '0 4px' }}>Item Name</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '0 2px' }}>Packing</th>
                  <th style={{ width: 40, textAlign: 'center', padding: '0 2px', color: '#b45309' }}>PKT</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '0 2px' }}>Qty</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>P.Price</th>
                  <th style={{ width: 50, textAlign: 'right', padding: '0 4px' }}>Disc%</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Flat Disc</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>P.Net</th>
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
                        onFocus={() => virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' })}
                        onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                        readOnly={!!row.locked}
                        className="form-input"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, ...(row.locked ? { background: '#f1f5f9', color: '#64748b', cursor: 'default' } : {}) }}
                      />

                    </td>

                    {/* Item Name */}
                    <td style={{ padding: '0 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', overflow: 'hidden' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.baseDescription ? `${row.baseDescription} ${row.category} ${row.size_range}`.replace(/\\s+/g, ' ').trim() : row.description}
                        </span>
                        {(row.description || row.itemCode) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <select
                              value={row.gender || ''}
                              onChange={e => updateRow(row.id, 'gender', e.target.value)}
                              className="form-input"
                              style={{ padding: '0 4px', fontSize: '0.85rem', height: 22, width: 'auto', minWidth: '70px', borderRadius: 2, background: row.gender ? '#fff' : '#f8fafc', border: '1px solid #cbd5e1' }}
                              tabIndex={-1}
                            >
                              <option value=""></option>
                              {genders.map(g => (
                                <option key={g.id} value={g.name}>{g.name}</option>
                              ))}
                              {row.gender && !genders.find(g => g.name === row.gender) && (
                                <option value={row.gender}>{row.gender}</option>
                              )}
                            </select>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Packing */}
                    <td style={{ textAlign: 'center', padding: '0 2px', fontWeight: 600, color: '#475569', fontSize: '0.88rem', borderBottom: '1px solid #e2e8f0' }}>
                      {row.description ? (row.packingQty || 1) : ''}
                    </td>

                    {/* PKT (packets = qty / packing) */}
                    <td style={{ textAlign: 'center', padding: '0 2px', fontWeight: 700, color: '#b45309', fontSize: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>
                      {row.description && parseInt(row.packets) > 0 ? Math.floor(parseInt(row.packets) / (parseInt(row.packingQty) || 1)) : ''}
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
                        onFocus={e => {
                          e.target.select();
                          virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
                        }}
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
                        onFocus={e => {
                          e.target.select();
                          virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
                        }}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2 }}
                      />
                    </td>

                    {/* Disc% */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.discPct}
                        onChange={e => updateRow(row.id, 'discPct', e.target.value.replace(/[^\d.]/g, ''))}
                        onFocus={e => {
                          e.target.select();
                          virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
                        }}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, width: '100%' }}
                        tabIndex={-1}
                      />
                    </td>

                    {/* Flat Discount */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.flatDiscount}
                        onChange={e => updateRow(row.id, 'flatDiscount', e.target.value.replace(/[^\d.]/g, ''))}
                        onFocus={e => {
                          e.target.select();
                          virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' });
                        }}
                        className="form-input right-text"
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 28, borderRadius: 2, width: '100%' }}
                        tabIndex={-1}
                      />
                    </td>

                    {/* P. Net */}
                    <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
                      {math.pPrice > 0 ? math.pPrice.toFixed(2) : '0.00'}
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
              fixedFooterContent={() => (
                <tr style={{ fontWeight: 700, height: 32, fontSize: '0.95rem' }}>
                  <td></td>
                  <td></td>
                  <td style={{ padding: '0 4px', color: '#475569', fontSize: '1.05rem' }}>Items: {totals.count}</td>
                  <td></td>
                  <td style={{ textAlign: 'center', padding: '0 2px', fontSize: '1.05rem' }}>
                    <span style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 4, color: '#78350f', padding: '1px 4px' }}>
                      {calcTotalPackets(items)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px', color: '#0f172a', fontSize: '1.05rem' }}>{totals.pkts}</td>
                  {/* P.Price col */}
                  <td></td>
                  {/* Disc% col */}
                  <td style={{ textAlign: 'right', padding: '0 4px', color: '#dc2626' }}>
                    {totals.totalPctDisc > 0 ? Math.round(totals.totalPctDisc).toLocaleString() : ''}
                  </td>
                  {/* Flat Disc col */}
                  <td style={{ textAlign: 'right', padding: '0 4px', color: '#dc2626' }}>
                    {totals.totalFlatDisc > 0 ? Math.round(totals.totalFlatDisc).toLocaleString() : ''}
                  </td>
                  {/* P.Net col */}
                  <td></td>
                  {/* Discount col */}
                  <td style={{ textAlign: 'right', padding: '0 4px', color: '#dc2626' }}>
                    {totals.totalItemDisc > 0 ? Math.round(totals.totalItemDisc).toLocaleString() : ''}
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            />
          </div>

          {/* Bottom Summary Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, padding: '10px 16px', background: '#f1f5f9', borderRadius: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Gross Amount</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{totals.grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>Total Disc.</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{Math.round(totals.totalItemDisc).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Net Subtotal</span>
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
                        if (!e.target.value) {
                          document.getElementById('exp-modal-done')?.focus();
                        } else {
                          document.getElementById('exp-modal-cartons')?.focus();
                        }
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
                      setAuthPass('');
                      setShowAuth(true);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setPurchaseExpenseTotal(String(modalTotal));
                        setShowExpensesModal(false);
                        setAuthPass('');
                        setShowAuth(true);
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
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: 480, padding: 0, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'visible' }}>

            {/* Header */}
            <div style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
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
                <div style={{ flex: 1, position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Session *</label>
                  <input
                    type="number"
                    autoFocus
                    placeholder="e.g. 1"
                    value={fromSession}
                    onFocus={() => setShowSessionDropdown('from')}
                    onBlur={() => setTimeout(() => setShowSessionDropdown(prev => prev === 'from' ? false : prev), 200)}
                    onChange={e => setFromSession(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && fromSession) { e.preventDefault(); handleImportSessionRange(); }
                    }}
                    className="session-select"
                  />
                  {showSessionDropdown === 'from' && recentSessions.length > 0 && recentSessions.filter(s => !fromSession || s.session_id.toString().includes(fromSession.toString())).length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 1000,
                      backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                      maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                    }}>
                      {recentSessions.filter(s => !fromSession || s.session_id.toString().includes(fromSession.toString())).map(s => (
                        <div
                          key={s.session_id}
                          onMouseDown={() => {
                            setFromSession(s.session_id);
                            setShowSessionDropdown(false);
                          }}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                        >
                          <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Session {s.session_id}</span>
                          <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {s.brand || 'No Brand'} by {s.created_by || 'Unknown'} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>To (Range)</label>
                  <input
                    type="number"
                    placeholder="Same as above"
                    value={toSession}
                    onFocus={() => setShowSessionDropdown('to')}
                    onBlur={() => setTimeout(() => setShowSessionDropdown(prev => prev === 'to' ? false : prev), 200)}
                    onChange={e => setToSession(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && fromSession) { e.preventDefault(); handleImportSessionRange(); }
                    }}
                    className="session-select"
                  />
                  {showSessionDropdown === 'to' && recentSessions.length > 0 && recentSessions.filter(s => !toSession || s.session_id.toString().includes(toSession.toString())).length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 1000,
                      backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                      maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                    }}>
                      {recentSessions.filter(s => !toSession || s.session_id.toString().includes(toSession.toString())).map(s => (
                        <div
                          key={s.session_id}
                          onMouseDown={() => {
                            setToSession(s.session_id);
                            setShowSessionDropdown(false);
                          }}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                        >
                          <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.9rem' }}>Session {s.session_id}</span>
                          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            {s.brand || 'No Brand'} by {s.created_by || 'Unknown'} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showAllSessions}
                    onChange={e => {
                      setShowAllSessions(e.target.checked);
                      loadSessions(e.target.checked);
                    }}
                  />
                  Show previously imported sessions
                </label>
              </div>

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
                if (e.key === 'Enter') { e.preventDefault(); executeSave(); }
                if (e.key === 'Escape') { e.preventDefault(); setShowAuth(false); setAuthPass(''); }
              }}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, marginBottom: 16 }}
              placeholder="Password"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowAuth(false); setAuthPass(''); }} style={{ padding: '6px 12px', background: '#f1f1f1', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={executeSave} style={{ padding: '6px 12px', background: '#3699ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} disabled={isSubmitting}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <SuccessAnimation
        show={showSuccessAnim}
        title={isEditing ? "Purchase Updated!" : "Purchase Saved!"}
        subtitle={isEditing ? "Purchase record updated successfully ✓" : "Purchase saved successfully ✓"}
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
        title="Purchase Stock Search"
      />

    </div>
  );
}

export default NewPurchase;
