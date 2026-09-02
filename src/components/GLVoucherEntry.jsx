import React, { useState, useEffect, useRef } from 'react';
import SuccessAnimation from './SuccessAnimation';
import CustomerLedger from './CustomerLedger';
import SupplierLedger from './SupplierLedger';
import CashLedger from './CashLedger';
import BankLedger from './BankLedger';
import './GL.css';
const { ipcRenderer } = window.require('electron');

const formatAccountDisplayName = (account) => {
  if (!account) return '';
  const rawName = account.account_name || '';
  const type = account.account_type || '';
  
  const match = rawName.match(/^(Customer|Supplier|Bank|Cash)\s*-\s*(.*)$/i);
  if (match) {
    const prefixType = match[1];
    const cleanName = match[2];
    return `${cleanName} (${prefixType})`;
  }
  
  if (type && !rawName.toLowerCase().includes(type.toLowerCase())) {
    return `${rawName} (${type})`;
  }
  return rawName;
};

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

function AccountSearchPicker({ accounts, value, onChange, placeholder = '-- Select Account --', disabled = false, inputRef, onOpenLedger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const itemRefs = useRef([]);

  const selectedAccount = React.useMemo(() => {
    return (accounts || []).find(a => String(a.id) === String(value));
  }, [accounts, value]);

  const filteredAccounts = React.useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return accounts || [];
    return (accounts || []).filter(a => {
      const name = (a.account_name || '').toLowerCase();
      const type = (a.account_type || '').toLowerCase();
      const cleanName = name.replace(/^(customer|supplier|bank|cash)\s*-\s*/i, '');
      const formatted = formatAccountDisplayName(a).toLowerCase();
      return name.includes(q) || type.includes(q) || cleanName.includes(q) || formatted.includes(q);
    });
  }, [accounts, searchTerm]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    if (isOpen && selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      try {
        itemRefs.current[selectedIndex].scrollIntoView({ block: 'nearest' });
      } catch (e) { }
    }
  }, [selectedIndex, isOpen]);

  const updatePosition = React.useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeTop = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownStyle({
        position: 'fixed',
        top: placeTop ? Math.max(10, rect.top - dropdownHeight - 4) : rect.bottom + 4,
        left: Math.max(10, rect.left),
        width: Math.max(rect.width, 320),
        maxHeight: dropdownHeight,
        background: '#fff',
        border: '1.5px solid #3b82f6',
        borderRadius: '8px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (account) => {
    onChange(account ? String(account.id) : '');
    setIsOpen(false);
    setIsFocused(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setSearchTerm('');
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredAccounts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAccounts.length > 0 && selectedIndex >= 0 && selectedIndex < filteredAccounts.length) {
        handleSelect(filteredAccounts[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const getTypeBadge = (type) => {
    switch (type?.toLowerCase()) {
      case 'customer':
        return { label: 'Cust', bg: '#dbeafe', color: '#1e40af' };
      case 'supplier':
        return { label: 'Supp', bg: '#f3e8ff', color: '#6b21a8' };
      case 'bank':
        return { label: 'Bank', bg: '#dcfce7', color: '#166534' };
      case 'cash':
        return { label: 'Cash', bg: '#ecfdf5', color: '#047857' };
      case 'expense':
        return { label: 'Exp', bg: '#fef3c7', color: '#92400e' };
      default:
        return { label: type || 'GL', bg: '#f1f5f9', color: '#475569' };
    }
  };

  const displayInputValue = isFocused ? searchTerm : (selectedAccount ? formatAccountDisplayName(selectedAccount) : '');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
      <button
        type="button"
        title={selectedAccount ? `Open ledger for ${formatAccountDisplayName(selectedAccount)}` : "Select an account to view ledger"}
        disabled={!selectedAccount}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (selectedAccount && onOpenLedger) {
            onOpenLedger(selectedAccount);
          }
        }}
        style={{
          width: '26px',
          height: '26px',
          minWidth: '26px',
          borderRadius: '4px',
          border: '1px solid #cbd5e1',
          background: selectedAccount ? '#2563eb' : '#e2e8f0',
          color: selectedAccount ? '#ffffff' : '#94a3b8',
          fontWeight: 800,
          fontSize: '0.78rem',
          cursor: selectedAccount ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: selectedAccount ? '0 1px 2px rgba(37,99,235,0.3)' : 'none',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        L
      </button>

      <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
        <input
          ref={el => {
            searchInputRef.current = el;
            if (typeof inputRef === 'function') inputRef(el);
            else if (inputRef) inputRef.current = el;
          }}
          type="text"
          disabled={disabled}
          value={displayInputValue}
          placeholder={placeholder}
          onFocus={() => {
            if (disabled) return;
            setIsFocused(true);
            setSearchTerm('');
            setIsOpen(true);
          }}
          onChange={e => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: isOpen ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
            borderRadius: '6px',
            background: disabled ? '#f1f5f9' : '#fff',
            fontSize: '0.88rem',
            fontWeight: 600,
            color: selectedAccount && !isFocused ? '#0f172a' : '#1e293b',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />

        {isOpen && (
          <div style={dropdownStyle}>
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
              <div
                onMouseDown={(e) => { e.preventDefault(); handleSelect(null); }}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  color: '#64748b',
                  cursor: 'pointer',
                  background: !value ? '#eff6ff' : 'transparent'
                }}
              >
                -- Select Account --
              </div>

              {filteredAccounts.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  No matching accounts found
                </div>
              ) : (
                filteredAccounts.map((a, idx) => {
                  const isSelected = String(a.id) === String(value);
                  const isHighlighted = idx === selectedIndex;
                  const badge = getTypeBadge(a.account_type);
                  return (
                    <div
                      key={a.id}
                      ref={el => { itemRefs.current[idx] = el; }}
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(a); }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        padding: '7px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isHighlighted ? '#e0f2fe' : isSelected ? '#f1f5f9' : 'transparent',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? '#1e40af' : '#1e293b',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatAccountDisplayName(a)}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: badge.bg,
                        color: badge.color,
                        marginLeft: 8,
                        flexShrink: 0
                      }}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

  const formatWithCommas = (val) => {
    if (val === null || val === undefined || val === '') return '';
    let str = String(val).replace(/,/g, '');
    str = str.replace(/[^0-9.-]/g, '');
    const isNeg = str.startsWith('-');
    if (isNeg) str = str.slice(1);
    const parts = str.split('.');
    if (parts.length > 2) {
      str = parts[0] + '.' + parts.slice(1).join('');
    }
    const cleanParts = str.split('.');
    const intFormatted = cleanParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const res = cleanParts.length > 1 ? `${intFormatted}.${cleanParts[1]}` : intFormatted;
    return isNeg ? `-${res}` : res;
  };

  const parseAmountNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    const clean = String(val).replace(/,/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  export default function GLVoucherEntry({ onCancel, onSuccess, initialCustomer, voucherToEdit, currentUser }) {
    const [voucherType, setVoucherType] = useState(voucherToEdit ? normalizeVType(voucherToEdit.voucher_type) : (initialCustomer ? 'CR' : 'BP'));
    const [voucherDate, setVoucherDate] = useState(voucherToEdit ? getSafeDateStr(voucherToEdit.voucher_date) : getSafeDateStr());
    const [voucherNo, setVoucherNo] = useState(voucherToEdit ? (voucherToEdit.voucher_no || '') : '');
    const [headerAccount, setHeaderAccount] = useState('');
    const [remarks, setRemarks] = useState(voucherToEdit ? (voucherToEdit.remarks || '') : (initialCustomer ? `Payment received from ${initialCustomer.name}` : ''));
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    const [showSuccessAnim, setShowSuccessAnim] = useState(false);
    const [headerBalance, setHeaderBalance] = useState(null);
    const [rowBalances, setRowBalances] = useState({});
    const [loadingBalances, setLoadingBalances] = useState({});
    const [balanceErrors, setBalanceErrors] = useState({});
    const [ledgerModalAccount, setLedgerModalAccount] = useState(null);

    const balanceCache = useRef(new Map());
    const accountRefs = useRef({});

    useEffect(() => {
      const handleModalEsc = (e) => {
        if (e.key === 'Escape' && ledgerModalAccount) {
          e.preventDefault();
          e.stopPropagation();
          setLedgerModalAccount(null);
        }
      };
      if (ledgerModalAccount) {
        window.addEventListener('keydown', handleModalEsc, true);
      }
      return () => window.removeEventListener('keydown', handleModalEsc, true);
    }, [ledgerModalAccount]);

    const handleAmountKeyDown = (e, index) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (index === details.length - 1) {
          const newId = Date.now();
          setDetails(prev => [
            ...prev,
            { id: newId, account_id: '', description: '', reference_no: '', debit: '', credit: '' }
          ]);
          setTimeout(() => {
            if (accountRefs.current[newId]) {
              accountRefs.current[newId].focus();
            }
          }, 50);
        } else {
          const nextRow = details[index + 1];
          if (nextRow && accountRefs.current[nextRow.id]) {
            accountRefs.current[nextRow.id].focus();
          }
        }
      }
    };

    const [accounts, setAccounts] = useState([]);
    const [details, setDetails] = useState([
      { id: 1, account_id: '', description: '', reference_no: '', debit: '', credit: '' }
    ]);

    const fetchBalance = async (accountId, targetInfo) => {
      if (!accountId) {
        if (targetInfo === 'header') { setHeaderBalance(null); setBalanceErrors(p => { const n = { ...p }; delete n.header; return n; }); setLoadingBalances(p => { const n = { ...p }; delete n.header; return n; }); }
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

    const LastBalanceBadge = ({ bal, loading, errorMsg }) => {
      if (loading) return <span className="inline-block px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-100 border border-indigo-300 rounded animate-pulse">⟳ Loading…</span>;
      if (errorMsg) return <span className="inline-block px-2.5 py-1 text-xs font-bold text-red-700 bg-red-100 border border-red-400 rounded" title={errorMsg}>⚠ Error</span>;
      if (!bal || bal.closing_balance == null) return <span className="inline-block px-2.5 py-1 text-xs font-semibold text-slate-400">—</span>;

      const baseSigned = bal.signed_balance != null ? bal.signed_balance : (bal.balance_type === 'Dr' ? parseFloat(bal.closing_balance) : -parseFloat(bal.closing_balance));
      const isDr = baseSigned >= 0;
      const amount = Math.abs(baseSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balType = isDr ? 'Dr' : 'Cr';

      return (
        <span
          className={`inline-block px-3 py-1.5 text-sm font-black rounded-md shadow-sm border ${isDr ? 'bg-indigo-50 text-indigo-950 border-indigo-200' : 'bg-amber-50 text-amber-950 border-amber-300'}`}
          style={{ fontSize: '0.92rem', color: isDr ? '#1e1b4b' : '#451a03', backgroundColor: isDr ? '#e0e7ff' : '#fcf08cff', borderColor: isDr ? '#a5b4fc' : '#fcd34d' }}
          title={`Last Balance (Fixed): ${amount} ${balType}`}>
          {amount} {balType}
        </span>
      );
    };

    const ClosingBalanceBadge = ({ bal, loading, errorMsg, rowDebit, rowCredit }) => {
      if (loading) return <span className="inline-block px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-100 border border-indigo-300 rounded animate-pulse">⟳ Loading…</span>;
      if (errorMsg) return <span className="inline-block px-2.5 py-1 text-xs font-bold text-red-700 bg-red-100 border border-red-400 rounded" title={errorMsg}>⚠ Error</span>;
      if (!bal || bal.closing_balance == null) return <span className="inline-block px-2.5 py-1 text-xs font-semibold text-slate-400">—</span>;

      const dAmt = (voucherType === 'BP' || voucherType === 'CP') ? parseAmountNum(rowDebit) : (isJV ? parseAmountNum(rowDebit) : 0);
      const cAmt = (voucherType === 'BR' || voucherType === 'CR') ? parseAmountNum(rowCredit) : (isJV ? parseAmountNum(rowCredit) : 0);

      const baseSigned = bal.signed_balance != null ? bal.signed_balance : (bal.balance_type === 'Dr' ? parseFloat(bal.closing_balance) : -parseFloat(bal.closing_balance));
      const projectedSigned = baseSigned + dAmt - cAmt;
      const isDr = projectedSigned >= 0;
      const amount = Math.abs(projectedSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balType = isDr ? 'Dr' : 'Cr';

      return (
        <span
          className={`inline-block px-3.5 py-1.5 text-sm font-black rounded-md shadow-md border-2 ${isDr ? 'bg-blue-600 text-white border-blue-800' : 'bg-amber-600 text-white border-amber-800'}`}
          style={{ fontSize: '0.98rem' }}
          title={`Closing Balance After Entry: ${amount} ${balType}`}>
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
      const lastAmount = Math.abs(baseSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const lastBalType = baseSigned >= 0 ? 'Dr' : 'Cr';

      const projectedSigned = baseSigned + dAmt - cAmt;
      const isDr = projectedSigned >= 0;
      const amount = Math.abs(projectedSigned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balType = isDr ? 'Dr' : 'Cr';

      return (
        <div className="flex items-center gap-6 ml-4 flex-wrap">
          <span
            className="text-sm font-black px-3.5 py-1.5 rounded-md shadow-sm border"
            style={{ fontSize: '0.95rem', color: '#1e1b4b', backgroundColor: '#e0e7ff', borderColor: '#a5b4fc' }}
            title="Last Balance Before">
            Last Bal: {lastAmount} {lastBalType}
          </span>
          <span
            className={`text-sm font-black px-4 py-1.5 rounded-md shadow-md border-2 ${isDr ? 'bg-blue-600 text-white border-blue-800' : 'bg-amber-600 text-white border-amber-800'}`}
            style={{ fontSize: '1rem' }}
            title={`Closing Balance After: ${amount} ${balType}`}>
            Closing Bal: {amount} {balType}
          </span>
        </div>
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
                debit: d.debit ? formatWithCommas(d.debit) : '',
                credit: d.credit ? formatWithCommas(d.credit) : ''
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
                debit: d.debit ? formatWithCommas(d.debit) : '',
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
                credit: d.credit ? formatWithCommas(d.credit) : ''
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
      newDetails[index][field] = (field === 'debit' || field === 'credit') ? formatWithCommas(value) : value;
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
      totalDebit += parseAmountNum(d.debit);
      totalCredit += parseAmountNum(d.credit);
    });

    const headerAccounts = accounts.filter(a => a.account_type === 'Bank' || a.account_type === 'Cash');

    const handleSave = async () => {
      setStatusMsg({ type: '', text: '' });
      if (!isJV && !headerAccount) {
        setStatusMsg({ type: 'error', text: 'Please select an A/c Head (Bank/Cash Account)' });
        return;
      }

      // Validate rows
      const validDetails = details.filter(d => d.account_id && (parseAmountNum(d.debit) > 0 || parseAmountNum(d.credit) > 0));
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
          debit: parseAmountNum(d.debit),
          credit: parseAmountNum(d.credit)
        }));
      } else {
        let gridTotal = 0;
        validDetails.forEach(d => {
          const amt = parseAmountNum(d.debit) || parseAmountNum(d.credit);
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
        user_id: currentUser?.id || currentUser?.userId || voucherToEdit?.user_id || null,
        details: finalDetails
      };

      try {
        await ipcRenderer.invoke('save-voucher', payload);
        setStatusMsg({ type: 'success', text: voucherToEdit ? '✅ Transaction Updated Successfully!' : '✅ Transaction Saved Successfully!' });
        setShowSuccessAnim(true);
      } catch (err) {
        setStatusMsg({ type: 'error', text: '❌ Error saving transaction: ' + err.message });
      }
    };

    useEffect(() => {
      const handleGlobalShortcut = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleSave();
        }
      };
      window.addEventListener('keydown', handleGlobalShortcut);
      return () => window.removeEventListener('keydown', handleGlobalShortcut);
    }, [handleSave, voucherType, voucherNo, voucherDate, headerAccount, remarks, details, isJV, totalDebit, totalCredit]);

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
                <div className="flex-1">
                  <AccountSearchPicker
                    accounts={headerAccounts}
                    value={headerAccount}
                    onChange={newId => { setHeaderAccount(newId); fetchBalance(newId, 'header'); }}
                    placeholder="-- Select Bank / Cash Account --"
                    onOpenLedger={setLedgerModalAccount}
                  />
                </div>
                <BalanceBadgeHeader bal={headerBalance} loading={loadingBalances.header} errorMsg={balanceErrors.header} totalGridDebit={totalDebit} totalGridCredit={totalCredit} />
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse border border-slate-300" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-slate-200">
              <tr>
                <th className="border p-2" style={{ width: 250 }}>Account Name</th>
                <th className="border p-2" style={{ width: 85 }}>Ref No</th>
                <th className="border p-2">Description</th>
                <th className="border p-2 bg-gray-100 text-gray-900" style={{ width: 155 }}>Last Balance</th>
                {(voucherType === 'BP' || voucherType === 'CP' || isJV) && (
                  <th className="border p-2 bg-red-100 text-red-700 font-extrabold" style={{ width: 125 }}>Debit (Dr)</th>
                )}
                {(voucherType === 'BR' || voucherType === 'CR' || isJV) && (
                  <th className="border p-2 bg-green-100 text-green-700 font-extrabold" style={{ width: 125 }}>Credit (Cr)</th>
                )}
                <th className="border p-2 bg-blue-100 text-blue-900 font-extrabold" style={{ width: 165 }}>Closing Balance</th>
                <th className="border p-2" style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, idx) => {
                const bal = rowBalances[row.id];
                const loading = loadingBalances['r_' + row.id];
                const err = balanceErrors['r_' + row.id];

                return (
                  <tr key={row.id}>
                    <td className="border p-1" style={{ width: 250 }}>
                      <AccountSearchPicker
                        accounts={accounts}
                        value={row.account_id}
                        inputRef={el => { accountRefs.current[row.id] = el; }}
                        onChange={newId => handleDetailChange(idx, 'account_id', newId)}
                        placeholder="-- Select Account --"
                        onOpenLedger={setLedgerModalAccount}
                      />
                    </td>
                    <td className="border p-1" style={{ width: 85 }}>
                      <input type="text" value={row.reference_no} onChange={e => handleDetailChange(idx, 'reference_no', e.target.value)} className="w-full p-1 border" />
                    </td>
                    <td className="border p-1">
                      <input type="text" value={row.description} onChange={e => handleDetailChange(idx, 'description', e.target.value)} className="w-full p-1 border" />
                    </td>
                    <td className="border p-2 text-center" style={{ width: 155 }}>
                      <div className="inline-block w-full">
                        <LastBalanceBadge bal={bal} loading={loading} errorMsg={err} />
                      </div>
                    </td>

                    {(voucherType === 'BP' || voucherType === 'CP' || isJV) && (
                      <td className="border p-1" style={{ width: 125 }}>
                        <input
                          type="text"
                          value={row.debit}
                          onChange={e => handleDetailChange(idx, 'debit', e.target.value)}
                          onKeyDown={e => handleAmountKeyDown(e, idx)}
                          style={{ color: '#dc2626', fontWeight: 700 }}
                          className="w-full p-1 border text-right font-bold"
                          placeholder="0.00"
                        />
                      </td>
                    )}

                    {(voucherType === 'BR' || voucherType === 'CR' || isJV) && (
                      <td className="border p-1" style={{ width: 125 }}>
                        <input
                          type="text"
                          value={row.credit}
                          onChange={e => handleDetailChange(idx, 'credit', e.target.value)}
                          onKeyDown={e => handleAmountKeyDown(e, idx)}
                          style={{ color: '#16a34a', fontWeight: 700 }}
                          className="w-full p-1 border text-right font-bold"
                          placeholder="0.00"
                        />
                      </td>
                    )}

                    <td className="border p-2 text-center" style={{ width: 165 }}>
                      <div className="inline-block w-full">
                        <ClosingBalanceBadge bal={bal} loading={loading} errorMsg={err} rowDebit={row.debit} rowCredit={row.credit} />
                      </div>
                    </td>

                    <td className="border p-1 text-center" style={{ width: 40 }}>
                      <button onClick={() => removeRow(idx)} className="text-red-600 font-bold px-2 hover:bg-red-100 rounded">X</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold">
              <tr>
                <td colSpan="4" className="border p-2 text-right">TOTAL</td>
                {(voucherType === 'BP' || voucherType === 'CP' || isJV) && (
                  <td className="border p-2 text-right font-extrabold text-lg" style={{ color: '#dc2626' }}>{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                )}
                {(voucherType === 'BR' || voucherType === 'CR' || isJV) && (
                  <td className="border p-2 text-right font-extrabold text-lg" style={{ color: '#16a34a' }}>{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                )}
                <td className="border"></td>
                <td className="border"></td>
              </tr>
              {isJV && totalDebit !== totalCredit && (
                <tr>
                  <td colSpan={isJV ? 8 : 7} className="p-2 text-right text-red-600">Difference: {Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex justify-between">
          <button onClick={addRow} className="bg-slate-200 text-slate-800 px-4 py-2 rounded shadow hover:bg-slate-300">+ Add Row</button>
          <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 text-lg font-bold">Save Transaction</button>
        </div>

        <SuccessAnimation
          show={showSuccessAnim}
          title={voucherToEdit ? "Transaction Updated!" : "Transaction Saved!"}
          subtitle={voucherToEdit ? "Voucher entry updated successfully ✓" : "Voucher entry posted to GL ledger ✓"}
          onClose={() => {
            setShowSuccessAnim(false);
            if (onSuccess) onSuccess();
          }}
        />

        {ledgerModalAccount && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              width: '95%',
              maxWidth: '1250px',
              height: '92vh',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '12px 20px',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #3b82f6'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>📖</span>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                    Ledger Statement: <span style={{ color: '#60a5fa' }}>{formatAccountDisplayName(ledgerModalAccount)}</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLedgerModalAccount(null)}
                  style={{
                    background: '#334155',
                    border: 'none',
                    color: '#f8fafc',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Close ✕
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#f8fafc' }}>
                {(() => {
                  const acc = ledgerModalAccount;
                  if (!acc) return null;
                  const rawName = acc.account_name || '';
                  const match = rawName.match(/^(Customer|Supplier|Bank|Cash)\s*-\s*(.*)$/i);
                  const cleanName = match ? match[2] : rawName;
                  const type = (acc.account_type || (match ? match[1] : '')).toLowerCase();

                  if (type === 'customer') {
                    return <CustomerLedger currentUser={currentUser} initialCustomer={{ id: acc.reference_id, name: cleanName }} isActive={true} />;
                  } else if (type === 'supplier') {
                    return <SupplierLedger initialSupplier={{ name: cleanName, id: acc.reference_id }} onClose={() => setLedgerModalAccount(null)} />;
                  } else if (type === 'cash') {
                    return <CashLedger currentUser={currentUser} initialCash={acc} isActive={true} />;
                  } else {
                    return <BankLedger currentUser={currentUser} initialBank={acc} isActive={true} />;
                  }
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
