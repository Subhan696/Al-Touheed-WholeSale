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

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchSearch = !searchTerm.trim() || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(item.code).includes(searchTerm);
      const matchCat = !selectedCategory || item.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [data, searchTerm, selectedCategory]);

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
                  <th style={{ width: '85px' }}>Alias</th>
                  <th>Account Name</th>
                  <th style={{ width: '90px' }}>Category</th>
                  <th style={{ width: '170px', textAlign: 'right' }}>Debit (Lene Hain)</th>
                  <th style={{ width: '170px', textAlign: 'right' }}>Credit (Dene Hain)</th>
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
