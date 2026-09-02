import React, { useState, useEffect, useMemo } from 'react';
import './CustomerBalanceList.css';

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

function CustomerBalanceList({ currentUser, isActive }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
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
      const res = await ipcRenderer.invoke('get-customers-balance-list');
      setData(res || []);
      setAsOfTime(getNowFormatted());
    } catch (err) {
      console.error('Error loading customer balances:', err);
    }
    setLoading(false);
  };

  const citiesList = useMemo(() => {
    const set = new Set(data.map(d => d.city).filter(Boolean));
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
    if (sortField !== field) return <span className="cbl-sort-icon neutral no-print-sort"> ↕</span>;
    return <span className="cbl-sort-icon active no-print-sort">{sortOrder === 'asc' ? ' ⬆️' : ' ⬇️'}</span>;
  };

  const filteredData = useMemo(() => {
    let result = data.filter(item => {
      const matchSearch = !searchTerm.trim() || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(item.code).includes(searchTerm) || 
        (item.phone && item.phone.includes(searchTerm));
      const matchCity = !selectedCity || item.city === selectedCity;

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

      return matchSearch && matchCity && matchBalance;
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
      } else if (sortField === 'city') {
        valA = (a.city || '').toLowerCase();
        valB = (b.city || '').toLowerCase();
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
  }, [data, searchTerm, selectedCity, balanceFilter, sortField, sortOrder]);

  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredData.forEach(d => {
      totalDebit += (d.debit || 0);
      totalCredit += (d.credit || 0);
    });
    const netBal = totalDebit - totalCredit;
    return {
      totalDebit,
      totalCredit,
      netBalanceStr: `${formatNum(Math.abs(netBal))} ${netBal >= 0 ? 'Dr (Lene Hain)' : 'Cr (Dene Hain)'}`
    };
  }, [filteredData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="customer-balance-list-page">
      {/* Top Toolbar (No-Print) */}
      <div className="cbl-toolbar no-print">
        <div className="cbl-toolbar-left">
          <h2>📋 Customers Balance List</h2>
          <span className="cbl-count-badge">{filteredData.length} Customers</span>
        </div>
        <div className="cbl-toolbar-right">
          <input
            type="text"
            placeholder="🔍 Search customer name or code..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="cbl-search-input"
          />
          <select
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="cbl-select-input"
          >
            <option value="">ALL CITIES / AREAS</option>
            {citiesList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={balanceFilter}
            onChange={e => setBalanceFilter(e.target.value)}
            className="cbl-select-input"
            title="Filter by balance"
          >
            <option value="all">⚡ All Balances</option>
            <option value="hide_zero">🚫 Hide 0 Balances</option>
            <option value="debit_only">🟢 Debit Only (Lene Hain)</option>
            <option value="credit_only">🔴 Credit Only (Dene Hain)</option>
            <option value="zero_only">⭕ 0 Balances Only</option>
          </select>
          <select
            value={`${sortField}_${sortOrder}`}
            onChange={e => {
              const [field, order] = e.target.value.split('_');
              setSortField(field);
              setSortOrder(order);
            }}
            className="cbl-select-input"
            title="Sort list"
          >
            <option value="name_asc">Sort: Customer (A to Z)</option>
            <option value="name_desc">Sort: Customer (Z to A)</option>
            <option value="debit_desc">Sort: Debit (High to Low)</option>
            <option value="debit_asc">Sort: Debit (Low to High)</option>
            <option value="credit_desc">Sort: Credit (High to Low)</option>
            <option value="credit_asc">Sort: Credit (Low to High)</option>
            <option value="city_asc">Sort: City (A to Z)</option>
            <option value="city_desc">Sort: City (Z to A)</option>
            <option value="code_asc">Sort: Alias (Asc)</option>
            <option value="code_desc">Sort: Alias (Desc)</option>
          </select>
          <button type="button" onClick={loadData} className="cbl-btn cbl-btn-refresh">
            🔄 Refresh
          </button>
          <button type="button" onClick={handlePrint} className="cbl-btn cbl-btn-print">
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="cbl-sheet-container">
        <div className="cbl-paper">
          {/* Printable Header */}
          <div className="cbl-paper-header">
            <div className="cbl-paper-title-row">
              <span className="cbl-paper-asof">Date: {asOfTime.split(' ')[0]}</span>
              <h1 className="cbl-paper-main-title">Customers Balance List</h1>
              <span className="cbl-paper-page-num">Page 1 of 1</span>
            </div>

            <div className="cbl-company-block">
              <div className="cbl-company-name">AL-TOUHEED GARMENTS</div>
              <div className="cbl-company-address">SHOP 2 AND 3, GROUND FLOOR AL MUMTAZ CENTRE</div>
              <div className="cbl-company-city">CHOWK RANG MAHAL, LAHORE</div>
              <div className="cbl-company-contact">
                Phone(s): 042-37639907 &nbsp;&nbsp;&nbsp;&nbsp; Fax:
              </div>
            </div>

            <div className="cbl-paper-sub-header">
              <div className="cbl-sub-left">
                <strong>As On:</strong> {asOfTime}
              </div>
            </div>

            <div className="cbl-grouping-bar">
              <div><strong>Code: 1</strong> &nbsp;&nbsp;&nbsp;&nbsp; <strong>Area:</strong> {selectedCity || 'ALL CITY'}</div>
              <div><strong>Category:</strong> RECEIVABLE AMOUNT</div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="cbl-loading">Loading customer balances...</div>
          ) : (
            <table className="cbl-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>SNo.</th>
                  <th style={{ width: '75px', cursor: 'pointer' }} onClick={() => handleSort('code')} title="Click to sort by Alias">
                    Alias {getSortIcon('code')}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')} title="Click to sort by Customer Name">
                    Customer Name {getSortIcon('name')}
                  </th>
                  <th style={{ width: '120px', cursor: 'pointer' }} onClick={() => handleSort('city')} title="Click to sort by City / Area">
                    City / Area {getSortIcon('city')}
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
                    <td colSpan="6" className="cbl-empty-row">No customer balances found.</td>
                  </tr>
                ) : (
                  filteredData.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{item.code}</td>
                      <td className="cbl-cust-name-cell">{item.name}</td>
                      <td>{item.city || '-'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {item.debit > 0 ? (
                          <div className="cbl-val-box">
                            <span className="cbl-amount-num dr-text">{formatNum(item.debit)}</span>
                            <span className="cbl-tag cbl-tag-dr">Lene Hain</span>
                          </div>
                        ) : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {item.credit > 0 ? (
                          <div className="cbl-val-box">
                            <span className="cbl-amount-num cr-text">{formatNum(item.credit)}</span>
                            <span className="cbl-tag cbl-tag-cr">Dene Hain</span>
                          </div>
                        ) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="cbl-tfoot-row">
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 700 }}>
                    Balance : <span className="cbl-net-bal dr-text">{totals.netBalanceStr}</span> &nbsp;&nbsp;&nbsp;&nbsp; Total:
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

export default CustomerBalanceList;

