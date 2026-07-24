import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function ManufacturerStockReport() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('get-manufacturer-stock-report');
      setReportData(data || []);
    } catch (err) {
      console.error('Failed to load stock report', err);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  // Group data by Manufacturer
  const mfgGroups = {};
  let totalGlobalStock = 0;
  let totalGlobalValue = 0;

  reportData.forEach(row => {
    const mfg = row.manufacturer;
    if (!mfgGroups[mfg]) {
      mfgGroups[mfg] = {
        name: mfg,
        totalStock: 0,
        totalValue: 0,
        brands: []
      };
    }
    const stock = parseInt(row.total_stock) || 0;
    const val = parseFloat(row.total_value) || 0;
    
    mfgGroups[mfg].brands.push({ name: row.brand, stock, val });
    mfgGroups[mfg].totalStock += stock;
    mfgGroups[mfg].totalValue += val;

    totalGlobalStock += stock;
    totalGlobalValue += val;
  });

  const sortedMfgs = Object.values(mfgGroups).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: '12px 20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>Manufacturer & Brand Stock Report</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadReport} className="btn btn-secondary" disabled={loading}>{loading ? 'Loading...' : '↻ Refresh'}</button>
          <button onClick={handlePrint} className="btn btn-primary">🖨️ Print Report</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20, flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading report data...</div>
        ) : sortedMfgs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No stock data available.</div>
        ) : (
          <div className="printable-report">
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .printable-report, .printable-report * { visibility: visible; }
                .printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
              }
              .report-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 0.95rem; }
              .report-table th, .report-table td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
              .report-table th { background: #f8fafc; font-weight: 700; color: #334155; }
              .mfg-header { background: #e0f2fe !important; font-weight: 700; color: #0369a1; }
              .val-col { text-align: right !important; }
              .total-row th { background: #f1f5f9; font-weight: 800; font-size: 1.1rem; }
            `}</style>
            
            <h1 style={{ display: 'none', margin: '0 0 20px', textAlign: 'center' }} className="print-heading">Manufacturer Stock Report</h1>
            <style>{`@media print { .print-heading { display: block !important; } }`}</style>

            <table className="report-table">
              <thead>
                <tr>
                  <th>Manufacturer / Brand</th>
                  <th className="val-col" style={{ width: '150px' }}>Total Items (Packets)</th>
                  <th className="val-col" style={{ width: '200px' }}>Est. Value (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {sortedMfgs.map(mfg => (
                  <React.Fragment key={mfg.name}>
                    <tr>
                      <td className="mfg-header">{mfg.name}</td>
                      <td className="mfg-header val-col">{mfg.totalStock.toLocaleString()}</td>
                      <td className="mfg-header val-col">{Math.round(mfg.totalValue).toLocaleString()}</td>
                    </tr>
                    {mfg.brands.map(b => (
                      <tr key={`${mfg.name}-${b.name}`}>
                        <td style={{ paddingLeft: '30px', color: '#475569' }}>↳ {b.name}</td>
                        <td className="val-col">{b.stock.toLocaleString()}</td>
                        <td className="val-col">{Math.round(b.val).toLocaleString()}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <th style={{ textAlign: 'right' }}>GRAND TOTAL:</th>
                  <th className="val-col">{totalGlobalStock.toLocaleString()}</th>
                  <th className="val-col">{Math.round(totalGlobalValue).toLocaleString()}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManufacturerStockReport;
