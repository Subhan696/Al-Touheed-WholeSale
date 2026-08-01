import React, { useState, useEffect, useRef } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import './GL.css';
const { ipcRenderer } = window.require('electron');

export default function GLLedgerReport() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(getLocalDateString);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await ipcRenderer.invoke('get-gl-accounts');
      setAccounts(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadLedger = async () => {
    if (!accountId) return alert('Select an account first');
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-ledger-report', {
        accountId: parseInt(accountId, 10),
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setStatement(res || null);
    } catch (err) {
      alert(err.message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = `
      <html><head><style>
        body { font-family: sans-serif; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
        th { background: #eee; }
        .right { text-align: right; }
      </style></head>
      <body>
        <h2>Account Ledger Report</h2>
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Account Ledger</h1>
        <button onClick={handlePrint} disabled={!statement} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 disabled:opacity-50">Print</button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold mb-1">Account</label>
          <select value={accountId} onChange={e => { setAccountId(e.target.value); setStatement(null); }} className="w-full border p-2 rounded focus:outline-blue-500">
            <option value="">-- Select Account --</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">From Date (Optional)</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">To Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button onClick={loadLedger} disabled={loading} className="bg-slate-800 text-white px-6 py-2 rounded shadow hover:bg-slate-900 disabled:opacity-50">
            {loading ? 'Loading...' : 'Load Ledger'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto border border-slate-200 p-4" ref={printRef}>
        {accountInfo && (
          <div className="mb-4">
            <h3 className="text-lg font-bold">Account: {accountInfo.account_name}</h3>
            <p>Type: {accountInfo.account_type} | Opening Bal: {Number(accountInfo.opening_balance).toFixed(2)} {accountInfo.balance_type}</p>
          </div>
        )}

        {!statement && !loading && (
          <p className="text-center py-4 text-slate-500">Select an account and click Load Ledger.</p>
        )}

        {statement && (
          <table className="min-w-full text-sm border-collapse border border-slate-300">
            <thead className="bg-slate-100">
              <tr>
                <th className="border p-2">Date</th>
                <th className="border p-2">Type</th>
                <th className="border p-2">Transaction No</th>
                <th className="border p-2">Remarks</th>
                <th className="border p-2">Ref/Cheque No</th>
                <th className="border p-2 text-right bg-red-100 text-red-700 font-extrabold">Debit (Dr)</th>
                <th className="border p-2 text-right bg-green-100 text-green-700 font-extrabold">Credit (Cr)</th>
                <th className="border p-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={7} className="border p-2 text-right">Opening Balance:</td>
                <td className="border p-2 text-right">
                  {fmtBal(statement.initial_balance)} {statement.initial_balance_type || 'Dr'}
                </td>
              </tr>

              {transactions.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-4 text-slate-500">No transactions found.</td></tr>
              ) : (
                transactions.map((row, idx) => (
                  <tr key={row.id || idx} className="border-b hover:bg-slate-50">
                    <td className="border p-2">{fmtDate(row.date)}</td>
                    <td className="border p-2 font-semibold">{row.type}</td>
                    <td className="border p-2">{row.v_code}</td>
                    <td className="border p-2">{row.remarks}</td>
                    <td className="border p-2">{row.cheque_no}</td>
                    <td className="border p-2 text-right font-semibold" style={{ color: Number(row.debit) > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(row.debit)}</td>
                    <td className="border p-2 text-right font-semibold" style={{ color: Number(row.credit) > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(row.credit)}</td>
                    <td className="border p-2 text-right font-bold">
                      {fmtBal(row.balance)} <span style={{ color: row.balance_type === 'Dr' ? '#dc2626' : '#d97706' }}>{row.balance_type}</span>
                    </td>
                  </tr>
                ))
              )}

              {transactions.length > 0 && (
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={5} className="border p-2 text-right">Account Total:</td>
                  <td className="border p-2 text-right font-black text-base" style={{ color: '#dc2626' }}>{fmtBal(statement.total_debit)}</td>
                  <td className="border p-2 text-right font-black text-base" style={{ color: '#16a34a' }}>{fmtBal(statement.total_credit)}</td>
                  <td className="border p-2 text-right font-black text-base">
                    {fmtBal(statement.final_balance)} <span style={{ color: statement.final_balance_type === 'Dr' ? '#dc2626' : '#d97706' }}>{statement.final_balance_type || 'Dr'}</span>
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
