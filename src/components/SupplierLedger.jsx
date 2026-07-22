import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function SupplierLedger() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit Balance Modal
  const [editSupplier, setEditSupplier] = useState(null);
  const [editBalance, setEditBalance] = useState('');

  // Payment Modal
  const [paySupplier, setPaySupplier] = useState(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');

  // Statement Modal
  const [statementSupplier, setStatementSupplier] = useState(null);
  const [statementData, setStatementData] = useState(null);

  useEffect(() => {
    loadLedger();
  }, []);

  const loadLedger = async () => {
    setLoading(true);
    const data = await ipcRenderer.invoke('get-suppliers-ledger');
    setSuppliers(data || []);
    setLoading(false);
  };

  const handleUpdateBalance = async () => {
    if (!editSupplier) return;
    await ipcRenderer.invoke('update-supplier-balance', { id: editSupplier.id, initial_balance: editBalance });
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

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Supplier & Manufacturer Ledger</h2>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Supplier Name</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Initial Balance</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total Purchases</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total Returns</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total Paid</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Net Balance</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ padding: 40, textAlign: 'center' }}>Loading ledger...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: 40, textAlign: 'center' }}>No suppliers found.</td></tr>
            ) : suppliers.map(s => {
              const initBal = parseFloat(s.initial_balance) || 0;
              const purch = parseFloat(s.total_purchases) || 0;
              const ret = parseFloat(s.total_returns) || 0;
              const paid = parseFloat(s.total_paid) || 0;
              const net = parseFloat(s.net_balance) || 0;

              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => openStatement(s)}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {initBal.toLocaleString()}
                    <button onClick={(e) => { e.stopPropagation(); setEditSupplier(s); setEditBalance(s.initial_balance); }} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer' }}>✎</button>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{purch.toLocaleString()}</td>
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

      {/* Edit Initial Balance Modal */}
      {editSupplier && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 400 }}>
            <h3 style={{ marginTop: 0 }}>Set Initial Balance</h3>
            <p><strong>{editSupplier.name}</strong></p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Amount (Positive = We owe them, Negative = They owe us)</label>
              <input type="number" value={editBalance} onChange={e => setEditBalance(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditSupplier(null)} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateBalance} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {paySupplier && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 400 }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setStatementSupplier(null)}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 800, height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Statement: {statementSupplier.name}</h3>
              <button onClick={() => setStatementSupplier(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>&times;</button>
            </div>
            
            {!statementData ? (
              <div style={{ padding: 40, textAlign: 'center' }}>Loading statement...</div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                      <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Type</th>
                      <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Ref No</th>
                      <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Notes</th>
                      <th style={{ padding: 8, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Debit (Paid)</th>
                      <th style={{ padding: 8, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Credit (Bill)</th>
                      <th style={{ padding: 8, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="6" style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>Opening Balance</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>
                        {parseFloat(statementData.initial_balance).toLocaleString()}
                      </td>
                    </tr>
                    {(() => {
                      let runningBal = parseFloat(statementData.initial_balance) || 0;
                      return statementData.transactions.map((t, idx) => {
                        const amt = parseFloat(t.amount) || 0;
                        let debit = 0;
                        let credit = 0;
                        
                        if (t.type === 'Purchase') {
                          credit = amt; // Bill increases our payable
                          runningBal += amt;
                        } else if (t.type === 'Return') {
                          debit = amt; // Return decreases our payable
                          runningBal -= amt;
                        } else if (t.type === 'Payment') {
                          debit = amt; // Payment decreases our payable
                          runningBal -= amt;
                        }

                        // Format date nicely
                        const d = new Date(t.txn_date);
                        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth()+1).padStart(2, '0')}-${d.getFullYear()}`;

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: 8 }}>{dateStr}</td>
                            <td style={{ padding: 8 }}>
                              <span style={{ 
                                padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                                background: t.type === 'Purchase' ? '#fee2e2' : (t.type === 'Payment' ? '#d1fae5' : '#fef3c7'),
                                color: t.type === 'Purchase' ? '#991b1b' : (t.type === 'Payment' ? '#065f46' : '#92400e')
                              }}>
                                {t.type}
                              </span>
                            </td>
                            <td style={{ padding: 8 }}>{t.ref_no || '-'}</td>
                            <td style={{ padding: 8 }}>{t.notes || '-'}</td>
                            <td style={{ padding: 8, textAlign: 'right', color: '#059669' }}>{debit > 0 ? debit.toLocaleString() : ''}</td>
                            <td style={{ padding: 8, textAlign: 'right', color: '#dc2626' }}>{credit > 0 ? credit.toLocaleString() : ''}</td>
                            <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{runningBal.toLocaleString()}</td>
                          </tr>
                        );
                      });
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
