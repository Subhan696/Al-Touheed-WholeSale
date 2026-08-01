import React, { useState, useEffect } from 'react';
import { getLocalDateString } from '../utils/dateUtils';

const { ipcRenderer } = window.require('electron');

function SupplierLedger() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supplierSearch, setSupplierSearch] = useState('');

  // Edit Balance Modal
  const [editSupplier, setEditSupplier] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');

  // Payment Modal
  const [paySupplier, setPaySupplier] = useState(null);
  const [payDate, setPayDate] = useState(getLocalDateString);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');

  // Statement Modal
  const [statementSupplier, setStatementSupplier] = useState(null);
  const [statementData, setStatementData] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (statementSupplier || paySupplier || editSupplier) {
          e.preventDefault();
          e.stopPropagation();
          setStatementSupplier(null);
          setPaySupplier(null);
          setEditSupplier(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [statementSupplier, paySupplier, editSupplier]);

  useEffect(() => {
    loadLedger();
  }, []);

  const loadLedger = async () => {
    setLoading(true);
    const data = await ipcRenderer.invoke('get-suppliers-ledger');
    setSuppliers(data || []);
    setLoading(false);
  };

  const handleUpdateSupplier = async () => {
    if (!editSupplier) return;
    await ipcRenderer.invoke('update-supplier', { id: editSupplier.id, name: editName, initial_balance: editBalance });
    setEditSupplier(null);
    loadLedger();
  };

  const handleAddPayment = async () => {
    if (!paySupplier || !payAmount) return;
    await ipcRenderer.invoke('add-supplier-payment', {
      supplier_name: paySupplier.name,
      payment_date: payDate,
      amount: payAmount,
      payment_mode: payMode,
      notes: payNotes
    });
    setPaySupplier(null);
    setPayAmount('');
    setPayNotes('');
    loadLedger();
  };

  const openStatement = async (supplier) => {
    setStatementSupplier(supplier);
    setStatementData(null);
    const data = await ipcRenderer.invoke('get-supplier-statement', { supplier_name: supplier.name });
    setStatementData(data);
  };

  const filteredSuppliers = suppliers.filter(s => {
    if (!supplierSearch.trim()) return true;
    return s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase());
  });

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Supplier & Manufacturer Ledger</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Search Supplier:</label>
          <input
            type="text"
            placeholder="Type supplier name..."
            value={supplierSearch}
            onChange={e => setSupplierSearch(e.target.value)}
            style={{
              width: 260,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
          {supplierSearch && (
            <button
              type="button"
              onClick={() => setSupplierSearch('')}
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Supplier Name</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Initial Balance</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Total Purchases</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Total Discount</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Total Returns</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Total Paid</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Net Balance</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center' }}>Loading ledger...</td></tr>
            ) : filteredSuppliers.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center' }}>{supplierSearch ? 'No suppliers match your search.' : 'No suppliers found.'}</td></tr>
            ) : filteredSuppliers.map(s => {
              const initBal = parseFloat(s.initial_balance) || 0;
              const purch = parseFloat(s.total_purchases) || 0;
              const disc = parseFloat(s.total_discount) || 0;
              const ret = parseFloat(s.total_returns) || 0;
              const paid = parseFloat(s.total_paid) || 0;
              const net = parseFloat(s.net_balance) || 0;

              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => openStatement(s)}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>
                    {s.name}
                    <button onClick={(e) => { e.stopPropagation(); setEditSupplier(s); setEditName(s.name); setEditBalance(s.initial_balance); }} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer' }} title="Edit Supplier Name & Initial Balance">✎ Edit</button>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {initBal.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{purch.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{disc.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{ret.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{paid.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: net > 0 ? '#ef4444' : (net < 0 ? '#10b981' : 'inherit') }}>
                    {Math.abs(net).toLocaleString()} {net > 0 ? '(Payable)' : (net < 0 ? '(Receivable)' : '')}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button onClick={(e) => { e.stopPropagation(); setPaySupplier(s); }} style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Pay</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Supplier Modal */}
      {editSupplier && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditSupplier(null)}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Edit Supplier</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Supplier Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Initial Balance (Positive = We owe them, Negative = They owe us)</label>
              <input type="number" value={editBalance} onChange={e => setEditBalance(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditSupplier(null)} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateSupplier} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {paySupplier && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPaySupplier(null)}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add Payment</h3>
            <p><strong>{paySupplier.name}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Amount Paid</label>
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Mode</label>
              <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank / Cheque</option>
                <option value="Transfer">Online Transfer</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Notes / Remarks</label>
              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPaySupplier(null)} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddPayment} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer' }}>Save Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {statementSupplier && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setStatementSupplier(null)}>
          <div style={{ background: '#e5e5e5', padding: '10px 24px 24px', borderRadius: 0, width: '95vw', height: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => {
                  const printContents = document.getElementById('printable-ledger').innerHTML;
                  const originalContents = document.body.innerHTML;
                  document.body.innerHTML = printContents;
                  window.print();
                  document.body.innerHTML = originalContents;
                  window.location.reload();
                }} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 16px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ Print Ledger</button>
              </div>
              <button onClick={() => setStatementSupplier(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', fontSize: 16, cursor: 'pointer', fontWeight: 'bold' }}>X CLOSE</button>
            </div>
            
            {!statementData ? (
              <div style={{ padding: 40, textAlign: 'center', background: 'white', flex: 1 }}>Loading statement...</div>
            ) : (
              <div id="printable-ledger" style={{ flex: 1, overflow: 'auto', background: 'white', padding: '20px 40px' }}>
                {/* Waseela Format Header */}
                <div style={{ textAlign: 'center', marginBottom: 20, fontFamily: 'serif' }}>
                  <h2 style={{ margin: '0 0 5px 0', fontSize: '1.4rem', textTransform: 'uppercase' }}>Supplier Ledger</h2>
                  <h1 style={{ margin: '0 0 5px 0', fontSize: '1.8rem', fontWeight: 'bold' }}>AL - TOUHEED GARMENTS</h1>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', fontWeight: 'normal' }}>SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</h3>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', fontWeight: 'normal' }}>CHOWK RANG MAHAL, LAHORE</h3>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'sans-serif', border: '2px solid black' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Date</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Type</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold', width: '15%' }}>Remarks</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Supp.<br/>Date</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Supp.<br/>Inv. #</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Bilty<br/>No.</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>CTN<br/>Bag</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Freight</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Total<br/>Qty</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Supplier<br/>Amount</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Discount<br/>Amount</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Cheque<br/>No</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626', backgroundColor: '#fee2e2' }}>Debit</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold', color: '#16a34a', backgroundColor: '#d1fae5' }}>Credit</th>
                      <th style={{ border: '1px solid black', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Balance</th>
                    </tr>
                    
                    {/* Supplier Meta Header Row */}
                    <tr>
                      <td colSpan="7" style={{ border: '1px solid black', padding: '4px', fontWeight: 'bold' }}>
                        Supplier: <span style={{ fontSize: '0.85rem' }}>{statementSupplier.name}</span><br/>
                        Address: 
                      </td>
                      <td colSpan="8" style={{ border: '1px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold', verticalAlign: 'bottom' }}>
                        Opening Balance: &nbsp;&nbsp;&nbsp;&nbsp; {parseFloat(statementData.initial_balance).toLocaleString(undefined, {minimumFractionDigits: 2})} Cr
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="15" style={{ padding: '4px', fontWeight: 'bold', borderLeft: '1px solid black', borderRight: '1px solid black' }}>
                        Posted Transactions
                      </td>
                    </tr>
                    
                    {(() => {
                      let runningBal = parseFloat(statementData.initial_balance) || 0;
                      let totalSupplierAmount = 0;
                      let totalDiscountAmount = 0;
                      let totalDebit = 0;
                      let totalCredit = 0;
                      let totalCTN = 0;
                      let totalQtySum = 0;
                      let totalFreight = 0;

                      const rows = statementData.transactions.map((t, idx) => {
                        const debit = parseFloat(t.debit) || 0;
                        const credit = parseFloat(t.credit) || 0;
                        const ctn = parseInt(t.ctn_bag) || 0;
                        const qty = parseInt(t.total_qty) || 0;
                        const numFreight = parseFloat(t.freight) || 0;
                        const suppAmt = parseFloat(t.supplier_amount) || 0;
                        const discAmt = parseFloat(t.discount_amount) || 0;

                        runningBal += credit; // Credit increases liability (Owe them more)
                        runningBal -= debit;  // Debit decreases liability (Paid them)
                        
                        totalSupplierAmount += suppAmt;
                        totalDiscountAmount += discAmt;
                        totalDebit += debit;
                        totalCredit += credit;
                        totalCTN += ctn;
                        totalQtySum += qty;
                        totalFreight += numFreight;

                        const fmtDate = (dStr) => {
                          if (!dStr) return '';
                          if (typeof dStr === 'string') {
                            const clean = dStr.split('T')[0];
                            const parts = clean.split('-');
                            if (parts.length === 3) {
                              const [y, m, d] = parts;
                              return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                            }
                          }
                          const d = new Date(dStr);
                          if (isNaN(d.getTime())) return String(dStr);
                          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                        };

                        const dateStr = fmtDate(t.txn_date);
                        const suppDateStr = fmtDate(t.supp_date);

                        // Determine Dr/Cr tag for Balance
                        const balTag = runningBal >= 0 ? 'Cr' : 'Dr';
                        const displayBal = Math.abs(runningBal).toLocaleString(undefined, {minimumFractionDigits: 2});

                        return (
                          <tr key={idx} style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{dateStr}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{t.type}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{t.notes || ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{suppDateStr}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{t.supp_inv_no || ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{t.bilty_no || ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>{ctn > 0 ? ctn : ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: numFreight > 0 ? 'right' : 'center' }}>{numFreight > 0 ? numFreight.toLocaleString(undefined, {minimumFractionDigits: 2}) : (t.freight || '')}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>{qty > 0 ? qty : ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>{suppAmt > 0 ? suppAmt.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>{discAmt > 0 ? discAmt.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px' }}>{t.cheque_no || ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right', fontWeight: 700, color: debit > 0 ? '#dc2626' : 'inherit' }}>{debit > 0 ? debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ borderRight: '1px solid black', padding: '2px 4px', textAlign: 'right', fontWeight: 700, color: credit > 0 ? '#16a34a' : 'inherit' }}>{credit > 0 ? credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 700 }}>{displayBal} <span style={{ color: balTag === 'Dr' ? '#dc2626' : '#d97706' }}>{balTag}</span></td>
                          </tr>
                        );
                      });

                      return (
                        <React.Fragment>
                          {rows}
                          {/* Totals Row */}
                          <tr>
                            <td colSpan="6" style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>Supplier Total:</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{totalCTN > 0 ? totalCTN : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{totalFreight > 0 ? totalFreight.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{totalQtySum > 0 ? totalQtySum : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{totalSupplierAmount > 0 ? totalSupplierAmount.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{totalDiscountAmount > 0 ? totalDiscountAmount.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px' }}></td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{totalDebit > 0 ? totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>{totalCredit > 0 ? totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
                            <td style={{ border: '2px solid black', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{Math.abs(runningBal).toLocaleString(undefined, {minimumFractionDigits: 2})} <span style={{ color: runningBal >= 0 ? '#d97706' : '#dc2626' }}>{runningBal >= 0 ? 'Cr' : 'Dr'}</span></td>
                          </tr>
                        </React.Fragment>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SupplierLedger;
