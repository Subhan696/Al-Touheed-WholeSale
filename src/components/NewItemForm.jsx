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
  const [packingQty, setPackingQty] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
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

  const refs = useRef({});
  const fileInputRef = useRef(null);
  const companyRef = useRef(null);
  const newCompanyInputRef = useRef(null);
  const profitModalRefs = useRef({});

  useEffect(() => { loadCompanies(); loadProfitRules(); loadLists(); }, []);

  const loadLists = async () => {
    setGendersList(await ipcRenderer.invoke('get-genders') || []);
    setCategoriesList(await ipcRenderer.invoke('get-categories') || []);
    setSizeRangesList(await ipcRenderer.invoke('get-size-ranges') || []);
    setPackingsList(await ipcRenderer.invoke('get-packings') || []);
    setBrandsList(await ipcRenderer.invoke('get-brands') || []);
  };

  const openListManager = (type) => {
    setManageListType(type); setNewItemName('');
    if (type === 'genders') setManageListItems(gendersList);
    if (type === 'categories') setManageListItems(categoriesList);
    if (type === 'size_ranges') setManageListItems(sizeRangesList);
    if (type === 'packings') setManageListItems(packingsList);
    setShowManageModal(true);
  };

  const handleAddListItem = async () => {
    if (!newItemName.trim()) return;
    const val = manageListType === 'packings' ? parseInt(newItemName) : newItemName.trim();
    if (manageListType === 'genders') await ipcRenderer.invoke('add-gender', val);
    if (manageListType === 'categories') await ipcRenderer.invoke('add-category', val);
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('add-size-range', val);
    if (manageListType === 'packings') await ipcRenderer.invoke('add-packing', val);
    setNewItemName('');
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    await loadLists();
  };

  const handleDeleteListItem = async (id) => {
    if (manageListType === 'genders') await ipcRenderer.invoke('delete-gender', id);
    if (manageListType === 'categories') await ipcRenderer.invoke('delete-category', id);
    if (manageListType === 'size_ranges') await ipcRenderer.invoke('delete-size-range', id);
    if (manageListType === 'packings') await ipcRenderer.invoke('delete-packing', id);
    if (manageListType === 'genders') setManageListItems(await ipcRenderer.invoke('get-genders') || []);
    if (manageListType === 'categories') setManageListItems(await ipcRenderer.invoke('get-categories') || []);
    if (manageListType === 'size_ranges') setManageListItems(await ipcRenderer.invoke('get-size-ranges') || []);
    if (manageListType === 'packings') setManageListItems(await ipcRenderer.invoke('get-packings') || []);
    await loadLists();
  };

  const loadProfitRules = async () => {
    try {
      const rules = await ipcRenderer.invoke('get-profit-rules') || [];
      setProfitRules(rules);
      const edits = {};
      rules.forEach(r => { edits[r.id] = { pct: String(r.profit_pct || 0), disc: String(r.discount_pct || 0) }; });
      setRuleEdits(edits);
    } catch {}
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

  // Auto-focus default % when modal opens
  useEffect(() => {
    if (!showProfitModal || companies.length === 0) return;
    const co = companies[0];
    selectProfitCompany(co);
  }, [showProfitModal]);

  const findDiscountPct = (company, cat, sr) => {
    if (!company) return 0;
    const m1 = profitRules.find(r => r.company_name === company && r.category === cat && r.size_range === sr);
    if (m1) return parseFloat(m1.discount_pct || 0);
    const m2 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === sr && sr);
    if (m2) return parseFloat(m2.discount_pct || 0);
    const m3 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === '');
    if (m3) return parseFloat(m3.discount_pct || 0);
    return 0;
  };
  const findProfitPct = (company, cat, sr) => {
    if (!company) return null;
    const m1 = profitRules.find(r => r.company_name === company && r.category === cat && r.size_range === sr);
    if (m1) return parseFloat(m1.profit_pct);
    const m2 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === sr && sr);
    if (m2) return parseFloat(m2.profit_pct);
    const m3 = profitRules.find(r => r.company_name === company && r.category === '' && r.size_range === '');
    if (m3) return parseFloat(m3.profit_pct);
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
      setYear(editItemData.year || new Date().getFullYear());
      setSaleRate(String(editItemData.sale_rate));
      setPackingQty(editItemData.packing_qty || 6);
      if (editItemData.photo_path) {
        ipcRenderer.invoke('get-product-photo', editItemData.id).then(img => { if (img) setPhotoPreview(img); });
      }
      const match = companies.find(c => editItemData.description.startsWith(c));
      if (match) setSelectedCompany(match);
    } else {
      setIsEditing(false);
      // loadNextCode(); // Auto-increment paused as requested
      setItemCode('');
      setYear(new Date().getFullYear());
      setDescription(''); setPurchaseRate(''); setSaleRate('');
      setBrand('');
      setPhotoFile(null); setPhotoPreview(null);
    }
  }, [editItemData]);

  const loadCompanies = async () => {
    try { setCompanies(await ipcRenderer.invoke('get-companies') || []); } catch {}
  };

  const loadNextCode = async () => {
    try { setItemCode(await ipcRenderer.invoke('get-next-item-code')); } catch {}
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;
    if (!itemCode || !description || !purchaseRate || !saleRate) {
      setStatusMsg('❌ Fill in Item Code, Description, and both Rates');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    if (parseFloat(saleRate) < parseFloat(purchaseRate)) {
      setStatusMsg('❌ Sale Rate cannot be less than Purchase Rate');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    setIsSubmitting(true);
    setStatusMsg('Saving...');

    const payload = {
      itemCode: itemCode.trim().toUpperCase(),
      description: `${description || ''} ${brand || ''} ${category || ''} ${sizeRange || ''} ${gender || ''}`.trim(),
      gender: gender,
      category: category,
      brand: brand,
      sizeRange: sizeRange.trim(),
      purchaseRate: parseFloat(purchaseRate),
      saleRate: parseFloat(saleRate),
      packingQty: parseInt(packingQty),
      year: parseInt(year),
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
        if (result.success) { setStatusMsg(`✅ Updated! ${payload.itemCode}`); setTimeout(() => onClearEdit?.(), 1500); }
        else setStatusMsg(`❌ ${result.error}`);
      } else {
        result = await ipcRenderer.invoke('save-product', payload);
        if (result.success) {
          if (photoFile) await ipcRenderer.invoke('save-product-photo', { productId: result.id, photoData: photoPreview });
          setStatusMsg(`✅ Saved! ${result.itemCode}`);
          setTimeout(() => { setStatusMsg(''); handleReset(); }, 1500);
        } else setStatusMsg(`❌ ${result.error}`);
      }
    } catch (err) {
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    if (isEditing) { onClearEdit?.(); return; }
    setDescription(''); setPurchaseRate(''); setSaleRate('');
    setPhotoFile(null); setPhotoPreview(null);
    loadNextCode();
    setYear(new Date().getFullYear());
    setTimeout(() => companyRef.current?.focus(), 100);
  };

  useEffect(() => {
    const handler = (e) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSubmit(e); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, itemCode, description, purchaseRate, saleRate, packingQty, gender, category, sizeRange, isEditing]);

  // Auto-calculate sale rate from profit rules (new items only, when purchase rate is set)
  useEffect(() => {
    if (isEditing || !purchaseRate || !selectedCompany) return;
    const pct = findProfitPct(selectedCompany, gender, sizeRange);
    if (pct !== null) setSaleRate(String(Math.round(parseFloat(purchaseRate) * (1 + pct / 100))));
  }, [purchaseRate, selectedCompany, gender, sizeRange, profitRules]);

  const handleEnter = (e, nextKey) => {
    if (e.key === 'Enter') { e.preventDefault(); refs.current[nextKey]?.focus(); }
  };

  const margin = purchaseRate && saleRate ? Math.round(((parseFloat(saleRate) - parseFloat(purchaseRate)) / parseFloat(purchaseRate)) * 100) : null;

  return (
    <div className="new-item-dashboard">
      <header className="dashboard-header">
        <h2 className="title">{isEditing ? `Edit: ${itemCode}` : 'New Stock Entry'}</h2>
        <div className="status-msg">
          {statusMsg && <span className={statusMsg.includes('❌') ? 'error' : 'success'}>{statusMsg}</span>}
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setShowProfitModal(true)} className="btn btn-secondary sm">📊 Profit Sheet</button>
          <button type="button" onClick={() => setShowCompanyModal(true)} className="btn btn-secondary sm">🏢 Companies</button>
          <button type="button" onClick={handleReset} className="btn btn-secondary sm" disabled={isSubmitting}>{isEditing ? 'Cancel' : 'Reset'}</button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary sm" disabled={isSubmitting}>
            {isSubmitting ? '...' : isEditing ? 'Update (Ctrl+S)' : 'Save (Ctrl+S)'}
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* LEFT: Input */}
        <div className="dashboard-col">
          <div className="dashboard-card">
            <h3 className="card-title">Basic Information</h3>
            <div className="form-grid">
              {/* Row 1: Item Code + Year + Packing Qty */}
              <div className="form-group span-third">
                <label>Item Code</label>
                <input ref={el => refs.current.itemCode = el} type="text" value={itemCode}
                  onChange={e => setItemCode(e.target.value.toUpperCase())}
                  onKeyDown={e => handleEnter(e, 'year')}
                  placeholder="W001" className="form-input" style={{ fontWeight: 700 }} />
              </div>
              <div className="form-group span-third">
                <label>Year</label>
                <input ref={el => refs.current.year = el} type="number" value={year}
                  onChange={e => setYear(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'packing')} className="form-input" />
              </div>
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Packing Qty</label>
                  <button type="button" onClick={() => openListManager("packings")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.packing = el} value={packingQty}
                  onChange={e => setPackingQty(parseInt(e.target.value))}
                  onKeyDown={e => handleEnter(e, 'brand')} className="form-input">
                  <option value="">-- Select --</option>
                  {packingsList.map(p => <option key={p.id} value={p.value}>{p.value} pcs/packet</option>)}
                </select>
              </div>

              {/* Row 2: Brand */}
              <div className="form-group span-half">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Brand</label>
                  <button type="button" onClick={() => openListManager("brands")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.brand = el} value={brand}
                  onChange={e => setBrand(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (brand) setDescription(brand + ' '); refs.current.description?.focus(); } }} className="form-input">
                  <option value="">-- Select --</option>
                  {brandsList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {/* Row 3: Description */}
              <div className="form-group span-full">
                <label>Description</label>
                <input ref={el => refs.current.description = el} type="text" value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'gender')}
                  placeholder="e.g. Cotton Suit, Jeans, Shirt..." className="form-input" />
              </div>

              {/* Row 3: Gender + Category + Size Range */}
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Gender</label>
                  <button type="button" onClick={() => openListManager("genders")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.gender = el} value={gender}
                  onChange={e => { setGender(e.target.value); setSizeRange(''); }}
                  onKeyDown={e => handleEnter(e, 'category')} className="form-input">
                  <option value="">-- Select --</option>
                  {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Category</label>
                  <button type="button" onClick={() => openListManager("categories")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.category = el} value={category}
                  onChange={e => setCategory(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'sizeRange')} className="form-input">
                  <option value="">-- Select --</option>
                  {categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Size Range</label>
                  <button type="button" onClick={() => openListManager("size_ranges")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.sizeRange = el} value={sizeRange}
                  onChange={e => setSizeRange(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                  <option value="">-- Select --</option>
                  {sizeRangesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {/* Row 4: Rates */}
              <div className="form-group span-half">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label>Purchase Rate (PKR)</label>
                    <input ref={el => refs.current.purchaseRate = el} type="text" inputMode="numeric"
                      value={purchaseRate} onChange={e => setPurchaseRate(e.target.value.replace(/[^\d.]/g, ''))}
                      onKeyDown={e => handleEnter(e, 'saleRate')}
                      placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                  </div>
                  <div>
                    <label>Discount Amount</label>
                    <input type="text" readOnly
                      value={((parseFloat(saleRate) || 0) * (findDiscountPct(selectedCompany, gender, sizeRange) / 100)).toFixed(0)}
                      placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600, backgroundColor: '#fff5f5', color: '#e53935', borderColor: '#ffcdd2' }} />
                  </div>
                </div>
              </div>
              <div className="form-group span-half">
                <label>Sale Rate (PKR)</label>
                <input ref={el => refs.current.saleRate = el} type="text" inputMode="numeric"
                  value={saleRate} onChange={e => setSaleRate(e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                  placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="dashboard-col">
          <div className="preview-card">
            <h3 className="card-title">Product Preview</h3>
            <div className="product-preview-box">
              <div className="item-code-badge">{itemCode || 'W000'}</div>

              <div className="preview-row" style={{ backgroundColor: '#fff3cd', fontWeight: 'bold', padding: '4px', borderRadius: '4px' }}>
                <span className="preview-label">Description</span>
                <span className="preview-value" style={{ maxWidth: '60%', textAlign: 'right' }}>{`${description || ''} ${category || ''} ${sizeRange || ''} ${gender || ''}`.trim() || '—'}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Gender</span>
                <span className="preview-value">{gender}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Category</span>
                <span className="preview-value">{category}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Size Range</span>
                <span className="preview-value">{sizeRange || '—'}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Packing</span>
                <span className="preview-value">{packingQty} pcs / packet</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Purchase Rate</span>
                <span className="preview-value" style={{ color: '#f64e60' }}>PKR {purchaseRate || '0'}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Sale Rate</span>
                <span className="preview-value" style={{ color: '#16a34a' }}>PKR {saleRate || '0'}</span>
              </div>
              {margin !== null && (
                <div className="preview-row">
                  <span className="preview-label">Margin</span>
                  <span className="preview-value" style={{ color: margin >= 0 ? '#16a34a' : '#f64e60' }}>{margin}%</span>
                </div>
              )}
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
        const companyRules = profitRules.filter(r => r.company_name === selectedProfitCompany);
        const defaultRule = companyRules.find(r => r.category === '' && r.size_range === '');
        const overrideRules = companyRules.filter(r => r.size_range !== '' || r.category !== '');
        const coIdx = companies.indexOf(selectedProfitCompany);

        const handleCompanyNav = (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); selectProfitCompany(companies[Math.min(coIdx + 1, companies.length - 1)]); }
          if (e.key === 'ArrowUp') { e.preventDefault(); selectProfitCompany(companies[Math.max(coIdx - 1, 0)]); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); profitModalRefs.current.defaultPct?.focus(); }
          if (e.key === 'Escape') setShowProfitModal(false);
        };

        const handleDefaultPctKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (defaultPctInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput);
            profitModalRefs.current.newCat?.focus();
          }
          if (e.key === 'Escape') setShowProfitModal(false);
        };

        const handleOverridePctKey = (e, rule, idx) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = ruleEdits[rule.id];
            if (val) saveProfitRule(rule.company_name, rule.category, rule.size_range, val);
            const next = overrideRules[idx + 1];
            if (next) profitModalRefs.current[`rule_${next.id}`]?.focus();
            else profitModalRefs.current.newCat?.focus();
          }
          if (e.key === 'Escape') setShowProfitModal(false);
        };

        const handleAddPctKey = async (e) => {
          if (e.key === 'Enter' && newRuleSizeRange && newRulePct) {
            e.preventDefault();
            await saveProfitRule(selectedProfitCompany, newRuleCategory, newRuleSizeRange, newRulePct);
            setNewRuleSizeRange(''); setNewRulePct('');
            profitModalRefs.current.newRange?.focus();
          }
          if (e.key === 'Escape') setShowProfitModal(false);
        };

        return (
          <div className="modal-overlay" onClick={() => setShowProfitModal(false)}>
            <div className="modal-content" style={{ maxWidth: 720, width: '96%', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #e4e6ef', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>📊 Profit Sheet</h3>
                <span style={{ marginLeft: 10, fontSize: '0.78rem', color: '#9ca3af' }}>↑↓ navigate companies · Enter/Tab to move between fields · auto-saves on blur</span>
                <button className="modal-close" style={{ position: 'static', marginLeft: 'auto' }} onClick={() => setShowProfitModal(false)}>✕</button>
              </div>

              <div style={{ display: 'flex', height: 490 }}>

                {/* Left: company list — keyboard navigable */}
                <div
                  tabIndex={0}
                  onKeyDown={handleCompanyNav}
                  style={{ width: 182, borderRight: '1px solid #e4e6ef', overflowY: 'auto', flexShrink: 0, outline: 'none' }}
                >
                  {companies.length === 0 && <div style={{ padding: 16, color: '#9ca3af', fontSize: '0.85rem' }}>No companies yet</div>}
                  {companies.map(co => {
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

                {/* Right: rules editor */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {!selectedProfitCompany ? (
                    <div style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 80, fontSize: '0.9rem' }}>Select a company ←</div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e1e2d', paddingBottom: 6, borderBottom: '2px solid #e4e6ef' }}>{selectedProfitCompany}</div>

                      {/* Default % */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e4e6ef', borderRadius: 8, padding: '11px 14px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5e6278', textTransform: 'uppercase', marginBottom: 8 }}>Default % — all items from this company</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div>
                            <span style={{fontSize: '0.75rem', marginRight: 4, color: '#16a34a', fontWeight: 'bold'}}>Profit</span>
                            <input
                              ref={el => profitModalRefs.current.defaultPct = el}
                              type="number" value={defaultPctInput}
                              onChange={e => setDefaultPctInput(e.target.value)}
                              onBlur={() => { if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.defaultDisc?.focus(); } }}
                              placeholder="e.g. 20" min="0" max="500" step="0.5"
                              style={{ width: 60, padding: '7px 5px', border: '2px solid #4caf50', borderRadius: 5, fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700 }}
                            />
                            <span style={{ fontWeight: 700, color: '#5e6278', marginLeft: 4 }}>%</span>
                          </div>
                          <div style={{marginLeft: 8}}>
                            <span style={{fontSize: '0.75rem', marginRight: 4, color: '#dc2626', fontWeight: 'bold'}}>Discount</span>
                            <input
                              ref={el => profitModalRefs.current.defaultDisc = el}
                              type="number" value={defaultDiscInput}
                              onChange={e => setDefaultDiscInput(e.target.value)}
                              onBlur={() => { if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); profitModalRefs.current.newCat?.focus(); } }}
                              placeholder="e.g. 5" min="0" max="100" step="0.5"
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
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>Enter or Tab to save</span>
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
                                          onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); profitModalRefs.current[`rule_${rule.id}_disc`]?.focus(); } }}
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
                                            if(e.key === 'Enter') {
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
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                          <input
                            ref={el => profitModalRefs.current.newPct = el}
                            type="number" value={newRulePct}
                            onChange={e => setNewRulePct(e.target.value)}
                            onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); profitModalRefs.current.newDisc?.focus(); } }}
                            placeholder="Profit %" min="0" max="500" step="0.5"
                            style={{ ...mInput, width: 75, fontWeight: 700, border: '2px solid #4caf50' }}
                          />
                          <input
                            ref={el => profitModalRefs.current.newDisc = el}
                            type="number" value={newRuleDisc}
                            onChange={e => setNewRuleDisc(e.target.value)}
                            onKeyDown={async e => {
                              if(e.key === 'Enter') {
                                e.preventDefault();
                                if (newRuleSizeRange && (newRulePct || newRuleDisc)) {
                                  await saveProfitRule(selectedProfitCompany, newRuleCategory, newRuleSizeRange, newRulePct, newRuleDisc);
                                  setNewRuleSizeRange(''); setNewRulePct(''); setNewRuleDisc('');
                                  profitModalRefs.current.newRange?.focus();
                                }
                              }
                            }}
                            placeholder="Disc %" min="0" max="100" step="0.5"
                            style={{ ...mInput, width: 75, fontWeight: 700, border: '2px solid #f44336' }}
                          />
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
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 4 }}>Enter in % to add</span>
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
              <input type={manageListType === "packings" ? "number" : "text"} value={newItemName}
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
        <div style={{padding: 20, color: 'red', background: 'white', zIndex: 9999, position: 'relative'}}>
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
