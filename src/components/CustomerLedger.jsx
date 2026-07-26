import React, { useState, useEffect, useRef } from 'react';
import './CustomerLedger.css';
import GLVoucherEntry from './GLVoucherEntry';

const { ipcRenderer } = window.require('electron');

function CustomerLedger({ currentUser, initialCustomer, isActive }) {
  const getLocalDateStr = (d = new Date()) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  const getThirtyDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateStr(d);
  };

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [customerSearch, setCustomerSearch] = useState(initialCustomer ? initialCustomer.name : '');
  const [customerList, setCustomerList] = useState([]);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(initialCustomer || null);

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showVoucherEntry, setShowVoucherEntry] = useState(false);

  const reportRef = useRef(null);

  // Fetch customer options
  useEffect(() => {
    ipcRenderer.invoke('get-customers', { searchTerm: customerSearch }).then(res => {
      setCustomerList(res || []);
    }).catch(() => {});
  }, [customerSearch]);

  // Load statement whenever selectedCustomer, startDate, or endDate changes
  const fetchStatement = async () => {
    if (!selectedCustomer) {
      setStatement(null);
      return;
    }

    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('get-customer-statement', {
        customerName: selectedCustomer.name,
        customerId: selectedCustomer.id,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setStatement(data);
    } catch (err) {
      console.error('Failed to load customer statement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [selectedCustomer, startDate, endDate]);

  const selectCust = (cust) => {
    setSelectedCustomer(cust);
    setCustomerSearch(cust.name);
    setShowCustomerDrop(false);
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
    if (dStr.includes('-')) {
      const parts = dStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return dStr;
  };

  const handlePrint = () => {
    if (!statement || !reportRef.current) return;
    const content = reportRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Ledger - ${selectedCustomer?.name}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; font-family: 'Times New Roman', Times, serif; }
          body { font-size: 13px; color: #000; background: #fff; margin: 0; padding: 10px; }
          .cl-header { text-align: center; margin-bottom: 12px; }
          .cl-header h1 { font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase; }
          .cl-header h2 { font-size: 15px; font-weight: bold; margin: 2px 0; }
          .cl-header p { font-size: 12px; margin: 2px 0; font-weight: bold; }
          .cl-meta-bar { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; }
          .cl-cust-box { border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 10px; font-weight: bold; }
          .cl-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .cl-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; font-weight: bold; }
          .cl-table td { padding: 4px 6px; font-size: 12px; border-bottom: 1px dotted #ccc; }
          .cl-table th.right, .cl-table td.right { text-align: right; }
          .cl-table th.center, .cl-table td.center { text-align: center; }
          .cl-opening-row td { font-weight: bold; padding: 6px; }
          .cl-total-row td { font-weight: bold; border-top: 1px solid #000; border-bottom: 2px double #000; padding: 6px; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  if (showVoucherEntry) {
    return (
      <GLVoucherEntry 
        initialCustomer={selectedCustomer}
        onCancel={() => setShowVoucherEntry(false)}
        onSuccess={() => {
          setShowVoucherEntry(false);
          fetchStatement();
        }}
      />
    );
  }

  return (
    <div className="customer-ledger-container">
      {/* Control Bar */}
      <div className="cl-control-bar no-print">
        <div className="cl-control-group">
          <label>Customer Search:</label>
          <div className="cl-search-wrap">
            <input 
              type="text" 
              placeholder="Type customer name or code..." 
              value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDrop(true); }}
              onFocus={() => setShowCustomerDrop(true)}
              className="cl-input"
            />
            {showCustomerDrop && customerList.length > 0 && (
              <div className="cl-dropdown">
                {customerList.map(c => (
                  <div key={c.id} className="cl-drop-item" onClick={() => selectCust(c)}>
                    <strong>{c.name}</strong> {c.city ? `(${c.city})` : ''} {c.phone ? `- ${c.phone}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cl-control-group">
          <label>From Date:</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="cl-input-date"
          />
        </div>

        <div className="cl-control-group">
          <label>To Date:</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="cl-input-date"
          />
        </div>

        <div className="cl-btn-group">
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
      {loading && <div className="cl-loading">Loading Customer Ledger...</div>}

      {!loading && !selectedCustomer && (
        <div className="cl-placeholder">
          <h3>Select a customer above to view their Customer Ledger statement</h3>
        </div>
      )}

      {!loading && selectedCustomer && statement && (
        <div className="cl-paper-wrapper">
          <div className="cl-paper" ref={reportRef}>
            {/* Header Stamp */}
            <div className="cl-top-meta">
              <span>Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US')}</span>
              <span>Page 1 of 1</span>
            </div>

            <div className="cl-header">
              <h1>Customer Ledger</h1>
              <h2>AL - TOUHEED GARMENTS</h2>
              <p>SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</p>
              <p>CHOWK RANG MAHAL, LAHORE</p>
            </div>

            <div className="cl-meta-bar">
              <span>From Date: {fmtDate(startDate)}</span>
              <span>To Date: {fmtDate(endDate)}</span>
            </div>

            <div className="cl-cust-box">
              <div>Customer: <strong>{statement.customer?.name} ({statement.customer?.id || 'Ref'})</strong></div>
              <div>Address: {statement.customer?.city || statement.customer?.address || '—'} {statement.customer?.phone ? `| Phone: ${statement.customer.phone}` : ''}</div>
            </div>

            {/* Table */}
            <table className="cl-table">
              <thead>
                <tr>
                  <th style={{ width: '105px' }}>Date</th>
                  <th style={{ width: '85px' }}>Type</th>
                  <th style={{ width: '75px' }}>V/Code</th>
                  <th>Remarks</th>
                  <th style={{ width: '220px' }}>Cheque #</th>
                  <th className="right" style={{ width: '120px', color: '#dc2626', backgroundColor: '#fee2e2' }}>Debit</th>
                  <th className="right" style={{ width: '120px', color: '#16a34a', backgroundColor: '#d1fae5' }}>Credit</th>
                  <th className="right" style={{ width: '140px' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                <tr className="cl-opening-row">
                  <td colSpan={7} style={{ textAlign: 'right', fontWeight: 'bold' }}>Opening Balance:</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.initial_balance)} {statement.initial_balance_type}
                  </td>
                </tr>

                {/* Transaction Rows */}
                {statement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontStyle: 'italic' }}>
                      No transactions recorded in this date range.
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{fmtDate(t.date)}</td>
                      <td style={{ fontWeight: 700 }}>{t.type}</td>
                      <td>{t.v_code}</td>
                      <td>{t.remarks}</td>
                      <td>{t.cheque_no}</td>
                      <td className="right" style={{ fontWeight: 700, color: t.debit > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(t.debit)}</td>
                      <td className="right" style={{ fontWeight: 700, color: t.credit > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(t.credit)}</td>
                      <td className="right" style={{ fontWeight: 700 }}>
                        {fmtBal(t.balance)} <span style={{ color: t.balance_type === 'Dr' ? '#dc2626' : '#d97706' }}>{t.balance_type}</span>
                      </td>
                    </tr>
                  ))
                )}

                {/* Footer Totals */}
                <tr className="cl-total-row">
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Customer Total:</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmtBal(statement.total_debit)}</td>
                  <td className="right" style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmtBal(statement.total_credit)}</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>
                    {fmtBal(statement.final_balance)} <span style={{ color: statement.final_balance_type === 'Dr' ? '#dc2626' : '#d97706' }}>{statement.final_balance_type}</span>
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

export default CustomerLedger;
