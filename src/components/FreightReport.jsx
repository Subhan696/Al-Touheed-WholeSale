import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

export default function FreightReport() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadReport();
  }, [startDate, endDate]);

  const loadAccounts = async () => {
    try {
      const res = await ipcRenderer.invoke('get-expense-accounts');
      setAccounts(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('get-freight-report', { startDate, endDate });
      setReportData(data || []);
    } catch (e) {
      console.error('Failed to load freight report', e);
      setReportData([]);
    }
    setLoading(false);
  };

  const filteredData = reportData.filter(row => {
    if (selectedAccount && row.account_name !== selectedAccount) return false;
    return true;
  });

  const totalAmount = filteredData.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalCartons = filteredData.reduce((sum, row) => sum + Number(row.cartons), 0);

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Freight Expenses Report</h2>
        
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>Account / Company</label>
            <select 
              value={selectedAccount} 
              onChange={e => setSelectedAccount(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 4 }}
            >
              <option value="">All Accounts</option>
              {accounts.map(a => (
                <option key={a.id} value={a.account_name}>{a.account_name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>Start Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 4 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>End Date</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 4 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => window.print()} 
              style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', height: 35, marginTop: 17 }}
            >
              Print
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Freight Account</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Supplier</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Invoice No</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Cartons</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Rate</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center' }}>Loading report...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center' }}>No freight expenses found for this period.</td></tr>
            ) : filteredData.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>{new Date(row.purchase_date).toLocaleDateString()}</td>
                <td style={{ padding: '12px', fontWeight: 600, color: '#334155' }}>{row.account_name}</td>
                <td style={{ padding: '12px' }}>{row.supplier_name || '-'}</td>
                <td style={{ padding: '12px' }}>{row.invoice_no || '-'}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>{row.cartons}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>{Number(row.rate).toLocaleString()}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>{Number(row.amount).toLocaleString()}</td>
                <td style={{ padding: '12px', color: '#64748b' }}>{row.remarks || '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot style={{ position: 'sticky', bottom: 0, background: '#f8fafc', fontWeight: 'bold', boxShadow: '0 -1px 2px rgba(0,0,0,0.1)' }}>
            <tr>
              <td colSpan="4" style={{ padding: '12px', textAlign: 'right', borderTop: '2px solid #e2e8f0' }}>TOTAL:</td>
              <td style={{ padding: '12px', textAlign: 'right', borderTop: '2px solid #e2e8f0' }}>{totalCartons}</td>
              <td style={{ padding: '12px', borderTop: '2px solid #e2e8f0' }}></td>
              <td style={{ padding: '12px', textAlign: 'right', borderTop: '2px solid #e2e8f0', color: '#0f172a' }}>{totalAmount.toLocaleString()}</td>
              <td style={{ padding: '12px', borderTop: '2px solid #e2e8f0' }}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
