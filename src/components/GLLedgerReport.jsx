import React, { useState, useEffect, useRef } from 'react';
import './GL.css';

const { ipcRenderer } = window.require('electron');

export default function GLLedgerReport({ initialTab = 'all' }) {
  const [activeSubTab, setActiveSubTab] = useState(initialTab);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);

  // Sync sub-tab if prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Fetch accounts when sub-tab changes
  useEffect(() => {
    let isMounted = true;
    const fetchAccounts = async () => {
      try {
        let params = {};
        if (activeSubTab === 'expense') {
          params = { type: 'Expense', excludeExpenseAccounts: true };
        } else if (activeSubTab === 'equity') {
          params = { type: 'Equity' };
        } else {
          params = { types: ['Cash', 'Bank', 'Expense', 'Equity', 'Income'], excludeExpenseAccounts: true };
        }

        const res = await ipcRenderer.invoke('get-gl-accounts', params);
        const list = res || [];
        if (isMounted) {
          setAccounts(list);
          if (list.length > 0) {
            setAccountId(String(list[0].id));
          } else {
            setAccountId('');
            setStatement(null);
          }
        }
      } catch (err) {
        console.error('Error fetching GL accounts:', err);
        if (isMounted) {
          setAccounts([]);
          setAccountId('');
          setStatement(null);
        }
      }
    };

    fetchAccounts();
    return () => { isMounted = false; };
  }, [activeSubTab]);

  // Auto-load ledger statement whenever accountId, startDate, or endDate changes
  useEffect(() => {
    if (!accountId) {
      setStatement(null);
      return;
    }

    let isMounted = true;
    const loadLedger = async () => {
      setLoading(true);
      try {
        const selectedAcc = accounts.find(a => a.id === parseInt(accountId, 10));
        const res = await ipcRenderer.invoke('get-ledger-report', {
          accountId: parseInt(accountId, 10),
          accountName: selectedAcc?.account_name || '',
          startDate: startDate || null,
          endDate: endDate || null,
        });
        if (isMounted) {
          setStatement(res || null);
        }
      } catch (err) {
        console.error('Failed to load ledger statement:', err);
        if (isMounted) setStatement(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadLedger();
    return () => { isMounted = false; };
  }, [accountId, startDate, endDate, accounts]);

  const handleAccountChange = (e) => {
    setAccountId(e.target.value);
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = `
      <html><head><style>
        body { font-family: sans-serif; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background: #eee; }
        .right { text-align: right; }
      </style></head>
      <body>
        <h2>Account Ledger Report ${activeSubTab === 'expense' ? '(Expense Ledger)' : activeSubTab === 'equity' ? '(Equity Ledger)' : ''}</h2>
        ${printRef.current.innerHTML}
      </body></html>
    `;
    ipcRenderer.invoke('print-receipt', html);
  };

  const accountInfo = accounts.find(a => a.id === parseInt(accountId, 10));
  const transactions = statement?.transactions || [];

  const fmt = (num) => {
    if (num === null || num === undefined || num === 0) return '';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtBal = (num) => {
    return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtDate = (dStr) => {
    if (!dStr) return '';
    const d = dStr instanceof Date ? dStr : new Date(dStr);
    if (Number.isNaN(d.getTime())) return String(dStr);
    return d.toLocaleDateString('en-GB');
  };

  return (
    <div className="p-4 bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Account Ledger</h1>
          <p className="text-sm text-slate-500 mt-1">
            View detailed ledger statements for all accounts, expense accounts, and equity accounts.
          </p>
        </div>
        <button 
          onClick={handlePrint} 
          disabled={!statement || transactions.length === 0} 
          className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 disabled:opacity-50 font-semibold"
        >
          🖨️ Print Ledger
        </button>
      </div>

      {/* Navigation Sub-Tabs on Account Ledger Page */}
      <div className="flex border-b border-slate-300 mb-6 bg-white rounded-t-lg overflow-hidden border">
        <button
          type="button"
          className={`py-3 px-6 font-semibold text-sm transition-colors border-r ${activeSubTab === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setActiveSubTab('all')}
        >
          📖 All Accounts Ledger
        </button>
        <button
          type="button"
          className={`py-3 px-6 font-semibold text-sm transition-colors border-r ${activeSubTab === 'expense' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setActiveSubTab('expense')}
        >
          💸 Expense Ledger
        </button>
        <button
          type="button"
          className={`py-3 px-6 font-semibold text-sm transition-colors ${activeSubTab === 'equity' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setActiveSubTab('equity')}
        >
          🏛️ Equity Ledger
        </button>
      </div>

      {/* Account & Date Controls */}
      <div className="bg-white p-4 rounded shadow mb-6 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold mb-1 text-slate-700">
            {activeSubTab === 'expense' ? 'Select Expense Account' : activeSubTab === 'equity' ? 'Select Equity Account' : 'Select Account'}
          </label>
          <select value={accountId} onChange={handleAccountChange} className="w-full border p-2 rounded focus:outline-blue-500 text-slate-800 font-medium">
            {accounts.length === 0 ? (
              <option value="">-- No Accounts Available --</option>
            ) : (
              accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.account_name} ({a.account_type})
                </option>
              ))
            )}
          </select>
          {activeSubTab === 'expense' && (
            <span className="text-xs text-slate-500 mt-1 block">
              * Freight accounts created on Freight Expense page are managed separately in Freight Report.
            </span>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">From Date (Optional)</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">To Date (Optional)</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="md:col-span-4 flex justify-end gap-2">
          {(startDate || endDate) && (
            <button 
              type="button"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="px-4 py-2 text-slate-600 border rounded hover:bg-slate-100 font-medium"
            >
              Show Full Ledger
            </button>
          )}
        </div>
      </div>

      {/* Statement Table View */}
      <div className="bg-white rounded shadow overflow-x-auto border border-slate-200 p-4" ref={printRef}>
        {accountInfo && (
          <div className="mb-4 pb-3 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Account: {accountInfo.account_name}</h3>
              <p className="text-sm text-slate-600 mt-1">
                Account Type: <span className="font-semibold">{accountInfo.account_type}</span> | Opening Balance: <span className="font-semibold">{Number(accountInfo.opening_balance).toFixed(2)} {accountInfo.balance_type}</span>
                {(!startDate && !endDate) && <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">Full Ledger (All Dates)</span>}
              </p>
            </div>
            {statement && (
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase block">Closing Balance</span>
                <span className={`text-xl font-extrabold ${statement.final_balance_type === 'Dr' ? 'text-red-600' : 'text-green-600'}`}>
                  Rs. {fmtBal(statement.final_balance)} {statement.final_balance_type || 'Dr'}
                </span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="text-center py-8 text-slate-500 font-medium">
            Loading ledger transactions...
          </div>
        )}

        {!loading && !statement && !accountId && (
          <div className="text-center py-8 text-slate-500">
            <div className="text-3xl mb-2">📖</div>
            <p className="font-medium">No accounts found in this category.</p>
          </div>
        )}

        {!loading && statement && (
          <table className="min-w-full text-sm border-collapse border border-slate-300">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border p-2 text-left">Date</th>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Transaction No</th>
                <th className="border p-2 text-left">Remarks / Particulars</th>
                <th className="border p-2 text-left">Ref/Cheque No</th>
                <th className="border p-2 text-right bg-red-50 text-red-700 font-extrabold">Debit (Dr)</th>
                <th className="border p-2 text-right bg-green-50 text-green-700 font-extrabold">Credit (Cr)</th>
                <th className="border p-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={7} className="border p-2 text-right text-slate-600">Opening Balance:</td>
                <td className="border p-2 text-right font-bold">
                  {fmtBal(statement.initial_balance)} {statement.initial_balance_type || 'Dr'}
                </td>
              </tr>

              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-6 text-slate-500">
                    No transactions found for this account.
                  </td>
                </tr>
              ) : (
                transactions.map((row, idx) => (
                  <tr key={row.id || idx} className="border-b hover:bg-slate-50">
                    <td className="border p-2 whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="border p-2 font-semibold text-slate-700">{row.type}</td>
                    <td className="border p-2">{row.v_code}</td>
                    <td className="border p-2">{row.remarks}</td>
                    <td className="border p-2">{row.cheque_no}</td>
                    <td className="border p-2 text-right font-semibold" style={{ color: Number(row.debit) > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(row.debit)}</td>
                    <td className="border p-2 text-right font-semibold" style={{ color: Number(row.credit) > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(row.credit)}</td>
                    <td className="border p-2 text-right font-bold">
                      {fmtBal(row.balance)} <span style={{ fontSize: '0.8rem', color: row.balance_type === 'Dr' ? '#dc2626' : '#16a34a' }}>{row.balance_type}</span>
                    </td>
                  </tr>
                ))
              )}

              {transactions.length > 0 && (
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={5} className="border p-2 text-right text-slate-700">Account Total:</td>
                  <td className="border p-2 text-right font-black text-base" style={{ color: '#dc2626' }}>{fmtBal(statement.total_debit)}</td>
                  <td className="border p-2 text-right font-black text-base" style={{ color: '#16a34a' }}>{fmtBal(statement.total_credit)}</td>
                  <td className="border p-2 text-right font-black text-base">
                    {fmtBal(statement.final_balance)} <span style={{ fontSize: '0.85rem', color: statement.final_balance_type === 'Dr' ? '#dc2626' : '#16a34a' }}>{statement.final_balance_type || 'Dr'}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
