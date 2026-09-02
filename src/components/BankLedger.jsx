import React, { useState, useEffect, useRef } from 'react';
import './BankLedger.css';

const { ipcRenderer } = window.require('electron');

function BankLedger({ currentUser, isActive, initialBank }) {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [bankSearch, setBankSearch] = useState('');
  const [bankList, setBankList] = useState([]);
  const [showBankDrop, setShowBankDrop] = useState(false);
  const [selectedBank, setSelectedBank] = useState(initialBank || null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reportRef = useRef(null);

  useEffect(() => {
    if (initialBank) {
      setSelectedBank(initialBank);
    }
  }, [initialBank]);

  // Fetch bank options from GL Accounts
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await ipcRenderer.invoke('get-gl-accounts', { type: 'Bank', searchTerm: bankSearch });
        setBankList(res || []);
      } catch (err) {
        console.error('Error fetching banks:', err);
        setBankList([]);
      }
    };
    fetchBanks();
  }, [bankSearch]);

  // Load statement whenever selectedBank, startDate, or endDate changes
  const fetchStatement = async () => {
    if (!selectedBank) {
      setStatement(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await ipcRenderer.invoke('get-ledger-report', {
        accountId: selectedBank.id,
        accountName: selectedBank.account_name,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setStatement(data);
    } catch (err) {
      console.error('Failed to load bank statement:', err);
      setError(err.message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [selectedBank?.id, startDate, endDate]);

  const selectBank = (bank) => {
    setSelectedBank(bank);
    setBankSearch(bank.account_name);
    setShowBankDrop(false);
    setStatement(null);
    setError(null);
  };

  const fmt = (num) => {
    if (num === null || num === undefined || num === 0) return '';
    return Math.round(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtBal = (num) => {
    return (num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtDate = (dStr) => {
    if (!dStr) return '';

    // Handle Date objects
    if (dStr instanceof Date) {
      const day = String(dStr.getDate()).padStart(2, '0');
      const month = String(dStr.getMonth() + 1).padStart(2, '0');
      const year = dStr.getFullYear();
      return `${day}/${month}/${year}`;
    }

    // Handle ISO date strings
    if (typeof dStr === 'string') {
      if (dStr.includes('T')) {
        // ISO format: 2026-07-24T19:00:00.000Z
        const datePart = dStr.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
    }

    return String(dStr);
  };

  const handlePrint = () => {
    if (!statement || !reportRef.current) return;
    const content = reportRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bank Ledger - ${selectedBank?.account_name}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; font-family: 'Times New Roman', Times, serif; }
          body { font-size: 13px; color: #000; background: #fff; margin: 0; padding: 10px; }
          .bl-header { text-align: center; margin-bottom: 12px; }
          .bl-header h1 { font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase; }
          .bl-header h2 { font-size: 15px; font-weight: bold; margin: 2px 0; }
          .bl-header p { font-size: 12px; margin: 2px 0; font-weight: bold; }
          .bl-meta-bar { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; }
          .bl-bank-box { border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 10px; font-weight: bold; }
          .bl-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .bl-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; font-weight: bold; }
          .bl-table td { padding: 4px 6px; font-size: 12px; border-bottom: 1px dotted #ccc; }
          .bl-table th.right, .bl-table td.right { text-align: right; }
          .bl-table th.center, .bl-table td.center { text-align: center; }
          .bl-opening-row td { font-weight: bold; padding: 6px; }
          .bl-total-row td { font-weight: bold; border-top: 1px solid #000; border-bottom: 2px double #000; padding: 6px; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  if (error) {
    return (
      <div className="bank-ledger-container" style={{ padding: 40, textAlign: 'center' }}>
        <h3 style={{ color: '#f64e60' }}>Error: {error}</h3>
        <button onClick={fetchStatement} style={{ padding: '10px 20px', marginTop: 20 }}>Retry</button>
      </div>
    );
  }

  return (
    <div className="bank-ledger-container">
      {/* Control Bar */}
      <div className="bl-control-bar no-print">
        <div className="bl-control-group">
          <label>Bank Account:</label>
          <div className="bl-search-wrap">
            <input
              type="text"
              placeholder="Type bank name..."
              value={bankSearch}
              onChange={e => { setBankSearch(e.target.value); setShowBankDrop(true); }}
              onFocus={() => setShowBankDrop(true)}
              className="bl-input"
            />
            {showBankDrop && bankList.length > 0 && (
              <div className="bl-dropdown">
                {bankList.map(b => (
                  <div key={b.id} className="bl-drop-item" onClick={() => selectBank(b)}>
                    <strong>{b.account_name}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bl-control-group">
          <label>From Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bl-input-date"
          />
        </div>

        <div className="bl-control-group">
          <label>To Date:</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bl-input-date"
          />
        </div>

        <div className="bl-btn-group">
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={!statement}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: statement ? 'pointer' : 'not-allowed' }}
          >
            🖨️ Print Ledger
          </button>

          <button
            className="btn btn-secondary"
            onClick={fetchStatement}
            style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Statement Display */}
      {loading && <div className="bl-loading">Loading Bank Ledger...</div>}

      {!loading && !selectedBank && (
        <div className="bl-placeholder">
          <h3>Select a bank account above to view their Bank Ledger statement</h3>
        </div>
      )}

      {!loading && selectedBank && !statement && (
        <div className="bl-placeholder">
          <h3>Loading statement for {selectedBank.account_name}...</h3>
        </div>
      )}

      {!loading && selectedBank && statement && (
        <div className="bl-paper-wrapper">
          <div className="bl-paper" ref={reportRef}>
            {/* Header Stamp */}
            <div className="bl-top-meta">
              <span>Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US')}</span>
              <span>Page 1 of 1</span>
            </div>

            <div className="bl-header">
              <h1>Accounts Ledger</h1>
              <h2>AL - TOUHEED GARMENTS</h2>
              <p>SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</p>
              <p>CHOWK RANG MAHAL, LAHORE</p>
            </div>

            <div className="bl-meta-bar">
              <span>From Date: {fmtDate(startDate)}</span>
              <span>To Date: {fmtDate(endDate)}</span>
            </div>

            <div className="bl-bank-box">
              <div>Bank Account: <strong>{statement.account?.account_name || selectedBank.account_name || 'N/A'}</strong></div>
              <div>Account Type: {statement.account?.account_type || selectedBank.account_type || '—'}</div>
            </div>

            {/* Table */}
            <table className="bl-table">
              <thead>
                <tr>
                  <th style={{ width: '75px' }}>Date</th>
                  <th style={{ width: '80px' }}>Type</th>
                  <th style={{ width: '75px' }}>User</th>
                  <th>Remarks</th>
                  <th style={{ width: '85px' }}>Cheque #</th>
                  <th className="right" style={{ width: '80px', color: '#dc2626', backgroundColor: '#fee2e2' }}>Debit</th>
                  <th className="right" style={{ width: '80px', color: '#16a34a', backgroundColor: '#d1fae5' }}>Credit</th>
                  <th className="right" style={{ width: '130px' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                <tr className="bl-opening-row">
                  <td colSpan={7} style={{ textAlign: 'right', fontWeight: 'bold' }}>Opening Balance:</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.initial_balance || 0)} {statement.initial_balance_type || 'Dr'}
                  </td>
                </tr>

                {/* Transaction Rows */}
                {(!statement.transactions || !Array.isArray(statement.transactions) || statement.transactions.length === 0) ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontStyle: 'italic' }}>
                      No transactions recorded in this date range.
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((t, idx) => {
                    if (!t) return null;
                    return (
                      <tr key={t.id || idx}>
                        <td>{fmtDate(t.date)}</td>
                        <td style={{ fontWeight: 700 }}>{String(t.type || '')}</td>
                        <td style={{ fontWeight: 600, color: '#475569' }}>{String(t.user_name || t.user || 'Admin')}</td>
                        <td>{String(t.remarks || '')}</td>
                        <td>{String(t.cheque_no || '')}</td>
                        <td className="right" style={{ fontWeight: 700, color: (t.debit || 0) > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(t.debit)}</td>
                        <td className="right" style={{ fontWeight: 700, color: (t.credit || 0) > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(t.credit)}</td>
                        <td className="right" style={{ fontWeight: 700 }}>
                          {fmtBal(t.balance || 0)} <span style={{ color: (t.balance_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{String(t.balance_type || '')}</span>
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Footer Totals */}
                <tr className="bl-total-row">
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Account Total:</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmtBal(statement.total_debit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmtBal(statement.total_credit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.final_balance || 0)} <span style={{ color: (statement.final_balance_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{statement.final_balance_type || 'Dr'}</span>
                  </td>
                </tr>
                <tr className="bl-total-row">
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Report Total:</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmtBal(statement.total_debit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmtBal(statement.total_credit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.final_balance || 0)} <span style={{ color: (statement.final_balance_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{statement.final_balance_type || 'Dr'}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default BankLedger;
