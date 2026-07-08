import React, { useState, useEffect, useRef } from 'react';
import './NewItemForm.css';

const { ipcRenderer } = window.require('electron');

function NewItemForm({ editItemData, onClearEdit, isActive }) {
  const [itemCode, setItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState('');
  const [category, setCategory] = useState('');
  const [sizeRange, setSizeRange] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [saleRate, setSaleRate] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [packingQty, setPackingQty] = useState('6');
  const [year, setYear] = useState('2024-25');
  const [note, setNote] = useState('');
  const [gendersList, setGendersList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [sizeRangesList, setSizeRangesList] = useState([]);
  const [packingsList, setPackingsList] = useState([]);
  const [brandsList, setBrandsList] = useState([]);
  const [brand, setBrand] = useState('');
  const [manageListType, setManageListType] = useState('');
  const [showManageModal, setShowManageModal] = useState(false);
  const [manageListItems, setManageListItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
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

  const refs = useRef({});
  const fileInputRef = useRef(null);
  const companyRef = useRef(null);
  const newCompanyInputRef = useRef(null);
  const profitModalRefs = useRef({});

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

    setGendersList(genders);
    setCategoriesList(categories);
    setSizeRangesList(sizeRanges);
    setPackingsList(packings);
    setBrandsList(brands);

    if (!editItemData) {
      setBrand(prev => prev || (brands.length > 0 ? brands[0].name : ''));
      setGender(prev => prev || (genders.length > 0 ? genders[0].name : ''));
      setCategory(prev => prev || (categories.length > 0 ? categories[0].name : ''));
      setSizeRange(prev => prev || (sizeRanges.length > 0 ? sizeRanges[0].name : ''));
    }
  };

  const openListManager = (type) => {
    setManageListType(type); setNewItemName('');
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
    setNewItemName('');
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    if (manageListType === 'brands') setManageListItems(await ipcRenderer.invoke('get-brands') || []);
    await loadLists();
    setTimeout(() => refs.current.manageListInput?.focus(), 0);
  };

  const handleDeleteListItem = async (id) => {
    if (manageListType === 'genders') await ipcRenderer.invoke('delete-gender', id);
    if (manageListType === 'categories') await ipcRenderer.invoke('delete-category', id);
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('delete-size-range', id);
    if (manageListType === 'packings') await ipcRenderer.invoke('delete-packing', id);
    if (manageListType === 'brands') await ipcRenderer.invoke('delete-brand', id);
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    if (manageListType === 'brands') setManageListItems(await ipcRenderer.invoke('get-brands') || []);
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
      setTimeout(() => refs.current.itemCode?.focus(), 200);
    }
  }, [editItemData, companies, showCompanyModal, isActive]);

  useEffect(() => {
    if (editItemData) {
      setIsEditing(true);
      setItemCode(editItemData.item_code);
      setDescription(editItemData.description);
      setGender(editItemData.gender || '');
      setCategory(editItemData.category || '');
      setBrand(editItemData.brand || '');
      setSizeRange(editItemData.size_range || '');
      setYear(editItemData.year || '2024-25');
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
      setTimeout(() => refs.current.itemCode?.focus(), 200);
    } else {
      setIsEditing(false);
      // loadNextCode(); // Auto-increment paused as requested
      setItemCode('');
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
    try { setItemCode(await ipcRenderer.invoke('get-next-item-code')); } catch { }
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
    if (!purchaseRate || !saleRate) {
      setStatusMsg('❌ Fill in Purchase Rate and Sale Rate');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    setIsSubmitting(true);
    setStatusMsg('Saving...');

    const payload = {
      itemCode: itemCode.trim().toUpperCase(),
      description: description.trim(),
      gender: gender,
      category: category,
      brand: brand,
      sizeRange: sizeRange.trim(),
      purchaseRate: parseFloat(purchaseRate),
      saleRate: parseFloat(saleRate),
      packingQty: parseInt(packingQty) || 6,
      year: year,
      discount: discount ? parseFloat(discount) : 0,
      note: note.trim(),
    };

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
        result = await ipcRenderer.invoke('save-product', payload);
        if (result.success) {
          if (photoFile) await ipcRenderer.invoke('save-product-photo', { productId: result.id, photoData: photoPreview });
          setStatusMsg(`✅ Saved! ${result.itemCode}`);
          setTimeout(() => {
            setStatusMsg('');
            // Clear only item-specific fields, retain selects/year/packing
            setItemCode('');
            setDescription(''); setPurchaseRate(''); setSaleRate(''); setDiscount(''); setDiscountPct('');
            setPhotoFile(null); setPhotoPreview(null);
            setNote('');
            setTimeout(() => refs.current.itemCode?.focus(), 50);
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

  const handleReset = () => {
    if (isEditing) { onClearEdit?.(); return; }
    setItemCode('');
    setDescription(''); setPurchaseRate(''); setSaleRate(''); setDiscount(''); setDiscountPct('');
    setBrand(brandsList.length > 0 ? brandsList[0].name : '');
    setGender(gendersList.length > 0 ? gendersList[0].name : '');
    setCategory(categoriesList.length > 0 ? categoriesList[0].name : '');
    setSizeRange(sizeRangesList.length > 0 ? sizeRangesList[0].name : '');
    setPackingQty(packingsList.length > 0 ? parseInt(packingsList[0].value) : 6);
    setPhotoFile(null); setPhotoPreview(null);
    setYear('2024-25'); setNote('');
    setTimeout(() => refs.current.itemCode?.focus(), 100);
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      // Ctrl+X closes profit sheet
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (showProfitModal) { e.preventDefault(); setShowProfitModal(false); return; }
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
  }, [isActive, itemCode, description, purchaseRate, saleRate, packingQty, gender, category, sizeRange, isEditing, showManageModal, showProfitModal, showCompanyModal, selectedProfitCompany, defaultPctInput, defaultDiscInput, note, overallProfitPct, overallDiscountPct, overallEnabled]);

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
    <div className="new-item-dashboard">
      <header className="page-header">
        <h2 className="page-title">{isEditing ? 'Edit Stock Entry' : 'New Stock Entry'}</h2>
        {statusMsg && (
          <span style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
            background: statusMsg.includes('✅') ? '#d1fae5' : '#fee2e2',
            color: statusMsg.includes('✅') ? '#065f46' : '#b91c1c',
            border: `1px solid ${statusMsg.includes('✅') ? '#6ee7b7' : '#fca5a5'}`,
          }}>{statusMsg}</span>
        )}
        <div className="header-actions">
          <button type="button" onClick={() => setShowProfitModal(true)} className="btn btn-secondary">📊 Profit Sheet</button>
          <select value="" onChange={e => { if (e.target.value) openListManager(e.target.value); }} className="btn btn-secondary" style={{ appearance: 'none', paddingRight: '12px' }}>
            <option value="" disabled>⚙️ Manage Lists...</option>
            <option value="brands">🏢 Brands</option>
            <option value="genders">👔 Genders</option>
            <option value="categories">🏷️ Categories</option>
            <option value="size_ranges">📏 Sizes</option>
            <option value="packings">📦 Packings</option>
          </select>
          <button type="button" onClick={handleReset} className="btn btn-secondary">Reset</button>
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
                  className="form-input" style={{ fontWeight: 700 }} />
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
                <input ref={el => refs.current.description = el} type="text" value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'category')}
                  placeholder="e.g. Cotton Suit, Jeans, Shirt..." className="form-input" />
              </div>

              {/* Row 3: Category + Size Range + Gender */}
              <div className="form-group span-third">
                <label>Category</label>
                <select ref={el => refs.current.category = el} value={category}
                  onChange={e => setCategory(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'sizeRange')} className="form-input">
                  {categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                  onChange={e => setGender(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                  {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {/* Row 4: Rates (Left Column) + Packing (Middle Column) */}
              <div className="span-third" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>Purchase Rate (PKR)</label>
                  <input ref={el => refs.current.purchaseRate = el} type="number" value={purchaseRate}
                    onChange={e => setPurchaseRate(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); refs.current.saleRate?.focus(); }
                      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); refs.current.packing?.focus(); }
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
            </div>

            {/* Row 6: Discount + Year + Note */}
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
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e1e2d', flex: 1, minWidth: 0, whiteSpace: 'normal', wordWrap: 'break-word', lineHeight: '1.4' }}>
                  {`${description || ''} ${category || ''} ${sizeRange || ''} ${gender || ''}`.trim() || '\u2014'}
                </span>
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
        <div className="modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowManageModal(false)}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700, textTransform: "capitalize" }}>⚙️ Manage {manageListType.replace("_", " ")}</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input ref={el => refs.current.manageListInput = el} type={manageListType === "packings" ? "number" : "text"} value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddListItem(); }}
                placeholder={"New " + manageListType.replace("_", " ") + "..."} style={{ flex: 1, padding: "8px 10px", border: "1px solid #e4e6ef", borderRadius: 5, fontSize: "0.9rem", fontFamily: "inherit" }} />
              <button className="btn btn-primary" onClick={handleAddListItem}>Add</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table className="data-table">
                <tbody>
                  {manageListItems.map(item => (
                    <tr key={item.id}>
                      <td>{manageListType === "packings" ? item.value : item.name}</td>
                      <td style={{ textAlign: "right" }}>
                        <button onClick={() => handleDeleteListItem(item.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {manageListItems.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: "0.9rem" }}>No items yet. Add one above!</div>}
            </div>
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
