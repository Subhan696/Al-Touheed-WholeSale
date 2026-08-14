import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import './NewPurchase.css';
import { generateTSPL } from '../utils/TSPLGenerator';

const { ipcRenderer } = window.require('electron');

let _rowId = Date.now();
const nextId = () => ++_rowId;

function makeRow() {
  return { id: nextId(), itemCode: '', description: '', gender: '', brand: '', packingQty: 0, packets: '', preDiscPrice: '', flatDiscount: 0, discPct: 0 };
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

function descForProduct(p) {
  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();
}

function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.45);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.5);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (e) {
    // Audio not available — silently skip
  }
}

const VirtuosoTableComponents = {
  Table: (props) => <table {...props} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
  TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />),
  TableFoot: React.forwardRef((props, ref) => <tfoot {...props} ref={ref} style={{ position: 'sticky', bottom: 0, zIndex: 10, background: '#f8fafc', borderTop: '2px solid #cbd5e1' }} />),
  TableRow: (props) => <tr {...props} style={{ height: 28, fontSize: '0.9rem' }} />
};

function FastPurchase({ currentUser, isActive, onClose }) {
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
  const [activeDrop, setActiveDrop] = useState(null);
  const [showAmountMismatch, setShowAmountMismatch] = useState(false);
  const [forceSave, setForceSave] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [miscCharges, setMiscCharges] = useState('');
  const [discount, setDiscount] = useState('');

  // Session Import
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);
  const [fromSession, setFromSession] = useState('');
  const [toSession, setToSession] = useState('');
  const [importingSession, setImportingSession] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printResult, setPrintResult] = useState(null);
  const [showPrintSuccess, setShowPrintSuccess] = useState(false);

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

  const getSupplierForBrand = (brandName, discountsList, companiesList) => {
    if (!brandName) return '';
    const b = brandName.trim().toLowerCase();

    if (discountsList && discountsList.length > 0) {
      const rule = discountsList.find(d =>
        (d.brand_name || '').trim().toLowerCase() === b ||
        (d.company_name || '').trim().toLowerCase() === b
      );
      if (rule) {
        const sup = rule.supplier_name || rule.company_name;
        if (sup) return sup;
      }
    }

    if (companiesList && companiesList.length > 0) {
      const compMatch = companiesList.find(c => (c || '').trim().toLowerCase() === b);
      if (compMatch) return compMatch;
    }

    return '';
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [comps, mfg, sess] = await Promise.all([
          ipcRenderer.invoke('get-manufacturers').catch(() => []),
          ipcRenderer.invoke('get-raw-manufacturer-brands').catch(() => []),
          ipcRenderer.invoke('get-item-sessions').catch(() => [])
        ]);
        const compNames = (comps || []).map(c => c.name);
        setCompanies(compNames);
        const mfgData = mfg || [];
        setMfgDiscounts(mfgData);

        // Auto-select supplier of the last session's brand
        let hasAutoSupplier = false;
        if (sess && sess.length > 0 && sess[0].brand) {
          const autoSupplier = getSupplierForBrand(sess[0].brand, mfgData, compNames);
          if (autoSupplier) {
            setSupplierName(autoSupplier);
            hasAutoSupplier = true;
          }
        }
        if (hasAutoSupplier) {
          setTimeout(() => amountRef.current?.focus(), 120);
        } else {
          setTimeout(() => supplierRef.current?.focus(), 100);
        }
      } catch (err) {
        console.error('Failed to load FastPurchase data:', err);
        setTimeout(() => supplierRef.current?.focus(), 100);
      }
    };
    loadData();

    // Load printers for barcode printing
    const loadPrinters = async () => {
      try {
        const list = await ipcRenderer.invoke('get-printers');
        setPrinters(list || []);
        // Auto-select TSC printer or default
        const defaultPrinter = list.find(p => p.isDefault) || list[0];
        if (defaultPrinter) setSelectedPrinter(defaultPrinter.name);
        const tsc = list.find(p => p.name.toUpperCase().includes('TSC'));
        if (tsc) setSelectedPrinter(tsc.name);
      } catch (err) {
        console.error('Failed to load printers:', err);
      }
    };
    loadPrinters();
  }, []);

  const rowMath = useMemo(() => {
    const mathMap = {};
    let sub = 0;
    let pkts = 0;

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

      mathMap[r.id] = { pPrice, rowDiscTotal: (flat + rDisc) * q, rowTotal, netRate: 0 };
      if (r.description && q > 0) {
        sub += rowTotal;
        grossSub += rowGross;
        pkts += q;
        totalItemDisc += (flat + rDisc) * q;
      }
    });

    items.forEach(r => {
      const math = mathMap[r.id];
      if (r.description && parseInt(r.packets) > 0 && sub > 0) {
        math.netRate = math.rowTotal / parseInt(r.packets);
      } else if (parseInt(r.packets) > 0) {
        math.netRate = math.rowTotal / parseInt(r.packets);
      }
    });

    return mathMap;
  }, [items]);

  const totals = useMemo(() => {
    let sub = 0;
    let pkts = 0;
    let grossSub = 0;
    let totalItemDisc = 0;

    items.forEach(r => {
      const math = rowMath[r.id];
      if (r.description && parseInt(r.packets) > 0) {
        sub += math.rowTotal;
        grossSub += (parseFloat(r.preDiscPrice) || 0) * parseInt(r.packets);
        pkts += parseInt(r.packets);
        totalItemDisc += math.rowDiscTotal;
      }
    });

    const netSub = grossSub - totalItemDisc;
    const misc = parseFloat(miscCharges) || 0;
    const disc = parseFloat(discount) || 0;
    const grand = netSub + misc - disc;

    return {
      count: items.filter(r => r.description && parseInt(r.packets) > 0).length,
      pkts,
      grossSub,
      totalItemDisc,
      flatDisc: 0,
      netSub,
      grand
    };
  }, [items, rowMath, miscCharges, discount]);

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
        const sessionBrand = products[0]?.brand || sess[0]?.brand || '';
        let targetSupplier = supplierName;
        if (!targetSupplier && sessionBrand) {
          targetSupplier = getSupplierForBrand(sessionBrand, mfgDiscounts, companies);
          if (targetSupplier) {
            setSupplierName(targetSupplier);
          }
        }
        if (targetSupplier) {
          setTimeout(() => amountRef.current?.focus(), 60);
        }

        const newRows = products.map(p => {
          let flatD = 0, pctD = 0;
          const currentSup = targetSupplier || supplierName;
          if (currentSup && p.brand) {
            const rule = mfgDiscounts.find(d =>
              (d.company_name || '').toLowerCase() === currentSup.toLowerCase() &&
              (d.brand_name || '').toLowerCase() === p.brand.toLowerCase()
            );
            if (rule) {
              pctD = parseFloat(rule.purchase_discount_pct) || 0;
              flatD = parseFloat(rule.discount_amount) || 0;
            }
          }
          return {
            id: nextId(),
            itemCode: p.item_code,
            description: descForProduct(p),
            gender: p.gender || '',
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
        gender: product.gender || '',
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
      if (row && row.locked) {
        packetsRefs.current[rowId]?.focus();
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') ctrlD(e, idx);
  };

  const handlePktsKD = (e, rowId, idx) => {
    const rows = itemsRef.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= rows.length - 1) {
        addEmptyRow();
      } else {
        // Skip to next row's qty if next row is locked, otherwise next code
        if (rows[idx + 1]?.locked) {
          focusInput(idx + 1, packetsRefs);
        } else {
          focusInput(idx + 1, codeRefs);
        }
      }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusInput(idx + 1, packetsRefs); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusInput(idx - 1, packetsRefs); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') ctrlD(e, idx);
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') ctrlD(e, idx);
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
            gender: p.gender || '',
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

  const executeSave = useCallback(async (skipValidation = false) => {
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

    // Check if amount matches gross amount (must match, cannot be empty or mismatched)
    const enteredAmount = parseFloat(amount) || 0;
    const grossAmount = totals.grossSub;

    if (!skipValidation && (!enteredAmount || Math.abs(enteredAmount - grossAmount) > 0.01)) {
      setShowAmountMismatch(true);
      setPendingAction('save');
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert DD-MM-YYYY to YYYY-MM-DD for database
      let dbPurchaseDate = purchaseDate;
      if (purchaseDate && purchaseDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = purchaseDate.split('-');
        dbPurchaseDate = `${y}-${m}-${d}`;
      }

      const payload = {
        purchaseDate: dbPurchaseDate,
        invoiceNo: '',
        supplierName,
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
        }),
        discount: parseFloat(discount) || 0,
        miscCharges: parseFloat(miscCharges) || 0,
        purchaseExpenseTotal: 0,
        expenses: [],
        notes: 'Fast Purchase',
        supplierInvNo: '',
        supplierDate: dbPurchaseDate,
        vehicleNo: '',
        godown: '1-SHOP',
        bltNumber: ''
      };

      const result = await ipcRenderer.invoke('save-purchase', payload);
      if (result.success) {
        if (!skipValidation) {
          setStatusMsg('✓ Purchase saved!');
          setTimeout(() => {
            setStatusMsg('');
            // Reset form
            setItems([makeRow()]);
            setSupplierName('');
            setAmount('');
            setMiscCharges('');
            setDiscount('');
            setAutoImported(false);
            setActiveDrop(null);
            setForceSave(false);
            setPendingAction(null);
            setIsSubmitting(false);
            if (onClose) onClose();
            else setTimeout(() => supplierRef.current?.focus(), 100);
          }, 1200);
        } else {
          setIsSubmitting(false);
        }
        return result.id;
      } else {
        setStatusMsg(`Error: ${result.error || 'Failed'}`);
        setIsSubmitting(false);
        return null;
      }
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setIsSubmitting(false);
      return null;
    }
  }, [supplierName, items, rowMath, amount, totals.grossSub, purchaseDate, discount, miscCharges]);

  const executeSaveAndPrint = useCallback(async () => {
    // Check if amount matches gross amount (must match, cannot be empty or mismatched)
    const enteredAmount = parseFloat(amount) || 0;
    const grossAmount = totals.grossSub;

    if (!forceSave && (!enteredAmount || Math.abs(enteredAmount - grossAmount) > 0.01)) {
      setShowAmountMismatch(true);
      setPendingAction('print');
      return;
    }

    const purchaseId = await executeSave(true);
    if (!purchaseId) return;

    try {
      setStatusMsg('✓ Purchase saved! Printing barcodes...');

      // Load barcode data and print directly
      const purchaseItems = await ipcRenderer.invoke('get-purchase-barcode-data', purchaseId);
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

        let itemName = nameParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unknown';

        return {
          ...item,
          item_name: itemName,
          sale_rate: Math.round(parseFloat(item.sale_rate) || 0),
          quantity: labelsCount,
          packing: packing
        };
      });

      // Print directly using TSPL
      if (!selectedPrinter) {
        setStatusMsg('⚠ No printer selected');
        setTimeout(() => setStatusMsg(''), 3000);
        return;
      }

      setIsPrinting(true);
      setPrintResult(null);

      const tsplData = generateTSPL(barcodeItems);
      const result = await ipcRenderer.invoke('print-raw', {
        printerName: selectedPrinter,
        data: tsplData
      });

      setIsPrinting(false);

      if (result.success) {
        setStatusMsg('✓ Purchase saved! Barcodes printed successfully!');
        setPrintResult({ type: 'success', msg: 'Labels sent to printer successfully!' });
        setShowPrintSuccess(true);
        playSuccessChime();
        setTimeout(() => setShowPrintSuccess(false), 1800);
      } else {
        setStatusMsg(`✓ Purchase saved! Print failed: ${result.error || 'Unknown error'}`);
        setPrintResult({ type: 'error', msg: result.error || 'Print failed.' });
      }

      setTimeout(() => {
        setStatusMsg('');
        setPrintResult(null);
        // Reset form
        setItems([makeRow()]);
        setSupplierName('');
        setAmount('');
        setAutoImported(false);
        setActiveDrop(null);
        setForceSave(false);
        setPendingAction(null);
        if (onClose) onClose();
        else setTimeout(() => supplierRef.current?.focus(), 100);
      }, 2000);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setIsSubmitting(false);
      setPrintResult({ type: 'error', msg: err.message });
    }
  }, [amount, totals.grossSub, forceSave, executeSave, selectedPrinter]);

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        executeSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        executeSaveAndPrint();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, executeSave, executeSaveAndPrint]);

  return (
    <div className="new-purchase-page">

      {/* Page Header */}
      <header className="page-header" style={{ marginBottom: 3 }}>
        <h2 className="title" style={{ fontSize: '1rem' }}>Fast Purchase Entry</h2>
        <div className="status-msg">
          {statusMsg && (
            <span className={statusMsg.startsWith('Error') ? 'error' : 'success'}>{statusMsg}</span>
          )}
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={selectedPrinter}
            onChange={e => setSelectedPrinter(e.target.value)}
            disabled={isPrinting}
            style={{ padding: '2px 6px', fontSize: '0.78rem', borderRadius: 4, border: '1px solid #e2e8f0', height: 26 }}
          >
            <option value="">Select Printer</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>

          <button type="button" onClick={openSessionModal} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b', padding: '2px 10px', fontSize: '0.75rem' }}>
            📦 Import Session
          </button>
          <button type="button" onClick={() => {
            setItems([makeRow()]);
            setSupplierName('');
            setAmount('');
            setMiscCharges('');
            setDiscount('');
            setAutoImported(false);
            setActiveDrop(null);
            setTimeout(() => supplierRef.current?.focus(), 100);
          }} className="btn btn-secondary sm" disabled={isSubmitting} style={{ padding: '2px 10px', fontSize: '0.75rem' }}>
            Reset
          </button>
          <button type="button" onClick={executeSave} className="btn btn-secondary sm" disabled={isSubmitting} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', padding: '2px 10px', fontSize: '0.75rem' }}>
            {isSubmitting ? 'Saving...' : 'Save (Ctrl+S)'}
          </button>
          <button type="button" onClick={executeSaveAndPrint} className="btn btn-primary sm" disabled={isSubmitting || !selectedPrinter} style={{ padding: '2px 10px', fontSize: '0.75rem' }}>
            {isPrinting ? 'Printing...' : 'Save & Print (Ctrl+P)'}
          </button>
        </div>
      </header>

      <div className="purchase-form" style={{ overflow: 'hidden', gap: 6 }}>

        {/* Card 1: Purchase Details */}
        <section className="form-card" style={{ padding: '6px 14px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 2, display: 'block' }}>Date</label>
              <input ref={dateRef} type="text" value={purchaseDate} onChange={handleDateChange} onKeyDown={e => handleHeaderKD(e, 'date')} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '3px 6px', fontSize: '0.85rem', height: 30 }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200, marginBottom: 0 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 2, display: 'block' }}>Supplier Name *</label>
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
              }} onKeyDown={e => handleHeaderKD(e, 'supplier')} className="form-input" style={{ padding: '3px 6px', fontSize: '0.85rem', height: 30 }}>
                <option value="">-- Select Supplier --</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ width: 220, marginBottom: 0 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0f172a', marginBottom: 2, display: 'block' }}>Amount</label>
              <input
                ref={amountRef}
                type="text"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'amount')}
                placeholder="Enter Amount"
                className="form-input center-text"
                style={{
                  padding: '4px 12px',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  backgroundColor: '#fef3c7',
                  border: '3px solid #f59e0b',
                  borderRadius: 6,
                  color: '#0f172a',
                  textAlign: 'center',
                  height: 30
                }}
              />
            </div>
          </div>
        </section>

        {/* Card 2: Items Table */}
        <section className="form-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '6px 8px' }}>
          <div className="card-header" style={{ marginBottom: 4 }}>
            <h3 className="card-title" style={{ fontSize: '0.8rem', margin: 0 }}>Purchase Items</h3>
          </div>
          <div className="items-table" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <TableVirtuoso
              ref={virtuosoRef}
              data={items}
              style={{ flex: 1, border: '1px solid #e2e8f0', background: 'white' }}
              components={VirtuosoTableComponents}
              fixedHeaderContent={() => (
                <tr style={{ fontSize: '0.75rem', height: 26, borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 24, textAlign: 'center', padding: '0 2px' }}>No.</th>
                  <th style={{ width: '10%', padding: '0 4px' }}>Alias Name</th>
                  <th style={{ padding: '0 4px' }}>Item Name</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '0 2px' }}>Packing</th>
                  <th style={{ width: 40, textAlign: 'center', padding: '0 2px', color: '#b45309' }}>PKT</th>
                  <th style={{ width: 55, textAlign: 'center', padding: '0 2px', background: '#fef9c3', color: '#92400e' }}>QTY</th>
                  <th style={{ width: 105, textAlign: 'right', padding: '0 4px' }}>P.Price</th>
                  <th style={{ width: 140, textAlign: 'right', padding: '0 4px' }}>Total</th>
                  <th style={{ width: 140, textAlign: 'right', padding: '0 4px' }}>Net Rate</th>
                  <th style={{ width: 30, padding: '0' }}></th>
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
                        style={{ padding: '2px 4px', fontSize: '0.88rem', height: 26, borderRadius: 2, ...(row.locked ? { background: '#f1f5f9', color: '#64748b', cursor: 'default' } : {}) }}
                      />

                    </td>

                    {/* Item Name */}
                    <td style={{ padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid #e2e8f0' }}>
                      {row.description}
                    </td>

                    {/* Packing */}
                    <td style={{ textAlign: 'center', padding: '0 4px', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                      {row.description ? (row.packingQty || 1) : ''}
                    </td>

                    {/* PKT (packets = qty / packing) */}
                    <td style={{ textAlign: 'center', padding: '0 2px', fontWeight: 700, color: '#b45309', fontSize: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>
                      {row.description && parseInt(row.packets) > 0 ? Math.floor(parseInt(row.packets) / (parseInt(row.packingQty) || 1)) : ''}
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '0 2px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb' }}>
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
                        style={{ padding: '2px 4px', fontSize: '0.95rem', height: 26, borderRadius: 2, background: '#fef08a', fontWeight: 700, border: '1px solid #fbbf24' }}
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
                        style={{ padding: '2px 4px', fontSize: '0.88rem', height: 26, borderRadius: 2 }}
                      />
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
                <tr style={{ fontWeight: 700, height: 32, fontSize: '0.9rem', background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                  <td></td>
                  <td></td>
                  <td style={{ padding: '0 4px', color: '#475569', fontWeight: 700 }}>Items: {totals.count}</td>
                  <td></td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <span style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 4, color: '#78350f', padding: '1px 4px', fontSize: '0.9rem' }}>
                      {calcTotalPackets(items)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px', color: '#0f172a', fontWeight: 800 }}>{totals.pkts}</td>
                  <td></td>
                  <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 800, color: '#0f172a' }}>
                    {totals.grossSub > 0 ? Math.round(totals.grossSub).toLocaleString() : ''}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            />
          </div>

          {/* Bottom Summary Bar */}
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, marginTop: 3, padding: '3px 8px', background: '#f1f5f9', borderRadius: 5, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>Total:</span>
              <span style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: '#0f172a',
                backgroundColor: '#fef3c7',
                border: '3px solid #f59e0b',
                borderRadius: 6,
                padding: '4px 20px',
                textAlign: 'center'
              }}>
                {Math.round(totals.grossSub).toLocaleString()}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Amount Mismatch Modal */}
      {showAmountMismatch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 28, borderRadius: 12, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', border: '2px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.6rem' }}>⚠️</span>
              <h3 style={{ margin: 0, color: '#dc2626', fontSize: '1.1rem' }}>Amount Mismatch</h3>
            </div>
            <div style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 14px', marginBottom: 20, border: '1px solid #fecaca' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Entered amount:</span>
                <strong style={{ color: '#0f172a' }}>{amount ? parseFloat(amount).toLocaleString() : '(empty)'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Calculated gross:</span>
                <strong style={{ color: '#16a34a' }}>{totals.grossSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fecaca', paddingTop: 6 }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Difference:</span>
                <strong style={{ color: '#dc2626' }}>{Math.abs((parseFloat(amount) || 0) - totals.grossSub).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>
              Please type in the correct amount in the <strong>Amount</strong> field before saving.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                autoFocus
                onClick={() => {
                  setShowAmountMismatch(false);
                  setPendingAction(null);
                  setAmount('');
                  setTimeout(() => {
                    amountRef.current?.focus();
                    amountRef.current?.select();
                  }, 50);
                }}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 28px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.4)'
                }}
              >
                ✏️ Enter Correct Amount
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Success Overlay */}
      {showPrintSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          animation: 'fpFadeIn 0.2s ease'
        }}>
          <style>{`
            @keyframes fpFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes fpScaleIn { from { transform: scale(0.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
            @keyframes fpCheckDraw { from { stroke-dashoffset: 80 } to { stroke-dashoffset: 0 } }
            @keyframes fpRing1 { 0% { transform: scale(0.6); opacity: 1 } 100% { transform: scale(2.2); opacity: 0 } }
            @keyframes fpRing2 { 0% { transform: scale(0.6); opacity: 1 } 100% { transform: scale(2.8); opacity: 0 } }
          `}</style>
          <div style={{
            background: 'white',
            borderRadius: 24,
            padding: '40px 56px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            animation: 'fpScaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            position: 'relative'
          }}>
            {/* Ripple rings */}
            <div style={{
              position: 'absolute', width: 120, height: 120,
              borderRadius: '50%', border: '4px solid #22c55e',
              animation: 'fpRing1 1.2s ease-out 0.2s both'
            }} />
            <div style={{
              position: 'absolute', width: 120, height: 120,
              borderRadius: '50%', border: '3px solid #86efac',
              animation: 'fpRing2 1.4s ease-out 0.3s both'
            }} />
            {/* Circle + checkmark */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(34,197,94,0.5)'
            }}>
              <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
                <path
                  d="M10 22L18 30L32 14"
                  stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="80" strokeDashoffset="0"
                  style={{ animation: 'fpCheckDraw 0.4s ease 0.25s both', strokeDashoffset: 80 }}
                />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>Printed Successfully!</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Barcodes sent to printer ✓</div>
            </div>
          </div>
        </div>
      )}

      {/* Session Import Modal */}
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
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.9rem' }}
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
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.9rem' }}
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
                {importingSession ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FastPurchase;