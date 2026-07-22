import React, { useState, useEffect, useRef, useMemo } from 'react';
import './NewSale.css'; // Direct import to inherit perfect styling
import './BarcodePrint.css'; // For small adjustments if needed
import BarcodeSheet from './BarcodeSheet';

const { ipcRenderer } = window.require('electron');

function BarcodePrint({ isActive }) {
  const [mode, setMode] = useState('manual'); // 'manual' or 'purchase'
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  
  // Unified items list for printing
  const [items, setItems] = useState([]);
  const [draftCode, setDraftCode] = useState('');
  const [message, setMessage] = useState('');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isActive && mode === 'purchase') {
      loadPurchases();
    }
  }, [mode, isActive]);

  // Keep focus on scanner input like NewSale
  useEffect(() => {
    if (isActive && !showPrintPreview) {
      setTimeout(() => {
        inputRef.current?.focus();
        
        // Auto-scroll the table wrap exactly like NewSale
        const tableWrap = document.querySelector('.sale-table-wrap');
        if (tableWrap) {
          tableWrap.scrollTo({
            top: tableWrap.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [isActive, showPrintPreview, mode, items.length]);

  const loadPurchases = async () => {
    const data = await ipcRenderer.invoke('get-purchases');
    setPurchases(data);
  };

  const handleSelectPurchase = async (purchase) => {
    if (!purchase.is_posted) return;
    setSelectedPurchase(purchase);
    setIsLoading(true);
    try {
      const purchaseItems = await ipcRenderer.invoke('get-purchase-barcode-data', purchase.id);
      setItems(purchaseItems.map(item => {
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
      }));
    } catch (err) {
      console.error('Failed to load purchase items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addFromDraft = async () => {
    if (!draftCode.trim()) return;
    
    const cleanedCode = draftCode.trim().toUpperCase();
    setIsLoading(true);
    try {
      const found = await ipcRenderer.invoke('get-product-by-code', cleanedCode);

      if (!found) {
        setMessage(`Item ${cleanedCode} not found.`);
        setTimeout(() => setMessage(''), 3000);
        setDraftCode('');
        // Re-focus immediately
        setTimeout(() => {
          inputRef.current?.focus();
        }, 10);
        return;
      }

      // Check if already in list
      const existingIdx = items.findIndex(it => it.item_code === cleanedCode);
      if (existingIdx !== -1) {
        const newItems = [...items];
        newItems[existingIdx].quantity += 1;
        setItems(newItems);
      } else {
        setItems(prev => [
          ...prev,
          {
            id: found.id,
            item_code: cleanedCode,
            item_name: (() => {
              let brand = (found.brand || '').trim();
              let desc = (found.description || '').trim();
              let nameParts = [];
              if (brand && !desc.toUpperCase().startsWith(brand.toUpperCase())) {
                nameParts.push(brand);
              }
              nameParts.push(desc);
              nameParts.push((found.category || '').trim());
              nameParts.push((found.size_range || '').trim());
              nameParts.push((found.gender || '').trim());
              return nameParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unknown';
            })(),
            item_description: found.description || 'Unknown',
            sale_rate: Math.round(parseFloat(found.sale_rate) || 0),
            quantity: 1,
            packing: found.packing_qty || 1
          }
        ]);
      }

      setDraftCode('');
      setMessage('');
    } catch (err) {
      console.error('Error adding item:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItemQty = (idx, val) => {
    const qty = parseInt(val, 10) || 0;
    setItems(prev => {
      const newItems = [...prev];
      newItems[idx].quantity = qty;
      return newItems;
    });
  };

  const handlePrint = () => {
    if (items.length === 0) return;
    setShowPrintPreview(true);
  };

  const resetList = () => {
    setItems([]);
    setDraftCode('');
    setMessage('');
    setSelectedPurchase(null);
  };

  const totalLabels = useMemo(() => items.reduce((acc, it) => acc + (parseInt(it.quantity) || 0), 0), [items]);

  useEffect(() => {
    // Auto-scroll the table wrap exactly like NewSale
    const tableWrap = document.querySelector('.sale-table-wrap');
    if (tableWrap) {
      tableWrap.scrollTo({
        top: tableWrap.scrollHeight,
        behavior: 'smooth'
      });
    }
    
    if (isActive && !showPrintPreview) {
      // ONLY steal focus if NOT currently editing a quantity field
      const activeEl = document.activeElement;
      const isEditingQty = activeEl?.classList.contains('qty-field');
      
      if (!isEditingQty) {
        inputRef.current?.focus();
      }
    }
  }, [items, isActive, showPrintPreview, message]);

  const handleQtyKeyDown = (e, idx) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      removeItem(idx);
      // After removal, focus the previous item or the scan input
      setTimeout(() => {
        const remainingQtys = document.querySelectorAll('.qty-field');
        if (remainingQtys.length > 0) {
          const nextTarget = remainingQtys[Math.min(idx, remainingQtys.length - 1)];
          nextTarget?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 0);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevQty = document.querySelectorAll('.qty-field')[idx - 1];
      if (prevQty) prevQty.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextQty = document.querySelectorAll('.qty-field')[idx + 1];
      if (nextQty) {
        nextQty.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="sale-page">
      {showPrintPreview ? (
        <BarcodeSheet items={items} onClose={() => setShowPrintPreview(false)} />
      ) : (
        <>
          {/* EXACT CLONE OF NewSale topbar */}
          <div className="sale-topbar">
            <div className="topbar-left">
              <span className="topbar-title blue">Manual Barcode Printing</span>
              <div className="mode-tabs-container">
                <button 
                  className={`topbar-btn ${mode === 'manual' ? 'topbar-btn-primary' : 'topbar-btn-secondary'}`}
                  onClick={() => { setMode('manual'); resetList(); }}
                  style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                >
                  Manual / Scan
                </button>
                <button 
                  className={`topbar-btn ${mode === 'purchase' ? 'topbar-btn-primary' : 'topbar-btn-secondary'}`}
                  onClick={() => { setMode('purchase'); resetList(); }}
                  style={{ padding: '4px 12px', fontSize: '0.8rem', marginLeft: '5px' }}
                >
                  From Purchase
                </button>
              </div>
            </div>
            <div className="topbar-right">
              <button className="topbar-btn topbar-btn-tertiary" onClick={resetList}>Reset List</button>
              <button 
                className="topbar-btn topbar-btn-primary" 
                onClick={handlePrint}
                disabled={items.length === 0}
              >
                🖨️ Print {totalLabels} Labels
              </button>
            </div>
          </div>

          {message && <div className="message">{message}</div>}

          <div className="sale-body" style={{ paddingTop: '16px' }}>
            {mode === 'purchase' ? (
              <div className="barcode-purchase-split" style={{ display: 'flex', gap: '16px', width: '100%', height: '100%' }}>
                <div className="purchase-side-panel" style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Select Purchase</span>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {purchases.map(p => (
                      <div 
                        key={p.id} 
                        className={`purchase-item-card ${selectedPurchase?.id === p.id ? 'active' : ''} ${!p.is_posted ? 'unposted' : ''}`}
                        onClick={() => handleSelectPurchase(p)}
                        style={{
                          padding: '10px',
                          border: `2px solid ${selectedPurchase?.id === p.id ? '#4f46e5' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          background: selectedPurchase?.id === p.id ? '#f5f3ff' : '#fff',
                          cursor: p.is_posted ? 'pointer' : 'not-allowed',
                          opacity: p.is_posted ? 1 : 0.6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.9rem' }}>#{p.id}</strong>
                            <span style={{ 
                              fontSize: '0.6rem', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: p.is_posted ? '#e1ffeb' : '#f3f6f9',
                              color: p.is_posted ? '#1bc5bd' : '#7e8299',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {p.is_posted ? 'Posted' : 'Draft'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatDate(p.purchase_date)}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#374151', fontWeight: '600' }}>{p.supplier_name}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="sale-table-wrap" style={{ flex: 1 }}>
                   <table className="sale-table">
                     <thead>
                       <tr>
                         <th>#</th>
                         <th className="center">Item Code</th>
                         <th>Description</th>
                         <th className="center">Qty to Print</th>
                         <th className="right">Rate</th>
                       </tr>
                     </thead>
                     <tbody>
                       {items.map((item, idx) => (
                         <tr key={idx}>
                           <td className="center" style={{ color: '#000', fontWeight: 'bold' }}>{idx + 1}</td>
                           <td className="center">
                              <span className="code-field">{item.item_code}</span>
                           </td>
                           <td><span className="desc-main" style={{ fontWeight: '700' }}>{item.item_name}</span></td>
                           <td className="center">
                             <input 
                               type="number" 
                               className="qty-field center"
                               style={{ width: '8ch', minWidth: '8ch', fontSize: '1.2rem', fontWeight: 'bold', background: '#f3f6f9', color: '#6b7280', border: 'none' }}
                               value={item.quantity}
                               readOnly
                               tabIndex="-1"
                               min="0"
                             />
                           </td>
                           <td className="right">
                              <span className="rate-field">{item.sale_rate}</span>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   {items.length === 0 && (
                     <div className="empty">Select a purchase from the left to load items</div>
                   )}
                </div>
              </div>
            ) : (
              <div className="sale-table-wrap" style={{ flex: 1 }}>
                <table className="sale-table">
                  <thead>
                    <tr>
                      <th width="60">#</th>
                      <th width="180" className="center">Item Code</th>
                      <th>Description</th>
                      <th width="150" className="center">Qty to Print</th>
                      <th width="180" className="right">Rate</th>
                      <th width="80" className="center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className={focusedIndex === idx ? 'row-active' : ''}>
                        <td className="center" style={{ color: '#000', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td className="center">
                           <span className="code-field">{item.item_code}</span>
                        </td>
                        <td><span className="desc-main" style={{ fontWeight: '700' }}>{item.item_description || item.item_name}</span></td>
                        <td className="center">
                          <input 
                            type="number" 
                            className="qty-field center"
                            style={{ width: '8ch', minWidth: '8ch', fontSize: '1.2rem', fontWeight: 'bold' }}
                            value={item.quantity}
                            onChange={(e) => updateItemQty(idx, e.target.value)}
                            onKeyDown={(e) => handleQtyKeyDown(e, idx)}
                            onFocus={(e) => { e.target.select(); setFocusedIndex(idx); }}
                            onBlur={() => setFocusedIndex(null)}
                            min="1"
                          />
                        </td>
                        <td className="right">
                           <span className="rate-field">{item.sale_rate}</span>
                        </td>
                        <td className="center">
                          <button className="btn-icon" onClick={() => removeItem(idx)} tabIndex="-1">✖</button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan="6" className="empty">Scan or type an item code to add to the print list.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                
                {/* EXACT CLONE OF scan-entry row */}
                <div className="scan-entry" style={{ border: '1px solid #1e40af', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                  <div className="scan-cell" style={{ width: '250px' }}>
                    <input
                      ref={inputRef}
                      type="text"
                      className="scan-input-inline"
                      placeholder={isLoading ? "Searching..." : "Scan Item Code"}
                      value={draftCode}
                      onChange={(e) => setDraftCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addFromDraft();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const qtys = document.querySelectorAll('.qty-field');
                          if (qtys.length > 0) qtys[qtys.length - 1]?.focus();
                        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                          e.preventDefault();
                          if (items.length > 0) {
                            removeItem(items.length - 1);
                            setMessage('Last item removed');
                            setTimeout(() => setMessage(''), 2000);
                          }
                        }
                      }}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="scan-hint">Press Enter after scanning to add to list</div>
                </div>
              </div>
            )}
          </div>

          <footer className="sale-footer">
            <div className="footer-left-group">
               <div className="footer-stock-box">
                  <span className="footer-box-label">Items Count</span>
                  <strong>{items.length} Unique Items</strong>
               </div>
            </div>
            <div className="footer-grand" style={{ marginLeft: 'auto' }}>
               <span>TOTAL LABELS</span>
               <strong>{totalLabels}</strong>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

export default BarcodePrint;
