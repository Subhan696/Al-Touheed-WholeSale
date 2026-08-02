import React, { useState, useEffect, useRef } from 'react';
import './CashLedger.css';

const { ipcRenderer } = window.require('electron');

function CashLedger({ currentUser, isActive }) {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [cashSearch, setCashSearch] = useState('');
  const [cashList, setCashList] = useState([]);
  const [showCashDrop, setShowCashDrop] = useState(false);
  const [selectedCash, setSelectedCash] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reportRef = useRef(null);

  // Fetch cash account options from GL Accounts
  useEffect(() => {
    const fetchCashAccounts = async () => {
      try {
        const res = await ipcRenderer.invoke('get-gl-accounts', { type: 'Cash', searchTerm: cashSearch });
        const list = res || [];
        setCashList(list);
        if (!selectedCash && list.length > 0 && !cashSearch) {
          setSelectedCash(list[0]);
          setCashSearch(list[0].account_name);
        }
      } catch (err) {
        console.error('Error fetching cash accounts:', err);
        setCashList([]);
      }
    };
    fetchCashAccounts();
  }, [cashSearch]);

  // Load statement whenever selectedCash, startDate, or endDate changes
  const fetchStatement = async () => {
    if (!selectedCash) {
      setStatement(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await ipcRenderer.invoke('get-ledger-report', {
        accountId: selectedCash.id,
        accountName: selectedCash.account_name,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setStatement(data);
    } catch (err) {
      console.error('Failed to load cash statement:', err);
      setError(err.message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [selectedCash?.id, startDate, endDate]);

  const selectCash = (cashAcc) => {
    setSelectedCash(cashAcc);
    setCashSearch(cashAcc.account_name);
    setShowCashDrop(false);
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
    
    if (dStr instanceof Date) {
      const day = String(dStr.getDate()).padStart(2, '0');
      const month = String(dStr.getMonth() + 1).padStart(2, '0');
      const year = dStr.getFullYear();
      return `${day}/${month}/${year}`;
    }
    
    if (typeof dStr === 'string') {
      if (dStr.includes('T')) {
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
        <title>Cash Ledger - ${selectedCash?.account_name}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; font-family: 'Times New Roman', Times, serif; }
          body { font-size: 13px; color: #000; background: #fff; margin: 0; padding: 10px; }
          .csl-header { text-align: center; margin-bottom: 12px; }
          .csl-header h1 { font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase; }
          .csl-header h2 { font-size: 15px; font-weight: bold; margin: 2px 0; }
          .csl-header p { font-size: 12px; margin: 2px 0; font-weight: bold; }
          .csl-meta-bar { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; }
          .csl-cash-box { border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 10px; font-weight: bold; }
          .csl-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .csl-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; font-weight: bold; }
          .csl-table td { padding: 4px 6px; font-size: 12px; border-bottom: 1px dotted #ccc; }
          .csl-table th.right, .csl-table td.right { text-align: right; }
          .csl-table th.center, .csl-table td.center { text-align: center; }
          .csl-opening-row td { font-weight: bold; padding: 6px; }
          .csl-total-row td { font-weight: bold; border-top: 1px solid #000; border-bottom: 2px double #000; padding: 6px; }
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
      <div className="cash-ledger-container" style={{ padding: 40, textAlign: 'center' }}>
        <h3 style={{ color: '#f64e60' }}>Error: {error}</h3>
        <button onClick={fetchStatement} style={{ padding: '10px 20px', marginTop: 20 }}>Retry</button>
      </div>
    );
  }

  return (
    <div className="cash-ledger-container">
      {/* Control Bar */}
      <div className="csl-control-bar no-print">
        <div className="csl-control-group">
          <label>Cash Account:</label>
          <div className="csl-search-wrap">
            <input 
              type="text" 
              placeholder="Type cash account name..." 
              value={cashSearch}
              onChange={e => { setCashSearch(e.target.value); setShowCashDrop(true); }}
              onFocus={() => setShowCashDrop(true)}
              className="csl-input"
            />
            {showCashDrop && cashList.length > 0 && (
              <div className="csl-dropdown">
                {cashList.map(c => (
                  <div key={c.id} className="csl-drop-item" onClick={() => selectCash(c)}>
                    <strong>{c.account_name}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="csl-control-group">
          <label>From Date:</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="csl-input-date"
          />
        </div>

        <div className="csl-control-group">
          <label>To Date:</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="csl-input-date"
          />
        </div>

        <div className="csl-btn-group">
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
      {loading && <div className="csl-loading">Loading Cash Ledger...</div>}

      {!loading && !selectedCash && (
        <div className="csl-placeholder">
          <h3>Select a cash account above to view their Cash Ledger statement</h3>
        </div>
      )}

      {!loading && selectedCash && !statement && (
        <div className="csl-placeholder">
          <h3>Loading statement for {selectedCash.account_name}...</h3>
        </div>
      )}

      {!loading && selectedCash && statement && (
        <div className="csl-paper-wrapper">
          <div className="csl-paper" ref={reportRef}>
            {/* Header Stamp */}
            <div className="csl-top-meta">
              <span>Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US')}</span>
              <span>Page 1 of 1</span>
            </div>

            <div className="csl-header">
              <h1>Cash Ledger</h1>
              <h2>AL - TOUHEED GARMENTS</h2>
              <p>SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</p>
              <p>CHOWK RANG MAHAL, LAHORE</p>
            </div>

            <div className="csl-meta-bar">
              <span>From Date: {fmtDate(startDate)}</span>
              <span>To Date: {fmtDate(endDate)}</span>
            </div>

            <div className="csl-cash-box">
              <div>Cash Account: <strong>{statement.account?.account_name || selectedCash.account_name || 'N/A'}</strong></div>
              <div>Account Type: {statement.account?.account_type || selectedCash.account_type || 'Cash'}</div>
            </div>

            {/* Table */}
            <table className="csl-table">
              <thead>
                <tr>
                  <th style={{ width: '105px' }}>Date</th>
                  <th style={{ width: '85px' }}>Type</th>
                  <th style={{ width: '75px' }}>V/Code</th>
                  <th>Remarks</th>
                  <th style={{ width: '220px' }}>Reference #</th>
                  <th className="right" style={{ width: '120px', color: '#dc2626', backgroundColor: '#fee2e2' }}>Debit</th>
                  <th className="right" style={{ width: '120px', color: '#16a34a', backgroundColor: '#d1fae5' }}>Credit</th>
                  <th className="right" style={{ width: '140px' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                <tr className="csl-opening-row">
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
                        <td>{String(t.v_code || '')}</td>
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
                <tr className="csl-total-row">
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Account Total:</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmtBal(statement.total_debit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmtBal(statement.total_credit || 0)}</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.final_balance || 0)} <span style={{ color: (statement.final_balance_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{statement.final_balance_type || 'Dr'}</span>
                  </td>
                </tr>
                <tr className="csl-total-row">
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

export default CashLedger;
