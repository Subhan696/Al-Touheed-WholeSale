import React, { useState, useEffect } from 'react';
import './FreightReport.css';

const { ipcRenderer } = window.require('electron');

export default function FreightReport() {
  const [ledgerData, setLedgerData] = useState({
    transactions: [],
    opening_balance: 0,
    opening_type: 'Cr.',
    total_debit: 0,
    total_credit: 0,
    closing_balance: 0,
    closing_type: 'Cr.'
  });
  const [loading, setLoading] = useState(false);
  
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(null);

  useEffect(() => {
    loadAccounts();
    loadReceiptSettings();
  }, []);

  useEffect(() => {
    loadReport();
  }, [startDate, endDate, selectedAccount]);

  const loadAccounts = async () => {
    try {
      const res = await ipcRenderer.invoke('get-expense-accounts');
      setAccounts(res || []);
      if (res && res.length > 0 && !selectedAccount) {
        // Default to first account or PEP AC4 if available
        const pep = res.find(a => a.account_name.toUpperCase().includes('PEP') || a.account_name.toUpperCase().includes('PAYABLE') || a.account_name.toUpperCase().includes('FREIGHT'));
        if (pep) {
          setSelectedAccount(pep.account_name);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadReceiptSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-receipt-settings');
      setReceiptSettings(settings || {});
    } catch (e) {
      console.error(e);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const ledger = await ipcRenderer.invoke('get-freight-ledger', {
        startDate,
        endDate,
        accountName: selectedAccount || ''
      });
      setLedgerData(ledger || { transactions: [] });
    } catch (e) {
      console.error('Failed to load freight report', e);
      setLedgerData({ transactions: [] });
    }
    setLoading(false);
  };

  const fmtDate = (dStr) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fmtAmt = (num) => {
    const val = Number(num) || 0;
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const now = new Date();
  const currentDateTimeStr = `${fmtDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const shopName = receiptSettings?.shopName || 'AL - TOUHEED GARMENTS';
  const addressLine1 = receiptSettings?.address1 || 'SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE';
  const addressLine2 = receiptSettings?.address2 || 'CHOWK RANG MAHAL, LAHORE';

  // Format alias name (e.g. PEPAC4 or short code)
  const getAliasName = (accName) => {
    if (!accName) return 'PEPAC4';
    if (accName.toUpperCase().includes('PEP')) return 'PEPAC4';
    return accName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  };

  const transactions = ledgerData?.transactions || [];

  return (
    <div className="freight-report-container">
      {/* Control Bar (Hidden on print) */}
      <div className="fr-control-bar no-print">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Freight Account</label>
          <select 
            value={selectedAccount} 
            onChange={e => setSelectedAccount(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 4, minWidth: 200 }}
          >
            <option value="">All Freight Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.account_name}>{a.account_name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Start Date</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 4 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>End Date</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 4 }}
          />
        </div>

        <button 
          onClick={loadReport}
          style={{ padding: '7px 14px', background: '#475569', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', marginTop: 17 }}
        >
          🔄 Refresh
        </button>

        <button 
          onClick={() => window.print()} 
          style={{ padding: '7px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', marginTop: 17, marginLeft: 'auto' }}
        >
          🖨️ Print Report
        </button>
      </div>

      {/* Report Paper */}
      <div className="fr-paper-wrapper">
        <div className="fr-paper">
          {/* Top Stamp */}
          <div className="fr-top-meta">
            <span>Date: &nbsp;{currentDateTimeStr}</span>
            <span>Page 1 of 1</span>
          </div>

          {/* Header Title */}
          <div className="fr-header">
            <div className="fr-title">Accounts Ledger</div>
            <div className="fr-shop-name">{shopName}</div>
            <div className="fr-address">{addressLine1}</div>
            <div className="fr-address">{addressLine2}</div>
          </div>

          {/* Date Range */}
          <div className="fr-date-bar">
            From &nbsp;{fmtDate(startDate)} &nbsp;&nbsp;&nbsp;&nbsp; To &nbsp;{fmtDate(endDate)}
          </div>

          <div className="fr-dotted-line"></div>

          {/* Ledger Table */}
          <table className="fr-table">
            <thead>
              <tr>
                <th style={{ width: '90px', textAlign: 'left' }}>Date</th>
                <th style={{ width: '85px', textAlign: 'left' }}>Type</th>
                <th style={{ width: '70px', textAlign: 'left' }}>V/Code</th>
                <th style={{ textAlign: 'left' }}>Remarks</th>
                <th style={{ width: '90px', textAlign: 'left' }}>Cheque #</th>
                <th style={{ width: '100px', textAlign: 'right', color: '#dc2626', backgroundColor: '#fee2e2' }}>Debit</th>
                <th style={{ width: '100px', textAlign: 'right', color: '#16a34a', backgroundColor: '#d1fae5' }}>Credit</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
          </table>

          <div className="fr-dotted-line"></div>

          <table className="fr-table">
            <tbody>
              {/* Account Subheader */}
              <tr className="fr-account-header-row">
                <td colSpan="5">
                  <span style={{ fontWeight: 'bold' }}>Alias Name:</span> {getAliasName(selectedAccount)}
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  <span style={{ fontWeight: 'bold' }}>{selectedAccount || 'PURCHASE EXPENSE PAYABLE A/C'}</span>
                </td>
                <td colSpan="3" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                  Opening Balance: &nbsp;&nbsp;&nbsp;&nbsp; {fmtAmt(ledgerData?.opening_balance)} {ledgerData?.opening_type || 'Cr.'}
                </td>
              </tr>

              {/* Transactions */}
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '30px', textAlign: 'center' }}>Loading statement...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '30px', textAlign: 'center' }}>No transactions found for this period.</td>
                </tr>
              ) : (
                transactions.map((t, idx) => (
                  <tr key={idx}>
                    <td style={{ width: '90px' }}>{fmtDate(t.date)}</td>
                    <td style={{ width: '85px' }}>{t.type}</td>
                    <td style={{ width: '70px' }}>{t.vcode}</td>
                    <td>{t.remarks}</td>
                    <td style={{ width: '90px' }}>{t.cheque_no || ''}</td>
                    <td style={{ width: '100px', textAlign: 'right', fontWeight: 700, color: t.debit > 0 ? '#dc2626' : 'inherit' }}>{t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
                    <td style={{ width: '100px', textAlign: 'right', fontWeight: 700, color: t.credit > 0 ? '#16a34a' : 'inherit' }}>{t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
                    <td style={{ width: '110px', textAlign: 'right', fontWeight: 700 }}>{fmtAmt(t.balance)} <span style={{ color: (t.balance_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{t.balance_type || 'Cr.'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Totals Section */}
          <div className="fr-totals-container">
            <div className="fr-dotted-line" style={{ width: '580px' }}></div>
            <table className="fr-totals-table">
              <tbody>
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', width: '270px' }}>Account Total:</td>
                  <td style={{ width: '100px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{fmtAmt(ledgerData?.total_debit)}</td>
                  <td style={{ width: '100px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>{fmtAmt(ledgerData?.total_credit)}</td>
                  <td style={{ width: '110px', textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(ledgerData?.closing_balance)} <span style={{ color: (ledgerData?.closing_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{ledgerData?.closing_type || 'Cr.'}</span></td>
                </tr>
              </tbody>
            </table>

            <div className="fr-dotted-line" style={{ width: '580px' }}></div>

            <table className="fr-totals-table">
              <tbody>
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', width: '270px' }}>Report Total:</td>
                  <td style={{ width: '100px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{fmtAmt(ledgerData?.total_debit)}</td>
                  <td style={{ width: '100px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>{fmtAmt(ledgerData?.total_credit)}</td>
                  <td style={{ width: '110px', textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(ledgerData?.closing_balance)} <span style={{ color: (ledgerData?.closing_type || '').includes('Dr') ? '#dc2626' : '#d97706' }}>{ledgerData?.closing_type || 'Cr.'}</span></td>
                </tr>
              </tbody>
            </table>

            <div className="fr-dotted-line" style={{ width: '580px' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
