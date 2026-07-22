import React, { useEffect, useRef, useState } from 'react';
import './PaymentModal.css';

const { ipcRenderer } = window.require('electron');

const PRESET_METHODS = ['Cash Received', 'JazzCash', 'EasyPaisa', 'Raast', 'Bank Transfer'];

function PaymentModal({ open, invoiceNo, grandTotal, isEditMode, existingPayments, onConfirm, onCancel, onChange, cashOnly }) {
  const [lines, setLines] = useState([{ id: Date.now(), method: 'Cash Received', accNo: '', amount: '' }]);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [defaultAccounts, setDefaultAccounts] = useState({});
  const [addingNewAcc, setAddingNewAcc] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef({});

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
    if (open) {
      setIsSubmitting(false);

      // Load shared account numbers from server on every open so all PCs stay in sync
      ipcRenderer.invoke('get-payment-accounts').then(data => {
        if (data) {
          setSavedAccounts(data.savedAccounts || []);
          setDefaultAccounts(data.defaultAccounts || {});
        }
      }).catch(() => {});

      const roundedTotal = Math.round(grandTotal);
      if (existingPayments && Object.keys(existingPayments).length > 0) {
        const paymentsArray = Object.entries(existingPayments).map(([key, val], i) => {
          let method = key;
          let accNo = '';
          const match = key.match(/(.*)\s\((.*)\)/);
          if (match) {
            method = match[1];
            accNo = match[2];
          }
          return { id: Date.now() + i, method, accNo, amount: val };
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
    }
  }, [open, existingPayments, grandTotal]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!open) return;
      if (isSubmitting) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel, isSubmitting]);

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

  useEffect(() => {
    if (open && onChange) {
      const validPayments = lines
        .filter(line => (parseFloat(line.amount) || 0) > 0)
        .map(line => ({
          method: line.method || 'Cash Received',
          accNo: line.accNo || '',
          amount: parseFloat(line.amount) || 0
        }));
      onChange({ payments: validPayments, totalReceived, change });
    }
  }, [lines, totalReceived, change, open, onChange]);

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
    setLines(prev => [...prev, { id: Date.now(), method: cashOnly ? 'Cash Received' : 'JazzCash', accNo: '', amount: '' }]);
  };

  if (!open) return null;

  return (
    <div className="payment-modal-overlay" onClick={() => { if (!isSubmitting) onCancel(); }}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
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
            <div key={line.id} className="payment-field-row" style={{ alignItems: 'flex-start', margin: '14px 0', width: '100%', boxSizing: 'border-box' }}>
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
                  {cashOnly ? <option value="Cash Received">Cash Received</option> : PRESET_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                {line.method !== 'Cash Received' && (
                  <>
                    {(addingNewAcc[index] || savedAccounts.length === 0) ? (
                      <input
                        type="text"
                        placeholder="Type Account No"
                        title="Type a new Account Number"
                        value={line.accNo}
                        onChange={(e) => updateLine(index, 'accNo', e.target.value)}
                        onBlur={() => {
                          if (!line.accNo && savedAccounts.length > 0) {
                            setAddingNewAcc(prev => ({ ...prev, [index]: false }));
                          }
                        }}
                        style={{
                          width: '100%', maxWidth: 'none', padding: '4px 6px', fontSize: '0.85rem',
                          border: '1px solid #9ca3af', borderRadius: '4px', boxSizing: 'border-box',
                          background: '#ffffff', flex: 'none', textAlign: 'left', fontWeight: 'normal',
                          color: '#111827'
                        }}
                        autoFocus
                      />
                    ) : (
                      <select
                        value={line.accNo || ''}
                        title="Select Account Number"
                        onChange={(e) => {
                          if (e.target.value === 'ADD_NEW') {
                            setAddingNewAcc(prev => ({ ...prev, [index]: true }));
                            updateLine(index, 'accNo', '');
                          } else {
                            updateLine(index, 'accNo', e.target.value);
                          }
                        }}
                        style={{
                          width: '100%', maxWidth: 'none', padding: '4px 4px', fontSize: '0.8rem',
                          border: '1px solid #9ca3af', borderRadius: '4px', boxSizing: 'border-box',
                          background: '#ffffff', flex: 'none', textAlign: 'left', fontWeight: 'normal',
                          color: '#111827', cursor: 'pointer'
                        }}
                      >
                        <option value="" disabled>Select Account</option>
                        {savedAccounts.map(acc => (
                          <option key={acc} value={acc}>
                            {acc} {defaultAccounts[line.method] === acc ? '(Default)' : ''}
                          </option>
                        ))}
                        <option value="ADD_NEW">+ Add New Account</option>
                      </select>
                    )}
                    {line.accNo && defaultAccounts[line.method] !== line.accNo && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDefaultAccount(line.method, line.accNo);
                        }}
                        style={{
                          fontSize: '0.75rem', color: '#4f46e5', background: 'none', border: 'none',
                          cursor: 'pointer', padding: '2px 0', textAlign: 'left', marginTop: '-2px', fontWeight: 'bold'
                        }}
                      >
                        Set as Default
                      </button>
                    )}
                  </>
                )}
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
      </div>
    </div>
  );
}

export default PaymentModal;
