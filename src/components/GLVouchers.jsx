import React, { useState, useEffect } from 'react';
import { getLocalDateString, getFirstDayOfMonthString } from '../utils/dateUtils';
import GLVoucherEntry from './GLVoucherEntry';
import './GL.css';
const { ipcRenderer } = window.require('electron');

const VOUCHER_TYPE_NAMES = {
  BP: 'Bank Payment (BP)',
  BR: 'Bank Receipt (BR)',
  CP: 'Cash Payment (CP)',
  CR: 'Cash Receipt (CR)',
  JV: 'Journal Entry (JV)'
};

const formatDateDMY = (val) => {
  if (!val) return '—';
  let rawStr = '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${d}-${m}-${y}`;
  }
  if (typeof val === 'string') {
    rawStr = val.split('T')[0].split(' ')[0];
  } else {
    rawStr = String(val).split('T')[0].split(' ')[0];
  }
  const parts = rawStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    }
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
  }
  return rawStr;
};

export default function GLVouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [showEntry, setShowEntry] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [viewingVoucher, setViewingVoucher] = useState(null);
  const [viewDetails, setViewDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchVouchers(startDate, endDate, search);
    const handleUpdate = () => fetchVouchers(startDate, endDate, search);
    ipcRenderer.on('vouchers', handleUpdate);
    return () => ipcRenderer.removeListener('vouchers', handleUpdate);
  }, []);

  const fetchVouchers = async (sDate = startDate, eDate = endDate, sTerm = search) => {
    try {
      const res = await ipcRenderer.invoke('get-vouchers', { startDate: sDate, endDate: eDate, searchTerm: sTerm });
      setVouchers(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredVouchers = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return vouchers;
    return vouchers.filter(v => {
      const vNo = (v.voucher_no || '').toLowerCase();
      const vType = (v.voucher_type || '').toLowerCase();
      const vTypeName = (VOUCHER_TYPE_NAMES[v.voucher_type] || '').toLowerCase();
      const vRemarks = (v.remarks || '').toLowerCase();
      return vNo.includes(s) || vType.includes(s) || vTypeName.includes(s) || vRemarks.includes(s);
    });
  }, [vouchers, search]);

  const handleDelete = async (id) => {
    const confirmed = await ipcRenderer.invoke('confirm-dialog', 'Delete this transaction and all its details permanently?');
    if (confirmed) {
      await ipcRenderer.invoke('delete-voucher', id);
      if (viewingVoucher && viewingVoucher.id === id) {
        setViewingVoucher(null);
      }
    }
  };

  const handleView = async (voucher) => {
    setViewingVoucher(voucher);
    setLoadingDetails(true);
    try {
      const res = await ipcRenderer.invoke('get-voucher-details', voucher.id);
      setViewDetails(res || []);
    } catch (err) {
      console.error(err);
      setViewDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEdit = (voucher) => {
    setEditingVoucher(voucher);
    setViewingVoucher(null);
    setShowEntry(true);
  };

  const handleNewTransaction = () => {
    setEditingVoucher(null);
    setShowEntry(true);
  };

  if (showEntry) {
    return (
      <GLVoucherEntry
        voucherToEdit={editingVoucher}
        onCancel={() => { setShowEntry(false); setEditingVoucher(null); }}
        onSuccess={() => { setShowEntry(false); setEditingVoucher(null); fetchVouchers(startDate, endDate, search); }}
      />
    );
  }

  // Calculate totals for viewing modal
  let viewTotalDebit = 0;
  let viewTotalCredit = 0;
  viewDetails.forEach(d => {
    viewTotalDebit += Number(d.debit) || 0;
    viewTotalCredit += Number(d.credit) || 0;
  });

  return (
    <div className="p-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Transaction Entry</h1>
        <button onClick={handleNewTransaction} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-semibold">
          + New Transaction
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 border border-slate-200 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-sm font-semibold mb-1">Search Transactions</label>
              <input
                type="text"
                placeholder="Voucher #, Remarks, or Account..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchVouchers(startDate, endDate, search); }}
                className="border p-2 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => fetchVouchers(startDate, endDate, search)}
              className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm font-semibold flex items-center gap-1"
            >
              🔍 Search
            </button>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                fetchVouchers(e.target.value, endDate, search);
              }}
              className="border p-2 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                fetchVouchers(startDate, e.target.value, search);
              }}
              className="border p-2 rounded text-sm"
            />
          </div>
          <button
            onClick={() => fetchVouchers(startDate, endDate, search)}
            className="bg-slate-800 text-white px-4 py-2 rounded shadow hover:bg-slate-900 text-sm font-semibold"
          >
            🔍 Filter
          </button>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => {
              const today = getLocalDateString();
              setStartDate(today);
              setEndDate(today);
              fetchVouchers(today, today, search);
            }}
            className="bg-blue-50 text-blue-700 border border-blue-300 px-3 py-2 rounded text-xs font-bold hover:bg-blue-100"
          >
            📅 Today
          </button>
          <button
            onClick={() => {
              const firstDay = getFirstDayOfMonthString();
              const today = getLocalDateString();
              setStartDate(firstDay);
              setEndDate(today);
              fetchVouchers(firstDay, today, search);
            }}
            className="bg-indigo-50 text-indigo-700 border border-indigo-300 px-3 py-2 rounded text-xs font-bold hover:bg-indigo-100"
          >
            📆 This Month
          </button>
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSearch('');
              fetchVouchers('', '', '');
            }}
            className="bg-amber-50 text-amber-700 border border-amber-300 px-3 py-2 rounded text-xs font-bold hover:bg-amber-100"
          >
            🌐 Show All
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="py-2 px-4 text-left">Date</th>
              <th className="py-2 px-4 text-left">Transaction No</th>
              <th className="py-2 px-4 text-left">Type</th>
              <th className="py-2 px-4 text-left">Remarks</th>
              <th className="py-2 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVouchers.map(v => (
              <tr key={v.id} className="border-b hover:bg-slate-50">
                <td className="py-2 px-4">{formatDateDMY(v.voucher_date)}</td>
                <td className="py-2 px-4 font-semibold text-blue-700">{v.voucher_no}</td>
                <td className="py-2 px-4 font-medium">{VOUCHER_TYPE_NAMES[v.voucher_type] || v.voucher_type}</td>
                <td className="py-2 px-4">{v.remarks || '-'}</td>
                <td className="py-2 px-4 text-center space-x-2">
                  <button onClick={() => handleView(v)} style={{ backgroundColor: '#059669', color: '#ffffff', border: 'none' }} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs hover:bg-emerald-700 font-semibold shadow-sm">
                    View
                  </button>
                  <button onClick={() => handleEdit(v)} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none' }} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 font-semibold shadow-sm">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(v.id)} style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none' }} className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 font-semibold shadow-sm">
                    Del
                  </button>
                </td>
              </tr>
            ))}
            {filteredVouchers.length === 0 && (
              <tr><td colSpan="5" className="text-center py-4 text-slate-500">No transactions found matching your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed Transaction View Modal */}
      {viewingVoucher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">Transaction Details</h3>
                <p className="text-xs text-slate-300">Voucher No: <span className="font-semibold text-blue-300">{viewingVoucher.voucher_no}</span></p>
              </div>
              <button onClick={() => setViewingVoucher(null)} className="text-white hover:text-red-400 font-bold text-xl">
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 bg-slate-100 p-3 rounded text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">Date</span>
                  <span className="font-semibold">{formatDateDMY(viewingVoucher.voucher_date)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Type</span>
                  <span className="font-semibold text-blue-700">{VOUCHER_TYPE_NAMES[viewingVoucher.voucher_type] || viewingVoucher.voucher_type}</span>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="text-slate-500 block text-xs">Remarks</span>
                  <span className="font-semibold">{viewingVoucher.remarks || 'N/A'}</span>
                </div>
              </div>

              <h4 className="font-semibold text-slate-700 mb-2">Entry Breakdown</h4>
              {loadingDetails ? (
                <div className="text-center py-8 text-slate-500">Loading details...</div>
              ) : (
                <div className="border rounded overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-200 text-slate-700">
                      <tr>
                        <th className="py-2 px-3 text-left">Account Name</th>
                        <th className="py-2 px-3 text-left">Ref No</th>
                        <th className="py-2 px-3 text-left">Description</th>
                        <th className="py-2 px-3 text-right bg-red-100 text-red-700 font-extrabold">Debit (Dr)</th>
                        <th className="py-2 px-3 text-right bg-green-100 text-green-700 font-extrabold">Credit (Cr)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDetails.map((d, i) => (
                        <tr key={d.id || i} className="border-t hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">{d.account_name || d.account_id}</td>
                          <td className="py-2 px-3 text-slate-600">{d.reference_no || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{d.description || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: Number(d.debit) > 0 ? '#dc2626' : '#94a3b8' }}>
                            {Number(d.debit) > 0 ? Number(d.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: Number(d.credit) > 0 ? '#16a34a' : '#94a3b8' }}>
                            {Number(d.credit) > 0 ? Number(d.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                        </tr>
                      ))}
                      {viewDetails.length === 0 && (
                        <tr><td colSpan="5" className="text-center py-4 text-slate-500">No detail lines found for this transaction.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                      <tr>
                        <td colSpan="3" className="py-2 px-3 text-right">TOTAL</td>
                        <td className="py-2 px-3 text-right font-mono font-black text-base" style={{ color: '#dc2626' }}>{viewTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-3 text-right font-mono font-black text-base" style={{ color: '#16a34a' }}>{viewTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-100 border-t flex justify-end space-x-3">
              <button
                onClick={() => handleEdit(viewingVoucher)}
                style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none' }}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm shadow hover:bg-blue-700 font-semibold"
              >
                Edit Transaction
              </button>
              <button
                onClick={() => setViewingVoucher(null)}
                style={{ backgroundColor: '#475569', color: '#ffffff', border: 'none' }}
                className="bg-slate-600 text-white px-4 py-2 rounded text-sm shadow hover:bg-slate-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
