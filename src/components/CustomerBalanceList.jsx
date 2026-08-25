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

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchSearch = !searchTerm.trim() || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(item.code).includes(searchTerm) || 
        (item.phone && item.phone.includes(searchTerm));
      const matchCity = !selectedCity || item.city === selectedCity;
      return matchSearch && matchCity;
    });
  }, [data, searchTerm, selectedCity]);

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
                  <th style={{ width: '75px' }}>Alias</th>
                  <th>Customer Name</th>
                  <th style={{ width: '180px', textAlign: 'right' }}>Debit (Lene Hain)</th>
                  <th style={{ width: '180px', textAlign: 'right' }}>Credit (Dene Hain)</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="cbl-empty-row">No customer balances found.</td>
                  </tr>
                ) : (
                  filteredData.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{item.code}</td>
                      <td className="cbl-cust-name-cell">{item.name}</td>
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
                  <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700 }}>
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
