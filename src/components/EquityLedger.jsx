import React, { useState, useEffect, useRef } from 'react';
import './CashLedger.css';

const { ipcRenderer } = window.require('electron');

export default function EquityLedger({ currentUser, isActive }) {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [accountSearch, setAccountSearch] = useState('');
  const [accountList, setAccountList] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reportRef = useRef(null);

  // Fetch Equity account options from GL Accounts
  useEffect(() => {
    const fetchEquityAccounts = async () => {
      try {
        const res = await ipcRenderer.invoke('get-gl-accounts', { 
          type: 'Equity', 
          searchTerm: accountSearch 
        });
        const list = res || [];
        setAccountList(list);
        if (!selectedAccount && list.length > 0 && !accountSearch) {
          setSelectedAccount(list[0]);
          setAccountSearch(list[0].account_name);
        }
      } catch (err) {
        console.error('Error fetching equity accounts:', err);
        setAccountList([]);
      }
    };
    fetchEquityAccounts();
  }, [accountSearch]);

  const fetchStatement = async () => {
    if (!selectedAccount) {
      setStatement(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await ipcRenderer.invoke('get-ledger-report', {
        accountId: selectedAccount.id,
        accountName: selectedAccount.account_name,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setStatement(data);
    } catch (err) {
      console.error('Failed to load equity statement:', err);
      setError(err.message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [selectedAccount?.id, startDate, endDate]);

  const selectAccount = (acc) => {
    setSelectedAccount(acc);
    setAccountSearch(acc.account_name);
    setShowDrop(false);
    setStatement(null);
    setError(null);
  };

  const fmt = (num) => {
    if (num === null || num === undefined || num === 0) return '';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtBal = (num) => {
    return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return String(dStr);
  };

  const handlePrint = () => {
    if (!reportRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print');
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Equity Ledger - ${selectedAccount?.account_name || 'Account'}</title>
          <style>
            body { font-family: monospace; font-size: 12px; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
            th { background-color: #f2f2f2; }
            .text-right { text-align: right; }
            .header-box { border: 1px solid #000; padding: 8px; margin-bottom: 15px; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-box">
            <h2 style="margin:0 0 5px 0;">EQUITY LEDGER REPORT</h2>
            <div><strong>Account:</strong> ${selectedAccount?.account_name || '—'}</div>
            <div><strong>Period:</strong> ${startDate || 'All'} to ${endDate || 'All'}</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
          </div>
          ${reportRef.current.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="cash-ledger-container" style={{ padding: 16 }}>
      {/* Header & Controls */}
      <div className="cash-ledger-controls no-print" style={{ background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Account Selector Dropdown */}
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>Select Equity Account</label>
            <input
              type="text"
              className="cash-input"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #cbd5e1' }}
              placeholder="Search Equity Account..."
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value);
                setShowDrop(true);
              }}
              onFocus={() => setShowDrop(true)}
            />
            {showDrop && accountList.length > 0 && (
              <ul className="cash-dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, maxHeight: 200, overflowY: 'auto', zIndex: 50, listStyle: 'none', margin: '4px 0 0 0', padding: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                {accountList.map((acc) => (
                  <li
                    key={acc.id}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    onClick={() => selectAccount(acc)}
                  >
                    <strong>{acc.account_name}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 8 }}>({acc.account_type})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Date Range */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>From Date</label>
            <input
              type="date"
              className="cash-input"
              style={{ padding: '7px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>To Date</label>
            <input
              type="date"
              className="cash-input"
              style={{ padding: '7px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 16px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              onClick={handlePrint}
              disabled={!statement || statement.transactions?.length === 0}
            >
              🖨️ Print
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading && <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Loading equity ledger...</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 12, borderRadius: 6, marginBottom: 16 }}>{error}</div>}

      {!loading && !selectedAccount && (
        <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, color: '#64748b' }}>
          <h3>No Equity Account Selected</h3>
          <p>Please select an equity account from the search box above.</p>
        </div>
      )}

      {!loading && selectedAccount && statement && (
        <div ref={reportRef} style={{ background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {/* Account Meta Header */}
          <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>{selectedAccount.account_name}</h2>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                Account Type: Equity | Balance Type: {statement.initial_balance_type || 'Cr'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Closing Balance</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: statement.final_balance_type === 'Cr' ? '#16a34a' : '#dc2626' }}>
                Rs. {fmtBal(statement.final_balance)} {statement.final_balance_type || 'Cr.'}
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #334155' }}>Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #334155' }}>Type</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #334155' }}>Voucher No</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #334155' }}>Remarks / Particulars</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #334155' }}>Ref/Cheque No</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #334155', background: '#991b1b' }}>Debit (Dr)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #334155', background: '#166534' }}>Credit (Cr)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #334155' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                  <td colSpan={7} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>Opening Balance:</td>
                  <td style={{ padding: '8px 12px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>
                    {fmtBal(statement.initial_balance)} {statement.initial_balance_type || 'Cr.'}
                  </td>
                </tr>

                {statement.transactions?.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', border: '1px solid #cbd5e1' }}>
                      No transactions recorded for this equity account in the selected date range.
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((t, idx) => (
                    <tr key={t.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{t.type}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>{t.v_code}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>{t.remarks}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>{t.cheque_no}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', textAlign: 'right', color: Number(t.debit) > 0 ? '#dc2626' : '#94a3b8', fontWeight: Number(t.debit) > 0 ? 700 : 400 }}>{fmt(t.debit)}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', textAlign: 'right', color: Number(t.credit) > 0 ? '#16a34a' : '#94a3b8', fontWeight: Number(t.credit) > 0 ? 700 : 400 }}>{fmt(t.credit)}</td>
                      <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>
                        {fmtBal(t.balance)} <span style={{ fontSize: '0.8rem', color: t.balance_type === 'Cr' ? '#16a34a' : '#dc2626' }}>{t.balance_type}</span>
                      </td>
                    </tr>
                  ))
                )}

                {statement.transactions?.length > 0 && (
                  <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                    <td colSpan={5} style={{ padding: '10px 12px', border: '1px solid #cbd5e1', textAlign: 'right' }}>Total Equity Activity:</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#dc2626' }}>{fmtBal(statement.total_debit)}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#16a34a' }}>{fmtBal(statement.total_credit)}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '1.05rem' }}>
                      {fmtBal(statement.final_balance)} <span style={{ fontSize: '0.85rem', color: statement.final_balance_type === 'Cr' ? '#16a34a' : '#dc2626' }}>{statement.final_balance_type || 'Cr.'}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
