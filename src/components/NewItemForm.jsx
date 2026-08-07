import React, { useState, useEffect, useRef } from 'react';
import './NewItemForm.css';

const { ipcRenderer } = window.require('electron');

const formatExactDateTime = (dateStr) => {
  if (!dateStr) return 'Unknown Date/Time';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

function NewItemForm({ editItemData, onClearEdit, isActive, currentUser, openWindow }) {
  const [itemCode, setItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState('');
  const [category, setCategory] = useState('');
  const [defaultCategory, setDefaultCategoryState] = useState(() => localStorage.getItem('default_category') || '');

  const handleSetDefaultCategory = (catName) => {
    localStorage.setItem('default_category', catName);
    setDefaultCategoryState(catName);
    setCategory(catName);
  };
  const [sizeRange, setSizeRange] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [saleRate, setSaleRate] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [discount, setDiscount] = useState('');
  const isAutoCode = true;
  const [packingQty, setPackingQty] = useState('6');
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);
  const [note, setNote] = useState('');
  const [gendersList, setGendersList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [sizeRangesList, setSizeRangesList] = useState([]);
  const [packingsList, setPackingsList] = useState([]);
  const [brandsList, setBrandsList] = useState([]);
  const [manufacturersList, setManufacturersList] = useState([]);
  const [brand, setBrand] = useState('');
  const [manageListType, setManageListType] = useState('');
  const [showManageModal, setShowManageModal] = useState(false);
  const [manageListItems, setManageListItems] = useState([]);
  const [manageListSearchQuery, setManageListSearchQuery] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [editingListItemId, setEditingListItemId] = useState(null);
  const [editingListItemVal, setEditingListItemVal] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companies, setCompanies] = useState([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [duplicateItem, setDuplicateItem] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [sessionItems, setSessionItems] = useState([]);

  // Profit sheet state
  const [profitRules, setProfitRules] = useState([]);
  const [selectedProfitCompany, setSelectedProfitCompany] = useState('');
  const [defaultPctInput, setDefaultPctInput] = useState('');
  const [defaultDiscInput, setDefaultDiscInput] = useState('');
  const [ruleEdits, setRuleEdits] = useState({});
  const [newRuleCategory, setNewRuleCategory] = useState('Boy');
  const [newRuleSizeRange, setNewRuleSizeRange] = useState('');
  const [newRulePct, setNewRulePct] = useState('');
  const [newRuleDisc, setNewRuleDisc] = useState('');
  const [overallProfitPct, setOverallProfitPct] = useState('');
  const [overallDiscountPct, setOverallDiscountPct] = useState('');
  const [overallEnabled, setOverallEnabled] = useState(false);
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const [profitSavedMsg, setProfitSavedMsg] = useState('');

  // Special mode for fast data entry
  const [specialMode, setSpecialMode] = useState(false);
  const [previousCategory, setPreviousCategory] = useState('');
  const [previousGender, setPreviousGender] = useState('');

  const refs = useRef({});
  const fileInputRef = useRef(null);
  const companyRef = useRef(null);
  const newCompanyInputRef = useRef(null);
  const profitModalRefs = useRef({});

  const handleNewSession = async () => {
    try {
      const id = await ipcRenderer.invoke('start-new-item-session');
      setSessionId(id);
    } catch (err) {
      console.error('Failed to get session ID:', err);
    }
  };

  // Clock and Session Initialization
  useEffect(() => {
    let interval;
    if (isActive) {
      interval = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString());
      }, 1000);

      // Start a new session only if not editing and we don't have one
      if (!isEditing && !sessionId) {
        ipcRenderer.invoke('start-new-item-session').then(id => {
          setSessionId(id);
          loadSessionItems(id);
        }).catch(err => console.error('Failed to get session ID:', err));
      }
    }
    // No longer clearing session on isActive = false so it persists until tab closed (ctrl+x)
    return () => clearInterval(interval);
  }, [isActive, isEditing, sessionId]);

  useEffect(() => { loadCompanies(); loadProfitRules(); loadLists(); loadOverallProfit(); }, []);

  const loadOverallProfit = async () => {
    try {
      const data = await ipcRenderer.invoke('get-overall-profit');
      if (data) {
        setOverallProfitPct(parseFloat(data.profit_pct) ? String(parseFloat(data.profit_pct)) : '');
        setOverallDiscountPct(parseFloat(data.discount_pct) ? String(parseFloat(data.discount_pct)) : '');
        setOverallEnabled(!!data.enabled);
      }
    } catch { }
  };

  const saveOverallProfit = async () => {
    try {
      await ipcRenderer.invoke('save-overall-profit', {
        profit_pct: parseFloat(overallProfitPct) || 0,
        discount_pct: parseFloat(overallDiscountPct) || 0,
        enabled: overallEnabled
      });
    } catch { }
  };

  const loadLists = async () => {
    const genders = await ipcRenderer.invoke('get-genders') || [];
    const categories = await ipcRenderer.invoke('get-categories') || [];
    const sizeRanges = await ipcRenderer.invoke('get-size-ranges') || [];
    const packings = await ipcRenderer.invoke('get-packings') || [];
    const brands = await ipcRenderer.invoke('get-brands') || [];
    const manufacturers = await ipcRenderer.invoke('get-manufacturers') || [];

    setGendersList(genders);
    setCategoriesList(categories);
    setSizeRangesList(sizeRanges);
    setPackingsList(packings);
    setBrandsList(brands);
    setManufacturersList(manufacturers);

    const savedDefaultCat = localStorage.getItem('default_category') || '';
    if (!editItemData) {
      setBrand(prev => prev || (brands.length > 0 ? brands[0].name : ''));
      setGender(prev => prev || (genders.length > 0 ? genders[0].name : ''));
      setCategory(prev => {
        if (prev) return prev;
        if (savedDefaultCat && categories.some(c => c.name === savedDefaultCat)) return savedDefaultCat;
        return categories.length > 0 ? categories[0].name : '';
      });
      setSizeRange(prev => prev || (sizeRanges.length > 0 ? sizeRanges[0].name : ''));
    }
  };

  const openListManager = (type) => {
    setManageListType(type); setNewItemName('');
    setEditingListItemId(null); setEditingListItemVal('');
    setManageListSearchQuery('');
    if (type === 'genders') setManageListItems(gendersList);
    if (type === 'categories') setManageListItems(categoriesList);
    if (type === 'size_ranges') setManageListItems(sizeRangesList);
    if (type === 'packings') setManageListItems(packingsList);
    if (type === 'brands') setManageListItems(brandsList);
    setShowManageModal(true);
    setTimeout(() => refs.current.manageListInput?.focus(), 100);
  };

  const handleAddListItem = async () => {
    if (!newItemName.trim()) return;
    const val = manageListType === 'packings' ? parseInt(newItemName) : newItemName.trim();
    if (manageListType === 'genders') await ipcRenderer.invoke('add-gender', val);
    if (manageListType === 'categories') await ipcRenderer.invoke('add-category', val);
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('add-size-range', val);
    if (manageListType === 'packings') await ipcRenderer.invoke('add-packing', val);
    if (manageListType === 'brands') await ipcRenderer.invoke('add-brand', val);
    if (manageListType === 'manufacturers') await ipcRenderer.invoke('add-manufacturer', val);
    setNewItemName('');
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    if (manageListType === 'brands') setManageListItems(await ipcRenderer.invoke('get-brands') || []);
    if (manageListType === 'manufacturers') setManageListItems(await ipcRenderer.invoke('get-manufacturers') || []);
    await loadLists();
    setTimeout(() => refs.current.manageListInput?.focus(), 0);
  };

  const handleSaveEditListItem = async (id) => {
    if (!editingListItemVal.trim()) return;
    const val = manageListType === 'packings' ? parseInt(editingListItemVal) : editingListItemVal.trim();
    if (manageListType === 'categories') {
      const oldItem = manageListItems.find(i => i.id === id);
      if (oldItem && oldItem.name === defaultCategory) {
        handleSetDefaultCategory(val);
      }
    }
    if (manageListType === 'genders') await ipcRenderer.invoke('update-gender', { id, name: val });
    if (manageListType === 'categories') await ipcRenderer.invoke('update-category', { id, name: val });
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('update-size-range', { id, name: val });
    if (manageListType === 'packings') await ipcRenderer.invoke('update-packing', { id, value: val });
    if (manageListType === 'brands') await ipcRenderer.invoke('update-brand', { id, name: val });
    if (manageListType === 'manufacturers') await ipcRenderer.invoke('update-manufacturer', { id, name: val });
    setEditingListItemId(null);
    setEditingListItemVal('');
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    if (manageListType === 'brands') setManageListItems(await ipcRenderer.invoke('get-brands') || []);
    if (manageListType === 'manufacturers') setManageListItems(await ipcRenderer.invoke('get-manufacturers') || []);
    await loadLists();
  };

  const handleDeleteListItem = async (id) => {
    if (manageListType === 'categories') {
      const itemToDelete = manageListItems.find(i => i.id === id);
      if (itemToDelete && itemToDelete.name === defaultCategory) {
        localStorage.removeItem('default_category');
        setDefaultCategoryState('');
      }
    }
    if (manageListType === 'genders') await ipcRenderer.invoke('delete-gender', id);
    if (manageListType === 'categories') await ipcRenderer.invoke('delete-category', id);
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('delete-size-range', id);
    if (manageListType === 'packings') await ipcRenderer.invoke('delete-packing', id);
    if (manageListType === 'brands') await ipcRenderer.invoke('delete-brand', id);
    if (manageListType === 'manufacturers') await ipcRenderer.invoke('delete-manufacturer', id);
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    if (manageListType === 'brands') setManageListItems(await ipcRenderer.invoke('get-brands') || []);
    if (manageListType === 'manufacturers') setManageListItems(await ipcRenderer.invoke('get-manufacturers') || []);
    await loadLists();
  };

  const loadProfitRules = async () => {
    try {
      const rules = await ipcRenderer.invoke('get-profit-rules') || [];
      setProfitRules(rules);
      const edits = {};
      rules.forEach(r => { edits[r.id] = { pct: String(r.profit_pct || 0), disc: String(r.discount_pct || 0) }; });
      setRuleEdits(edits);
    } catch { }
  };

  const saveProfitRule = async (company, cat, sr, pct, disc = 0) => {
    if ((!pct && !disc) || !company) return;
    await ipcRenderer.invoke('save-profit-rule', { company_name: company, category: cat, size_range: sr, profit_pct: parseFloat(pct) || 0, discount_pct: parseFloat(disc) || 0 });
    await loadProfitRules();
  };
  const deleteProfitRule = async (id) => {
    await ipcRenderer.invoke('delete-profit-rule', id);
    await loadProfitRules();
  };

  const selectProfitCompany = (co) => {
    const def = profitRules.find(r => r.company_name === co && r.category === '' && r.size_range === '');
    setSelectedProfitCompany(co);
    setDefaultPctInput(def ? String(def.profit_pct) : '');
    setDefaultDiscInput(def ? String(def.discount_pct || 0) : '');
    setNewRuleCategory('Boy'); setNewRuleSizeRange(''); setNewRulePct(''); setNewRuleDisc('');
    setTimeout(() => profitModalRefs.current.defaultPct?.focus(), 30);
  };

  // Auto-focus default % when modal opens — use first brand
  useEffect(() => {
    if (!showProfitModal || brandsList.length === 0) return;
    const co = brandsList[0].name;
    selectProfitCompany(co);
  }, [showProfitModal, brandsList]);

  const findDiscountPct = (company, cat, sr) => {
    if (!company) return overallEnabled ? (parseFloat(overallDiscountPct) || 0) : 0;
    const m1 = profitRules.find(r => r.company_name === company && r.category === cat && r.size_range === sr);
    if (m1) return parseFloat(m1.discount_pct || 0);
    const m2 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === sr && sr);
    if (m2) return parseFloat(m2.discount_pct || 0);
    const m3 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === '');
    if (m3) return parseFloat(m3.discount_pct || 0);
    // Fallback to overall if enabled
    if (overallEnabled) return parseFloat(overallDiscountPct) || 0;
    return 0;
  };
  const findProfitPct = (company, cat, sr) => {
    if (!company) return overallEnabled ? (parseFloat(overallProfitPct) || null) : null;
    const m1 = profitRules.find(r => r.company_name === company && r.category === cat && r.size_range === sr);
    if (m1) return parseFloat(m1.profit_pct);
    const m2 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === sr && sr);
    if (m2) return parseFloat(m2.profit_pct);
    const m3 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === '');
    if (m3) return parseFloat(m3.profit_pct);
    // Fallback to overall if enabled
    if (overallEnabled) return parseFloat(overallProfitPct) || null;
    return null;
  };

  useEffect(() => {
    if (!editItemData && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(companies[0]);
    }
  }, [companies]);

  useEffect(() => {
    if (!editItemData && !showCompanyModal && isActive) {
      if (specialMode) {
        // In special mode, set description with brand + 'D-' and focus on description
        if (brand && !description) {
          setDescription(brand + ' D-');
        }
        setTimeout(() => refs.current.description?.focus(), 200);
      } else {
        setTimeout(() => refs.current.brand?.focus(), 200);
      }
    }
  }, [editItemData, companies, showCompanyModal, isActive, specialMode, brand]);

  // Store previous category and gender when special mode is enabled
  useEffect(() => {
    if (specialMode && !previousCategory && category) {
      setPreviousCategory(category);
    }
    if (specialMode && !previousGender && gender) {
      setPreviousGender(gender);
    }
  }, [specialMode, category, gender, previousCategory, previousGender]);

  // Ensure category and gender are set to previous values when in special mode
  useEffect(() => {
    if (specialMode) {
      if (previousCategory) setCategory(previousCategory);
      if (previousGender) setGender(previousGender);
    }
  }, [specialMode, previousCategory, previousGender]);

  // Update description when brand changes in special mode
  useEffect(() => {
    if (specialMode && brand) {
      setDescription(brand + ' D-');
    }
  }, [specialMode, brand]);

  useEffect(() => {
    if (editItemData) {
      setIsEditing(true);
      setItemCode(editItemData.item_code);
      setDescription(editItemData.description);
      setGender(editItemData.gender || '');
      setCategory(editItemData.category || '');
      setBrand(editItemData.brand || '');
      setSizeRange(editItemData.size_range || '');
      setYear(editItemData.year || currentYear);
      setPurchaseRate(editItemData.purchase_rate ? String(parseFloat(editItemData.purchase_rate)) : '');
      setSaleRate(editItemData.sale_rate ? String(parseFloat(editItemData.sale_rate)) : '');
      setDiscount(editItemData.discount && parseFloat(editItemData.discount) > 0 ? String(parseFloat(editItemData.discount)) : '');
      setPackingQty(editItemData.packing_qty || 6);
      setNote(editItemData.note || '');
      if (editItemData.photo_path) {
        ipcRenderer.invoke('get-product-photo', editItemData.id).then(img => { if (img) setPhotoPreview(img); });
      }
      const match = companies.find(c => editItemData.description.startsWith(c));
      if (match) setSelectedCompany(match);
      setTimeout(() => refs.current.brand?.focus(), 200);
    } else {
      setIsEditing(false);
      loadNextCode();
      setDescription(''); setPurchaseRate(''); setSaleRate('');
      setDiscount(''); setDiscountPct(''); setPackingQty('6');
      setBrand('');
      setPhotoFile(null); setPhotoPreview(null);
    }
  }, [editItemData]);

  const loadCompanies = async () => {
    try { setCompanies(await ipcRenderer.invoke('get-companies') || []); } catch { }
  };

  const loadNextCode = async () => {
    try {
      const code = await ipcRenderer.invoke('get-next-item-code');
      setItemCode(code);
    } catch { }
  };

  const loadSessionItems = async (sid) => {
    if (!sid) return;
    try {
      const items = await ipcRenderer.invoke('get-products-by-session', sid) || [];
      setSessionItems(items);
    } catch { }
  };



  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;
    if (!itemCode.trim()) {
      setStatusMsg('❌ Item Code is required');
      setTimeout(() => setStatusMsg(''), 3000);
      refs.current.itemCode?.focus();
      return;
    }
    if (!purchaseRate) {
      setStatusMsg('❌ Fill in Purchase Rate');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    if (!specialMode && !saleRate) {
      setStatusMsg('❌ Fill in Sale Rate');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    const payload = {
      itemCode: itemCode.trim().toUpperCase(),
      description: description.trim(),
      gender: specialMode ? previousGender : gender,
      category: specialMode ? previousCategory : category,
      brand: brand,
      sizeRange: sizeRange.trim(),
      purchaseRate: parseFloat(purchaseRate),
      saleRate: parseFloat(saleRate),
      packingQty: parseInt(packingQty) || 6,
      year: year,
      discount: discount ? parseFloat(discount) : 0,
      note: note.trim(),
    };

    // For new items (not editing), check for duplicates first
    if (!isEditing) {
      try {
        const dup = await ipcRenderer.invoke('check-duplicate-product', {
          description: payload.description,
          gender: payload.gender,
          category: payload.category,
          brand: payload.brand,
          sizeRange: payload.sizeRange,
          year: payload.year,
        });
        if (dup) {
          setDuplicateItem(dup);
          setPendingPayload(payload);
          return; // Wait for user decision
        }
      } catch (err) {
        console.error('Duplicate check failed', err);
      }
    }

    await doSave(payload);
  };

  const doSave = async (payload) => {
    setIsSubmitting(true);
    setStatusMsg('Saving...');

    try {
      let result;
      if (isEditing) {
        let finalPhotoPath = editItemData.photo_path;
        if (photoFile) {
          const pr = await ipcRenderer.invoke('save-product-photo', { productId: editItemData.id, photoData: photoPreview });
          if (pr?.photoPath) finalPhotoPath = pr.photoPath;
        } else if (!photoPreview) {
          finalPhotoPath = null;
        }
        result = await ipcRenderer.invoke('update-product', { ...payload, id: editItemData.id, photoPath: finalPhotoPath });
        if (result.success) { setStatusMsg(`✅ Updated! ${payload.itemCode}`); setTimeout(() => onClearEdit?.(), 500); }
        else setStatusMsg(`❌ ${result.error}`);
      } else {
        result = await ipcRenderer.invoke('save-product', { ...payload, sessionId, createdBy: currentUser?.username || 'Unknown' });
        if (result.success) {
          if (photoFile) await ipcRenderer.invoke('save-product-photo', { productId: result.id, photoData: photoPreview });
          setStatusMsg(`✅ Saved! ${result.itemCode}`);
          setTimeout(() => {
            setStatusMsg('');
            loadNextCode();
            loadSessionItems(sessionId);
            setDescription(''); setPurchaseRate(''); setSaleRate(''); setDiscount(''); setDiscountPct('');
            setPhotoFile(null); setPhotoPreview(null);
            setNote('');
            if (specialMode) {
              setDescription(brand + ' D-');
              setTimeout(() => refs.current.description?.focus(), 50);
            } else {
              setTimeout(() => refs.current.brand?.focus(), 50);
            }
          }, 500);
        } else {
          setStatusMsg(`❌ ${result.error || 'Failed to save'}`);
          setTimeout(() => setStatusMsg(''), 4000);
        }
      }
    } catch (err) {
      setStatusMsg(`❌ ${err.message}`);
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicateMerge = async () => {
    if (!duplicateItem || !pendingPayload) return;
    setIsSubmitting(true);
    setStatusMsg('Merging...');
    try {
      const originalPacking = parseInt(duplicateItem.packing_qty) || 0;
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = await ipcRenderer.invoke('start-new-item-session');
        setSessionId(activeSessionId);
      }
      // If a new purchase rate was entered, overwrite existing purchase rate; keep sale rate identical to existing item
      const newPurchaseRate = (pendingPayload && pendingPayload.purchaseRate !== undefined && !isNaN(pendingPayload.purchaseRate) && pendingPayload.purchaseRate > 0)
        ? pendingPayload.purchaseRate
        : duplicateItem.purchase_rate;
      const existingSaleRate = duplicateItem.sale_rate;

      await ipcRenderer.invoke('update-product', {
        id: duplicateItem.id,
        itemCode: duplicateItem.item_code,
        description: duplicateItem.description,
        gender: duplicateItem.gender,
        category: duplicateItem.category,
        brand: duplicateItem.brand || pendingPayload.brand,
        sizeRange: duplicateItem.size_range,
        purchaseRate: newPurchaseRate, // Overwrites purchase rate with new value
        saleRate: existingSaleRate,     // Sale rate remains unchanged
        packingQty: originalPacking,
        year: duplicateItem.year,
        photoPath: duplicateItem.photo_path,
        discount: duplicateItem.discount,
        note: duplicateItem.note,
        sessionId: activeSessionId,
      });
      // Immediately reload session items list so UI reflects the merged item right away
      await loadSessionItems(activeSessionId);
      setStatusMsg(`✅ Merged into Session #${activeSessionId} (${duplicateItem.item_code})`);
      setTimeout(() => {
        setStatusMsg('');
        loadNextCode();
        setDescription(''); setPurchaseRate(''); setSaleRate(''); setDiscount(''); setDiscountPct('');
        setPhotoFile(null); setPhotoPreview(null); setNote('');
        setTimeout(() => refs.current.brand?.focus(), 50);
      }, 1000);
    } catch (err) {
      setStatusMsg(`❌ Merge failed: ${err.message}`);
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setIsSubmitting(false);
      setDuplicateItem(null);
      setPendingPayload(null);
    }
  };

  const handleDuplicateCreateNew = async () => {
    setDuplicateItem(null);
    if (pendingPayload) {
      await doSave(pendingPayload);
    }
    setPendingPayload(null);
  };

  const handleReset = () => {
    if (isEditing) { onClearEdit?.(); return; }
    loadNextCode();
    setDescription(''); setPurchaseRate(''); setSaleRate(''); setDiscount(''); setDiscountPct('');
    setBrand(brandsList.length > 0 ? brandsList[0].name : '');
    setGender(gendersList.length > 0 ? gendersList[0].name : '');
    const savedDefaultCat = localStorage.getItem('default_category') || '';
    const initialCategory = (savedDefaultCat && categoriesList.some(c => c.name === savedDefaultCat))
      ? savedDefaultCat
      : (categoriesList.length > 0 ? categoriesList[0].name : '');
    setCategory(initialCategory);
    setSizeRange(sizeRangesList.length > 0 ? sizeRangesList[0].name : '');
    setPackingQty(packingsList.length > 0 ? parseInt(packingsList[0].value) : 6);
    setPhotoFile(null); setPhotoPreview(null);
    setYear(currentYear); setNote('');
    // Reset previous values when in normal mode
    if (!specialMode) {
      setPreviousCategory('');
      setPreviousGender('');
    }
    if (specialMode) {
      // In special mode, preserve category and gender but reset description
      setDescription(brand + ' D-');
      setTimeout(() => refs.current.description?.focus(), 100);
    } else {
      setTimeout(() => refs.current.brand?.focus(), 100);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      // Ctrl+X: close profit sheet if open; otherwise App.jsx handles swapping to Fast Purchase
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (showProfitModal) {
          e.preventDefault();
          e.stopPropagation();
          setShowProfitModal(false);
          return;
        }
        return;
      }
      // Ctrl+F: toggle Fast mode
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSpecialMode(prev => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Close manage/company modals immediately
        if (showManageModal) { setShowManageModal(false); return; }
        if (showCompanyModal) { setShowCompanyModal(false); return; }
        // In profit sheet: save all and show banner (don't close)
        if (showProfitModal) {
          (async () => {
            await saveOverallProfit();
            if (selectedProfitCompany && (defaultPctInput || defaultDiscInput)) {
              await saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput);
            }
            setProfitSavedMsg('✅ Saved!');
            setTimeout(() => setProfitSavedMsg(''), 2000);
          })();
          return;
        }
        handleSubmit(e);
      }
      // Esc closes profit sheet
      if (e.key === 'Escape' && showProfitModal) {
        e.preventDefault();
        setShowProfitModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, itemCode, description, purchaseRate, saleRate, packingQty, gender, category, sizeRange, isEditing, showManageModal, showProfitModal, showCompanyModal, selectedProfitCompany, defaultPctInput, defaultDiscInput, note, overallProfitPct, overallDiscountPct, overallEnabled, sessionId]);

  // Round a number to the nearest multiple of 5 (so last digit is 0 or 5)
  const roundToFive = (n) => Math.round(n / 5) * 5;

  // Auto-calculate sale rate and discount from profit rules when purchase rate changes
  useEffect(() => {
    if (isEditing || !purchaseRate || !brand) return;
    const pct = findProfitPct(brand, gender, sizeRange);
    const dPct = findDiscountPct(brand, gender, sizeRange);
    if (pct !== null) {
      const rawSale = parseFloat(purchaseRate) * (1 + pct / 100);
      const calculatedSale = roundToFive(rawSale);
      setSaleRate(String(calculatedSale));
      if (dPct > 0) {
        setDiscount(String(roundToFive(calculatedSale * (dPct / 100))));
      } else {
        setDiscount('');
      }
    }
  }, [purchaseRate, brand, gender, sizeRange, profitRules]);

  // Live-recalculate discount amount whenever sale rate or brand changes (only for new items)
  useEffect(() => {
    if (isEditing || !saleRate) return;
    const dPct = findDiscountPct(brand, gender, sizeRange);
    if (dPct > 0) {
      setDiscount(String(roundToFive(parseFloat(saleRate) * (dPct / 100))));
    }
  }, [saleRate, brand, gender, sizeRange, profitRules, overallDiscountPct, overallEnabled]);

  const handleEnter = (e, nextKey) => {
    if (e.key === 'Enter') { e.preventDefault(); refs.current[nextKey]?.focus(); }
  };

  const margin = purchaseRate && saleRate ? Math.round(((parseFloat(saleRate) - parseFloat(purchaseRate)) / parseFloat(purchaseRate)) * 100) : null;

  return (
    <div className="new-item-wrapper fade-in">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 className="page-title" style={{ margin: 0 }}>{isEditing ? 'Edit Stock Entry' : 'New Stock Entry'}</h2>
          {isActive && sessionId && !isEditing && (
            <div className="session-banner" style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>
              Session: {sessionId} | {currentTime}
            </div>
          )}
        </div>
        {statusMsg && (
          <span style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
            background: statusMsg.includes('✅') ? '#d1fae5' : '#fee2e2',
            color: statusMsg.includes('✅') ? '#065f46' : '#b91c1c',
            border: `1px solid ${statusMsg.includes('✅') ? '#6ee7b7' : '#fca5a5'}`,
          }}>{statusMsg}</span>
        )}
        <div className="header-actions">
          <button type="button" onClick={() => openWindow('fast-purchase')} className="btn" style={{ background: '#73cbfb', color: '#000', border: '1px solid #2d9efb', fontWeight: 700 }}>
            FP
          </button>
          <button type="button" onClick={() => setSpecialMode(!specialMode)} className="btn" style={{ background: specialMode ? '#6df166' : '#49f843ff', color: '#000', border: '1px solid #2af31f', fontWeight: 700 }}>
            {specialMode ? '⚡ Fast ON' : '⚡ Fast'}
          </button>
          <button type="button" onClick={() => setShowProfitModal(true)} className="btn btn-secondary">📊 Profit Sheet</button>
          <select value="" onChange={e => { if (e.target.value) openListManager(e.target.value); }} className="btn btn-secondary" style={{ appearance: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="" disabled>⚙️ Manage Lists...</option>
            <option value="brands">🏢 Brands</option>
            <option value="genders">👔 Genders</option>
            <option value="categories">🏷️ Categories</option>
            <option value="size_ranges">📏 Sizes</option>
            <option value="packings">📦 Packings</option>
          </select>
          <button type="button" onClick={handleSubmit} className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* LEFT: Input */}
        <div className="dashboard-col">
          <div className="dashboard-card">
            <h3 className="card-title">Basic Information</h3>
            <div className="form-grid">
              {/* Row 1: Item Code + Brand */}
              <div className="form-group span-half">
                <label>Item Code</label>
                <input ref={el => refs.current.itemCode = el} type="text" value={itemCode}
                  onChange={e => setItemCode(e.target.value.toUpperCase())}
                  onKeyDown={e => handleEnter(e, 'brand')}
                  className="form-input" style={{ fontWeight: 700, backgroundColor: '#f1f5f9' }} />
              </div>
              <div className="form-group span-half">
                <label>Brand</label>
                <select ref={el => refs.current.brand = el} value={brand}
                  onChange={e => setBrand(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (brand) setDescription(brand + ' D-'); refs.current.description?.focus(); } }} className="form-input">
                  {brandsList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {/* Row 2: Description */}
              <div className="form-group span-full">
                <label>Description</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!isEditing && sessionId && (
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#e353f7',
                      color: 'black', fontWeight: 800, fontSize: '1.2rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, boxShadow: '0 2px 6px rgba(227,83,247,0.45)'
                    }}>
                      {sessionItems.length + 1}
                    </div>
                  )}
                  <input ref={el => refs.current.description = el} type="text" value={description}
                    onChange={e => setDescription(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (specialMode) {
                          refs.current.sizeRange?.focus();
                        } else {
                          refs.current.category?.focus();
                        }
                      }
                    }}
                    placeholder="e.g. Cotton Suit, Jeans, Shirt..." className="form-input" style={{ flex: 1 }} />
                </div>
              </div>

              {/* Row 3: Category + Size Range + Gender */}
              {!specialMode && (
                <>
                  <div className="form-group span-third">
                    <label>Category</label>
                    <select ref={el => refs.current.category = el} value={category}
                      onChange={e => { setCategory(e.target.value); setPreviousCategory(e.target.value); }}
                      onKeyDown={e => handleEnter(e, 'sizeRange')} className="form-input">
                      {categoriesList.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group span-third">
                    <label>Size Range</label>
                    <select ref={el => refs.current.sizeRange = el} value={sizeRange}
                      onChange={e => setSizeRange(e.target.value)}
                      onKeyDown={e => handleEnter(e, 'gender')} className="form-input">
                      {sizeRangesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group span-third">
                    <label>Gender</label>
                    <select ref={el => refs.current.gender = el} value={gender}
                      onChange={e => { setGender(e.target.value); setPreviousGender(e.target.value); }}
                      onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                      {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              {specialMode && (
                <>
                  <div className="form-group span-full">
                    <label>Size Range</label>
                    <select ref={el => refs.current.sizeRange = el} value={sizeRange}
                      onChange={e => setSizeRange(e.target.value)}
                      onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                      {sizeRangesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Row 4: Rates & Packing */}
              {!specialMode ? (
                <>
                  <div className="span-third" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group">
                      <label>Purchase Rate (PKR)</label>
                      <input ref={el => refs.current.purchaseRate = el} type="number" value={purchaseRate}
                        onChange={e => setPurchaseRate(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            refs.current.packing?.focus();
                          }
                        }}
                        placeholder="0" className="form-input highlight-on-focus" style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, color: purchaseRate ? '#000' : '#9ca3af', backgroundColor: '#9c9cfe', borderRadius: '8px', padding: '0 10px', height: '70px', lineHeight: '70px', margin: 0, border: 'none' }} />
                    </div>

                    <div className="form-group">
                      <label>Sale Rate (PKR)</label>
                      <input ref={el => refs.current.saleRate = el} type="number" value={saleRate}
                        onChange={e => setSaleRate(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); }
                          if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); refs.current.discount?.focus(); }
                        }}
                        placeholder="0" className="form-input highlight-on-focus" style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, color: saleRate ? '#fff' : '#6b7280', backgroundColor: '#000', borderRadius: '8px', padding: '0 10px', height: '70px', lineHeight: '70px', margin: 0, border: 'none' }} />
                    </div>
                  </div>

                  <div className="form-group span-third">
                    <label>Packing Qty</label>
                    <select ref={el => refs.current.packing = el} value={packingQty}
                      onChange={e => setPackingQty(parseInt(e.target.value))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); refs.current.saleRate?.focus(); } }}
                      className="form-input">
                      {packingsList.map(p => <option key={p.id} value={p.value}>{p.value}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="span-third" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group">
                      <label>Purchase Rate (PKR)</label>
                      <input ref={el => refs.current.purchaseRate = el} type="number" value={purchaseRate}
                        onChange={e => setPurchaseRate(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            refs.current.packing?.focus();
                          }
                        }}
                        placeholder="0" className="form-input highlight-on-focus" style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, color: purchaseRate ? '#000' : '#9ca3af', backgroundColor: '#9c9cfe', borderRadius: '8px', padding: '0 10px', height: '70px', lineHeight: '70px', margin: 0, border: 'none' }} />
                    </div>

                    <div className="form-group">
                      <label>Sale Rate (PKR)</label>
                      <input ref={el => refs.current.saleRate = el} type="number" value={saleRate}
                        onChange={e => setSaleRate(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); }
                          if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); refs.current.discount?.focus(); }
                        }}
                        placeholder="0" className="form-input highlight-on-focus" style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, color: saleRate ? '#fff' : '#6b7280', backgroundColor: '#000', borderRadius: '8px', padding: '0 10px', height: '70px', lineHeight: '70px', margin: 0, border: 'none' }} />
                    </div>

                    <div className="form-group">
                      <label>Discount (PKR)</label>
                      <input ref={el => refs.current.discount = el} type="number" value={discount}
                        onChange={e => setDiscount(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                        placeholder="0" className="form-input highlight-on-focus" style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 800, color: discount ? '#be123c' : '#6b7280', backgroundColor: '#fff1f2', borderRadius: '6px', padding: '8px 6px', border: '1px solid #fecdd3', height: '50px' }} />
                    </div>
                  </div>

                  <div className="form-group span-third">
                    <label>Packing Qty</label>
                    <select ref={el => refs.current.packing = el} value={packingQty}
                      onChange={e => setPackingQty(parseInt(e.target.value))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); refs.current.saleRate?.focus(); } }}
                      className="form-input">
                      {packingsList.map(p => <option key={p.id} value={p.value}>{p.value}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Row 6: Discount + Year + Note */}
            {!specialMode && (
              <div className="form-grid" style={{ marginTop: '16px', alignItems: 'flex-end' }}>
                <div className="form-group span-third" style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Discount Amount</span>
                    {(() => {
                      const dPct = findDiscountPct(brand, gender, sizeRange);
                      return dPct > 0
                        ? <span style={{ fontSize: '0.75rem', color: '#e53935', fontWeight: 700, background: '#fff0f0', padding: '2px 8px', borderRadius: 5 }}>{dPct}% of sale</span>
                        : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>set in Profit Sheet</span>;
                    })()}
                  </label>
                  <input
                    ref={el => refs.current.discount = el}
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); }
                      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); refs.current.year?.focus(); }
                    }}
                    placeholder="0"
                    className="form-input"
                    style={{
                      backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c',
                      fontWeight: '800', fontSize: '1.25rem'
                    }}
                  />
                  {saleRate && discount && parseFloat(discount) > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, fontSize: '0.78rem', color: '#9ca3af', marginTop: 4, whiteSpace: 'nowrap' }}>
                      Price after discount: <strong style={{ color: '#15803d' }}>PKR {Math.round((parseFloat(saleRate) || 0) - (parseFloat(discount) || 0))}</strong>
                    </div>
                  )}
                </div>
                <div className="form-group span-third">
                  <label>Year</label>
                  <input ref={el => refs.current.year = el} type="text" value={year}
                    onChange={e => setYear(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); }
                      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); refs.current.note?.focus(); }
                    }}
                    className="form-input" />
                </div>
                <div className="form-group span-third">
                  <label>Note</label>
                  <input ref={el => refs.current.note = el} type="text" value={note}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                    placeholder="Optional note..."
                    className="form-input" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="dashboard-col">
          <div className="preview-card">
            <h3 className="card-title">Product Preview</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Item Code - highlighted, left-aligned, big */}
              {itemCode && (
                <div style={{
                  background: '#eef2ff', borderRadius: '10px 10px 0 0', border: '1px solid #c7d2fe',
                  padding: '12px 18px'
                }}>
                  <span style={{ fontWeight: 900, fontSize: '1.4rem', color: '#3730a3', letterSpacing: '1px' }}>{itemCode}</span>
                </div>
              )}
              {/* Header row: DESCRIPTION | SALE RATE */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8fafc', borderLeft: '1px solid #e4e6ef', borderRight: '1px solid #e4e6ef',
                borderTop: itemCode ? 'none' : '1px solid #e4e6ef',
                padding: '8px 18px'
              }}>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</span>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sale Rate</span>
              </div>
              {/* Values row: description text | sale rate badge */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fff', border: '1px solid #e4e6ef', borderTop: 'none',
                borderRadius: '0 0 10px 10px', padding: '14px 18px', gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {!isEditing && sessionId && (
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#e353f7',
                      color: 'black', fontWeight: 800, fontSize: '0.85rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, boxShadow: '0 2px 6px rgba(227,83,247,0.45)'
                    }}>
                      {sessionItems.length + 1}
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e1e2d', minWidth: 0, whiteSpace: 'normal', wordWrap: 'break-word', lineHeight: '1.4' }}>
                    {`${description || ''} ${category || ''} ${sizeRange || ''} ${gender || ''}`.trim() || '\u2014'}
                  </span>
                </div>
                {saleRate && (
                  <span style={{
                    background: '#000', color: '#fff', fontWeight: 800, fontSize: '2.2rem',
                    padding: '8px 24px', borderRadius: 8, letterSpacing: '0.5px', flexShrink: 0
                  }}>
                    {saleRate}
                  </span>
                )}
              </div>
            </div>

            {/* Photo */}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5e6278', display: 'block', marginBottom: 6 }}>Product Photo</label>
              <div className="photo-area" onClick={() => fileInputRef.current?.click()} style={{ height: 110 }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPhotoFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setPhotoPreview(reader.result);
                    reader.readAsDataURL(file);
                  }} />
                {photoPreview ? (
                  <>
                    <img src={photoPreview} alt="preview" className="photo-preview" onClick={e => { e.stopPropagation(); setShowPhotoModal(true); }} />
                    <button className="btn-remove-photo" onClick={e => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>✕</button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#aaa' }}>
                    <div style={{ fontSize: '1.5rem' }}>📷</div>
                    <div style={{ fontSize: '0.75rem' }}>Click to upload</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Modal */}
      {showPhotoModal && (
        <div className="modal-overlay" onClick={() => setShowPhotoModal(false)}>
          <div style={{ maxWidth: 600, width: '90%' }} onClick={e => e.stopPropagation()}>
            <img src={photoPreview} alt="Full" style={{ width: '100%', borderRadius: 8 }} />
          </div>
        </div>
      )}

      {/* Profit Sheet Modal */}
      {showProfitModal && (() => {
        const filteredBrands = brandSearchQuery
          ? brandsList.filter(b => b.name.toLowerCase().includes(brandSearchQuery.toLowerCase()))
          : brandsList;
        const companyRules = profitRules.filter(r => r.company_name === selectedProfitCompany);
        const defaultRule = companyRules.find(r => r.category === '' && r.size_range === '');
        const overrideRules = companyRules.filter(r => r.size_range !== '' || r.category !== '');
        const brandNames = filteredBrands.map(b => b.name);
        const coIdx = brandNames.indexOf(selectedProfitCompany);

        const handleCompanyNav = (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); selectProfitCompany(brandNames[Math.min(coIdx + 1, brandNames.length - 1)]); }
          if (e.key === 'ArrowUp') { e.preventDefault(); selectProfitCompany(brandNames[Math.max(coIdx - 1, 0)]); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); profitModalRefs.current.defaultPct?.focus(); }
          if (e.key === 'Escape') setShowProfitModal(false);
        };

        const showSavedBanner = () => {
          setProfitSavedMsg('✅ Saved!');
          setTimeout(() => setProfitSavedMsg(''), 2000);
        };

        const handleSaveAll = async () => {
          // Save overall
          await saveOverallProfit();
          // Save brand default if present
          if (selectedProfitCompany && (defaultPctInput || defaultDiscInput)) {
            await saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput);
          }
          // Save all override edits
          for (const rule of overrideRules) {
            const vals = ruleEdits[rule.id];
            if (vals) await saveProfitRule(rule.company_name, rule.category, rule.size_range, vals.pct, vals.disc);
          }
          showSavedBanner();
        };

        return (
          <div className="modal-overlay" onClick={() => setShowProfitModal(false)}>
            <div className="modal-content" style={{ maxWidth: 780, width: '96%', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #e4e6ef', background: '#f8fafc', gap: 10 }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>📊 Profit Sheet</h3>
                {profitSavedMsg && (
                  <span style={{ padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', animation: 'fadeIn 0.2s' }}>{profitSavedMsg}</span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={handleSaveAll} className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.82rem' }}>💾 Save</button>
                <button className="modal-close" style={{ position: 'static' }} onClick={() => setShowProfitModal(false)}>✕</button>
              </div>

              <div style={{ display: 'flex', height: 510 }}>

                {/* Left: brand search + company list */}
                <div style={{ width: 192, borderRight: '1px solid #e4e6ef', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  {/* Search */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #e4e6ef' }}>
                    <input
                      type="text" value={brandSearchQuery}
                      onChange={e => setBrandSearchQuery(e.target.value)}
                      placeholder="🔍 Search brands..."
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #e4e6ef', borderRadius: 5, fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Brand list */}
                  <div
                    tabIndex={0}
                    onKeyDown={handleCompanyNav}
                    style={{ flex: 1, overflowY: 'auto', outline: 'none' }}
                  >
                    {filteredBrands.length === 0 && <div style={{ padding: 16, color: '#9ca3af', fontSize: '0.85rem' }}>{brandSearchQuery ? 'No matches' : 'No brands yet. Add brands first →'}</div>}
                    {filteredBrands.map(brand => {
                      const co = brand.name;
                      const def = profitRules.find(r => r.company_name === co && r.category === '' && r.size_range === '');
                      const ov = profitRules.filter(r => r.company_name === co && (r.size_range !== '' || r.category !== ''));
                      const isSel = selectedProfitCompany === co;
                      return (
                        <div key={co}
                          onClick={() => selectProfitCompany(co)}
                          style={{ padding: '9px 13px', cursor: 'pointer', borderLeft: `3px solid ${isSel ? '#3699ff' : 'transparent'}`, background: isSel ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.87rem', color: '#1e1e2d' }}>{co}</div>
                          <div style={{ fontSize: '0.71rem', color: def ? '#3699ff' : '#9ca3af', marginTop: 2 }}>
                            {def ? `${def.profit_pct}% default` : 'no default'}
                            {ov.length > 0 && <span style={{ color: '#9ca3af' }}> · {ov.length} rule{ov.length > 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: rules editor */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Overall Profit & Discount */}
                  <div style={{ background: overallEnabled ? '#fffbeb' : '#f9fafb', border: `1px solid ${overallEnabled ? '#fbbf24' : '#e4e6ef'}`, borderRadius: 8, padding: '11px 14px', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5e6278', textTransform: 'uppercase' }}>Overall Profit & Discount</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: overallEnabled ? '#d97706' : '#9ca3af', fontWeight: 600 }}>
                        <input type="checkbox" checked={overallEnabled} onChange={e => { setOverallEnabled(e.target.checked); }} style={{ accentColor: '#f59e0b' }} />
                        {overallEnabled ? 'ON' : 'OFF'}
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: overallEnabled ? 1 : 0.5, pointerEvents: overallEnabled ? 'auto' : 'none' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', marginRight: 4, color: '#16a34a', fontWeight: 'bold' }}>Profit</span>
                        <input type="number" value={overallProfitPct}
                          onChange={e => setOverallProfitPct(e.target.value)}
                          onBlur={saveOverallProfit}
                          min="0" max="500" step="0.5"
                          style={{ width: 60, padding: '7px 5px', border: '2px solid #4caf50', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700 }}
                        />
                        <span style={{ fontWeight: 700, color: '#5e6278', marginLeft: 4 }}>%</span>
                      </div>
                      <div style={{ marginLeft: 8 }}>
                        <span style={{ fontSize: '0.75rem', marginRight: 4, color: '#dc2626', fontWeight: 'bold' }}>Discount</span>
                        <input type="number" value={overallDiscountPct}
                          onChange={e => setOverallDiscountPct(e.target.value)}
                          onBlur={saveOverallProfit}
                          min="0" max="100" step="0.5"
                          style={{ width: 60, padding: '7px 5px', border: '2px solid #f44336', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700 }}
                        />
                        <span style={{ fontWeight: 700, color: '#5e6278', marginLeft: 4 }}>%</span>
                      </div>
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af', marginLeft: 'auto' }}>Overridden by brand settings</span>
                    </div>
                  </div>

                  {!selectedProfitCompany ? (
                    <div style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 40, fontSize: '0.9rem' }}>Select a brand ←</div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e1e2d', paddingBottom: 6, borderBottom: '2px solid #e4e6ef' }}>{selectedProfitCompany}</div>

                      {/* Brand Default % */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e4e6ef', borderRadius: 8, padding: '11px 14px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5e6278', textTransform: 'uppercase', marginBottom: 8 }}>Brand Default % — overrides overall</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', marginRight: 4, color: '#16a34a', fontWeight: 'bold' }}>Profit</span>
                            <input
                              ref={el => profitModalRefs.current.defaultPct = el}
                              type="number" value={defaultPctInput}
                              onChange={e => setDefaultPctInput(e.target.value)}
                              onBlur={() => { if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.defaultDisc?.focus(); } }}
                              min="0" max="500" step="0.5"
                              style={{ width: 60, padding: '7px 5px', border: '2px solid #4caf50', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700 }}
                            />
                            <span style={{ fontWeight: 700, color: '#5e6278', marginLeft: 4 }}>%</span>
                          </div>
                          <div style={{ marginLeft: 8 }}>
                            <span style={{ fontSize: '0.75rem', marginRight: 4, color: '#dc2626', fontWeight: 'bold' }}>Discount</span>
                            <input
                              ref={el => profitModalRefs.current.defaultDisc = el}
                              type="number" value={defaultDiscInput}
                              onChange={e => setDefaultDiscInput(e.target.value)}
                              onBlur={() => { if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); profitModalRefs.current.newCat?.focus(); } }}
                              min="0" max="100" step="0.5"
                              style={{ width: 60, padding: '7px 5px', border: '2px solid #f44336', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700 }}
                            />
                            <span style={{ fontWeight: 700, color: '#5e6278', marginLeft: 4 }}>%</span>
                          </div>
                          {defaultRule && (
                            <button onClick={() => { deleteProfitRule(defaultRule.id); setDefaultPctInput(''); setDefaultDiscInput(''); }}
                              style={{ marginLeft: 4, background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Override table */}
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5e6278', textTransform: 'uppercase', marginBottom: 8 }}>
                          Size Range Overrides {overrideRules.length > 0 && <span style={{ color: '#3699ff' }}>({overrideRules.length})</span>}
                        </div>
                        {overrideRules.length === 0
                          ? <div style={{ color: '#9ca3af', fontSize: '0.84rem', padding: '6px 0' }}>No overrides — add one below</div>
                          : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                              <thead>
                                <tr style={{ background: '#f5f7fa' }}>
                                  <th style={mTh}>Category</th>
                                  <th style={mTh}>Size Range</th>
                                  <th style={{ ...mTh, width: 80 }}>Profit %</th><th style={{ ...mTh, width: 80 }}>Disc %</th>
                                  <th style={{ ...mTh, width: 50, textAlign: 'center' }}>Del</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overrideRules.map((rule, idx) => (
                                  <tr key={rule.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={mTd}>{rule.category || <span style={{ color: '#9ca3af' }}>Any</span>}</td>
                                    <td style={{ ...mTd, fontWeight: 700 }}>{rule.size_range}</td>
                                    <td style={mTd}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input
                                          ref={el => profitModalRefs.current[`rule_${rule.id}_pct`] = el}
                                          type="number"
                                          value={ruleEdits[rule.id]?.pct ?? String(rule.profit_pct || 0)}
                                          onChange={e => setRuleEdits(p => ({ ...p, [rule.id]: { ...p[rule.id], pct: e.target.value } }))}
                                          onBlur={() => {
                                            const vals = ruleEdits[rule.id];
                                            if (vals) saveProfitRule(rule.company_name, rule.category, rule.size_range, vals.pct, vals.disc);
                                          }}
                                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current[`rule_${rule.id}_disc`]?.focus(); } }}
                                          style={{ width: 55, padding: '5px 7px', border: '2px solid #4caf50', borderRadius: 4, fontSize: '0.92rem', fontFamily: 'inherit', fontWeight: 700 }}
                                        />
                                      </div>
                                    </td>
                                    <td style={mTd}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input
                                          ref={el => profitModalRefs.current[`rule_${rule.id}_disc`] = el}
                                          type="number"
                                          value={ruleEdits[rule.id]?.disc ?? String(rule.discount_pct || 0)}
                                          onChange={e => setRuleEdits(p => ({ ...p, [rule.id]: { ...p[rule.id], disc: e.target.value } }))}
                                          onBlur={() => {
                                            const vals = ruleEdits[rule.id];
                                            if (vals) saveProfitRule(rule.company_name, rule.category, rule.size_range, vals.pct, vals.disc);
                                          }}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const vals = ruleEdits[rule.id];
                                              if (vals) saveProfitRule(rule.company_name, rule.category, rule.size_range, vals.pct, vals.disc);
                                              const next = overrideRules[idx + 1];
                                              if (next) profitModalRefs.current[`rule_${next.id}_pct`]?.focus();
                                              else profitModalRefs.current.newCat?.focus();
                                            }
                                          }}
                                          style={{ width: 55, padding: '5px 7px', border: '2px solid #f44336', borderRadius: 4, fontSize: '0.92rem', fontFamily: 'inherit', fontWeight: 700 }}
                                        />
                                      </div>
                                    </td>
                                    <td style={{ ...mTd, textAlign: 'center' }}>
                                      <button onClick={() => deleteProfitRule(rule.id)}
                                        style={{ background: '#fee2e2', color: '#dc2626', border: 'none', width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        }
                      </div>

                      {/* Add override */}
                      <div style={{ background: '#f8fafc', border: '1px dashed #d1d5db', borderRadius: 8, padding: '11px 14px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5e6278', textTransform: 'uppercase', marginBottom: 8 }}>+ Add Override</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            ref={el => profitModalRefs.current.newCat = el}
                            value={newRuleCategory}
                            onChange={e => { setNewRuleCategory(e.target.value); setNewRuleSizeRange(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.newRange?.focus(); } if (e.key === 'Escape') setShowProfitModal(false); }}
                            style={mInput}>
                            {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                          <select
                            ref={el => profitModalRefs.current.newRange = el}
                            value={newRuleSizeRange}
                            onChange={e => setNewRuleSizeRange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.newPct?.focus(); } if (e.key === 'Escape') setShowProfitModal(false); }}
                            style={mInput}>
                            <option value="">-- Size Range --</option>
                            {sizeRangesList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>Profit</span>
                            <input
                              ref={el => profitModalRefs.current.newPct = el}
                              type="number" value={newRulePct}
                              onChange={e => setNewRulePct(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.newDisc?.focus(); } }}
                              min="0" max="500" step="0.5"
                              style={{ ...mInput, width: 55, fontWeight: 700, border: '2px solid #4caf50' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700 }}>Disc</span>
                            <input
                              ref={el => profitModalRefs.current.newDisc = el}
                              type="number" value={newRuleDisc}
                              onChange={e => setNewRuleDisc(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newRuleSizeRange && (newRulePct || newRuleDisc)) {
                                    await saveProfitRule(selectedProfitCompany, newRuleCategory, newRuleSizeRange, newRulePct, newRuleDisc);
                                    setNewRuleSizeRange(''); setNewRulePct(''); setNewRuleDisc('');
                                    profitModalRefs.current.newRange?.focus();
                                  }
                                }
                              }}
                              min="0" max="100" step="0.5"
                              style={{ ...mInput, width: 55, fontWeight: 700, border: '2px solid #f44336' }}
                            />
                          </div>
                          <button
                            onClick={async () => {
                              if (!newRuleSizeRange || (!newRulePct && !newRuleDisc)) return;
                              await saveProfitRule(selectedProfitCompany, newRuleCategory, newRuleSizeRange, newRulePct, newRuleDisc);
                              setNewRuleSizeRange(''); setNewRulePct(''); setNewRuleDisc('');
                              profitModalRefs.current.newRange?.focus();
                            }}
                            className="btn btn-primary sm" disabled={!newRuleSizeRange || (!newRulePct && !newRuleDisc)}>
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manage Lists Modal */}
      {showManageModal && (
        <div className="modal-overlay" onClick={() => { setShowManageModal(false); setEditingListItemId(null); setManageListSearchQuery(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowManageModal(false); setEditingListItemId(null); setManageListSearchQuery(''); }}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700, textTransform: "capitalize" }}>⚙️ Manage {manageListType.replace("_", " ")}</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input ref={el => refs.current.manageListInput = el} type={manageListType === "packings" ? "number" : "text"} value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddListItem(); }}
                placeholder={"New " + manageListType.replace("_", " ") + "..."} style={{ flex: 1, padding: "8px 10px", border: "1px solid #e4e6ef", borderRadius: 5, fontSize: "0.9rem", fontFamily: "inherit" }} />
              <button className="btn btn-primary" onClick={handleAddListItem}>Add</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={manageListSearchQuery}
                onChange={e => setManageListSearchQuery(e.target.value)}
                placeholder={`🔍 Search ${manageListType.replace("_", " ")}...`}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4e6ef", borderRadius: 5, fontSize: "0.88rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {(() => {
              const filteredList = manageListItems.filter(item => {
                if (!manageListSearchQuery.trim()) return true;
                const q = manageListSearchQuery.toLowerCase().trim();
                const val = manageListType === "packings" ? String(item.value || '') : (item.name || '');
                return val.toLowerCase().includes(q);
              });
              return (
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  <table className="data-table">
                    <tbody>
                      {filteredList.map(item => (
                        <tr key={item.id}>
                          {editingListItemId === item.id ? (
                            <>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type={manageListType === 'packings' ? 'number' : 'text'}
                                  value={editingListItemVal}
                                  onChange={e => setEditingListItemVal(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEditListItem(item.id); else if (e.key === 'Escape') setEditingListItemId(null); }}
                                  autoFocus
                                  style={{ width: '100%', padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: 4, fontSize: '0.88rem' }}
                                />
                              </td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '6px 10px' }}>
                                <button onClick={() => handleSaveEditListItem(item.id)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', marginRight: 4 }}>Save</button>
                                <button onClick={() => setEditingListItemId(null)} style={{ background: '#94a3b8', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '6px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {manageListType === 'categories' && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetDefaultCategory(item.name === defaultCategory ? '' : item.name)}
                                      title={item.name === defaultCategory ? 'Default category (click to unset)' : 'Click to set as default category'}
                                      style={{
                                        background: item.name === defaultCategory ? '#10b981' : '#f1f5f9',
                                        color: item.name === defaultCategory ? '#ffffff' : '#94a3b8',
                                        border: item.name === defaultCategory ? '1px solid #059669' : '1px solid #cbd5e1',
                                        borderRadius: '50%',
                                        width: 24,
                                        height: 24,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                        flexShrink: 0,
                                        transition: 'all 0.15s ease',
                                        boxShadow: item.name === defaultCategory ? '0 2px 4px rgba(16,185,129,0.3)' : 'none'
                                      }}
                                    >
                                      ✓
                                    </button>
                                  )}
                                  <span style={{ fontWeight: item.name === defaultCategory ? 700 : 400, color: item.name === defaultCategory ? '#047857' : 'inherit' }}>
                                    {manageListType === "packings" ? item.value : item.name}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: "right", whiteSpace: 'nowrap', padding: '6px 10px' }}>
                                <button onClick={() => { setEditingListItemId(item.id); setEditingListItemVal(manageListType === "packings" ? String(item.value) : item.name); }} style={{ background: "#e0f2fe", color: "#0369a1", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem", marginRight: 4 }}>Edit</button>
                                <button onClick={() => handleDeleteListItem(item.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}>Delete</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredList.length === 0 && (
                    <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: "0.9rem" }}>
                      {manageListSearchQuery ? `No matching ${manageListType.replace("_", " ")} found` : "No items yet. Add one above!"}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Company Modal */}
      {showCompanyModal && (
        <div className="modal-overlay" onClick={() => setShowCompanyModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCompanyModal(false)}>✕</button>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>🏢 Company Names</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input ref={newCompanyInputRef} type="text" value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newCompanyName.trim()) {
                    await ipcRenderer.invoke('save-company', newCompanyName.trim());
                    setNewCompanyName('');
                    await loadCompanies();
                    setTimeout(() => newCompanyInputRef.current?.focus(), 0);
                  }
                }}
                placeholder="New company name..." style={{ flex: 1, padding: '8px 10px', border: '1px solid #e4e6ef', borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit' }} />
              <button className="btn btn-primary" onClick={async () => {
                if (!newCompanyName.trim()) return;
                await ipcRenderer.invoke('save-company', newCompanyName.trim());
                setNewCompanyName('');
                await loadCompanies();
              }}>Add</button>
            </div>
            <div style={{ border: '1px solid #e4e6ef', borderRadius: 6, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead><tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Company</th>
                  <th style={{ padding: '10px', width: 80, textAlign: 'center' }}>Remove</th>
                </tr></thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr><td colSpan={2} style={{ padding: 16, textAlign: 'center', color: '#aaa' }}>No companies yet</td></tr>
                  ) : companies.map(c => (
                    <tr key={c} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px' }}>{c}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={async () => { await ipcRenderer.invoke('delete-company', c); await loadCompanies(); }}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="btn btn-secondary" onClick={() => setShowCompanyModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Item Detection Modal */}
      {duplicateItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'white', borderRadius: 10, width: 460, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #f59e0b' }}>

            {/* Header */}
            <div style={{ background: '#d97706', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.3rem' }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Duplicate Item Detected</h3>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700 }}>
                Code: {duplicateItem.item_code}
              </span>
            </div>

            {/* Content */}
            <div style={{ padding: '16px 18px' }}>

              {/* Exact Saved Timestamp Banner */}
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📅 Saved On:</span>
                <span style={{ color: '#78350f', fontWeight: 800 }}>{formatExactDateTime(duplicateItem.created_at || duplicateItem.updated_at)}</span>
              </div>

              {/* Single Line Item Specification */}
              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', marginBottom: 6, lineHeight: 1.4 }}>
                  {`${duplicateItem.description || ''} + ${duplicateItem.category || ''} + ${duplicateItem.size_range || ''} + ${duplicateItem.gender || ''}`}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#047857' }}>Purchase Rate: <strong style={{ fontWeight: 800, fontSize: '0.95rem' }}>Rs. {parseFloat(duplicateItem.purchase_rate || 0).toFixed(2)}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  <span style={{ color: '#1d4ed8' }}>Sale Rate: <strong style={{ fontWeight: 800, fontSize: '0.95rem' }}>Rs. {parseFloat(duplicateItem.sale_rate || 0).toFixed(2)}</strong></span>
                </div>
                {pendingPayload && pendingPayload.purchaseRate && parseFloat(pendingPayload.purchaseRate) !== parseFloat(duplicateItem.purchase_rate) && (
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309', marginTop: 6, background: '#fef3c7', padding: '4px 8px', borderRadius: 4 }}>
                    ⚠️ New Purchase Rate (Rs. {parseFloat(pendingPayload.purchaseRate).toFixed(2)}) will overwrite existing rate, keeping Sale Rate at Rs. {parseFloat(duplicateItem.sale_rate || 0).toFixed(2)}.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setDuplicateItem(null); setPendingPayload(null); }}
                style={{ padding: '7px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' }}
              >Cancel</button>
              <button
                autoFocus
                onClick={handleDuplicateMerge}
                style={{ padding: '7px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}
              >🔀 Merge</button>
              <button
                onClick={handleDuplicateCreateNew}
                style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}
              >➕ Save as New</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const mTh = { padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef', fontSize: '0.82rem' };
const mTd = { padding: '8px 10px', color: '#3f4254', verticalAlign: 'middle' };
const mInput = { padding: '6px 8px', border: '1px solid #e4e6ef', borderRadius: 5, fontSize: '0.88rem', fontFamily: 'inherit', background: '#fff' };

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: 'white', zIndex: 9999, position: 'relative' }}>
          <h2>NewItemForm Crashed</h2>
          <pre>{this.state.error.toString()}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NewItemFormWithErrorBoundary(props) {
  return <ErrorBoundary><NewItemForm {...props} /></ErrorBoundary>;
}