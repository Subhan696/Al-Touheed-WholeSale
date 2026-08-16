import React, { useState, useEffect, useRef, useMemo } from 'react';

import { useDataVersion } from '../context/DataContext';

import { getLocalDateString, parseLocalDate, getPrintedInvoiceNo } from '../utils/dateUtils';

import './NewSale.css';

import './StockList.css';

import './ProductList.css';

import PaymentModal from './PaymentModal';

import { PAKISTAN_CITIES } from '../utils/pakistanCities';



const { ipcRenderer } = window.require('electron');



function descForProduct(p) {

  return `${p.description || ''} ${p.category || ''} ${p.size_range || ''} ${p.gender || ''}`.replace(/\s+/g, ' ').trim();

}



function parsePaymentMethodString(str) {

  if (!str) return [];

  const result = [];

  const parts = str.split(',');

  for (const part of parts) {

    const trimmed = part.trim();

    if (!trimmed) continue;

    const colonIdx = trimmed.lastIndexOf(':');

    if (colonIdx !== -1) {

      let methodFull = trimmed.substring(0, colonIdx).trim();

      const amount = parseFloat(trimmed.substring(colonIdx + 1).trim()) || 0;

      let accNo = '';



      if (methodFull.endsWith(')')) {

        const pIdx = methodFull.lastIndexOf('(');

        if (pIdx !== -1) {

          accNo = methodFull.substring(pIdx + 1, methodFull.length - 1).trim();

          methodFull = methodFull.substring(0, pIdx).trim();

        }

      }

      result.push({ method: methodFull, accNo, amount });

    } else {

      // Include all payment methods including "Credit" and "Credit Invoice"

      result.push({ method: trimmed, accNo: '', amount: 0 });

    }

  }

  return result;

}



