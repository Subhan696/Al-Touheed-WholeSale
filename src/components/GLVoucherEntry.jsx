import React, { useState, useEffect, useRef } from 'react';
import './GL.css';
const { ipcRenderer } = window.require('electron');

const normalizeVType = (type) => {
  if (!type) return 'BP';
  if (type === 'Cash Payment' || type === 'CP') return 'CP';
  if (type === 'Cash Receipt' || type === 'CR') return 'CR';
  if (type === 'Bank Payment' || type === 'BP') return 'BP';
  if (type === 'Bank Receipt' || type === 'BR') return 'BR';
  if (type === 'Journal' || type === 'JV') return 'JV';
  return type;
};

const getSafeDateStr = (rawDate) => {
  if (!rawDate) {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  if (rawDate instanceof Date) {
    return `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
  }
  if (typeof rawDate === 'string') {
    const str = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
    return str.split(' ')[0];
  }
  try {
    const dt = new Date(rawDate);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  } catch (e) {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
};

export default function GLVoucherEntry({ onCancel, onSuccess, initialCustomer, voucherToEdit }) {
  const [voucherType, setVoucherType] = useState(voucherToEdit ? normalizeVType(voucherToEdit.voucher_type) : (initialCustomer ? 'CR' : 'BP'));
  const [voucherDate, setVoucherDate] = useState(voucherToEdit ? getSafeDateStr(voucherToEdit.voucher_date) : getSafeDateStr());
  const [voucherNo, setVoucherNo] = useState(voucherToEdit ? (voucherToEdit.voucher_no || '') : '');
  const [headerAccount, setHeaderAccount] = useState('');
  const [remarks, setRemarks] = useState(voucherToEdit ? (voucherToEdit.remarks || '') : (initialCustomer ? `Payment received from ${initialCustomer.name}` : ''));
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [headerBalance, setHeaderBalance] = useState(null);
  const [rowBalances, setRowBalances] = useState({});
  const [loadingBalances, setLoadingBalances] = useState({});
  const [balanceErrors, setBalanceErrors] = useState({});
  
  const balanceCache = useRef(new Map());
  
  const [accounts, setAccounts] = useState([]);
  const [details, setDetails] = useState([
    { id: 1, account_id: '', description: '', reference_no: '', debit: '', credit: '' }
  ]);

  const fetchBalance = async (accountId, targetInfo) => {
    if (!accountId) {
      if (targetInfo === 'header') { setHeaderBalance(null); setBalanceErrors(p => { const n = {...p}; delete n.header; return n; }); setLoadingBalances(p => { const n = {...p}; delete n.header; return n; }); }
      else if (targetInfo?.rowId != null) {
        const r = targetInfo.rowId;
        setRowBalances(prev => { const n = { ...prev }; delete n[r]; return n; });
        setBalanceErrors(prev => { const n = { ...prev }; delete n[r]; return n; });
        setLoadingBalances(prev => { const n = { ...prev }; delete n[r]; return n; });
      }
      return;
    }
    const key = targetInfo === 'header' ? 'header' : ('r_' + targetInfo.rowId);
    setLoadingBalances(prev => ({ ...prev, [key]: true }));
    setBalanceErrors(prev => { const n = { ...prev }; delete n[key]; return n; });

    if (balanceCache.current.has(String(accountId))) {
      const cached = balanceCache.current.get(String(accountId));
      if (targetInfo === 'header') setHeaderBalance(cached);
      else if (targetInfo?.rowId != null) {
        setRowBalances(prev => ({ ...prev, [targetInfo.rowId]: cached }));
      }
      setLoadingBalances(prev => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    try {
      const res = await ipcRenderer.invoke('get-account-closing-balance', { accountId: Number(accountId) || accountId });
      if (res && res.error) throw new Error(res.error);
      balanceCache.current.set(String(accountId), res);
      if (targetInfo === 'header') setHeaderBalance(res);
      else if (targetInfo?.rowId != null) {
        setRowBalances(prev => ({ ...prev, [targetInfo.rowId]: res }));
      }
    } catch (e) {
      console.error('fetchBalance error', e);
      setBalanceErrors(prev => ({ ...prev, [key]: e.message || String(e) }));
    } finally {
      setLoadingBalances(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const BalanceBadge = ({ bal, loading, errorMsg, rowDebit, rowCredit }) => {
    if (loading) return <span className="inline-block px-2 py-1 text-sm font-bold text-indigo-700 bg-indigo-100 border border-indigo-300 rounded animate-pulse">⟳ Loading…</span>;
    if (errorMsg) return <span className="inline-block px-2 py-1 text-sm font-bold text-red-700 bg-red-100 border border-red-400 rounded" title={errorMsg}>⚠ Error: {errorMsg.length > 25 ? errorMsg.slice(0,25)+'…' : errorMsg}</span>;
    if (!bal || bal.closing_balance == null) return <span className="inline-block px-3 py-1 text-sm font-bold text-indigo-800 bg-indigo-100 border-2 border-indigo-300 rounded-md">— (Select A/c)</span>;

    const dAmt = (voucherType === 'BP' || voucherType === 'CP') ? (parseFloat(rowDebit) || 0) : (isJV ? (parseFloat(rowDebit) || 0) : 0);
    const cAmt = (voucherType === 'BR' || voucherType === 'CR') ? (parseFloat(rowCredit) || 0) : (isJV ? (parseFloat(rowCredit) || 0) : 0);

    const baseSigned = bal.signed_balance != null ? bal.signed_balance : (bal.balance_type === 'Dr' ? parseFloat(bal.closing_balance) : -parseFloat(bal.closing_balance));
    const projectedSigned = baseSigned + dAmt - cAmt;
    const isDr = projectedSigned >= 0;
    const amount = Math.abs(projectedSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const balType = isDr ? 'Dr' : 'Cr';

    return (
      <span
        className={`inline-block px-3 py-1 text-lg font-black rounded-md shadow-md border-2 ${isDr ? 'bg-blue-600 text-white border-blue-800' : 'bg-amber-500 text-white border-amber-700'}`}
        style={isDr ? { backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#1e40af' } : { backgroundColor: '#d97706', color: '#ffffff', borderColor: '#b45309' }}
        title={`Projected Closing Balance: ${amount} ${balType}`}>
        {amount} {balType}
      </span>
    );
  };

  const BalanceBadgeHeader = ({ bal, loading, errorMsg, totalGridDebit, totalGridCredit }) => {
    if (loading) return <span className="ml-2 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300 animate-pulse">⟳ Loading…</span>;
    if (errorMsg) return <span className="ml-2 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-400" title={errorMsg}>⚠ Error</span>;
    if (!bal || bal.closing_balance == null) return <span className="ml-2 text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300">Select for balance</span>;

    let dAmt = 0;
    let cAmt = 0;
    if (voucherType === 'BP' || voucherType === 'CP') {
      cAmt = totalGridDebit;
    } else if (voucherType === 'BR' || voucherType === 'CR') {
      dAmt = totalGridCredit;
    }

    const baseSigned = bal.signed_balance != null ? bal.signed_balance : (bal.balance_type === 'Dr' ? parseFloat(bal.closing_balance) : -parseFloat(bal.closing_balance));
    const projectedSigned = baseSigned + dAmt - cAmt;
    const isDr = projectedSigned >= 0;
    const amount = Math.abs(projectedSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const balType = isDr ? 'Dr' : 'Cr';

    return (
      <span
        className={`ml-2 text-sm font-extrabold px-3 py-1 rounded-md shadow border-2 ${isDr ? 'bg-blue-600 text-white border-blue-700' : 'bg-amber-500 text-white border-amber-600'}`}
        style={isDr ? { backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#1d4ed8' } : { backgroundColor: '#d97706', color: '#ffffff', borderColor: '#b45309' }}
        title={`Projected Closing Balance: ${amount} ${balType}`}>
        Closing Bal: {amount} {balType}
      </span>
    );
  };

  useEffect(() => {
    initForm();
  }, [voucherToEdit]);

  useEffect(() => {
    if (!voucherToEdit) {
      setVoucherNo(`${voucherType}-${Date.now().toString().slice(-6)}`);
    }
  }, [voucherType]);

  const initForm = async () => {
    try {
      balanceCache.current.clear();
      const res = await ipcRenderer.invoke('get-gl-accounts');
      const allAccs = res || [];
      setAccounts(allAccs);

      if (voucherToEdit) {
        const detailsData = await ipcRenderer.invoke('get-voucher-details', voucherToEdit.id);
        const vType = normalizeVType(voucherToEdit.voucher_type);
        setVoucherType(vType);
        setVoucherNo(voucherToEdit.voucher_no || '');
        setRemarks(voucherToEdit.remarks || '');
        setVoucherDate(getSafeDateStr(voucherToEdit.voucher_date));

        if (vType === 'JV') {
          if (detailsData && detailsData.length > 0) {
            const mapped = detailsData.map(d => ({
              id: d.id,
              account_id: d.account_id,
              description: d.description || '',
              reference_no: d.reference_no || '',
              debit: d.debit || '',
              credit: d.credit || ''
            }));
            setDetails(mapped);
            mapped.forEach(d => d.account_id && fetchBalance(d.account_id, { rowId: d.id }));
          }
        } else if (vType === 'BP' || vType === 'CP') {
          const headerRow = detailsData.find(d => Number(d.credit) > 0);
          const gridRows = detailsData.filter(d => Number(d.debit) > 0);
          if (headerRow) {
            setHeaderAccount(headerRow.account_id);
            fetchBalance(headerRow.account_id, 'header');
          } else if (detailsData.length > 0) {
            setHeaderAccount(detailsData[0].account_id);
            fetchBalance(detailsData[0].account_id, 'header');
          }
          const rowsToMap = gridRows.length > 0 ? gridRows : detailsData;
          if (rowsToMap.length > 0) {
            const mapped = rowsToMap.map(d => ({
              id: d.id,
              account_id: d.account_id,
              description: d.description || '',
              reference_no: d.reference_no || '',
              debit: d.debit || '',
              credit: ''
            }));
            setDetails(mapped);
            mapped.forEach(d => d.account_id && fetchBalance(d.account_id, { rowId: d.id }));
          }
        } else if (vType === 'BR' || vType === 'CR') {
          const headerRow = detailsData.find(d => Number(d.debit) > 0);
          const gridRows = detailsData.filter(d => Number(d.credit) > 0);
          if (headerRow) {
            setHeaderAccount(headerRow.account_id);
            fetchBalance(headerRow.account_id, 'header');
          } else if (detailsData.length > 0) {
            setHeaderAccount(detailsData[0].account_id);
            fetchBalance(detailsData[0].account_id, 'header');
          }
          const rowsToMap = gridRows.length > 0 ? gridRows : detailsData;
          if (rowsToMap.length > 0) {
            const mapped = rowsToMap.map(d => ({
              id: d.id,
              account_id: d.account_id,
              description: d.description || '',
              reference_no: d.reference_no || '',
              debit: '',
              credit: d.credit || ''
            }));
            setDetails(mapped);
            mapped.forEach(d => d.account_id && fetchBalance(d.account_id, { rowId: d.id }));
          }
        }
      } else {
        const cashAcc = allAccs.find(a => a.account_type === 'Cash');
        if (cashAcc && !headerAccount) {
          setHeaderAccount(cashAcc.id);
          fetchBalance(cashAcc.id, 'header');
        }

        if (initialCustomer) {
          const custAcc = allAccs.find(a => a.account_name === 'Customer - ' + initialCustomer.name || (a.account_type === 'Customer' && a.reference_id === initialCustomer.id));
          if (custAcc) {
            setDetails([
              { id: 1, account_id: custAcc.id, description: `CASH PAY - ${initialCustomer.name}`, reference_no: '', debit: '', credit: '' }
            ]);
            fetchBalance(custAcc.id, { rowId: 1 });
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDetailChange = (index, field, value) => {
    const newDetails = [...details];
    newDetails[index][field] = value;
    setDetails(newDetails);
    if (field === 'account_id') {
      fetchBalance(value, { rowId: newDetails[index].id });
    }
  };

  const addRow = () => {
    setDetails([...details, { id: Date.now(), account_id: '', description: '', reference_no: '', debit: '', credit: '' }]);
  };

  const removeRow = (index) => {
    if (details.length === 1) return;
    const rowId = details[index].id;
    const newDetails = [...details];
    newDetails.splice(index, 1);
    setDetails(newDetails);
    setRowBalances(prev => { const n = { ...prev }; delete n[rowId]; return n; });
  };

  const isJV = voucherType === 'JV';
  
  // Calculate totals
  let totalDebit = 0;
  let totalCredit = 0;
  
  details.forEach(d => {
    totalDebit += Number(d.debit) || 0;
    totalCredit += Number(d.credit) || 0;
  });

  const headerAccounts = accounts.filter(a => a.account_type === 'Bank' || a.account_type === 'Cash');

  const handleSave = async () => {
    setStatusMsg({ type: '', text: '' });
    if (!isJV && !headerAccount) {
      setStatusMsg({ type: 'error', text: 'Please select an A/c Head (Bank/Cash Account)' });
      return;
    }
    
    // Validate rows
    const validDetails = details.filter(d => d.account_id && (Number(d.debit) > 0 || Number(d.credit) > 0));
    if (validDetails.length === 0) {
      setStatusMsg({ type: 'error', text: 'Please enter at least one valid transaction row with an amount.' });
      return;
    }

    if (isJV && totalDebit !== totalCredit) {
      setStatusMsg({ type: 'error', text: `Debit (${totalDebit.toFixed(2)}) and Credit (${totalCredit.toFixed(2)}) must be equal for Journal Entry!` });
      return;
    }

    // Build final details array
    let finalDetails = [];
    if (isJV) {
      finalDetails = validDetails.map(d => ({
        account_id: d.account_id,
        description: d.description,
        reference_no: d.reference_no,
        debit: Number(d.debit) || 0,
        credit: Number(d.credit) || 0
      }));
    } else {
      let gridTotal = 0;
      validDetails.forEach(d => {
        const amt = Number(d.debit) || Number(d.credit) || 0;
        gridTotal += amt;
        finalDetails.push({
          account_id: d.account_id,
          description: d.description,
          reference_no: d.reference_no,
          debit: (voucherType === 'BP' || voucherType === 'CP') ? amt : 0,
          credit: (voucherType === 'BR' || voucherType === 'CR') ? amt : 0
        });
      });
      // Add the offset header line
      finalDetails.push({
        account_id: headerAccount,
        description: remarks || 'Header offset',
        reference_no: '',
        debit: (voucherType === 'BR' || voucherType === 'CR') ? gridTotal : 0,
        credit: (voucherType === 'BP' || voucherType === 'CP') ? gridTotal : 0
      });
    }

    const payload = {
      id: voucherToEdit ? voucherToEdit.id : undefined,
      voucher_no: voucherNo,
      voucher_date: voucherDate,
      voucher_type: voucherType,
      remarks,
      details: finalDetails
    };

    try {
      await ipcRenderer.invoke('save-voucher', payload);
      setStatusMsg({ type: 'success', text: voucherToEdit ? '✅ Transaction Updated Successfully!' : '✅ Transaction Saved Successfully!' });
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: '❌ Error saving transaction: ' + err.message });
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow min-h-screen">
      <div className="flex justify-between items-center mb-4 border-b pb-2">
        <h2 className="text-2xl font-bold text-slate-800">Transaction Entry</h2>
        {onCancel && <button onClick={onCancel} className="text-red-600 font-bold">Close X</button>}
      </div>

      {statusMsg.text && (
        <div style={{
          padding: '10px 16px',
          marginBottom: '16px',
          borderRadius: '6px',
          fontWeight: 700,
          background: statusMsg.type === 'error' ? '#fee2e2' : '#d1fae5',
          color: statusMsg.type === 'error' ? '#dc2626' : '#065f46',
          border: statusMsg.type === 'error' ? '1px solid #fca5a5' : '1px solid #6ee7b7'
        }}>
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded border">
        <div>
          <label className="block text-sm font-semibold mb-1">Transaction Type</label>
          <select value={voucherType} onChange={e => setVoucherType(e.target.value)} className="w-full border p-1 rounded focus:outline-blue-500">
            <option value="BP">Bank Payment (BP)</option>
            <option value="BR">Bank Receipt (BR)</option>
            <option value="CP">Cash Payment (CP)</option>
            <option value="CR">Cash Receipt (CR)</option>
            <option value="JV">Journal Entry (JV)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Transaction No</label>
          <input type="text" value={voucherNo} onChange={e => setVoucherNo(e.target.value)} className="w-full border p-1 rounded" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Date</label>
          <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} className="w-full border p-1 rounded focus:outline-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Remarks (Optional)</label>
          <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full border p-1 rounded" placeholder="Enter remarks..." />
        </div>
        {!isJV && (
          <div className="md:col-span-4 border-t pt-3 mt-1">
            <label className="block text-sm font-semibold mb-1">A/c Head (Bank/Cash Account)</label>
            <div className="flex items-center gap-3">
              <select
                value={headerAccount}
                onChange={e => { setHeaderAccount(e.target.value); fetchBalance(e.target.value, 'header'); }}
                className="flex-1 border p-2 rounded text-base font-semibold focus:outline-blue-500 bg-white"
              >
                <option value="">-- Select Bank / Cash Account --</option>
                {headerAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
              <BalanceBadgeHeader bal={headerBalance} loading={loadingBalances.header} errorMsg={balanceErrors.header} totalGridDebit={totalDebit} totalGridCredit={totalCredit} />
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse border border-slate-300">
          <thead className="bg-slate-200">
            <tr>
              <th className="border p-2">Account Name</th>
              <th className="border p-2">Ref No</th>
              <th className="border p-2">Description</th>
              <th className="border p-2 bg-indigo-100 text-indigo-900 w-48">Closing Balance</th>
              <th className="border p-2 w-32 bg-red-100 text-red-700 font-extrabold">Debit (Dr)</th>
              <th className="border p-2 w-32 bg-green-100 text-green-700 font-extrabold">Credit (Cr)</th>
              <th className="border p-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {details.map((row, idx) => (
              <tr key={row.id}>
                <td className="border p-1">
                  <select value={row.account_id} onChange={e => handleDetailChange(idx, 'account_id', e.target.value)} className="w-full p-1 border rounded focus:outline-blue-500">
                    <option value="">-- Select --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                </td>
                <td className="border p-1"><input type="text" value={row.reference_no} onChange={e => handleDetailChange(idx, 'reference_no', e.target.value)} className="w-full p-1 border" /></td>
                <td className="border p-1"><input type="text" value={row.description} onChange={e => handleDetailChange(idx, 'description', e.target.value)} className="w-full p-1 border" /></td>
                <td className="border p-2 text-center">
                  <div className="inline-block w-full">
                    {(() => {
                      const bal = rowBalances[row.id];
                      const loading = loadingBalances['r_' + row.id];
                      const err = balanceErrors['r_' + row.id];
                      return (
                        <BalanceBadge bal={bal} loading={loading} errorMsg={err} rowDebit={row.debit} rowCredit={row.credit} />
                      );
                    })()}
                  </div>
                </td>
                <td className="border p-1">
                  <input
                    type="number"
                    step="0.01"
                    value={row.debit}
                    onChange={e => handleDetailChange(idx, 'debit', e.target.value)}
                    disabled={!isJV && (voucherType==='BR' || voucherType==='CR')}
                    style={{ color: '#dc2626', fontWeight: 700 }}
                    className="w-full p-1 border text-right disabled:bg-slate-100"
                    placeholder={!isJV && (voucherType==='BR' || voucherType==='CR') ? '-' : '0.00'}
                  />
                </td>
                <td className="border p-1">
                  <input
                    type="number"
                    step="0.01"
                    value={row.credit}
                    onChange={e => handleDetailChange(idx, 'credit', e.target.value)}
                    disabled={!isJV && (voucherType==='BP' || voucherType==='CP')}
                    style={{ color: '#16a34a', fontWeight: 700 }}
                    className="w-full p-1 border text-right disabled:bg-slate-100"
                    placeholder={!isJV && (voucherType==='BP' || voucherType==='CP') ? '-' : '0.00'}
                  />
                </td>
                <td className="border p-1 text-center">
                  <button onClick={() => removeRow(idx)} className="text-red-600 font-bold px-2 hover:bg-red-100 rounded">X</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td colSpan="4" className="border p-2 text-right">TOTAL</td>
              <td className="border p-2 text-right font-extrabold text-lg" style={{ color: '#dc2626' }}>{totalDebit.toFixed(2)}</td>
              <td className="border p-2 text-right font-extrabold text-lg" style={{ color: '#16a34a' }}>{totalCredit.toFixed(2)}</td>
              <td className="border"></td>
            </tr>
            {isJV && totalDebit !== totalCredit && (
              <tr>
                <td colSpan="7" className="p-2 text-right text-red-600">Difference: {Math.abs(totalDebit - totalCredit).toFixed(2)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex justify-between">
        <button onClick={addRow} className="bg-slate-200 text-slate-800 px-4 py-2 rounded shadow hover:bg-slate-300">+ Add Row</button>
        <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 text-lg font-bold">Save Transaction</button>
      </div>
    </div>
  );
}
