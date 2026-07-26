import React, { useState } from 'react';
import './GL.css';
const { ipcRenderer } = window.require('electron');

export default function GLCashActivityReport() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState([]);

  const loadReport = async () => {
    try {
      const res = await ipcRenderer.invoke('get-cash-activity-report', { startDate, endDate });
      setReportData(res || []);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-4 bg-slate-50 min-h-screen">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Cash Activity Detail Report</h1>
      
      <div className="bg-white p-4 rounded shadow mb-6 border border-slate-200 flex gap-4 items-end">
        <div>
          <label className="block text-sm font-semibold mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded" />
        </div>
        <button onClick={loadReport} className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 font-bold">
          Load Report
        </button>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto border border-slate-200">
        <table className="min-w-full text-sm border-collapse border border-slate-300">
          <thead className="bg-slate-100">
            <tr>
              <th className="border p-2 text-left">Account Name</th>
              <th className="border p-2 text-right">Opening Balance</th>
              <th className="border p-2 text-right">Debit (Receipts)</th>
              <th className="border p-2 text-right">Credit (Payments)</th>
              <th className="border p-2 text-right">Closing Balance</th>
            </tr>
          </thead>
          <tbody>
            {reportData.map((row) => {
              const op = Number(row.prior_balance) || 0;
              const dr = Number(row.period_debit) || 0;
              const cr = Number(row.period_credit) || 0;
              const closing = op + dr - cr;
              return (
                <tr key={row.id} className="border-b hover:bg-slate-50">
                  <td className="border p-2 font-semibold text-slate-700">{row.account_name}</td>
                  <td className="border p-2 text-right">{op.toFixed(2)}</td>
                  <td className="border p-2 text-right text-green-700">{dr > 0 ? dr.toFixed(2) : ''}</td>
                  <td className="border p-2 text-right text-red-600">{cr > 0 ? cr.toFixed(2) : ''}</td>
                  <td className="border p-2 text-right font-bold">{closing.toFixed(2)}</td>
                </tr>
              );
            })}
            {reportData.length === 0 && (
              <tr><td colSpan="5" className="text-center py-4 text-slate-500">Run the report to see activity.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