function NewSale({ currentUser, saleToEdit, onSaveSuccess, onExit, onViewSalesList, onNewSale, isActive }) {
  const isEditing = !!saleToEdit;

  const salesVersion = useDataVersion('sales');

  const stockVer = useDataVersion('stock');

  const productVer = useDataVersion('products');



  // Stock inventory search modal state

  const [stockSearchModalOpen, setStockSearchModalOpen] = useState(false);

  const [stockSearchFilters, setStockSearchFilters] = useState({ search: '', brand: '', category: '', size: '' });

  const [stockSearchItems, setStockSearchItems] = useState([]);

  const [stockSearchLoading, setStockSearchLoading] = useState(false);

  const [stockModalSelectedIndex, setStockModalSelectedIndex] = useState(0);

  const [stockToastMsg, setStockToastMsg] = useState('');

  const stockSearchInputRef = useRef(null);

  const stockModalRowRefs = useRef({});



  const [invoiceNo, setInvoiceNo] = useState('');

  const [saleDate, setSaleDate] = useState(new Date());

  const [customerId, setCustomerId] = useState(null);

  const [customerName, setCustomerName] = useState('');

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

  useEffect(() => {
    loadCities();
  }, []);

  const [paymentMethod, setPaymentMethod] = useState('Cash');

  const [receivedPayments, setReceivedPayments] = useState([]);

  const [cashAccountNames, setCashAccountNames] = useState([]); // GL Cash account names for correct invoice print classification

  const [discount, setDiscount] = useState(0);

  const [extraDiscountPct, setExtraDiscountPct] = useState('');

  const [miscCharges, setMiscCharges] = useState(0);

  const [notes, setNotes] = useState('');



  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  useEffect(() => {
    if (customerModalOpen) {
      loadCities();
      setShowAddCity(false);
    }
  }, [customerModalOpen]);

  const [customerSearch, setCustomerSearch] = useState('');

  const [customerResults, setCustomerResults] = useState([]);

  const [inlineCustomerResults, setInlineCustomerResults] = useState([]);

  const [inlineCustomerSelectedIndex, setInlineCustomerSelectedIndex] = useState(-1);

  const [customerModalSelectedIndex, setCustomerModalSelectedIndex] = useState(-1);

  const [isPrintMode, setIsPrintMode] = useState(false);

  const [receiptSettings, setReceiptSettings] = useState(null);

  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  const [previewHTML, setPreviewHTML] = useState('');

  const [customerPrevBalance, setCustomerPrevBalance] = useState(0);



  useEffect(() => {

    if (customerName && !isEditing) {

      ipcRenderer.invoke('get-customer-balance', { customerName, customerId })

        .then(res => {

          setCustomerPrevBalance(res?.balance || 0);

        })

        .catch(() => setCustomerPrevBalance(0));

    } else if (!customerName) {

      setCustomerPrevBalance(0);

    }

  }, [customerName, customerId, isEditing]);



  // References

  const itemCodeRefs = useRef({});

  const [items, setItems] = useState([]);

  const isReturnOnlyInvoice = items.length > 0 && items.every(item => item.isReturn);

  const [message, setMessage] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [customerOpen, setCustomerOpen] = useState(false);

  // Tracks which row is selected — persists after blur so footer always shows info

  const [focusedItemIdx, setFocusedItemIdx] = useState(null);



  // Scan entry (bottom input)

  const [scanCode, setScanCode] = useState('');

  const [scanResults, setScanResults] = useState([]);

  const [showScanDrop, setShowScanDrop] = useState(false);



  // Return modal state

  const [showReturnModal, setShowReturnModal] = useState(false);

  const [returnSearch, setReturnSearch] = useState('');

  const [returnResults, setReturnResults] = useState([]);

  const [tempReturns, setTempReturns] = useState([]);

  const [manualReturnForm, setManualReturnForm] = useState({ description: '', qty: 1, rate: 0, discount: 0 });



  // Per-row code editing

  const [activeCodeRow, setActiveCodeRow] = useState(null);

  const [codeRowResults, setCodeRowResults] = useState([]);

  const [showCodeRowDrop, setShowCodeRowDrop] = useState(false);



  // N-Wizard state (inline row data)

  const [wizardReferenceData, setWizardReferenceData] = useState({ companies: [], sizes: [], profitRules: [] });



  // Invoice Discount Overrides

  const getPersistedDiscounts = () => {

    const defaults = { overallPct: '', brands: {}, flatAmount: '' };

    try {

      const d = localStorage.getItem('persisted_invoice_discounts');

      return d ? { ...defaults, ...JSON.parse(d) } : defaults;

    } catch {

      return defaults;

    }

  };

  const [invoiceDiscounts, setInvoiceDiscounts] = useState(getPersistedDiscounts);

  const [showInvoiceDiscountModal, setShowInvoiceDiscountModal] = useState(false);

  const [modalDiscounts, setModalDiscounts] = useState(getPersistedDiscounts);

  const [newOverrideBrand, setNewOverrideBrand] = useState('');

  const [newOverridePct, setNewOverridePct] = useState('');



  const scanRef = useRef(null);

  const tableWrapRef = useRef(null);

  const codeRefs = useRef({});

  const packetsRefs = useRef({});

  const rateRefs = useRef({});

  const discountRefs = useRef({});

  const itemsRef = useRef([]);

  itemsRef.current = items;



  const customerNameRef = useRef(null);

  const customerPhoneRef = useRef(null);

  const customerNotesRef = useRef(null);

  const manualDescRef = useRef(null);

  const manualQtyRef = useRef(null);

  const manualRateRef = useRef(null);

  const newCustPhoneRef = useRef(null);

  const newCustCityRef = useRef(null);

  const inlineCustomerItemRefs = useRef([]);

  const customerModalItemRefs = useRef([]);



  // ── Load / clock ──────────────────────────────────────────────────────────

  useEffect(() => {

    if (inlineCustomerSelectedIndex >= 0) {

      inlineCustomerItemRefs.current[inlineCustomerSelectedIndex]?.scrollIntoView({ block: 'nearest' });

    }

  }, [inlineCustomerSelectedIndex]);



  useEffect(() => {

    if (customerModalSelectedIndex >= 0) {

      customerModalItemRefs.current[customerModalSelectedIndex]?.scrollIntoView({ block: 'nearest' });

    }

  }, [customerModalSelectedIndex]);



  useEffect(() => {

    if (isEditing) {

      const s = saleToEdit;

      setSaleDate(parseLocalDate(s.created_at || s.sale_date));

      setInvoiceNo(s.invoice_no || '');

      setCustomerName(s.customer_name || '');

      setCustomerPhone(s.customer_phone || '');

      setPaymentMethod(s.payment_method || '');

      setReceivedPayments(parsePaymentMethodString(s.payment_method));

      // Extract cash account names from saved payment_method for correct print classification
      if (s.payment_method) {
        const parsedPayments = parsePaymentMethodString(s.payment_method);
        const digitalWallets = ['jazzcash', 'easypaisa', 'nayapay', 'sadapay', 'upaisa', 'sadaqat'];
        const cashMethodsFromSaved = parsedPayments
          .filter(p => {
            if (!p.method) return false;
            const m = p.method.toLowerCase();
            // Exclude digital wallets
            if (digitalWallets.some(wallet => m.includes(wallet))) return false;
            // Only include methods that are cash-related
            return m.includes('cash');
          })
          .map(p => p.method);
        if (cashMethodsFromSaved.length > 0) {
          setCashAccountNames(prev => [...new Set([...prev, ...cashMethodsFromSaved])]);
        }
      }

      setDiscount(s.discount || 0);

      setMiscCharges(s.misc_charges || 0);

      setNotes(s.notes || '');

      setCustomerPrevBalance(s.customer_prev_balance || 0);

      ipcRenderer.invoke('get-sale-items', s.id).then(async rows => {

        const mapped = rows.map(r => ({

          itemCode: r.item_code,

          itemDescription: r.item_description,

          packingQty: r.packing_qty || 0,

          packets: Math.abs(r.packets),

          saleRate: parseFloat(r.sale_rate),

          purchaseRate: parseFloat(r.purchase_rate),

          discount: parseFloat(r.discount) || 0,

          baseDiscountAmt: parseFloat(r.discount) || 0,

          brand: r.brand || (r.item_description || '').split(' ')[0] || '',

          isReturn: parseInt(r.packets) < 0,

          amount: Math.abs(parseInt(r.packets)) * parseFloat(r.sale_rate) * (parseInt(r.packets) < 0 ? -1 : 1),

          stock: r.available_stock ?? null

        }));

        setItems(mapped);

        for (let i = 0; i < mapped.length; i++) {

          try {

            const st = await ipcRenderer.invoke('get-stock-single', mapped[i].itemCode);

            setItems(prev => prev.map((item, idx) => idx === i ? { ...item, stock: st } : item));

          } catch (e) { }

        }

      });

    } else {

      ipcRenderer.invoke('get-next-invoice-no').then(n => setInvoiceNo(n)).catch(() => { });

      const t = setInterval(() => setSaleDate(new Date()), 1000);

      return () => clearInterval(t);

    }

  }, [saleToEdit, salesVersion]);



  useEffect(() => {

    ipcRenderer.invoke('get-receipt-settings').then(res => {

      setReceiptSettings(res || {});

    }).catch(() => { });

  }, []);

  // Fetch GL Cash account names on mount so isCashPaymentMethod works for saved invoices
  useEffect(() => {
    ipcRenderer.invoke('get-gl-accounts').then(accounts => {
      if (accounts && Array.isArray(accounts)) {
        const cashNames = accounts.filter(a => a.account_type === 'Cash').map(a => a.account_name);
        if (cashNames.length > 0) setCashAccountNames(cashNames);
      }
    }).catch(() => { });
  }, []);



  useEffect(() => {

    if (!isActive) return;

    Promise.all([

      ipcRenderer.invoke('get-brands').catch(() => []),

      ipcRenderer.invoke('get-size-ranges').catch(() => []),

      ipcRenderer.invoke('get-profit-rules').catch(() => []),

      ipcRenderer.invoke('get-overall-profit').catch(() => null)

    ]).then(([comps, sizes, rules, overall]) => {

      setWizardReferenceData({

        companies: comps.map(c => typeof c === 'string' ? c : c.name || ''),

        sizes: sizes.map(s => typeof s === 'string' ? s : s.name || ''),

        profitRules: rules || [],

        overallProfit: overall || { enabled: false, profit_pct: 0, discount_pct: 0 }

      });

    });

  }, [isActive]);



  useEffect(() => {

    if (!isActive) return;

    const handleKeyDown = (e) => {

      if (e.key === 'F4') {

        e.preventDefault();

        e.stopPropagation();

        setCustomerModalOpen(true);

      } else if (e.key === 'F8') {

        e.preventDefault();

        e.stopPropagation();

        setStockSearchModalOpen(true);

      }

    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => window.removeEventListener('keydown', handleKeyDown, true);

  }, [isActive]);



  // Auto-scroll and refocus scan after item count changes

  useEffect(() => {

    setTimeout(() => {

      const active = document.activeElement;

      const isInRow = active?.classList.contains('qty-field') ||

        active?.classList.contains('rate-field') ||

        active?.classList.contains('code-field') ||

        active?.classList.contains('n-field');

      if (!isInRow) scanRef.current?.focus();

      const wrap = tableWrapRef.current;

      if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });

    }, 80);

  }, [items.length]);



  // ── Scan input (bottom) ───────────────────────────────────────────────────

  const handleScanChange = (val) => {

    setScanCode(val);

  };



  const handleReturnSearch = async (val) => {

    setReturnSearch(val);

    if (!val.trim()) { setReturnResults([]); return; }

    const results = await ipcRenderer.invoke('search-products', val);

    setReturnResults(results || []);

  };



  const addReturnProduct = (product) => {

    const pkts = product.packing_qty || 1;

    const rate = parseFloat(product.sale_rate) || 0;

    const purRate = Math.round((parseFloat(product.actual_cost) || parseFloat(product.purchase_rate) || 0) * 100) / 100;

    const baseDisc = parseFloat(product.discount) || 0;



    const draftItem = {

      id: Date.now() + Math.random(),

      itemCode: product.item_code,

      itemDescription: descForProduct(product),

      packingQty: pkts,

      packets: pkts,

      saleRate: rate,

      purchaseRate: purRate,

      discount: baseDisc,

      baseDiscountAmt: baseDisc,

      brand: product.brand || '',

      isReturn: true,

      stock: product.available_stock ?? product.stock_qty ?? null

    };

    draftItem.discount = calculateEffectiveDiscount(draftItem, invoiceDiscounts);

    draftItem.amount = calcAmount(draftItem);



    setTempReturns(prev => [...prev, draftItem]);

    setReturnSearch('');

    setReturnResults([]);

  };



  const handleAddManualReturn = () => {

    if (!manualReturnForm.description) return;

    const pkts = parseInt(manualReturnForm.qty) || 1;

    const rate = parseFloat(manualReturnForm.rate) || 0;

    const disc = parseFloat(manualReturnForm.discount) || 0;



    const draftItem = {

      id: Date.now() + Math.random(),

      itemCode: 'M-RET',

      itemDescription: manualReturnForm.description,

      packingQty: 1,

      packets: pkts,

      saleRate: rate,

      purchaseRate: 0,

      discount: disc,

      baseDiscountAmt: disc,

      brand: '',

      isReturn: true,

      stock: null

    };

    draftItem.discount = calculateEffectiveDiscount(draftItem, invoiceDiscounts);

    draftItem.amount = calcAmount(draftItem);



    setTempReturns(prev => [...prev, draftItem]);

    setManualReturnForm({ description: '', qty: 1, rate: 0, discount: 0 });

  };



  const removeTempReturn = (id) => {

    setTempReturns(prev => prev.filter(r => r.id !== id));

  };



  const commitReturns = () => {

    if (tempReturns.length > 0) {

      setItems(prev => {

        const newItems = [...prev, ...tempReturns];

        setFocusedItemIdx(newItems.length - 1);

        return newItems;

      });

      // Fetch stock for coded items

      tempReturns.forEach(ret => {

        if (ret.itemCode !== 'M-RET') {

          ipcRenderer.invoke('get-stock-single', ret.itemCode)

            .then(st => setItems(curr => curr.map((item) => (item.itemCode === ret.itemCode && item.isReturn) ? { ...item, stock: st } : item)))

            .catch(() => { });

        }

      });

    }

    setTempReturns([]);

    setShowReturnModal(false);

    setReturnSearch('');

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

      setTempReturns([]);

    }

  };



  const addProduct = (product) => {

    const pkts = product.packing_qty || 1;

    const rate = parseFloat(product.sale_rate) || 0;

    const purRate = Math.round((parseFloat(product.actual_cost) || parseFloat(product.purchase_rate) || 0) * 100) / 100;

    const newIdx = itemsRef.current.length;

    const draftItem = {

      itemCode: product.item_code,

      itemDescription: descForProduct(product),

      packingQty: pkts,

      packets: pkts,

      saleRate: rate,

      purchaseRate: purRate,

      discount: parseFloat(product.discount) || 0,

      baseDiscountAmt: parseFloat(product.discount) || 0,

      brand: product.brand || (product.item_description || '').split(' ')[0] || '',

      isReturn: false,

      stock: product.available_stock ?? product.stock_qty ?? null

    };



    draftItem.discount = calculateEffectiveDiscount(draftItem, invoiceDiscounts);

    draftItem.amount = calcAmount(draftItem);



    setItems(prev => [...prev, draftItem]);

    setFocusedItemIdx(newIdx);

    setScanCode('');

    setScanResults([]);

    setShowScanDrop(false);



    ipcRenderer.invoke('get-stock-single', product.item_code)

      .then(st => setItems(prev => prev.map((item, i) => i === newIdx ? { ...item, stock: st } : item)))

      .catch(() => { });



    // Return focus to scan so next item can be typed immediately

    setTimeout(() => scanRef.current?.focus(), 50);

  };



  // ── Stock Search Modal Logic ────────────────────────────────────────────────

  const loadStockForSearch = async () => {

    setStockSearchLoading(true);

    try {

      const res = await ipcRenderer.invoke('get-stock-list-chunked', { limit: 100, offset: 0 });

      if (res && res.items) {

        setStockSearchItems(res.items);

        setStockSearchLoading(false);

        if (res.total > 100) {

          const remaining = await ipcRenderer.invoke('get-stock-list');

          setStockSearchItems(remaining || []);

        }

      } else {

        setStockSearchLoading(false);

      }

    } catch (e) {

      setStockSearchLoading(false);

    }

  };



  useEffect(() => {

    if (stockSearchModalOpen) {

      setStockSearchFilters({ search: '', brand: '', category: '', size: '' });

      setStockModalSelectedIndex(0);

      loadStockForSearch();

      setTimeout(() => stockSearchInputRef.current?.focus(), 50);

    }

  }, [stockSearchModalOpen, stockVer, productVer]);



  const filteredStockItems = useMemo(() => {

    const s = stockSearchFilters.search.toLowerCase().trim();

    const b = stockSearchFilters.brand.toLowerCase().trim();

    const c = stockSearchFilters.category.toLowerCase().trim();

    const sz = stockSearchFilters.size.toLowerCase().trim();



    let res = stockSearchItems.filter(p => {

      if (s && !(p.item_code || '').toLowerCase().includes(s) && !(p.description || '').toLowerCase().includes(s)) return false;

      if (b && !(p.brand || '').toLowerCase().includes(b)) return false;

      if (c && !(p.category || '').toLowerCase().includes(c)) return false;

      if (sz && !(p.size_range || '').toLowerCase().includes(sz)) return false;

      return true;

    });



    if (s) {

      res.sort((a, b) => {

        const aCode = (a.item_code || '').toLowerCase();

        const bCode = (b.item_code || '').toLowerCase();

        if (aCode === s && bCode !== s) return -1;

        if (bCode === s && aCode !== s) return 1;

        const aStarts = aCode.startsWith(s);

        const bStarts = bCode.startsWith(s);

        if (aStarts && !bStarts) return -1;

        if (bStarts && !aStarts) return 1;

        return 0;

      });

    }



    return res;

  }, [stockSearchItems, stockSearchFilters]);



  useEffect(() => {

    if (stockSearchModalOpen) {

      setStockModalSelectedIndex(filteredStockItems.length > 0 ? 0 : -1);

    }

  }, [filteredStockItems, stockSearchModalOpen]);



  useEffect(() => {

    if (stockSearchModalOpen && stockModalSelectedIndex >= 0) {

      const el = stockModalRowRefs.current[stockModalSelectedIndex];

      if (el) {

        el.scrollIntoView({ block: 'nearest' });

      }

    }

  }, [stockModalSelectedIndex, stockSearchModalOpen]);



  const totalStockSearchValue = useMemo(() => {

    return filteredStockItems.reduce((sum, p) => sum + ((p.stock_packets || 0) * (parseFloat(p.purchase_rate) || 0)), 0);

  }, [filteredStockItems]);



  const handleAddStockItemToSale = (product) => {

    if (!product) return;

    addProduct(product);

    setStockSearchModalOpen(false);

    setTimeout(() => {

      if (scanRef.current) {

        scanRef.current.focus();

        scanRef.current.select?.();

      }

    }, 50);

  };



  // Dedicated capture-phase Esc key listener for Stock Search Modal

  useEffect(() => {

    if (!stockSearchModalOpen) return;



    const handleStockSearchEsc = (e) => {

      if (e.key === 'Escape' || e.code === 'Escape') {

        e.preventDefault();

        e.stopPropagation();

        e.stopImmediatePropagation();

        setStockSearchModalOpen(false);

        setTimeout(() => {

          if (scanRef.current) {

            scanRef.current.focus();

            scanRef.current.select?.();

          }

        }, 50);

      }

    };



    window.addEventListener('keydown', handleStockSearchEsc, true);

    return () => window.removeEventListener('keydown', handleStockSearchEsc, true);

  }, [stockSearchModalOpen]);



  const handleStockModalKeyDown = (e) => {

    if (e.key === 'ArrowDown') {

      e.preventDefault();

      setStockModalSelectedIndex(prev => Math.min(prev + 1, Math.min(filteredStockItems.length - 1, 149)));

    } else if (e.key === 'ArrowUp') {

      e.preventDefault();

      setStockModalSelectedIndex(prev => Math.max(prev - 1, 0));

    } else if (e.key === 'Enter') {

      e.preventDefault();

      if (filteredStockItems.length > 0) {

        const idx = stockModalSelectedIndex >= 0 ? stockModalSelectedIndex : 0;

        if (filteredStockItems[idx]) {

          handleAddStockItemToSale(filteredStockItems[idx]);

        }

      }

    } else if (e.key === 'Escape') {

      e.preventDefault();

      e.stopPropagation();

      e.stopImmediatePropagation();

      setStockSearchModalOpen(false);

      setTimeout(() => scanRef.current?.focus(), 50);

    }

  };



  const handleScanKD = async (e) => {

    if (e.key === 'Enter') {

      e.preventDefault();

      const trimmed = scanCode.trim();

      if (!trimmed) return;



      if (trimmed.toLowerCase() === 'n') {

        const newIdx = itemsRef.current.length;

        setItems(prev => [...prev, {

          itemCode: 'N',

          itemDescription: '',

          packingQty: 1,

          packets: 1,

          saleRate: 0,

          purchaseRate: 0,

          discount: 0,

          isReturn: false,

          amount: 0,

          stock: null,

          isPlaceholderN: true,

          nBrand: '',

          nCategory: '',

          nSize: '',

          nPurchaseRate: ''

        }]);

        setScanCode('');

        setFocusedItemIdx(newIdx);

        setTimeout(() => document.getElementById(`n-brand-${newIdx}`)?.focus(), 50);

        return;

      }



      const results = await ipcRenderer.invoke('search-products', trimmed);

      if (results && results.length > 0) {

        const exact = results.find(r => r.item_code.toLowerCase() === trimmed.toLowerCase());

        addProduct(exact || results[0]);

      } else {

        setMessage(`Product not found: ${trimmed}`);

        setTimeout(() => setMessage(''), 3000);

      }

      return;

    }

    if (e.key === 'Escape') { setScanCode(''); return; }

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

        packingQty: pkts,

        packets: pkts,

        saleRate: rate,

        purchaseRate: purRate,

        discount: baseDisc,

        baseDiscountAmt: baseDisc,

        brand: product.brand || '',

        isReturn: false,

        stock: product.available_stock ?? product.stock_qty ?? null

      };



      draftItem.discount = calculateEffectiveDiscount(draftItem, invoiceDiscounts);

      draftItem.amount = calcAmount(draftItem);



      return draftItem;

    }));



    setShowCodeRowDrop(false);

    setActiveCodeRow(null);

    setFocusedItemIdx(idx);

    setTimeout(() => packetsRefs.current[idx]?.focus(), 30);



    ipcRenderer.invoke('get-stock-single', product.item_code)

      .then(st => setItems(prev => prev.map((item, i) => i === idx ? { ...item, stock: st } : item)))

      .catch(() => { });

  };



  const handleCodeKD = (e, idx) => {

    if (e.key === 'Enter') {

      e.preventDefault();

      const codeVal = e.target.value?.trim()?.toLowerCase() || items[idx]?.itemCode?.trim()?.toLowerCase();

      if (codeVal === 'n') {

        updateItemData(idx, {

          itemCode: 'N',

          isPlaceholderN: true,

          nBrand: '',

          nCategory: '',

          nSize: '',

          nPurchaseRate: ''

        });

        setTimeout(() => document.getElementById(`n-brand-${idx}`)?.focus(), 50);

        return;

      }



      if (showCodeRowDrop && codeRowResults.length > 0) {
        // Prefer exact code match, fallback to first result
        const exact = codeRowResults.find(r => r.item_code.toLowerCase() === codeVal);
        fillRow(idx, exact || codeRowResults[0]);
        return;
      }

      // No dropdown — move to packing

      packetsRefs.current[idx]?.focus();

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



  // ── Packing / Rate row editing ────────────────────────────────────────────

  const roundToFive = (num) => Math.round((parseFloat(num) || 0) / 5) * 5;



  const calculateEffectiveDiscount = (item, discountsOverride) => {

    if (item.isPlaceholderN || item.itemCode === 'N') return parseFloat(item.discount) || 0;



    // Flat amount: same discount value applied to every item, overrides % based rules below.

    if (discountsOverride.flatAmount !== '' && discountsOverride.flatAmount !== null && discountsOverride.flatAmount !== undefined) {

      const flat = parseFloat(discountsOverride.flatAmount);

      if (!isNaN(flat)) return flat;

    }



    const brand = item.brand || item.nBrand || '';



    let overridePct = null;

    if (brand && discountsOverride.brands && discountsOverride.brands[brand] !== undefined) {

      overridePct = parseFloat(discountsOverride.brands[brand]);

    } else if (discountsOverride.overallPct !== '' && discountsOverride.overallPct !== null) {

      overridePct = parseFloat(discountsOverride.overallPct);

    }



    if (overridePct !== null) {

      const rawDisc = parseFloat(item.saleRate) * overridePct / 100;

      return roundToFive(rawDisc) || 0;

    }

    return parseFloat(item.baseDiscountAmt) || 0;

  };



  const calcAmount = (item) => {

    const p = parseInt(item.packets) || 0;

    const actualP = item.isReturn ? -Math.abs(p) : Math.abs(p);

    const r = parseFloat(item.saleRate) || 0;

    return actualP * r;

  };



  function makeRow() {

    return { id: nextId(), itemCode: '', itemDescription: '', packingQty: 0, packets: '', saleRate: 0, purchaseRate: 0, discount: 0, isReturn: false, amount: 0 };

  }



  useEffect(() => {

    setItems(prev => {

      // Avoid infinite loop if no changes actually occur

      let changed = false;

      const nextItems = prev.map(item => {

        if (item.isPlaceholderN || item.itemCode === 'N') return item;

        const newDisc = calculateEffectiveDiscount(item, invoiceDiscounts);

        if (newDisc !== item.discount) {

          changed = true;

          const newItem = { ...item, discount: newDisc };

          return { ...newItem, amount: calcAmount(newItem) };

        }

        return item;

      });

      return changed ? nextItems : prev;

    });

  }, [invoiceDiscounts]);



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



  const updateItemData = (idx, data) => {

    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...data } : item));

  };



  const calculateNRow = (idx) => {

    setItems(prev => prev.map((item, i) => {

      if (i !== idx) return item;

      const pr = parseFloat(item.nPurchaseRate) || 0;



      const company = item.nBrand || '';

      const cat = item.nCategory || '';

      const sr = item.nSize || '';

      const overall = wizardReferenceData.overallProfit || {};



      const findVal = (field) => {

        if (!company) return overall.enabled ? (parseFloat(overall[field]) || 0) : 0;

        const m1 = wizardReferenceData.profitRules.find(r => r.company_name === company && r.category === cat && r.size_range === sr);

        if (m1) return parseFloat(m1[field]) || 0;

        const m2 = wizardReferenceData.profitRules.find(r => r.company_name === company && (!r.category || r.category === '') && r.size_range === sr && sr);

        if (m2) return parseFloat(m2[field]) || 0;

        const m3 = wizardReferenceData.profitRules.find(r => r.company_name === company && (!r.category || r.category === '') && (!r.size_range || r.size_range === ''));

        if (m3) return parseFloat(m3[field]) || 0;

        return overall.enabled ? (parseFloat(overall[field]) || 0) : 0;

      };



      const profitPct = findVal('profit_pct');

      const discountPct = findVal('discount_pct');



      const roundToFive = (num) => Math.round(num / 5) * 5;



      const rawSale = pr + (pr * profitPct / 100);

      const saleRate = roundToFive(rawSale);

      const disc = discountPct > 0 ? roundToFive(saleRate * discountPct / 100) : 0;



      const rawCat = (item.nCategory || '').replace(/^D-/i, '').trim();

      const catFormatted = rawCat ? `D-${rawCat}` : '';

      const desc = `${item.nBrand || ''} ${catFormatted} ${item.nSize || ''}`.replace(/\s+/g, ' ').trim();



      const newItem = {

        ...item,

        itemDescription: desc,

        purchaseRate: pr,

        saleRate: saleRate,

        discount: disc,

        baseDiscountAmt: disc,

        brand: item.nBrand || '',

        isPlaceholderN: false

      };

      newItem.discount = calculateEffectiveDiscount(newItem, invoiceDiscounts);

      newItem.amount = calcAmount(newItem);

      return newItem;

    }));

    setTimeout(() => packetsRefs.current[idx]?.focus(), 50);

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

      if (field === 'discount') {

        if (idx >= rows.length - 1) scanRef.current?.focus();

        else discountRefs.current[idx + 1]?.focus();

      }

      return;

    }

    if (e.key === 'ArrowDown') {

      e.preventDefault();

      // Stay in same column — packing stays packing, rate stays rate, discount stays discount

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

      // Stay in same column

      if (field === 'packets' && idx > 0) packetsRefs.current[idx - 1]?.focus();

      if (field === 'rate' && idx > 0) rateRefs.current[idx - 1]?.focus();

      if (field === 'discount' && idx > 0) discountRefs.current[idx - 1]?.focus();

    }

  };



  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {

    const subTotal = items.reduce((s, i) => s + i.amount, 0);

    const itemDiscounts = items.reduce((s, i) => {

      const p = parseInt(i.packets) || 0;

      const actualP = i.isReturn ? -Math.abs(p) : Math.abs(p);

      return s + (actualP * (parseFloat(i.discount) || 0));

    }, 0);

    const totalQty = items.reduce((s, i) => {
      const p = parseInt(i.packets) || 0;
      return s + (i.isReturn ? 0 : Math.abs(p));
    }, 0);

    const totalPackets = Math.round(items.reduce((s, i) => {
      if (i.isReturn) return s;
      const qty = Math.abs(parseFloat(i.packets) || 0);
      const packing = parseFloat(i.packingQty) || 1;
      return s + (packing > 0 ? (qty / packing) : qty);
    }, 0));

    const totalReturnQty = items.reduce((s, i) => i.isReturn ? s + Math.abs(parseInt(i.packets) || 0) : s, 0);

    const totalReturnAmount = items.reduce((s, i) => i.isReturn ? s + Math.abs(i.amount) : s, 0);

    const extraDiscountAmt = parseFloat(discount) || 0;

    const miscAmt = parseFloat(miscCharges) || 0;

    // Percentage discount is applied on top of the subtotal net of item-level

    // discounts and misc charges, independently of the flat "Extra Disc" amount.

    const preExtraPctTotal = subTotal + miscAmt - itemDiscounts;

    const extraDiscountPctAmt = roundToFive(preExtraPctTotal * (parseFloat(extraDiscountPct) || 0) / 100);

    const totalDiscountAmt = itemDiscounts + extraDiscountAmt + extraDiscountPctAmt;

    const grandTotal = subTotal + miscAmt - totalDiscountAmt;

    return { subTotal, itemDiscounts, totalDiscountAmt, totalQty, totalPackets, grandTotal, totalReturnQty, totalReturnAmount };

  }, [items, discount, extraDiscountPct, miscCharges]);



  // ── Submit ────────────────────────────────────────────────────────────────

  const executeSave = async (paymentMethodStr) => {

    setIsSubmitting(true);

    const payload = {

      saleDate: getLocalDateString(saleDate),

      invoiceNo, customerId, customerName, customerPhone,

      items: items.map(i => {

        const pkts = Math.abs(parseInt(i.packets) || 0);

        const gross = pkts * (parseFloat(i.saleRate) || 0);

        const disc = pkts * (parseFloat(i.discount) || 0);

        const netAmt = gross - disc;

        return {

          ...i,

          packets: i.isReturn ? -pkts : pkts,

          amount: i.isReturn ? -Math.abs(netAmt) : Math.abs(netAmt)

        };

      }),

      discount: (totals.totalDiscountAmt - totals.itemDiscounts) || 0,

      miscCharges: parseFloat(miscCharges) || 0,

      paymentMethod: paymentMethodStr, notes,

      userId: currentUser?.id,

      customerPrevBalance: customerPrevBalance

    };

    try {

      const result = isEditing

        ? await ipcRenderer.invoke('update-sale', { ...payload, id: saleToEdit.id })

        : await ipcRenderer.invoke('save-sale', payload);

      if (result.success) {

        if (result.invoiceNo && !isEditing) {

          setInvoiceNo(result.invoiceNo);

        }

        onSaveSuccess?.();

      }

      else { setMessage(result.error || 'Failed to save'); setIsSubmitting(false); }

    } catch (err) {

      setMessage(err.message || 'Error');

      setIsSubmitting(false);

    }

  };



  const handleDeleteSale = async () => {

    if (!saleToEdit) return;

    const confirmed = await ipcRenderer.invoke('confirm-dialog', `Delete invoice ${saleToEdit.invoice_no}? This will permanently remove this sale.`);

    if (!confirmed) return;



    try {

      const result = await ipcRenderer.invoke('delete-sale', saleToEdit.id);

      if (result?.success) {

        setMessage('Sale deleted successfully');

        setTimeout(() => onSaveSuccess?.(), 1000);

      } else {

        setMessage('Failed to delete sale');

      }

    } catch (err) {

      setMessage('Error deleting sale');

    }

  };



  const handlePaymentConfirm = async (paymentData) => {

    const paymentMethodStr = paymentData.payments.length > 0

      ? paymentData.payments.map(p => {

        const accStr = p.accNo ? ` (${p.accNo})` : '';

        return `${p.method}${accStr}: ${p.amount}`;

      }).join(', ')

      : 'Credit';



    setReceivedPayments(paymentData.payments);

    setPaymentMethod(paymentMethodStr);

    // Store cash account names so invoice print can classify cash vs bank correctly

    if (paymentData.cashAccountNames) {

      setCashAccountNames(paymentData.cashAccountNames);

    }



    await executeSave(paymentMethodStr);

    setPaymentModalOpen(false);



    if (isPrintMode) {

      await printReceipt(paymentData);

    }

  };



  const handleSubmit = () => {

    if (items.length === 0) { setMessage('Add at least one item'); return; }

    if (isReturnOnlyInvoice) {

      setIsPrintMode(false);

      executeSave('Return Invoice');

      return;

    }

    setIsPrintMode(false);

    setPaymentModalOpen(true);

  };



  const handlePreview = () => {

    if (items.length === 0) { setMessage('Add at least one item'); return; }

    setPreviewHTML(generateInvoiceHTML({ payments: receivedPayments, cashAccountNames }));

    setShowReceiptPreview(true);

  };



  const [isSavingPdf, setIsSavingPdf] = useState(false);



  const handleSaveInvoicePdf = async () => {

    const html = generateInvoiceHTML({ payments: receivedPayments, cashAccountNames });

    setIsSavingPdf(true);

    try {

      const result = await ipcRenderer.invoke('save-invoice-pdf', { html, fileName: `Invoice-${invoiceNo || 'Draft'}.pdf` });

      if (result.success) {

        setMessage('Invoice saved as PDF');

        setTimeout(() => setMessage(''), 3000);

      } else if (!result.canceled) {

        setMessage('Failed to save PDF: ' + (result.error || 'Unknown error'));

        setTimeout(() => setMessage(''), 3000);

      }

    } catch (err) {

      setMessage('Error saving PDF');

      setTimeout(() => setMessage(''), 3000);

    } finally {

      setIsSavingPdf(false);

    }

  };



  const [isPrintingFromPreview, setIsPrintingFromPreview] = useState(false);

  const handlePrintFromPreview = async () => {

    if (isPrintingFromPreview) return; // prevent double-click

    setIsPrintingFromPreview(true);

    const html = generateInvoiceHTML({ payments: receivedPayments, cashAccountNames });

    try {

      const result = await ipcRenderer.invoke('print-receipt', html);

      if (!result.success) {

        setMessage('Print failed: ' + result.error);

      } else {

        setMessage('Print successful');

      }

      setTimeout(() => setMessage(''), 3000);

    } catch (err) {

      setMessage('Error during printing');

      setTimeout(() => setMessage(''), 3000);

    } finally {

      setIsPrintingFromPreview(false);

    }

  };



  const handlePrint = () => {

    if (items.length === 0) { setMessage('Add at least one item'); return; }

    if (isReturnOnlyInvoice) {

      setIsPrintMode(true);

      executeSave('Return Invoice');

      return;

    }

    setIsPrintMode(true);

    setPaymentModalOpen(true);

  };



  const printReceipt = async (paymentData) => {

    try {

      const html = generateInvoiceHTML(paymentData);

      const result = await ipcRenderer.invoke('print-receipt', html);

      if (!result.success) {

        setMessage('Print failed: ' + result.error);

      } else {

        setMessage('Print successful');

      }

      setTimeout(() => setMessage(''), 3000);

    } catch (err) {

      console.error(err);

      setMessage('Error during printing');

      setTimeout(() => setMessage(''), 3000);

    }

  };



  const generateInvoiceHTML = (paymentData) => {

    const d = new Date();

    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${d.toLocaleTimeString('en-US', { hour12: false })}`;



    const formatAmt = (num) => parseFloat(num).toFixed(2).replace(/\.00$/, '');



    const visibleItems = items.filter(item => item.itemCode || item.itemDescription);



    // hasItemDiscount: controls the per-item Disc column — only shown when

    // at least one item actually has its own discount value. Invoice-level

    // extra discounts (flat or %) don't apply per-item, so they shouldn't

    // force this column to appear (it would just show zeros on every row).

    const hasItemDiscount = items.some(item => (parseFloat(item.discount) || 0) !== 0);

    // hasAnyDiscount: controls the "Total Discount" summary line — shown

    // whenever there's a discount anywhere, including invoice-level ones.

    const hasAnyDiscount = hasItemDiscount

      || (parseFloat(discount) || 0) !== 0

      || (parseFloat(extraDiscountPct) || 0) !== 0;

    const hasDiscount = hasItemDiscount;



    // ── Dynamic Pagination ──────────────────────────────────────────────────

    // ── Dynamic Pagination Rules ──────────────────────────────────────────

    // 1. Single-page limit: 16 items ONLY for Master Cashier mode when customer has a previous balance,

    //    otherwise 20 items for standard invoices.

    // 2. Multi-page invoice: Page 1 holds 20 items.

    // 3. Middle pages: Hold up to 30 items.

    // 4. Last page of a multi-page invoice: Holds up to 25 items max.



    const useMasterCashier = (currentUser?.permissions || []).includes('use_master_cashier');

    const isMasterCashierWithPrevBalance = useMasterCashier && customerPrevBalance && parseFloat(customerPrevBalance) !== 0;



    const SINGLE_PAGE_MAX = isMasterCashierWithPrevBalance ? 16 : 20;

    const FIRST_PAGE_MULTI_MAX = 20;

    const LAST_PAGE_MULTI_MAX = 25;

    const MIDDLE_PAGE_MAX = 30;



    const chunks = [];

    let remainingItems = [...visibleItems];



    if (remainingItems.length === 0) {

      chunks.push([]);

    } else if (remainingItems.length <= SINGLE_PAGE_MAX) {

      // Single-page invoice: Page 1 is both first & last page (up to 16 items)

      chunks.push(remainingItems);

    } else {

      // Multi-page invoice:

      // Page 1 gets 20 items. However if total items is 17..20, Page 1 takes 16

      // so it cleanly splits into 2 pages with the last page getting the remaining 1..4 items.

      const p1Take = (remainingItems.length <= FIRST_PAGE_MULTI_MAX) ? SINGLE_PAGE_MAX : FIRST_PAGE_MULTI_MAX;

      chunks.push(remainingItems.slice(0, p1Take));

      remainingItems = remainingItems.slice(p1Take);



      // Subsequent pages

      while (remainingItems.length > 0) {

        if (remainingItems.length <= LAST_PAGE_MULTI_MAX) {

          // Last page gets up to 25 items

          chunks.push(remainingItems);

          remainingItems = [];

        } else {

          // Middle page gets up to 30 items.

          // If remaining is 26..30, take 25 so the last page gets 1..5 items (never exceeds 25).

          let take = MIDDLE_PAGE_MAX;

          if (remainingItems.length > LAST_PAGE_MULTI_MAX && remainingItems.length <= MIDDLE_PAGE_MAX) {

            take = LAST_PAGE_MULTI_MAX;

          }

          chunks.push(remainingItems.slice(0, take));

          remainingItems = remainingItems.slice(take);

        }

      }

    }



    const isSinglePage = chunks.length === 1;

    const lastChunkSize = chunks[chunks.length - 1]?.length || 0;

    const compactSignatures = isSinglePage

      ? lastChunkSize >= 14

      : lastChunkSize >= 22;



    const tableHeaderRowHtml = `

      <tr>

        <th style="width: 5%;">S.No</th>

        <th style="width: ${hasDiscount ? 52 : 58}%;">Item Name</th>

        <th style="width: 12%;">Item.No</th>

        <th style="width: 6%;">Qty</th>

        <th style="width: 8%;">Price</th>

        ${hasDiscount ? '<th style="width: 6%;">Disc</th>' : ''}

        <th style="width: 11%;">Total</th>

      </tr>

    `;



    const rowHtml = (item, globalIndex) => {

      const rate = parseFloat(item.saleRate) || 0;

      const qty = parseFloat(item.packets) || 0;

      const disc = parseFloat(item.discount) || 0;

      const isRet = item.isReturn;

      const rowStyle = isRet ? ' style="background-color: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;"' : '';

      return `

        <tr${rowStyle}>

          <td>${globalIndex + 1}</td>

          <td class="left item-name">

            ${item.itemDescription || ''}

            ${isRet ? '<span style="font-size: 11px; margin-left: 4px; font-weight: bold;">(RET)</span>' : ''}

          </td>

          <td>${item.itemCode}</td>

          <td>${Math.abs(qty)}</td>

          <td class="right">${formatAmt(rate)}</td>

          ${hasDiscount ? `<td class="right">${disc !== 0 ? formatAmt(Math.abs(disc)) : ''}</td>` : ''}

          <td class="right">${formatAmt(Math.abs(item.amount))}</td>

        </tr>

      `;

    };



    // Calculate payment breakdown

    // A payment is "cash" if its method is 'Cash Received', 'cash', or matches a known Cash GL account name

    const knownCashNames = cashAccountNames || paymentData?.cashAccountNames || [];

    const isCashPaymentMethod = (method) => {

      if (!method) return false;

      const m = method.toLowerCase().trim();

      // Exclude digital wallet services that contain 'cash' but are bank payments
      const digitalWallets = ['jazzcash', 'easypaisa', 'nayapay', 'sadapay', 'upaisa', 'sadaqat'];
      if (digitalWallets.some(wallet => m.includes(wallet))) return false;

      // Check if method is exactly 'cash received' or 'cash'
      if (m === 'cash received' || m === 'cash') return true;

      // Check if method starts with 'cash ' (with space) or 'cash(' to handle cash accounts like 'Cash Account 1'
      // This excludes JazzCash since it doesn't have a space after 'cash'
      if (m.startsWith('cash ') || m.startsWith('cash(')) return true;

      // Check against known cash account names from state (extracted from saved payment_method)
      if (knownCashNames.some(n => n.toLowerCase() === method.toLowerCase())) return true;

      return false;

    };

    const payments = paymentData?.payments || [];

    const cashReceived = payments

      .filter(p => isCashPaymentMethod(p.method))

      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const bankReceived = payments

      .filter(p => !isCashPaymentMethod(p.method))

      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const totalReceived = cashReceived + bankReceived;

    const totalOwedBeforePayments = (customerPrevBalance !== 0 && useMasterCashier)
      ? (totals.grandTotal + parseFloat(customerPrevBalance || 0))
      : totals.grandTotal;

    const balanceAmount = totalOwedBeforePayments - totalReceived;

    const finalNetPayable = (useMasterCashier && balanceAmount > 0)
      ? balanceAmount
      : totalOwedBeforePayments;



    // Net Payable + footer notes — reused on every single page so it's

    // always pinned to the bottom of whichever page it's printed on.

    const pinnedFooterHtml = `

      <div class="net-payable">

        <div class="footer-notes-inside">

          ${(receiptSettings?.footerNotes || "THANKS FOR YOUR VISIT ****!!!!<br/>DON'T EXCHANGE DAMAGED ITEMS AND LOOSE PIECE NOTE: NO ANY RETURN<br/>BRANCH # 2 ..... SHOP NO # E-2028 KUCHA CHAH TAILIAN RANG MAHAL").replace(/\\n/g, '<br/>')}

        </div>

        <div class="net-payable-title">

          Net Payable Total Rs: ${formatAmt(finalNetPayable)}

        </div>

      </div>

    `;




    const isCreditSaleInvoice = receivedPayments.length === 0 || (paymentMethod && paymentMethod.toLowerCase().includes('credit'));

    const isReturnInvoice = isReturnOnlyInvoice || (paymentMethod && paymentMethod.toLowerCase().includes('return'));

    const defaultTitle = isReturnInvoice ? 'Return Invoice' : (isCreditSaleInvoice ? 'Credit Sale Invoice' : 'Cash Sale Invoice');

    const invoiceTitleToUse = receiptSettings?.invoiceTitle || defaultTitle;



    const headerBlockHtml = `

      <div class="header">

        <div class="page-num">Page 1 of ${chunks.length}</div>

        <h1>${receiptSettings?.shopName || 'AL - TOUHEED GARMENTS'}</h1>

        <div class="sub">${receiptSettings?.shopSub || 'SHOP NO E-2028 KUCHA CHAH TAILIAN RANG MAHAL LAHORE'}</div>

        <div class="title">${invoiceTitleToUse}</div>

        <div class="shop-info">

          ${(receiptSettings?.shopAddress || 'SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE<br/>CHOWK RANG MAHAL, LAHORE<br/>Phone #: (+92 42) 37639907').replace(/\n/g, '<br/>')}

        </div>

      </div>



      <div class="info-section">

        <div class="info-left">

          <div class="info-row" style="margin-bottom: 6px;"><span class="lbl" style="font-size: 16px; font-weight: 900;">Invoice No:</span> <span class="val" style="font-weight: 900; font-size: 20px; padding-left: 5px;">${getPrintedInvoiceNo(invoiceNo)}</span></div>

          <div class="info-row"><span class="lbl">Customer:</span> <span class="val">${customerName || 'Walk-in Customer'}</span></div>

          ${customerPhone ? `<div class="info-row"><span class="lbl">Phone:</span> <span class="val">${customerPhone}</span></div>` : ''}

        </div>

        <div class="info-right">

          <div class="info-row"><span class="lbl">Date:</span> <span class="val">${dateStr}</span></div>

          <div class="info-row"><span class="lbl">City:</span> <span class="val">${customerCity || ''}</span></div>

          <div class="info-row"><span class="lbl">No. of Bag:</span> <span class="val"></span></div>

        </div>

      </div>

    `;



    let pagesHtml = '';

    let currentStartIndex = 0;

    chunks.forEach((chunk, pageIdx) => {

      const isFirstPage = pageIdx === 0;

      const isLastPage = pageIdx === chunks.length - 1;

      const startIndex = currentStartIndex;

      currentStartIndex += chunk.length;

      const rows = chunk.map((item, i) => rowHtml(item, startIndex + i)).join('');



      const tfootHtml = isLastPage ? `
        <tfoot>
          <tr>
            <th style="border: none;"></th>
            <th style="text-align: left; border: none; padding-left: 5px; font-size: 13px; font-weight: 900;">Total Packets: ${totals.totalPackets}</th>
            <th style="text-align: right; border: none; padding-right: 10px; font-size: 12px; font-weight: 900;">Total Qty:</th>
            <th style="border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 13px; font-weight: 900; text-align: center;">${totals.totalQty}</th>
            <th colspan="${hasDiscount ? 3 : 2}" style="border: none;"></th>
          </tr>
        </tfoot>
      ` : '';



      // Totals + signatures only appear once, after the very last item —

      // never repeated on earlier pages.

      const totalsAndSignaturesHtml = isLastPage ? `

        <div class="totals-signatures ${compactSignatures ? 'compact' : ''}">

          <div class="summary">

            <div class="signatures-in-summary">

              <div class="sig-box">

                <div style="text-transform: uppercase;">${currentUser?.username || 'OPERATOR'}</div>

                <div class="sig-role">Operator</div>

              </div>

              <div class="sig-box">

                <div>SALES MAN</div>

                <div class="sig-role">Sales Man</div>

              </div>

              <div class="sig-box">

                <div style="visibility: hidden;">CHECKER</div>

                <div class="sig-role">Checker</div>

              </div>

            </div>

            <div style="width: 280px; margin-left: auto;">
              <div style="display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Subtotal:</strong></span>
                <span>${formatAmt(totals.subTotal + (totals.totalReturnAmount || 0))}</span>
              </div>
              ${hasAnyDiscount ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="white-space: nowrap;"><strong>Total Discount:</strong></span>
                  <span>${formatAmt(totals.totalDiscountAmt)}</span>
                </div>
              ` : ''}
              ${(totals.totalReturnQty > 0 || totals.totalReturnAmount > 0) ? `
                <div style="margin-top: 4px; text-align: right;">
                  <span style="background-color: #d1d5db; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                    <span style="margin-right: 15px;"><strong>Total Return Qty:</strong> ${totals.totalReturnQty}</span>
                    <span><strong>Return Amount:</strong> -${formatAmt(totals.totalReturnAmount)}</span>
                  </span>
                </div>
              ` : ''}
            </div>
          </div>

          ${(customerPrevBalance && parseFloat(customerPrevBalance) !== 0 && (currentUser?.permissions || []).includes('use_master_cashier')) ? `
            <div class="net-total" style="border-bottom: none; margin-bottom: 0;">
              <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Invoice Net Total:</strong></span>
                <span>${formatAmt(totals.grandTotal)}</span>
              </div>
            </div>
            <div class="net-total" style="margin-bottom: 0;">
              <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Previous Balance:</strong></span>
                <span>${customerPrevBalance > 0 ? '+' : '-'}${formatAmt(Math.abs(parseFloat(customerPrevBalance)))}</span>
              </div>
            </div>
            <div class="net-total" style="border-top: 1.5px solid #000; border-bottom: none; padding: 3px 6px; margin-top: 2px;">
              <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Total Amount Owed:</strong></span>
                <span>${formatAmt(totals.grandTotal + parseFloat(customerPrevBalance))}</span>
              </div>
            </div>
          ` : `
            <div class="net-total" style="border-bottom: none;">
              <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Invoice Net Total:</strong></span>
                <span>${formatAmt(totals.grandTotal)}</span>
              </div>
            </div>
          `}

          ${payments.length > 0 ? `
            <div class="net-total" style="margin-bottom: 0;">
              <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                <span style="white-space: nowrap;"><strong>Cash Received:</strong></span>
                <span>${formatAmt(cashReceived)}</span>
              </div>
            </div>
            ${bankReceived > 0 ? `
              <div class="net-total" style="margin-bottom: 0;">
                <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                  <span style="white-space: nowrap;"><strong>Bank / Online Received:</strong></span>
                  <span>${formatAmt(bankReceived)}</span>
                </div>
              </div>
            ` : ''}
            ${(Math.abs(balanceAmount) > 0.01) ? `
              <div class="net-total" style="border-top: 1.5px solid #000; border-bottom: 2.5px double #000; padding: 3px 6px; margin-top: 2px;">
                <div style="width: 280px; margin-left: auto; display: flex; justify-content: space-between;">
                  <span style="white-space: nowrap;"><strong>Balance:</strong></span>
                  <span>${formatAmt(balanceAmount)}</span>
                </div>
              </div>
            ` : ''}
          ` : ''}
          </div>

      ` : '';



      pagesHtml += `

        <div class="invoice-page">

          <div class="page-content">

            ${isFirstPage ? headerBlockHtml : `<div class="page-header-continued"><span class="inv-num-continued">Invoice No: ${getPrintedInvoiceNo(invoiceNo)}</span><span class="page-num-continued">Page ${pageIdx + 1} of ${chunks.length}</span></div>`}

            <table>

              <thead>${tableHeaderRowHtml}</thead>

              <tbody>${rows}</tbody>

              ${tfootHtml}

            </table>

            ${totalsAndSignaturesHtml}

          </div>

          <div class="page-footer-fixed">

            ${pinnedFooterHtml}

          </div>

        </div>

      `;

    });



    return `

      <!DOCTYPE html>

      <html>

      <head>

        <meta charset="utf-8">

        <style>

          @page { size: 6.5in 8.5in; margin: 5mm; }

          * { box-sizing: border-box; }

          html, body { margin: 0; padding: 0; }

          body { font-family: 'Arial', sans-serif; font-size: 13px; font-weight: bold; color: #000; }



          /* Each .invoice-page is sized to exactly one printed page's

             content area (page size minus @page margin) and forced onto

             its own page. Its footer sits at the bottom via flexbox, so

             Net Payable + footer notes are pinned to the bottom of every

             single page, not just the last one. */

          .invoice-page {

            height: calc(8.5in - 10mm);

            display: flex;

            flex-direction: column;

            page-break-after: always;

            overflow: hidden;

          }

          .invoice-page:last-child { page-break-after: auto; }

          .page-content { flex: 1 1 auto; min-height: 0; }

          .page-footer-fixed { flex-shrink: 0; }



          .header { text-align: center; margin-bottom: 6px; position: relative; }

          .header h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }

          .header .sub { font-size: 11px; margin: 1px 0; font-weight: bold; }

          .header .title { font-size: 14px; font-weight: bold; text-decoration: underline; margin: 3px 0 2px; }

          .header .shop-info { font-size: 10px; line-height: 1.15; font-weight: bold; }

          .page-num { position: absolute; top: 0; right: 0; font-size: 11px; }

          .page-header-continued { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; font-weight: bold; }



          .info-section { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }

          .info-left { width: 55%; }

          .info-right { width: 40%; text-align: right; }

          .info-row { margin-bottom: 2px; display: flex; align-items: baseline; }

          .info-row span.lbl { display: inline-block; margin-right: 5px; }

          .info-row span.val { flex: 1; border-bottom: 1px dashed #000; display: inline-block; text-align: left; }



          table { width: 100%; border-collapse: collapse; margin-bottom: 0; border: 1px solid #000; font-size: 12px; table-layout: fixed; }

          th, td { border: 1px solid #000; padding: 3px; text-align: center; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

          td.left { text-align: left; }

          td.item-name { font-size: 11px; }

          td.right { text-align: right; }



          .summary {

            border: 1px solid #000;

            border-top: none;

            padding: 4px 8px;

            font-size: 13px;

            font-weight: 900;

            display: flex;

            justify-content: space-between;

            align-items: flex-end;

          }

          .summary strong { font-weight: 900; }



          .signatures-in-summary {

            display: flex;

            gap: 12px;

            align-items: flex-end;

          }

          .sig-box {

            width: 60px;

            text-align: center;

            border-top: 1px solid #000;

            padding-top: 1px;

            font-size: 7.5px;

            font-weight: bold;

            line-height: 1.1;

          }

          .sig-role {

            font-weight: normal;

            font-size: 7px;

            color: #333;

          }



          .net-total {

            text-align: right;

            padding: 3px 6px;

            border: 1px solid #000;

            border-top: none;

            font-size: 13px;

            font-weight: 900;

          }

          .net-total strong { font-weight: 900; }



          /* Compact mode */

          .totals-signatures.compact .summary,

          .totals-signatures.compact .net-total { font-size: 11px; padding: 2px 4px; font-weight: 900; }

          .totals-signatures.compact .sig-box { width: 50px; font-size: 7px; }

          .totals-signatures.compact .sig-role { font-size: 6.5px; }



          .net-payable {

            border-top: 2px solid #000;

            border-bottom: 2px solid #000;

            padding: 3px 8px;

            background: #fff;

            display: flex;

            justify-content: space-between;

            align-items: center;

          }

          .net-payable-title {

            text-align: right;

            font-size: 15px;

            font-weight: 900;

            white-space: nowrap;

            margin-left: 10px;

          }

          .footer-notes-inside {

            font-size: 6.5px;

            font-weight: normal;

            text-transform: uppercase;

            line-height: 1.15;

            text-align: left;

            max-width: 62%;

            color: #222;

          }

        </style>

      </head>

      <body>

        ${pagesHtml}

      </body>

      </html>

    `;

  };



  useEffect(() => {

    const handler = (e) => {

      if (!isActive) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {

        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        handleSubmit();

      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {

        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        handlePrint();

      }

      if (e.key === 'F6') {

        e.preventDefault(); e.stopPropagation();

        setShowInvoiceDiscountModal(true);

      }

      if (e.key === 'Escape') {

        e.preventDefault();

        if (stockSearchModalOpen) {

          setStockSearchModalOpen(false);

          setTimeout(() => scanRef.current?.focus(), 50);

          return;

        }

        if (customerModalOpen) {

          setCustomerModalOpen(false);

          return;

        }

        if (showReturnModal) {

          setShowReturnModal(false);

          setReturnSearch('');

          setTempReturns([]);

          return;

        }

        if (showInvoiceDiscountModal) {

          setShowInvoiceDiscountModal(false);

          return;

        }

        if (showReceiptPreview) {

          setShowReceiptPreview(false);

          return;

        }

        if (paymentModalOpen) {

          setPaymentModalOpen(false);

          return;

        }

        onExit?.();

      }

    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);

  }, [isActive, items, invoiceNo, customerName, discount, miscCharges, paymentMethod, notes, isEditing, stockSearchModalOpen, customerModalOpen, showReturnModal, paymentModalOpen, showInvoiceDiscountModal, showReceiptPreview]);



  const focusedItem = focusedItemIdx !== null ? items[focusedItemIdx] : null;



  // ── Render ─────────────────────────────────────────────────────────────────

  return (

    <div className="sale-page">



      {/* Topbar */}

      <div className="sale-topbar">

        <div className="topbar-left">

          <span className="topbar-inv">Invoice: <strong>{invoiceNo}</strong></span>

          <span className="topbar-dt">

            {`${String(saleDate.getDate()).padStart(2, '0')}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${saleDate.getFullYear()}, ${saleDate.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`}

          </span>

          {saleToEdit?.updated_at && saleToEdit.updated_at !== saleToEdit.created_at && (() => {
            const uDate = parseLocalDate(saleToEdit.updated_at);
            const formatted = `${String(uDate.getDate()).padStart(2, '0')}-${String(uDate.getMonth() + 1).padStart(2, '0')}-${uDate.getFullYear()}, ${uDate.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;
            return (
              <span style={{ marginLeft: '10px', color: '#dc2626', fontWeight: '600', fontSize: '0.72rem' }}>
                (Updated: {formatted})
              </span>
            );
          })()}

          {!isEditing && onNewSale && (

            <button type="button" className="topbar-btn topbar-btn-primary" onClick={onNewSale} style={{ marginLeft: 10 }}>+ New Sale</button>

          )}

          <button type="button" className="topbar-btn" onClick={() => setShowInvoiceDiscountModal(true)} title="Invoice Discounts (F6)" style={{ background: '#10b981', color: '#fff', marginLeft: 10 }}>Disc (F6)</button>

          <span className={`topbar-title ${isEditing ? 'transparent' : 'yellow'}`}>{isEditing ? 'Edit Sale' : 'New Sale'}</span>

        </div>

        <div className="topbar-right">

          <button type="button" className="topbar-btn" onClick={() => setStockSearchModalOpen(true)} title="Stock Search (F8)" style={{ background: '#0284c7', color: '#fff', padding: '2px 8px', fontSize: '0.75rem', height: 26, lineHeight: '20px' }}>Search</button>

          <button type="button" className="topbar-btn" onClick={() => setCustomerModalOpen(true)} title="Search Customer (F4)" style={{ background: '#3b82f6', color: '#fff' }}>CUST</button>

          <button type="button" className="topbar-btn" style={{ background: '#ef4444', color: '#fff' }} onClick={() => setShowReturnModal(true)}>Add Return Item</button>

          <button type="button" className="topbar-btn topbar-btn-secondary" onClick={() => isEditing ? onExit() : window.location.reload()}>{isEditing ? 'Cancel' : 'Reset'}</button>

          <button type="button" className="topbar-btn topbar-btn-secondary" onClick={onViewSalesList}>View Sales List</button>

          {isEditing && (

            <button type="button" className="topbar-btn" style={{ background: '#b91c1c', color: '#fff' }} onClick={handleDeleteSale}>Delete</button>

          )}

          <button type="button" className="topbar-btn topbar-btn-primary" onClick={handlePreview} disabled={isSubmitting} style={{ background: '#3b82f6', borderColor: '#3b82f6' }}>

            Print Preview

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

            <div className="field" style={{ position: 'relative' }}>

              <label>Customer Name</label>

              <input

                ref={customerNameRef}

                value={customerName}

                onChange={async (e) => {

                  const val = e.target.value;

                  setCustomerName(val);

                  setInlineCustomerSelectedIndex(-1);

                  if (!val.trim()) { setInlineCustomerResults([]); return; }

                  try {

                    const res = await ipcRenderer.invoke('get-customers', { searchTerm: val });

                    setInlineCustomerResults(res || []);

                  } catch (err) { }

                }}

                onKeyDown={(e) => {

                  if (e.key === 'ArrowDown') {

                    e.preventDefault();

                    if (inlineCustomerResults.length > 0) {

                      setInlineCustomerSelectedIndex(prev => (prev < inlineCustomerResults.length - 1 ? prev + 1 : prev));

                    }

                  } else if (e.key === 'ArrowUp') {

                    e.preventDefault();

                    if (inlineCustomerResults.length > 0) {

                      setInlineCustomerSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));

                    }

                  } else if (e.key === 'Enter') {

                    e.preventDefault();

                    if (inlineCustomerResults.length > 0) {

                      const idx = inlineCustomerSelectedIndex >= 0 ? inlineCustomerSelectedIndex : 0;

                      const c = inlineCustomerResults[idx];

                      if (c) {

                        setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustomerCity(c.city || '');

                        setInlineCustomerResults([]);

                        setInlineCustomerSelectedIndex(-1);

                        setTimeout(() => customerPhoneRef.current?.focus(), 50);

                      }

                    } else {

                      customerPhoneRef.current?.focus();

                    }

                  } else if (e.key === 'Escape') {

                    setInlineCustomerResults([]);

                    setInlineCustomerSelectedIndex(-1);

                  }

                }}

                placeholder="Walk-in"

              />

              {inlineCustomerResults && inlineCustomerResults.length > 0 && (

                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

                  {inlineCustomerResults.map((c, idx) => (

                    <div key={c.id} ref={el => inlineCustomerItemRefs.current[idx] = el} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: idx === (inlineCustomerSelectedIndex >= 0 ? inlineCustomerSelectedIndex : 0) ? '#e2e8f0' : '#fff' }} onClick={() => {

                      setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustomerCity(c.city || '');

                      setInlineCustomerResults([]);

                      setInlineCustomerSelectedIndex(-1);

                      customerPhoneRef.current?.focus();

                    }}>

                      <div style={{ fontWeight: 600 }}>{c.name}</div>

                      <div style={{ fontSize: '11px', color: '#64748b' }}>{c.phone} | {c.city}</div>

                    </div>

                  ))}

                </div>

              )}

            </div>

            <div className="field">

              <label>Phone</label>

              <input ref={customerPhoneRef} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerNotesRef.current?.focus(); } }} placeholder="03XX-XXXXXXX" />

            </div>



            <div className="field">

              <label>Notes</label>

              <input ref={customerNotesRef} value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanRef.current?.focus(); } }} placeholder="Optional..." />

            </div>

          </div>

        </div>

      </div>



      {message && <div className="message">{message}</div>}



      {/* Body */}

      <div className="sale-body">

        <div className="sale-table-wrap" ref={tableWrapRef}>

          <table className="sale-table">

            <thead>

              <tr>

                <th style={{ width: 36 }}>#</th>

                <th style={{ width: '13%' }}>Code</th>

                <th>Description</th>

                <th className="center" style={{ width: '9%' }}>Packing</th>

                <th className="right" style={{ width: '10%' }}>Rate</th>

                <th className="right" style={{ width: '10%' }}>Disc.</th>

                <th className="right" style={{ width: '12%' }}>Amount</th>

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




                  </td>



                  {/* Description */}

                  <td>

                    {item.isPlaceholderN ? (

                      <div style={{ display: 'flex', gap: '6px' }}>

                        <select

                          id={`n-brand-${idx}`}

                          className="n-field"

                          value={item.nBrand || ''}

                          onChange={e => updateItemData(idx, { nBrand: e.target.value })}

                          onKeyDown={e => {

                            if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`n-cat-${idx}`)?.focus(); }

                          }}

                          style={{ width: '130px', padding: '6px', border: '1px solid #ccc', borderRadius: 4, outline: 'none', background: '#fff' }}

                        >

                          <option value="">Brand</option>

                          {wizardReferenceData.companies.map((c, i) => <option key={i} value={c}>{c}</option>)}

                        </select>

                        <input

                          id={`n-cat-${idx}`}

                          className="n-field"

                          placeholder="D-Number"

                          value={item.nCategory || ''}

                          onChange={e => updateItemData(idx, { nCategory: e.target.value })}

                          onKeyDown={e => {

                            if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`n-size-${idx}`)?.focus(); }

                          }}

                          style={{ width: '85px', padding: '6px', border: '1px solid #ccc', borderRadius: 4, outline: 'none' }}

                        />

                        <select

                          id={`n-size-${idx}`}

                          className="n-field"

                          value={item.nSize || ''}

                          onChange={e => updateItemData(idx, { nSize: e.target.value })}

                          onKeyDown={e => {

                            if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`n-prate-${idx}`)?.focus(); }

                          }}

                          style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: 4, outline: 'none', background: '#fff' }}

                        >

                          <option value="">Size</option>

                          {wizardReferenceData.sizes.map((s, i) => <option key={i} value={s}>{s}</option>)}

                        </select>

                        <input

                          id={`n-prate-${idx}`}

                          className="n-field"

                          type="number"

                          placeholder="Pur. Rate"

                          value={item.nPurchaseRate || ''}

                          onChange={e => updateItemData(idx, { nPurchaseRate: e.target.value })}

                          onKeyDown={e => {

                            if (e.key === 'Enter') {

                              e.preventDefault();

                              calculateNRow(idx);

                            }

                          }}

                          style={{ width: '85px', padding: '6px', border: '1px solid #ccc', borderRadius: 4, outline: 'none' }}

                        />

                      </div>

                    ) : (

                      <span className="desc-main">{item.itemDescription}</span>

                    )}

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



                  {/* Amount */}

                  <td className="right amount-cell" style={{ background: item.isReturn ? 'transparent' : undefined }}>

                    <span className="amount-badge" style={{ color: item.isReturn ? '#dc2626' : undefined, background: item.isReturn ? 'transparent' : undefined }}>

                      {item.amount !== 0 ? Math.round(item.amount).toLocaleString() : '—'}

                    </span>

                  </td>



                  {/* Delete */}

                  <td className="center">

                    <button className="btn-icon" tabIndex={-1}

                      onClick={() => setItems(p => p.filter((_, j) => j !== idx))}>✖</button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>



          {/* Scan input (bottom — always visible) */}

          <div className="scan-entry">

            <div className="scan-cell">

              <input

                ref={scanRef}

                type="text"

                value={scanCode}

                onChange={e => handleScanChange(e.target.value)}

                onKeyDown={handleScanKD}

                onFocus={() => setFocusedItemIdx(null)}

                onClick={e => {

                  e.target.focus();

                  e.target.select();

                }}

                placeholder=""

                className="scan-input-inline"

                autoFocus

              />

            </div>

          </div>

        </div>

        {/* Payment Details Side Panel when editing */}
        {isEditing && (() => {
          const receivedList = Array.isArray(receivedPayments)
            ? receivedPayments
            : Object.entries(receivedPayments || {}).map(([method, amount]) => ({ method, amount }));
          const totalReceived = receivedList.reduce((acc, p) => acc + (typeof p === 'number' ? p : (parseFloat(p.amount) || 0)), 0);
          const prevBal = parseFloat(customerPrevBalance || 0);
          const netPayable = totals.grandTotal + prevBal;
          const remBalance = netPayable - totalReceived;

          return (
            <div className="edit-side-panel" style={{
              flex: '0 0 320px',
              background: '#f9fafb',
              borderLeft: '1px solid #e5e7eb',
              padding: '16px',
              boxSizing: 'border-box',
              overflowY: 'auto'
            }}>
              <h3 style={{ marginTop: 0, color: '#111827', fontSize: '1rem', fontWeight: 800, borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
                Payment Details
              </h3>

              <div style={{ background: 'white', padding: '14px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#4b5563', fontWeight: 700 }}>Received Amounts</h4>

                {receivedList.length > 0 ? (
                  receivedList.map((p, pIdx) => (
                    <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>{p.method}</span>
                      <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a' }}>{Math.round(p.amount || 0).toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', padding: '4px 0' }}>No payments recorded</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', marginTop: '6px', borderTop: '2px solid #e5e7eb' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>Total Received</span>
                  <span style={{ fontWeight: 900, color: '#4f46e5', fontSize: '1.4rem' }}>
                    {Math.round(totalReceived).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', marginTop: '6px', borderTop: '1px dashed #e5e7eb' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>Current Bill</span>
                  <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#0f172a' }}>
                    {Math.round(totals.grandTotal).toLocaleString()}
                  </span>
                </div>

                {prevBal !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', marginTop: '6px', borderTop: '1px dashed #e5e7eb' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>Previous Balance</span>
                    <span style={{ fontWeight: 900, fontSize: '1.2rem', color: prevBal > 0 ? '#dc2626' : '#16a34a' }}>
                      {prevBal > 0 ? '+' : ''} {Math.round(prevBal).toLocaleString()}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', marginTop: '6px', borderTop: '2px solid #e5e7eb' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>Balance</span>
                  <span style={{
                    fontWeight: 900,
                    fontSize: '1.3rem',
                    color: Math.round(remBalance) > 0 ? '#dc2626' : '#16a34a'
                  }}>
                    {Math.round(remBalance).toLocaleString()}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <p style={{ color: '#6b7280', fontSize: '0.8rem', lineHeight: '1.2' }}>
                  * Payment amounts shown are original.
                </p>
              </div>
            </div>
          );
        })()}

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

              ? <strong style={{ fontSize: '1rem' }}>{focusedItem.purchaseRate != null && !isNaN(focusedItem.purchaseRate) ? (Math.round(parseFloat(focusedItem.purchaseRate) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}</strong>

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

        <div className="footer-grand">

          <span>Grand Total</span>

          <strong>{Math.round(totals.grandTotal).toLocaleString()}</strong>

        </div>

      </footer>



      {/* Return Item Modal */}

      {showReturnModal && (

        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>

          <div className="modal-content" style={{ background: '#fff', borderRadius: '12px', width: '850px', maxWidth: '95vw', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>



            {/* Header */}

            <div style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>

                <span style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontSize: '1rem' }}>⏎</span>

                Process Sales Return

              </h3>

              <button onClick={() => { setShowReturnModal(false); setReturnSearch(''); setTempReturns([]); }} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>&times;</button>

            </div>



            {/* Body */}

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>



              {/* Input Section */}

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>



                {/* Scanner/Search */}

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' }}>

                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.875rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scan / Search Product</h4>

                  <div style={{ position: 'relative' }}>

                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc' }}>

                      <span style={{ padding: '0 12px', color: '#94a3b8' }}>🔍</span>

                      <input

                        type="text"

                        autoFocus

                        value={returnSearch}

                        onChange={e => handleReturnSearch(e.target.value)}

                        onKeyDown={handleReturnKD}

                        placeholder="Scan barcode or type code..."

                        style={{ width: '100%', padding: '8px 8px 8px 0', fontSize: '1rem', border: 'none', background: 'transparent', outline: 'none' }}

                      />

                    </div>

                    {returnResults.length > 0 && (

                      <div className="autocomplete-dropdown" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1100, border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', background: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>

                        {returnResults.slice(0, 8).map(p => (

                          <div key={p.id} className="suggestion-item" onMouseDown={e => { e.preventDefault(); addReturnProduct(p); }} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center' }}>

                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', minWidth: '80px' }}>{p.item_code}</span>

                            <span style={{ flex: 1, fontSize: '0.875rem', color: '#334155' }}>{descForProduct(p)}</span>

                            <span style={{ fontWeight: 600, color: '#059669', fontSize: '0.875rem' }}>PKR {Math.round(p.sale_rate)}</span>

                          </div>

                        ))}

                      </div>

                    )}

                  </div>

                </div>



                {/* Manual Entry */}

                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '8px' }}>

                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.875rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manual Entry</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '4px' }}>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>

                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Item Description</label>

                      <input ref={manualDescRef} type="text" placeholder="Item Description" value={manualReturnForm.description} onChange={e => setManualReturnForm({ ...manualReturnForm, description: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') manualQtyRef.current?.focus(); }} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' }} />

                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>

                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Qty</label>

                      <input ref={manualQtyRef} type="number" placeholder="Qty" value={manualReturnForm.qty} onChange={e => setManualReturnForm({ ...manualReturnForm, qty: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') manualRateRef.current?.focus(); }} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' }} />

                    </div>

                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>

                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Rate (PKR)</label>

                      <input ref={manualRateRef} type="number" placeholder="Rate (PKR)" value={manualReturnForm.rate} onChange={e => setManualReturnForm({ ...manualReturnForm, rate: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { handleAddManualReturn(); setTimeout(() => manualDescRef.current?.focus(), 50); } }} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' }} />

                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>

                      <button type="button" onClick={() => { handleAddManualReturn(); setTimeout(() => manualDescRef.current?.focus(), 50); }} style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s', height: '33px' }}>Add Manual</button>

                    </div>

                  </div>

                </div>

              </div>



              {/* Table Section */}

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', flex: 1, overflowY: 'auto', minHeight: '180px' }}>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>

                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>

                    <tr>

                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Code</th>

                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Description</th>

                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '80px' }}>Qty</th>

                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '120px' }}>Rate</th>

                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '120px' }}>Amount</th>

                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '60px' }}></th>

                    </tr>

                  </thead>

                  <tbody style={{ background: '#fff' }}>

                    {tempReturns.length === 0 ? (

                      <tr><td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No items scanned for return yet.</td></tr>

                    ) : (

                      tempReturns.map(r => (

                        <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>

                          <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{r.itemCode}</td>

                          <td style={{ padding: '6px 12px', color: '#334155' }}>{r.itemDescription}</td>

                          <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600 }}>{Math.abs(r.packets)}</td>

                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569' }}>{Math.round(r.saleRate).toLocaleString()}</td>

                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{Math.round(Math.abs(r.amount)).toLocaleString()}</td>

                          <td style={{ padding: '4px 12px', textAlign: 'center' }}>

                            <button type="button" onClick={() => removeTempReturn(r.id)} style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer', width: '24px', height: '24px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', padding: 0 }}>×</button>

                          </td>

                        </tr>

                      ))

                    )}

                  </tbody>

                </table>

              </div>

              {/* Total Bar */}

              {tempReturns.length > 0 && (

                <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '24px' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Total Qty:</span>

                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{tempReturns.reduce((acc, curr) => acc + Math.abs(curr.packets), 0)}</strong>

                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Total Refund:</span>

                    <strong style={{ fontSize: '1.125rem', color: '#dc2626' }}>PKR {Math.abs(tempReturns.reduce((acc, curr) => acc + curr.amount, 0)).toLocaleString()}</strong>

                  </div>

                </div>

              )}



            </div>



            {/* Footer */}

            <div style={{ background: '#f8fafc', padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>

              <button type="button" onClick={() => { setShowReturnModal(false); setReturnSearch(''); setTempReturns([]); }} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>

              <button type="button" onClick={commitReturns} disabled={tempReturns.length === 0} style={{ padding: '8px 24px', background: tempReturns.length > 0 ? '#ef4444' : '#fca5a5', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, cursor: tempReturns.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>

                Confirm Returns

              </button>

            </div>



          </div>

        </div>

      )}



      <PaymentModal

        open={paymentModalOpen}

        invoiceNo={invoiceNo}

        grandTotal={totals.grandTotal}

        isEditMode={isEditing}

        existingPayments={isEditing ? receivedPayments : null}

        onConfirm={handlePaymentConfirm}

        onCancel={() => setPaymentModalOpen(false)}

        onChange={() => { }}

        cashOnly={false}

        useMasterCashier={(currentUser?.permissions || []).includes('use_master_cashier')}

        allowCredit={isEditing ? true : !!customerId}

        customerName={customerName}

        customerId={customerId}

        customerPrevBalance={customerPrevBalance}

      />



      {/* Receipt Preview Modal */}

      {showReceiptPreview && (

        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowReceiptPreview(false)}>

          <div style={{ width: '80%', height: '90%', background: '#fff', borderRadius: '8px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

            <div style={{ padding: '15px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <h3 style={{ margin: 0 }}>Print Preview</h3>

              <button onClick={() => setShowReceiptPreview(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>

            </div>

            <div style={{ flex: 1, padding: '20px', background: '#f5f6fa' }}>

              <iframe

                srcDoc={previewHTML}

                style={{ width: '100%', height: '100%', border: '1px solid #ddd', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}

                title="Invoice Preview"

                onLoad={(e) => { e.target.style.opacity = 1; }}

              />

            </div>

            <div style={{ padding: '15px', borderTop: '1px solid #ddd', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>

              <button type="button" className="btn btn-secondary" onClick={() => setShowReceiptPreview(false)}>Close Preview</button>

              <button type="button" className="btn btn-secondary" onClick={handleSaveInvoicePdf} disabled={isSavingPdf}>{isSavingPdf ? 'Saving PDF...' : '📄 Save as PDF'}</button>

              <button type="button" className="btn btn-primary" onClick={handlePrintFromPreview} disabled={isPrintingFromPreview}>{isPrintingFromPreview ? '🖨 Printing...' : '🖨 Print'}</button>

            </div>

          </div>

        </div>

      )}



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



      {/* Invoice Discounts Modal (F6) */}

      {showInvoiceDiscountModal && (

        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => {

          setModalDiscounts(invoiceDiscounts);

          setShowInvoiceDiscountModal(false);

        }}>

          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 450, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

            <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#10b981' }}>Invoice Discounts</h3>



            <div style={{ marginBottom: 20 }}>

              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Flat Discount Amount (same for every item)</label>

              <input type="number" placeholder="Leave empty to not use a flat amount" value={modalDiscounts.flatAmount} onChange={e => setModalDiscounts(p => ({ ...p, flatAmount: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />

              <div style={{ fontSize: '0.75rem', color: '#7e8299', marginTop: 4 }}>Applies this exact discount amount to every item on the invoice, regardless of rate or brand. Overrides the % settings below when set.</div>

            </div>



            <div style={{ marginBottom: 20, borderTop: '1px solid #e4e6ef', paddingTop: 16 }}>

              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Overall Invoice Discount %</label>

              <input type="number" placeholder="Leave empty for no overall override" value={modalDiscounts.overallPct} onChange={e => setModalDiscounts(p => ({ ...p, overallPct: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />

              <div style={{ fontSize: '0.75rem', color: '#7e8299', marginTop: 4 }}>Applies to all items unless a brand override is set below.</div>

            </div>



            <div style={{ marginBottom: 16, borderTop: '1px solid #e4e6ef', paddingTop: 16 }}>

              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Brand Specific Overrides</label>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>

                <select value={newOverrideBrand} onChange={e => setNewOverrideBrand(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }}>

                  <option value="">Select Brand</option>

                  {wizardReferenceData.companies.map((c, i) => <option key={i} value={c}>{c}</option>)}

                </select>

                <input type="number" placeholder="%" value={newOverridePct} onChange={e => setNewOverridePct(e.target.value)} style={{ width: '70px', padding: '8px', border: '1px solid #e4e6ef', borderRadius: 6, outline: 'none' }} />

                <button type="button" onClick={() => {

                  if (newOverrideBrand && newOverridePct) {

                    setModalDiscounts(p => ({

                      ...p,

                      brands: { ...p.brands, [newOverrideBrand]: newOverridePct }

                    }));

                    setNewOverrideBrand('');

                    setNewOverridePct('');

                  }

                }} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', cursor: 'pointer', fontWeight: 600 }}>Add</button>

              </div>



              {Object.keys(modalDiscounts.brands).length > 0 ? (

                <div style={{ border: '1px solid #e4e6ef', borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>

                  {Object.entries(modalDiscounts.brands).map(([brand, pct]) => (

                    <div key={brand} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>

                      <span style={{ fontWeight: 500 }}>{brand}</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                        <strong style={{ color: '#10b981' }}>{pct}%</strong>

                        <button onClick={() => setModalDiscounts(p => {

                          const newBrands = { ...p.brands };

                          delete newBrands[brand];

                          return { ...p, brands: newBrands };

                        })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}>×</button>

                      </div>

                    </div>

                  ))}

                </div>

              ) : (

                <div style={{ fontSize: '0.85rem', color: '#7e8299', textAlign: 'center', padding: '10px' }}>No brand overrides added.</div>

              )}

            </div>



            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>

              <button onClick={() => {

                setModalDiscounts(invoiceDiscounts);

                setShowInvoiceDiscountModal(false);

              }} style={{ padding: '8px 16px', background: '#f5f8fa', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>



              <button onClick={() => {

                setInvoiceDiscounts(modalDiscounts);

                localStorage.setItem('persisted_invoice_discounts', JSON.stringify(modalDiscounts));

                setShowInvoiceDiscountModal(false);

              }} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Apply & Recalculate</button>

            </div>

          </div>

        </div>

      )}



      {/* Stock Inventory Search Modal (F8) */}

      {stockSearchModalOpen && (

        <div

          style={{

            position: 'fixed',

            top: 0,

            left: 0,

            right: 0,

            bottom: 0,

            background: 'rgba(15, 23, 42, 0.75)',

            backdropFilter: 'blur(4px)',

            zIndex: 9999,

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            padding: '20px'

          }}

          onClick={() => setStockSearchModalOpen(false)}

        >

          <div

            style={{

              width: '95%',

              maxWidth: '1200px',

              height: '88vh',

              background: '#fff',

              borderRadius: '12px',

              display: 'flex',

              flexDirection: 'column',

              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

              overflow: 'hidden'

            }}

            onClick={e => e.stopPropagation()}

          >

            {/* Header & Filters */}

            <div style={{ background: '#1e293b', color: '#fff', padding: '14px 20px', flexShrink: 0 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

                  <span style={{ fontSize: '1.4rem' }}>📦</span>

                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>

                    Stock Inventory Search

                  </h3>

                  <span style={{ background: '#38bdf8', color: '#0f172a', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>

                    F8

                  </span>

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                  {stockToastMsg && (

                    <div style={{ background: '#22c55e', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>

                      ✓ {stockToastMsg}

                    </div>

                  )}

                  <button

                    type="button"

                    onClick={() => setStockSearchModalOpen(false)}

                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}

                  >

                    ✕

                  </button>

                </div>

              </div>



              {/* Filter controls */}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

                <input

                  ref={stockSearchInputRef}

                  autoFocus

                  type="text"

                  placeholder="Search Item Code or Description..."

                  value={stockSearchFilters.search}

                  onChange={e => {

                    setStockSearchFilters(f => ({ ...f, search: e.target.value }));

                    setStockModalSelectedIndex(0);

                  }}

                  onKeyDown={handleStockModalKeyDown}

                  style={{

                    flex: '2',

                    minWidth: '220px',

                    padding: '8px 12px',

                    borderRadius: '6px',

                    border: '1px solid #475569',

                    background: '#0f172a',

                    color: '#fff',

                    fontSize: '0.9rem',

                    outline: 'none'

                  }}

                />

                <input

                  type="text"

                  placeholder="Brand..."

                  value={stockSearchFilters.brand}

                  onChange={e => {

                    setStockSearchFilters(f => ({ ...f, brand: e.target.value }));

                    setStockModalSelectedIndex(0);

                  }}

                  onKeyDown={handleStockModalKeyDown}

                  style={{

                    flex: '1',

                    minWidth: '120px',

                    padding: '8px 12px',

                    borderRadius: '6px',

                    border: '1px solid #475569',

                    background: '#0f172a',

                    color: '#fff',

                    fontSize: '0.9rem',

                    outline: 'none'

                  }}

                />

                <input

                  type="text"

                  placeholder="Category..."

                  value={stockSearchFilters.category}

                  onChange={e => {

                    setStockSearchFilters(f => ({ ...f, category: e.target.value }));

                    setStockModalSelectedIndex(0);

                  }}

                  onKeyDown={handleStockModalKeyDown}

                  style={{

                    flex: '1',

                    minWidth: '120px',

                    padding: '8px 12px',

                    borderRadius: '6px',

                    border: '1px solid #475569',

                    background: '#0f172a',

                    color: '#fff',

                    fontSize: '0.9rem',

                    outline: 'none'

                  }}

                />

                <input

                  type="text"

                  placeholder="Size..."

                  value={stockSearchFilters.size}

                  onChange={e => {

                    setStockSearchFilters(f => ({ ...f, size: e.target.value }));

                    setStockModalSelectedIndex(0);

                  }}

                  onKeyDown={handleStockModalKeyDown}

                  style={{

                    flex: '1',

                    minWidth: '100px',

                    padding: '8px 12px',

                    borderRadius: '6px',

                    border: '1px solid #475569',

                    background: '#0f172a',

                    color: '#fff',

                    fontSize: '0.9rem',

                    outline: 'none'

                  }}

                />

                {(stockSearchFilters.search || stockSearchFilters.brand || stockSearchFilters.category || stockSearchFilters.size) && (

                  <button

                    type="button"

                    onClick={() => setStockSearchFilters({ search: '', brand: '', category: '', size: '' })}

                    style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer' }}

                  >

                    Clear Filters

                  </button>

                )}

              </div>



              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.85rem', color: '#cbd5e1' }}>

                <span>

                  Showing {filteredStockItems.length > 150 ? `top 150 of ${filteredStockItems.length}` : `${filteredStockItems.length}`} matching items

                </span>

                <span style={{ color: '#38bdf8', fontWeight: 600 }}>

                  Total Stock Value: PKR {totalStockSearchValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

                </span>

              </div>

            </div>



            {/* Table Content */}

            <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '12px 20px' }}>

              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>

                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 2 }}>

                    <tr>

                      <th style={{ padding: '10px 12px' }}>Item Code</th>

                      <th style={{ padding: '10px 12px' }}>Description</th>

                      <th style={{ padding: '10px 12px' }}>Category</th>

                      <th style={{ padding: '10px 12px' }}>Size Range</th>

                      <th style={{ padding: '10px 12px' }} className="text-right">Purch. Rate</th>

                      <th style={{ padding: '10px 12px' }} className="text-right">Sale Rate</th>

                      <th style={{ padding: '10px 12px' }} className="text-center">Stock (Pcs)</th>

                      <th style={{ padding: '10px 12px' }} className="text-right">Stock Value</th>

                      <th style={{ padding: '10px 12px' }} className="text-center">Action</th>

                    </tr>

                  </thead>

                  <tbody>

                    {stockSearchLoading ? (

                      <tr>

                        <td colSpan={9} className="empty-state" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>

                          Loading stock inventory...

                        </td>

                      </tr>

                    ) : filteredStockItems.length === 0 ? (

                      <tr>

                        <td colSpan={9} className="empty-state" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>

                          No items match search criteria

                        </td>

                      </tr>

                    ) : (

                      filteredStockItems.slice(0, 150).map((p, idx) => {

                        const isSelected = idx === stockModalSelectedIndex;

                        const stockPcs = p.stock_packets || 0;

                        const chipCls = stockPcs > 5 ? 'chip-ok' : stockPcs > 0 ? 'chip-low' : 'chip-zero';

                        return (

                          <tr

                            key={p.id || p.item_code}

                            ref={el => stockModalRowRefs.current[idx] = el}

                            onClick={() => setStockModalSelectedIndex(idx)}

                            onDoubleClick={() => handleAddStockItemToSale(p)}

                            style={{

                              background: isSelected ? '#e0f2fe' : 'transparent',

                              borderLeft: isSelected ? '4px solid #0284c7' : '4px solid transparent',

                              cursor: 'pointer',

                              transition: 'background 0.15s'

                            }}

                          >

                            <td><span className="badge badge-code">{p.item_code}</span></td>

                            <td>

                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.description}</div>

                              {p.brand && <div style={{ fontSize: '11px', color: '#64748b' }}>Brand: {p.brand}</div>}

                            </td>

                            <td><span className="badge badge-cat">{p.category || '—'}</span></td>

                            <td>{p.size_range || '—'}</td>

                            <td className="text-right">PKR {(parseFloat(p.purchase_rate) || 0).toLocaleString()}</td>

                            <td className="text-right" style={{ color: '#16a34a', fontWeight: 700 }}>

                              PKR {(parseFloat(p.sale_rate) || 0).toLocaleString()}

                            </td>

                            <td className="text-center">

                              <span className={`stock-chip ${chipCls}`}>{stockPcs}</span>

                            </td>

                            <td className="text-right" style={{ fontWeight: 600 }}>

                              PKR {(stockPcs * (parseFloat(p.purchase_rate) || 0)).toLocaleString()}

                            </td>

                            <td className="text-center">

                              <button

                                type="button"

                                onClick={(e) => {

                                  e.stopPropagation();

                                  handleAddStockItemToSale(p);

                                }}

                                style={{

                                  background: '#16a34a',

                                  color: '#fff',

                                  border: 'none',

                                  padding: '5px 12px',

                                  borderRadius: '6px',

                                  fontWeight: 600,

                                  fontSize: '0.8rem',

                                  cursor: 'pointer',

                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'

                                }}

                              >

                                + Add

                              </button>

                            </td>

                          </tr>

                        );

                      })

                    )}

                  </tbody>

                </table>

              </div>

            </div>



            {/* Footer */}

            <div style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>

              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>

                💡 <strong>Tip:</strong> Click <strong>+ Add</strong> or <strong>Double-Click</strong> any row to add item to invoice. Press <strong>Esc</strong> to close.

              </span>

              <button

                type="button"

                onClick={() => setStockSearchModalOpen(false)}

                style={{ padding: '8px 20px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}

              >

                Close (Esc)

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Datalists for N Row Inline Wizard */}

      <datalist id="n-brands-list">

        {wizardReferenceData.companies.map((c, i) => <option key={i} value={c} />)}

      </datalist>

      <datalist id="n-sizes-list">

        {wizardReferenceData.sizes.map((s, i) => <option key={i} value={s} />)}

      </datalist>



    </div>

  );

}



export default NewSale;