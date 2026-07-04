import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function Reports({ currentUser }) {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState(null);
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        ipcRenderer.invoke('get-report-summary', { startDate: dateFrom, endDate: dateTo }),
        ipcRenderer.invoke('get-report-top-items', { startDate: dateFrom, endDate: dateTo }),
      ]);
      setSummary(s);
      setTopItems(t || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const quickRange = (days) => {
    const d = new Date();
    const from = new Date(d); from.setDate(d.getDate() - days + 1);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(d.toISOString().split('T')[0]);
  };

  const profitPct = summary && summary.totalSales > 0 ? ((summary.totalProfit / summary.totalSales) * 100).toFixed(1) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, overflowY: 'auto' }}>
      {/* Date filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: '12px 16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, flex: 1 }}>Reports & Analytics</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['Today', 1], ['Week', 7], ['Month', 30]].map(([label, days]) => (
            <button key={label} onClick={() => { quickRange(days); setTimeout(loadReports, 50); }} style={{ padding: '5px 12px', border: '1px solid #e4e6ef', background: '#f3f6f9', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem' }}>{label}</button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: '#aaa' }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        <button onClick={loadReports} disabled={loading} className="btn btn-primary" style={{ padding: '8px 20px' }}>{loading ? '...' : 'Load'}</button>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Sales', value: `PKR ${summary.totalSales.toLocaleString()}`, color: '#3699ff', icon: '📈' },
            { label: 'Total Packets', value: summary.totalPackets.toLocaleString(), color: '#4f46e5', icon: '📦' },
            { label: 'Total Purchases', value: `PKR ${summary.totalPurchases.toLocaleString()}`, color: '#ffa800', icon: '🛒' },
            { label: 'Sales Returns', value: `PKR ${summary.totalReturns.toLocaleString()}`, color: '#f64e60', icon: '↩️' },
            { label: 'Net Profit', value: `PKR ${summary.totalProfit.toLocaleString()}`, color: '#16a34a', icon: '💰', sub: `${profitPct}% margin` },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: '16px 14px' }}>
              <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{card.icon}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#7e8299', textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: card.color }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: 2 }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Top Items */}
      <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20, flex: 1, minHeight: 0 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, borderBottom: '2px solid #e4e6ef', paddingBottom: 10 }}>Top Selling Items (by Packets)</h3>
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100% - 50px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f5f7fa' }}>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Item Code</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'center' }}>Packets Sold</th>
                <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                <th style={{ ...th, textAlign: 'right' }}>Profit</th>
                <th style={{ ...th, textAlign: 'right' }}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {topItems.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 50, textAlign: 'center', color: '#aaa' }}>No sales data for this period</td></tr>
              ) : topItems.map((item, i) => {
                const revenue = parseFloat(item.amount);
                const profit = parseFloat(item.profit);
                const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
                const maxPackets = topItems[0]?.packets || 1;
                const barPct = (item.packets / maxPackets) * 100;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3699ff' }}>{item.item_code}</span></td>
                    <td style={td}>
                      <div>{item.item_description}</div>
                      <div style={{ height: 4, background: '#e4e6ef', borderRadius: 2, marginTop: 4, width: 120 }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: '#3699ff', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{item.packets}</td>
                    <td style={{ ...td, textAlign: 'right' }}>PKR {revenue.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', color: profit >= 0 ? '#16a34a' : '#f64e60', fontWeight: 600 }}>PKR {profit.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}><span style={{ background: profit >= 0 ? '#e8fdf8' : '#fde8e8', color: profit >= 0 ? '#16a34a' : '#f64e60', padding: '2px 8px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem' }}>{margin}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#5e6278', borderBottom: '2px solid #e4e6ef', whiteSpace: 'nowrap' };
const td = { padding: '9px 12px', color: '#3f4254' };
const inputStyle = { padding: '7px 10px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.88rem', fontFamily: 'inherit', background: '#f9fafb' };

export default Reports;
