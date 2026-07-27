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
    }).catch(() => { });
  }, []);

  const availableMethods = useMemo(() => {
    let methods = [];
    if (bankMethods.length > 0) {
      methods = ['Cash Received', ...bankMethods];
    } else {
      methods = [...PRESET_METHODS];
    }
    // When editing, ensure existing payment methods are available even if not in current list
    if (isEditMode && existingPayments && existingPayments.length > 0) {
      existingPayments.forEach(p => {
        if (p.method && !methods.includes(p.method)) {
          methods.push(p.method);
        }
      });
    }
    return methods;
  }, [bankMethods, isEditMode, existingPayments]);

  const setDefaultAccount = (method, accNo) => {
    const updated = { ...defaultAccounts, [method]: accNo };
    setDefaultAccounts(updated);
    ipcRenderer.invoke('save-payment-accounts', { savedAccounts, defaultAccounts: updated }).catch(() => { });
  };

  const total = Math.round(grandTotal) || 0;

  // Cash Received always settles whatever the bank lines don't cover — the
  // typed Cash Received amount is only used to work out change to hand back,
  // it never determines how much actually gets posted. Bank lines, on the
  // other hand, post exactly what was typed regardless of the invoice total.
  const cashLinesAmount = lines
    .filter(line => line.method === 'Cash Received')
    .reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
  const bankLinesAmount = lines
    .filter(line => line.method !== 'Cash Received')
    .reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
  const requiredCash = Math.max(total - bankLinesAmount, 0);

  const totalReceived = cashLinesAmount + bankLinesAmount;
  const hasInput = lines.some(line => line.amount !== '');
  const change = hasInput ? cashLinesAmount - requiredCash : 0;
  const canConfirm = totalReceived >= total && totalReceived > 0;

  const saveAccountToHistory = (acc) => {
    if (!acc || savedAccounts.includes(acc)) return;
    const newAccs = [...savedAccounts, acc];
    setSavedAccounts(newAccs);
    ipcRenderer.invoke('save-payment-accounts', { savedAccounts: newAccs, defaultAccounts }).catch(() => { });
  };

  useEffect(() => {
    setIsSubmitting(false);

    // Load shared account numbers from server on every open so all PCs stay in sync
    ipcRenderer.invoke('get-payment-accounts').then(data => {
      if (data) {
        setSavedAccounts(data.savedAccounts || []);
        setDefaultAccounts(data.defaultAccounts || {});
      }
    }).catch(() => { });

    const roundedTotal = Math.round(grandTotal);
    if (existingPayments && existingPayments.length > 0) {
      const paymentsArray = existingPayments.map((p, i) => {
        return { id: Date.now() + i, method: p.method, accNo: p.accNo || '', amount: p.amount };
      });

      // Smart adjustment: If there's only one payment line and it's Cash Received,
      // auto-adjust it so the user doesn't have to re-type. Don't adjust bank/JazzCash payments.
      if (paymentsArray.length === 1 && 
          paymentsArray[0].method === 'Cash Received' && 
          Math.round(paymentsArray[0].amount) !== roundedTotal) {
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

    // Bank lines are posted exactly as entered, whatever the invoice total is.
    const bankLines = lines.filter(line => line.method !== 'Cash Received' && (parseFloat(line.amount) || 0) > 0);
    const totalBankAmount = bankLines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);

    // Cash always posts exactly enough to fully settle the invoice (total minus
    // whatever the bank lines already cover) — never the raw typed amount,
    // which may include extra cash tendered that's actually change owed back.
    const cashPortion = Math.max(total - totalBankAmount, 0);

    const validPayments = [];
    if (cashPortion > 0) {
      validPayments.push({ method: 'Cash Received', accNo: '', amount: cashPortion });
    }
    bankLines.forEach(line => {
      if (line.accNo) saveAccountToHistory(line.accNo);
      validPayments.push({
        method: line.method || 'Cash Received',
        accNo: line.accNo,
        amount: parseFloat(line.amount) || 0
      });
    });

    try {
      await Promise.resolve(onConfirm({ payments: validPayments, totalReceived: cashPortion + totalBankAmount, change }));
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

function MasterModalContent({ invoiceNo, grandTotal, isEditMode, existingPayments, onConfirm, onCancel, cashOnly, allowCredit, customerName, customerId, customerPrevBalance }) {
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [selectedCashAcc, setSelectedCashAcc] = useState('');
  const [cashAmount, setCashAmount] = useState('');

  const [bankRows, setBankRows] = useState([]); // [{id, accountName, amount, remarks}]
  const [custBalance, setCustBalance] = useState(null);

  useEffect(() => {
    // When editing, use the stored customerPrevBalance from the invoice
    // When creating new invoice, fetch current balance
    if (isEditMode && customerPrevBalance !== undefined) {
      setCustBalance(customerPrevBalance);
    } else if (customerName || customerId) {
      ipcRenderer.invoke('get-customer-balance', { customerName, customerId })
        .then(res => {
          if (res && res.balance !== undefined) {
            setCustBalance(res.balance);
          }
        }).catch(() => { });
    } else {
      setCustBalance(null);
    }
  }, [customerName, customerId, isEditMode, customerPrevBalance]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const glAccounts = await ipcRenderer.invoke('get-gl-accounts') || [];
        const cashAccs = glAccounts.filter(a => a.account_type === 'Cash');
        const bankAccs = glAccounts.filter(a => a.account_type === 'Bank');

        setCashAccounts(cashAccs);
        setBankAccounts(bankAccs);

        // Set default cash account
        if (cashAccs.length > 0) {
          setSelectedCashAcc(cashAccs[0].account_name);
        }

        // Parse existing payments when editing
        if (isEditMode) {
          const payments = Array.isArray(existingPayments) ? existingPayments : [];

          // If no payments exist or only "Credit" with 0 amount (was a credit invoice) — leave fields empty
          const isCreditInvoice = payments.length === 0 ||
            (payments.length === 1 && payments[0].method.toLowerCase() === 'credit' && parseFloat(payments[0].amount || 0) === 0);

          if (isCreditInvoice) {
            setCashAmount('');
            setBankRows([]);
            return;
          }

          let initialBankRows = [];
          let totalCashFound = 0;
          let cashMethodUsed = '';

          payments.forEach((p, i) => {
            // Try to match this payment entry to a known bank account
            const matchedBank = bankAccs.find(b =>
              b.account_name === p.method ||
              p.method.toLowerCase().includes(b.account_name.toLowerCase()) ||
              b.account_name.toLowerCase().includes(p.method.toLowerCase())
            );
            if (matchedBank) {
              initialBankRows.push({
                id: `bankrow-${Date.now()}-${i}`,
                accountName: matchedBank.account_name,
                amount: String(p.amount || ''),
                remarks: p.accNo || ''
              });
            } else {
              // Treat as cash
              totalCashFound += parseFloat(p.amount) || 0;
              if (p.method && p.method !== 'Cash Received') cashMethodUsed = p.method;
            }
          });

          // Restore the correct cash account name if it's one of our GL cash accounts
          const matchedCashAcc = cashAccs.find(c =>
            c.account_name === cashMethodUsed ||
            cashMethodUsed.toLowerCase().includes(c.account_name.toLowerCase())
          );
          if (matchedCashAcc) setSelectedCashAcc(matchedCashAcc.account_name);
          else if (cashMethodUsed) setSelectedCashAcc(cashMethodUsed);

          setCashAmount(totalCashFound > 0 ? totalCashFound.toString() : '');
          setBankRows(initialBankRows);
        } else {
          // For a new invoice, clear cash amount so leaving it empty saves as a credit invoice
          setCashAmount('');
          setBankRows([]);
        }
      } catch (err) {
        console.error('Failed to fetch GL accounts', err);
      }
    };
    fetchAccounts();
  }, [isEditMode, existingPayments]);

  const totalBankAmount = useMemo(() => {
    return bankRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  }, [bankRows]);

  const parsedCashAmount = parseFloat(cashAmount) || 0;
  const totalReceived = parsedCashAmount + totalBankAmount;
  const invoiceBalance = grandTotal - totalReceived;

  const usedBankNames = useMemo(() => new Set(bankRows.map(r => r.accountName)), [bankRows]);
  const availableBankAccounts = useMemo(
    () => bankAccounts.filter(a => !usedBankNames.has(a.account_name)),
    [bankAccounts, usedBankNames]
  );

  const updateBankRow = (id, field, value) => {
    setBankRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addBankRow = () => {
    const next = availableBankAccounts[0];
    if (!next) return;
    setBankRows(prev => [...prev, { id: `bankrow-${Date.now()}-${Math.random()}`, accountName: next.account_name, amount: '', remarks: '' }]);
  };

  const removeBankRow = (id) => {
    setBankRows(prev => prev.filter(r => r.id !== id));
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
    bankRows.forEach(row => {
      const amt = parseFloat(row.amount);
      if (amt > 0) {
        validPayments.push({
          method: row.accountName,
          accNo: row.remarks || '',
          amount: amt
        });
      }
    });

    const change = totalReceived > grandTotal ? totalReceived - grandTotal : 0;
    // Pass the list of cash account names so callers can classify payments correctly
    const cashAccountNames = cashAccounts.map(a => a.account_name);
    onConfirm({ payments: validPayments, totalReceived, change, cashAccountNames });
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
            <div className="pm-status-banner pm-status-banner-warn">
              <span>📝</span> Saved as <strong>Credit Invoice</strong> — fill amounts to convert to paid.
            </div>
          )}
          {isEditMode && totalReceived > 0 && (
            <div className="pm-status-banner pm-status-banner-ok">
              <span>✏️</span> Previous payment: <strong>PKR {totalReceived.toLocaleString()}</strong> — adjust or clear to save as credit.
            </div>
          )}

          {customerName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px', marginBottom: '6px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 700 }}>👤 Customer: {customerName}</span>
              {custBalance !== null && (
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: custBalance > 0 ? '#dc2626' : custBalance < 0 ? '#059669' : '#475569' }}>
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
            <label style={{ cursor: 'pointer', color: '#4f46e5' }} onClick={fillCashAmount}>Cash Amount</label>
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
          <div className="pm-bank-section">
            {bankRows.length > 0 && (
              <div className="pm-bank-grid">
                <div className="pm-grid-header">
                  <div className="pm-grid-cell">#</div>
                  <div className="pm-grid-cell">Bank Account</div>
                  <div className="pm-grid-cell">Amount</div>
                  <div className="pm-grid-cell">Remarks</div>
                  <div className="pm-grid-cell pm-grid-cell-actions"></div>
                </div>
                <div className="pm-bank-grid-scroll">
                  {bankRows.map((row, idx) => (
                    <div className="pm-grid-row" key={row.id}>
                      <div className="pm-grid-cell" style={{ justifyContent: 'center' }}>{idx + 1}</div>
                      <div className="pm-grid-cell" style={{ padding: '2px' }}>
                        <select
                          className="pm-grid-select"
                          value={row.accountName}
                          onChange={e => updateBankRow(row.id, 'accountName', e.target.value)}
                          title="Select Bank Account"
                        >
                          <option value={row.accountName}>{row.accountName}</option>
                          {availableBankAccounts.map(a => (
                            <option key={a.id} value={a.account_name}>{a.account_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="pm-grid-cell" style={{ padding: '2px' }}>
                        <input
                          type="number"
                          className="pm-grid-input amount"
                          placeholder="0.00"
                          value={row.amount}
                          onChange={e => updateBankRow(row.id, 'amount', e.target.value)}
                        />
                      </div>
                      <div className="pm-grid-cell" style={{ padding: '2px' }}>
                        <input
                          type="text"
                          className="pm-grid-input remarks"
                          placeholder="..."
                          value={row.remarks}
                          onChange={e => updateBankRow(row.id, 'remarks', e.target.value)}
                        />
                      </div>
                      <div className="pm-grid-cell pm-grid-cell-actions">
                        <button
                          type="button"
                          className="pm-grid-remove-btn"
                          onClick={() => removeBankRow(row.id)}
                          aria-label="Remove bank payment"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableBankAccounts.length > 0 && (
              <button type="button" className="pm-add-split-btn" onClick={addBankRow}>
                + Add Split Payment
              </button>
            )}
          </div>
        )}

        <div className="pm-bottom-section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label>Invoice Balance</label>
            {custBalance !== null && (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                New Customer Balance: <strong style={{ color: (parseFloat(custBalance) + invoiceBalance) > 0 ? '#dc2626' : (parseFloat(custBalance) + invoiceBalance) < 0 ? '#059669' : '#111827' }}>
                  {(parseFloat(custBalance) + invoiceBalance) > 0 ? `+${(parseFloat(custBalance) + invoiceBalance).toLocaleString()} (Due)` : (parseFloat(custBalance) + invoiceBalance) < 0 ? `${(parseFloat(custBalance) + invoiceBalance).toLocaleString()} (Adv)` : 'PKR 0'}
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