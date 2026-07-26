import React, { useEffect, useRef, useState, useMemo } from 'react';
import './PaymentModal.css';

const { ipcRenderer } = window.require('electron');

const PRESET_METHODS = ['Cash Received', 'JazzCash', 'EasyPaisa', 'Raast', 'Bank Transfer'];

function NormalModalContent({ invoiceNo, grandTotal, isEditMode, existingPayments, onConfirm, onCancel, cashOnly }) {
  const [lines, setLines] = useState([{ id: Date.now(), method: 'Cash Received', accNo: '', amount: '' }]);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [defaultAccounts, setDefaultAccounts] = useState({});
  const [addingNewAcc, setAddingNewAcc] = useState({});
  const [bankMethods, setBankMethods] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef({});

  useEffect(() => {
    ipcRenderer.invoke('get-gl-accounts').then(accounts => {
      if (accounts && Array.isArray(accounts)) {
        const banks = accounts.filter(a => a.account_type === 'Bank').map(a => a.account_name);
        setBankMethods(banks);
      }
    }).catch(() => {});
  }, []);

  const availableMethods = useMemo(() => {
    if (bankMethods.length > 0) {
      return ['Cash Received', ...bankMethods];
    }
    return PRESET_METHODS;
  }, [bankMethods]);

  const setDefaultAccount = (method, accNo) => {
    const updated = { ...defaultAccounts, [method]: accNo };
    setDefaultAccounts(updated);
    ipcRenderer.invoke('save-payment-accounts', { savedAccounts, defaultAccounts: updated }).catch(() => {});
  };

  const total = Math.round(grandTotal) || 0;
  const totalReceived = lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
  const hasInput = lines.some(line => line.amount !== '');
  const change = hasInput ? totalReceived - total : 0;
  const canConfirm = totalReceived >= total && totalReceived > 0;

  const saveAccountToHistory = (acc) => {
    if (!acc || savedAccounts.includes(acc)) return;
    const newAccs = [...savedAccounts, acc];
    setSavedAccounts(newAccs);
    ipcRenderer.invoke('save-payment-accounts', { savedAccounts: newAccs, defaultAccounts }).catch(() => {});
  };

  useEffect(() => {
    setIsSubmitting(false);

    // Load shared account numbers from server on every open so all PCs stay in sync
    ipcRenderer.invoke('get-payment-accounts').then(data => {
      if (data) {
        setSavedAccounts(data.savedAccounts || []);
        setDefaultAccounts(data.defaultAccounts || {});
      }
    }).catch(() => {});

    const roundedTotal = Math.round(grandTotal);
    if (existingPayments && existingPayments.length > 0) {
      const paymentsArray = existingPayments.map((p, i) => {
        return { id: Date.now() + i, method: p.method, accNo: p.accNo || '', amount: p.amount };
      });

      // Smart adjustment: If there's only one payment line and it doesn't match the new total,
      // auto-adjust it so the user doesn't have to re-type.
      if (paymentsArray.length === 1 && Math.round(paymentsArray[0].amount) !== roundedTotal) {
        paymentsArray[0].amount = roundedTotal;
      }

      setLines(paymentsArray);
    } else {
      // For NEW sales, don't pre-fill the amount, let the user type it
      setLines([{ id: Date.now(), method: 'Cash Received', accNo: '', amount: isEditMode ? (roundedTotal || '') : '' }]);
    }
    setTimeout(() => {
      inputRef.current[0]?.focus();
      inputRef.current[0]?.select();
    }, 50);
  }, [isEditMode, existingPayments, grandTotal]);

  const handleConfirm = async () => {
    if (!canConfirm || isSubmitting) return;
    setIsSubmitting(true);

    const validPayments = lines
      .filter(line => (parseFloat(line.amount) || 0) > 0)
      .map(line => {
        const isCash = line.method === 'Cash Received';
        if (line.accNo && !isCash) saveAccountToHistory(line.accNo);
        return {
          method: line.method || 'Cash Received',
          accNo: isCash ? '' : line.accNo,
          amount: parseFloat(line.amount) || 0
        };
      });

    try {
      await Promise.resolve(onConfirm({ payments: validPayments, totalReceived, change }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLine = (index, field, value) => {
    setLines(prev => {
      const copy = [...prev];
      let updatedLine = { ...copy[index], [field]: value };
      if (field === 'method') {
        setAddingNewAcc(a => ({ ...a, [index]: false }));
        if (value === 'Cash Received') {
          updatedLine.accNo = '';
        } else if (defaultAccounts[value]) {
          updatedLine.accNo = defaultAccounts[value];
        } else {
          updatedLine.accNo = '';
        }
      }
      copy[index] = updatedLine;
      return copy;
    });
  };

  const addLine = () => {
    const nextMethod = availableMethods.find(m => m !== 'Cash Received') || 'Cash Received';
    setLines(prev => [...prev, { id: Date.now(), method: cashOnly ? 'Cash Received' : nextMethod, accNo: '', amount: '' }]);
  };

  return (
    <>
      <div className="payment-modal-header">
        <h3>Payment</h3>
        <button type="button" className="payment-modal-close" onClick={onCancel} aria-label="Close" disabled={isSubmitting}>&times;</button>
      </div>
      <div className="payment-modal-body">
        <div className="payment-row payment-grand">
          <span>Bill</span>
          <strong>{total.toLocaleString()}</strong>
        </div>

        {lines.map((line, index) => (
          <div key={line.id} className="payment-field-row" style={{ alignItems: 'center', margin: '14px 0', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <select
                value={line.method}
                onChange={(e) => updateLine(index, 'method', e.target.value)}
                title="Select Payment Method"
                style={{
                  width: '100%', maxWidth: 'none',
                  border: '1px solid #9ca3af', borderRadius: '4px',
                  background: '#ffffff', padding: '6px 4px',
                  fontWeight: '700', color: '#111827', fontSize: '1rem',
                  outline: 'none', flex: 'none', textAlign: 'left', boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                {cashOnly ? <option value="Cash Received">Cash Received</option> : availableMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <input
              ref={el => (inputRef.current[index] = el)}
              style={{ flex: '1', minWidth: '0' }}
              type="number"
              min="0"
              step="1"
              value={line.amount}
              onChange={(e) => updateLine(index, 'amount', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prevIndex = Math.max(0, index - 1);
                  inputRef.current[prevIndex]?.focus();
                  inputRef.current[prevIndex]?.select();
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const nextIndex = Math.min(lines.length - 1, index + 1);
                  inputRef.current[nextIndex]?.focus();
                  inputRef.current[nextIndex]?.select();
                }
              }}
              placeholder="0"
            />
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines(prev => prev.filter((_, i) => i !== index))}
                style={{ padding: '8px 12px', marginLeft: 8, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {lines.length === 1 && lines[0].amount !== '' && parseFloat(lines[0].amount) < total && (
          <div style={{ textAlign: 'right', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={addLine}
              disabled={isSubmitting}
              style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
            >
              + Add split payment
            </button>
          </div>
        )}

        <div className="payment-row payment-change">
          <span>Change</span>
          <strong>{change.toLocaleString()}</strong>
        </div>
      </div>
      <div className="payment-modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="button" className="btn primary" onClick={handleConfirm} disabled={!canConfirm || isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </>
  );
}

function MasterModalContent({ invoiceNo, grandTotal, isEditMode, existingPayments, onConfirm, onCancel, cashOnly, allowCredit, customerName, customerId }) {
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  
  const [selectedCashAcc, setSelectedCashAcc] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  
  const [bankPayments, setBankPayments] = useState({});
  const [custBalance, setCustBalance] = useState(null);

  useEffect(() => {
    if (customerName || customerId) {
      ipcRenderer.invoke('get-customer-balance', { customerName, customerId })
        .then(res => {
          if (res && res.balance !== undefined) {
            setCustBalance(res.balance);
          }
        }).catch(() => {});
    } else {
      setCustBalance(null);
    }
  }, [customerName, customerId]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const glAccounts = await ipcRenderer.invoke('get-gl-accounts') || [];
        const cashAccs = glAccounts.filter(a => a.account_type === 'Cash');
        const bankAccs = glAccounts.filter(a => a.account_type === 'Bank');
        
        setCashAccounts(cashAccs);
        setBankAccounts(bankAccs);

        if (cashAccs.length > 0) {
          setSelectedCashAcc(cashAccs[0].account_name);
        }
        
        // Parse existing payments
        if (isEditMode && existingPayments) {
          let initialBankPayments = {};
          let totalCashFound = 0;
          let cashMethodUsed = '';
          
          if (Array.isArray(existingPayments) && existingPayments.length > 0) {
            existingPayments.forEach(p => {
              const matchedBank = bankAccs.find(b => b.account_name === p.method || p.method.includes(b.account_name) || b.account_name.includes(p.method));
              if (matchedBank) {
                initialBankPayments[matchedBank.account_name] = { amount: p.amount, remarks: p.accNo || '' };
              } else {
                totalCashFound += parseFloat(p.amount) || 0;
                if (p.method) cashMethodUsed = p.method;
              }
            });
          }
          
          if (cashMethodUsed) setSelectedCashAcc(cashMethodUsed);
          setCashAmount(totalCashFound > 0 ? totalCashFound.toString() : '0');
          setBankPayments(initialBankPayments);
        }
      } catch (err) {
        console.error('Failed to fetch GL accounts', err);
      }
    };
    fetchAccounts();
  }, [isEditMode, existingPayments]);

  const totalBankAmount = useMemo(() => {
    return Object.values(bankPayments).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [bankPayments]);

  const parsedCashAmount = parseFloat(cashAmount) || 0;
  const totalReceived = parsedCashAmount + totalBankAmount;
  const invoiceBalance = grandTotal - totalReceived;

  const handleBankInputChange = (accountName, field, value) => {
    setBankPayments(prev => ({
      ...prev,
      [accountName]: {
        ...prev[accountName],
        [field]: value
      }
    }));
  };

  const handleConfirm = () => {
    const validPayments = [];
    
    // Add Cash Payment
    if (parsedCashAmount > 0) {
      validPayments.push({
        method: selectedCashAcc || 'Cash Received',
        accNo: '',
        amount: parsedCashAmount
      });
    }

    // Add Bank Payments
    Object.entries(bankPayments).forEach(([accName, data]) => {
      const amt = parseFloat(data.amount);
      if (amt > 0) {
        validPayments.push({
          method: accName,
          accNo: data.remarks || '',
          amount: amt
        });
      }
    });
    
    const change = totalReceived > grandTotal ? totalReceived - grandTotal : 0;
    onConfirm({ payments: validPayments, totalReceived, change });
  };

  const fillCashAmount = () => {
    setCashAmount(Math.max(0, grandTotal - totalBankAmount).toString());
  };

  return (
    <>
      <div className="payment-modal-header">
        <h3>Master Cashier Window</h3>
        <button className="payment-modal-close" onClick={onCancel}>&times;</button>
      </div>
      <div className="payment-modal-body">
        <div className="pm-top-section">
          {isEditMode && totalReceived === 0 && (
            <div style={{ background: '#fffbebe6', color: '#b45309', border: '1px solid #fcd34d', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📝</span> Saved as Credit Invoice (Unpaid / Balance on Customer Account)
            </div>
          )}

          {customerName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 700 }}>👤 Customer: {customerName}</span>
              {custBalance !== null && (
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: custBalance > 0 ? '#dc2626' : custBalance < 0 ? '#059669' : '#475569' }}>
                  Prev Bal: {custBalance > 0 ? `+${custBalance.toLocaleString()} (Due)` : custBalance < 0 ? `${custBalance.toLocaleString()} (Adv)` : 'PKR 0'}
                </span>
              )}
            </div>
          )}

          <div className="pm-cash-account-row">
            <label>Cash A/c:</label>
            <select value={selectedCashAcc} onChange={e => setSelectedCashAcc(e.target.value)}>
              {cashAccounts.length === 0 && <option value="Cash Received">Cash Received</option>}
              {cashAccounts.map(a => <option key={a.id} value={a.account_name}>{a.account_name}</option>)}
            </select>
          </div>
          
          <div className="pm-summary-row pm-total-row">
            <label>Invoice Total</label>
            <div className="pm-val">{grandTotal.toLocaleString()}</div>
          </div>
          
          <div className="pm-summary-row">
            <label style={{cursor:'pointer', color:'#4f46e5'}} onClick={fillCashAmount}>Cash Amount</label>
            <input 
              type="number" 
              className="pm-input" 
              value={cashAmount} 
              onChange={e => setCashAmount(e.target.value)} 
              placeholder="0"
              autoFocus
            />
          </div>
        </div>

        {!cashOnly && bankAccounts.length > 0 && (
          <div className="pm-bank-grid">
            <div className="pm-grid-header">
              <div className="pm-grid-cell">#</div>
              <div className="pm-grid-cell">Bank Account</div>
              <div className="pm-grid-cell">Amount</div>
              <div className="pm-grid-cell">Remarks</div>
            </div>
            <div className="pm-bank-grid-scroll">
              {bankAccounts.map((acc, idx) => (
                <div className="pm-grid-row" key={acc.id}>
                  <div className="pm-grid-cell" style={{ justifyContent: 'center' }}>{idx + 1}</div>
                  <div className="pm-grid-cell" style={{ fontWeight: 600 }}>{acc.account_name}</div>
                  <div className="pm-grid-cell" style={{ padding: '2px' }}>
                    <input 
                      type="number" 
                      className="pm-grid-input amount" 
                      placeholder="0.00" 
                      value={bankPayments[acc.account_name]?.amount || ''}
                      onChange={e => handleBankInputChange(acc.account_name, 'amount', e.target.value)}
                    />
                  </div>
                  <div className="pm-grid-cell" style={{ padding: '2px' }}>
                    <input 
                      type="text" 
                      className="pm-grid-input remarks" 
                      placeholder="..." 
                      value={bankPayments[acc.account_name]?.remarks || ''}
                      onChange={e => handleBankInputChange(acc.account_name, 'remarks', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pm-bottom-section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label>Invoice Balance</label>
            {custBalance !== null && (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                New Customer Balance: <strong style={{ color: (custBalance + invoiceBalance) > 0 ? '#dc2626' : (custBalance + invoiceBalance) < 0 ? '#059669' : '#111827' }}>
                  {(custBalance + invoiceBalance) > 0 ? `+${(custBalance + invoiceBalance).toLocaleString()} (Due)` : (custBalance + invoiceBalance) < 0 ? `${(custBalance + invoiceBalance).toLocaleString()} (Adv)` : 'PKR 0'}
                </strong>
              </span>
            )}
          </div>
          <div className="pm-val" style={{ color: invoiceBalance > 0 ? '#dc2626' : invoiceBalance < 0 ? '#059669' : '#111827' }}>
            {invoiceBalance.toLocaleString()}
          </div>
        </div>
      </div>
      
      <div className="payment-modal-footer">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button 
          className="btn primary" 
          onClick={handleConfirm}
          disabled={allowCredit ? false : totalReceived < grandTotal}
        >
          {invoiceBalance > 0 && allowCredit ? 'Save Credit Invoice' : 'Confirm Payment'}
        </button>
      </div>
    </>
  );
}

function PaymentModal(props) {
  if (!props.open) return null;

  return (
    <div className="payment-modal-overlay" onClick={props.onCancel}>
      <div className={`payment-modal ${props.useMasterCashier ? 'master' : 'normal'}`} onClick={e => e.stopPropagation()}>
        {props.useMasterCashier ? <MasterModalContent {...props} /> : <NormalModalContent {...props} />}
      </div>
    </div>
  );
}

export default PaymentModal;
