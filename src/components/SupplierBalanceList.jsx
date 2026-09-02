import React, { useState, useEffect, useMemo } from 'react';
import './SupplierBalanceList.css';

const { ipcRenderer } = window.require('electron');

const formatNum = (num) => {
  const n = parseFloat(num) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getNowFormatted = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

function SupplierBalanceList({ currentUser, isActive }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all'); // 'all', 'hide_zero', 'debit_only', 'credit_only', 'zero_only'
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [asOfTime, setAsOfTime] = useState(getNowFormatted());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-suppliers-balance-list');
      setData(res || []);
      setAsOfTime(getNowFormatted());
    } catch (err) {
      console.error('Error loading supplier balances:', err);
    }
    setLoading(false);
  };

  const categoriesList = useMemo(() => {
    const set = new Set(data.map(d => d.category).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'debit' || field === 'credit' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <span className="sbl-sort-icon neutral no-print-sort"> ↕</span>;
    return <span className="sbl-sort-icon active no-print-sort">{sortOrder === 'asc' ? ' ⬆️' : ' ⬇️'}</span>;
  };

  const filteredData = useMemo(() => {
    let result = data.filter(item => {
      const matchSearch = !searchTerm.trim() || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(item.code).includes(searchTerm);
      const matchCat = !selectedCategory || item.category === selectedCategory;

      let matchBalance = true;
      const debit = item.debit || 0;
      const credit = item.credit || 0;
      if (balanceFilter === 'hide_zero') {
        matchBalance = debit > 0 || credit > 0;
      } else if (balanceFilter === 'debit_only') {
        matchBalance = debit > 0;
      } else if (balanceFilter === 'credit_only') {
        matchBalance = credit > 0;
      } else if (balanceFilter === 'zero_only') {
        matchBalance = debit === 0 && credit === 0;
      }

      return matchSearch && matchCat && matchBalance;
    });

    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'code') {
        valA = a.code || 0;
        valB = b.code || 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return sortOrder === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      } else if (sortField === 'category') {
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'debit') {
        valA = a.debit || 0;
        valB = b.debit || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      } else if (sortField === 'credit') {
        valA = a.credit || 0;
        valB = b.credit || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      } else if (sortField === 'balance') {
        valA = a.balance || 0;
        valB = b.balance || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    return result;
  }, [data, searchTerm, selectedCategory, balanceFilter, sortField, sortOrder]);

  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredData.forEach(d => {
      totalDebit += (d.debit || 0);
      totalCredit += (d.credit || 0);
    });
    const netBal = totalCredit - totalDebit;
    return {
      totalDebit,
      totalCredit,
      netBalanceStr: `${formatNum(Math.abs(netBal))} ${netBal >= 0 ? 'Cr (Dene Hain)' : 'Dr (Lene Hain)'}`
    };
  }, [filteredData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="supplier-balance-list-page">
      {/* Top Toolbar (No-Print) */}
      <div className="sbl-toolbar no-print">
        <div className="sbl-toolbar-left">
          <h2>📒 Suppliers Balance List</h2>
          <span className="sbl-count-badge">{filteredData.length} Suppliers</span>
        </div>
        <div className="sbl-toolbar-right">
          <input
            type="text"
            placeholder="🔍 Search supplier name or code..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="sbl-search-input"
          />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="sbl-select-input"
          >
            <option value="">ALL CATEGORIES / CITIES</option>
            {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={balanceFilter}
            onChange={e => setBalanceFilter(e.target.value)}
            className="sbl-select-input"
            title="Filter by balance"
          >
            <option value="all">⚡ All Balances</option>
            <option value="hide_zero">🚫 Hide 0 Balances</option>
            <option value="credit_only">🔴 Credit Only (Dene Hain)</option>
            <option value="debit_only">🟢 Debit Only (Lene Hain)</option>
            <option value="zero_only">⭕ 0 Balances Only</option>
          </select>
          <select
            value={`${sortField}_${sortOrder}`}
            onChange={e => {
              const [field, order] = e.target.value.split('_');
              setSortField(field);
              setSortOrder(order);
            }}
            className="sbl-select-input"
            title="Sort list"
          >
            <option value="name_asc">Sort: Supplier (A to Z)</option>
            <option value="name_desc">Sort: Supplier (Z to A)</option>
            <option value="credit_desc">Sort: Credit (High to Low)</option>
            <option value="credit_asc">Sort: Credit (Low to High)</option>
            <option value="debit_desc">Sort: Debit (High to Low)</option>
            <option value="debit_asc">Sort: Debit (Low to High)</option>
            <option value="category_asc">Sort: Category (A to Z)</option>
            <option value="category_desc">Sort: Category (Z to A)</option>
            <option value="code_asc">Sort: Alias (Asc)</option>
            <option value="code_desc">Sort: Alias (Desc)</option>
          </select>
          <button type="button" onClick={loadData} className="sbl-btn sbl-btn-refresh">
            🔄 Refresh
          </button>
          <button type="button" onClick={handlePrint} className="sbl-btn sbl-btn-print">
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="sbl-sheet-container">
        <div className="sbl-paper">
          {/* Printable Header */}
          <div className="sbl-paper-header">
            <div className="sbl-paper-title-row">
              <span className="sbl-paper-asof">Date: {asOfTime}</span>
              <h1 className="sbl-paper-main-title">Suppliers Balance List</h1>
              <span className="sbl-paper-page-num">Page 1 of 1</span>
            </div>

            <div className="sbl-company-block">
              <div className="sbl-company-name">AL-TOUHEED GARMENTS</div>
              <div className="sbl-company-address">SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</div>
              <div className="sbl-company-city">CHOWK RANG MAHAL, LAHORE</div>
            </div>

            <div className="sbl-paper-sub-header">
              <div><strong>As On:</strong> {asOfTime}</div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="sbl-loading">Loading supplier balances...</div>
          ) : (
            <table className="sbl-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>Sr. No</th>
                  <th style={{ width: '85px', cursor: 'pointer' }} onClick={() => handleSort('code')} title="Click to sort by Alias">
                    Alias {getSortIcon('code')}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')} title="Click to sort by Account Name">
                    Account Name {getSortIcon('name')}
                  </th>
                  <th style={{ width: '110px', cursor: 'pointer' }} onClick={() => handleSort('category')} title="Click to sort by Category">
                    Category {getSortIcon('category')}
                  </th>
                  <th style={{ width: '170px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('debit')} title="Click to sort by Debit">
                    Debit (Lene Hain) {getSortIcon('debit')}
                  </th>
                  <th style={{ width: '170px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('credit')} title="Click to sort by Credit">
                    Credit (Dene Hain) {getSortIcon('credit')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="sbl-empty-row">No supplier balances found.</td>
                  </tr>
                ) : (
                  filteredData.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{item.code}</td>
                      <td className="sbl-supp-name-cell">{item.name}</td>
                      <td>{item.category}</td>
                      <td style={{ textAlign: 'right' }}>
                        {item.debit > 0 ? (
                          <div className="sbl-val-box">
                            <span className="sbl-amount-num dr-text">{formatNum(item.debit)}</span>
                            <span className="sbl-tag sbl-tag-dr">Lene Hain</span>
                          </div>
                        ) : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {item.credit > 0 ? (
                          <div className="sbl-val-box">
                            <span className="sbl-amount-num cr-text">{formatNum(item.credit)}</span>
                            <span className="sbl-tag sbl-tag-cr">Dene Hain</span>
                          </div>
                        ) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="sbl-tfoot-row">
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 700 }}>
                    Balance : <span className="sbl-net-bal cr-text">{totals.netBalanceStr}</span> &nbsp;&nbsp;&nbsp;&nbsp; Total:
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }} className="dr-text">{formatNum(totals.totalDebit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }} className="cr-text">{formatNum(totals.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default SupplierBalanceList;

