import React, { useState, useEffect, useRef } from 'react';
import './UserManagement.css';
import './Reports.css';


const { ipcRenderer } = window.require('electron');

function Reports({ currentUser, isActive }) {
    const getLocalDate = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const local = new Date(now.getTime() - offset * 60 * 1000);
        return local.toISOString().slice(0, 10);
    };

    const [activeTab, setActiveTab] = useState('daily');
    const [startDate, setStartDate] = useState(getLocalDate);
    const [endDate, setEndDate] = useState(getLocalDate);
    // Optional time-of-day window for the Daily Report / Invoice Summary. Empty = whole day.
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');

    const [dailyReport, setDailyReport] = useState(null);
    const [salesReport, setSalesReport] = useState(null);
    const [stockReport, setStockReport] = useState(null);
    const [userReport, setUserReport] = useState(null);
    const [dateSummary, setDateSummary] = useState(null);
    const dateSummaryPrintRef = useRef(null);

    const [expandedUser, setExpandedUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showProfit, setShowProfit] = useState(false);
    const [filterMethod, setFilterMethod] = useState(null);
    const [printSummaryOnly, setPrintSummaryOnly] = useState(false);
    const [selectedUser, setSelectedUser] = useState('all');
    const [userList, setUserList] = useState([]);
    const [isMinimized, setIsMinimized] = useState(false);
    const printRef = useRef(null);
    const timeFilterMounted = useRef(false);

    const timeInputStyle = { padding: '8px 11px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '17px', fontWeight: 700, background: '#fff', color: '#1e293b' };
    const dateInputStyle = { marginLeft: '6px', padding: '8px 11px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '17px', fontWeight: 700, color: '#1e293b' };
    const filterLabelStyle = { fontSize: '15px', fontWeight: 700, color: '#334155' };

    const fetchReport = async (silent = false) => {
        // silent = update data in place without flipping `loading`. Used for the
        // debounced time-window refetch so the report doesn't unmount/collapse
        // (which caused the page to bounce while adjusting the time spinner).
        if (!silent) setLoading(true);
        try {
            if (activeTab === 'daily' || activeTab === 'invoices') {
                const data = await ipcRenderer.invoke('get-daily-report', { startDate, endDate, startTime, endTime, userId: selectedUser });
                setDailyReport(data);
            } else if (activeTab === 'sales') {
                const data = await ipcRenderer.invoke('get-sales-report', { startDate, endDate });
                setSalesReport(data);
            } else if (activeTab === 'stock') {
                const data = await ipcRenderer.invoke('get-stock-report');
                setStockReport(data);
            } else if (activeTab === 'users') {
                const data = await ipcRenderer.invoke('get-user-report', { startDate, endDate });
                setUserReport(data);
            } else if (activeTab === 'summary') {
                const data = await ipcRenderer.invoke('get-date-summary', { startDate, endDate });
                setDateSummary(data);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Fetch immediately when tab, date, or user changes.
    useEffect(() => {
        fetchReport();
    }, [activeTab, startDate, endDate, selectedUser]);

    // Fetch user list on mount
    useEffect(() => {
        (async () => {
            try {
                const users = await ipcRenderer.invoke('get-users');
                setUserList(users || []);
            } catch (e) { console.error('Error loading users:', e); }
        })();
    }, []);

    // Debounce the time-window refetch. The time spinner fires onChange on every
    // tick; without this, each tick triggers a full report reload, which collapses
    // and re-expands the content area and makes the page bounce. Wait until the
    // user stops adjusting (350ms) before fetching once. Skip the initial mount —
    // the effect above already handles the first load.
    useEffect(() => {
        if (!timeFilterMounted.current) { timeFilterMounted.current = true; return; }
        const t = setTimeout(() => { fetchReport(true); }, 350);
        return () => clearTimeout(t);
    }, [startTime, endTime]);

    // Explicitly removed: Refreshing heavy Reports on window focus freezes the app due to synchronous DB queries.
    // The user should explicitly click "Refresh" when they return to Reports to see new data.

    const fmt = (amount) => Math.round(amount || 0).toLocaleString();

    const fmtTime = (dt) => {
        if (!dt) return '-';
        try {
            return new Date(dt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch { return dt; }
    };

    const reformatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        let str = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString().slice(0, 10);
        if (!str.includes('-')) return str;
        const parts = str.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return str;
    };

    // Returned item quantity grouped by return_date (used by the Invoice Summary
    // to show per-date returns next to each date row).
    const invoiceReturnsByDate = (() => {
        const map = {};
        (dailyReport?.returns || []).forEach(ret => {
            const qty = (ret.items || []).reduce((s, it) => s + (parseInt(it.quantity) || 0), 0);
            map[ret.return_date] = (map[ret.return_date] || 0) + qty;
        });
        return map;
    })();

    const handlePrint = async (forceSummaryArg) => {
        const isSummary = forceSummaryArg === true || printSummaryOnly;
        if (isSummary && activeTab === 'daily' && dailyReport && !dailyReport.error) {
            const receiptSettings = (await ipcRenderer.invoke('get-receipt-settings')) || {};
            const subtitle = startDate === endDate ? reformatDateDisplay(startDate) : `${reformatDateDisplay(startDate)} to ${reformatDateDisplay(endDate)}`;

            const printHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                @page { margin: 0; size: 76mm auto; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Courier New', Courier, monospace; font-weight: 800 !important; width: 100%; padding: 2mm; font-size: 14px; background: white; color: #000; }
                .center { text-align: center; }
                .header { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
                .date-header { font-size: 18px; margin-bottom: 8px; font-weight: bold; }
                .line-solid { border-top: 2px solid #000; margin: 6px 0; }
                .line-dashed { border-top: 1px dashed #000; margin: 6px 0; }
                .row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
                .title-col { font-size: 18px; font-weight: bold; }
                .meta-col { font-size: 16px; font-weight: bold; margin-left: 8px; }
                .amt-col { font-size: 22px; font-weight: bold; white-space: nowrap; }
                .amt-col-main { font-size: 25px; font-weight: bold; white-space: nowrap; border-bottom: 4px double #000; display: inline-block; }
              </style>
            </head>
            <body>
              <div class="center header">Al-Touheed Garments</div>
              <div class="center date-header" style="font-size: 22px;">${subtitle}</div>
              <div class="line-solid"></div>
              
              <div class="row">
                <div>
                  <span class="title-col">Total Sales</span>
                  <span class="meta-col">(${dailyReport.sales.length} Invs, ${dailyReport.summary.totalSoldItems || 0} Items)</span>
                </div>
                <span class="amt-col-main">${fmt(dailyReport.summary.totalSales)}</span>
              </div>
              <div class="line-solid"></div>

              <div class="row">
                <div>
                  <span class="title-col">Returns</span>
                  <span class="meta-col">(${dailyReport.summary.totalReturnedItems || 0} Items)</span>
                </div>
                <span class="amt-col-main">${fmt(dailyReport.summary.totalReturns)}</span>
              </div>
              <div class="line-solid"></div>

              ${Object.keys(dailyReport.summary.digitalBreakdown || {}).length === 1 ? '' : `
              <div class="row" style="margin-bottom: 8px;">
                <span class="title-col">Total Digital</span>
                <span class="amt-col-main">${fmt(dailyReport.summary.totalDigital)}</span>
              </div>
              <div class="line-dashed"></div>
              `}

              ${Object.entries(dailyReport.summary.digitalBreakdown || {}).map(([method, data]) => {
                const matchingSales = dailyReport.sales.filter(sale => sale.breakdown && sale.breakdown[method]);

                if (matchingSales.length === 1) {
                    const sale = matchingSales[0];
                    return `
                        <div class="row" style="align-items: flex-start; margin-bottom: 8px;">
                          <div style="flex: 1; padding-right: 10px;">
                            <span class="title-col">${method.toUpperCase()} (1)</span>
                            <span class="meta-col">Inv #${sale.invoice_no || sale.id}</span>
                          </div>
                          <span class="amt-col-main">${fmt(data.amount)}</span>
                        </div>
                      `;
                } else {
                    const salesRows = matchingSales.map(sale => {
                        const amt = typeof sale.breakdown[method] === 'object' ? sale.breakdown[method].amount : sale.breakdown[method];
                        return `
                            <div class="row" style="align-items: flex-start; padding-left: 14px; margin-bottom: 4px;">
                              <div style="flex: 1; padding-right: 10px;">
                                <span class="meta-col">Inv #${sale.invoice_no || sale.id}</span>
                              </div>
                              <span class="amt-col">${fmt(amt)}</span>
                            </div>
                          `;
                    }).join('');

                    return `
                        <div style="margin-bottom: 8px;">
                          <div class="row" style="align-items: flex-start; margin-bottom: 4px;">
                            <div style="flex: 1; padding-right: 10px;">
                              <span class="title-col">${method.toUpperCase()} (${data.count})</span>
                            </div>
                            <span class="amt-col-main">${fmt(data.amount)}</span>
                          </div>
                          ${salesRows}
                        </div>
                      `;
                }
            }).join('')}
              <div class="line-solid"></div>
              <div class="row" style="margin-top: 8px;">
                <div><span class="title-col">Net Cash in Hand</span></div>
                <span class="amt-col-main">${fmt(dailyReport.summary.netCash)}</span>
              </div>
              <div class="line-solid"></div>
            </body>
            </html>
            `;

            try {
                await ipcRenderer.invoke('print-receipt', {
                    html: printHtml,
                    copies: 1,
                    printer: receiptSettings.printer
                });
            } catch (err) {
                console.error("Print Error:", err);
                alert("Failed to print directly: " + err.message);
            }
            return;
        }

        const content = printRef.current?.innerHTML;
        if (!content) return;
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Report - ${startDate} to ${endDate}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: 800; }
                    @page { size: 76mm auto; margin: 0; }
                    body { width: 100%; padding: 4mm 2mm; color: #000; background: #fff; }
                    h1 { font-size: 16px; margin-bottom: 4px; }
                    h2 { font-size: 14px; margin: 12px 0 6px; border-bottom: 2px solid #333; padding-bottom: 4px; }
                    h3 { font-size: 12px; margin: 8px 0 4px; color: #1a1a1a; }
                    .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
                    .summary-grid { display: block; margin-bottom: 16px; }
                    .summary-card { border: 2px solid #000; padding: 10px; border-radius: 4px; margin-bottom: 8px; page-break-inside: avoid; }
                    .summary-card .label { color: #000; font-size: 11px; font-weight: bold; text-transform: uppercase; }
                    .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                    th { background: #222; color: #fff; padding: 5px 4px; text-align: left; }
                    td { padding: 4px; border-bottom: 1px solid #eee; }
                    /* Invoice Summary print: shrink the table to its content so the columns sit
                       close together (no full-width spread) and compact the rows so more fit per
                       page. !important overrides the on-screen inline padding/width. */
                    .invoice-summary-table { width: auto !important; }
                    .invoice-summary-table th, .invoice-summary-table td { padding: 0 40px 0 0 !important; white-space: nowrap; font-size: 15px !important; line-height: 1.25 !important; }
                    /* Date separator row carries the date + that date's returns, in a larger font. */
                    .invoice-summary-table tr.inv-date-row td { padding: 7px 40px 2px 0 !important; }
                    .invoice-summary-table tr.inv-date-row td span { font-size: 18px !important; font-weight: bold !important; }
                    tr:nth-child(even) td { background: #f9f9f9; }
                    .invoice-block { margin-bottom: 12px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
                    .invoice-header { background: #f0f4ff; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; }
                    .invoice-meta { font-size: 10px; color: #555; }
                    .return-block { margin-bottom: 12px; border: 1px solid #ffe0e0; border-radius: 4px; overflow: hidden; }
                    .return-header { background: #fff0f0; padding: 6px 8px; display: flex; justify-content: space-between; }
                    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
                    .badge-cash { background:#d1fae5; color:#065f46; }
                    .badge-digital { background:#dbeafe; color:#1e40af; }
                    .badge-return { background:#fee2e2; color:#991b1b; }
                    .total-row td { font-weight: bold; background: #f0f4ff !important; }
                    @media print {
                        body { padding: 10px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        win.document.close();
        setTimeout(() => { win.print(); }, 500);
    };

    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                if (activeTab === 'daily') {
                    e.preventDefault();
                    handlePrint(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, activeTab, dailyReport, printSummaryOnly, handlePrint]);

    return (
        <div className="user-management-container">
            <div className="header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2>📊 Reports {isMinimized && <span style={{ fontSize: '14px', fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', marginLeft: '10px' }}>Compact View</span>}</h2>
                <button
                    className="btn btn-secondary"
                    onClick={() => setIsMinimized(prev => !prev)}
                    style={{ fontSize: '13px', padding: '6px 12px', background: isMinimized ? '#e0f2fe' : '#f1f5f9', color: isMinimized ? '#0369a1' : '#475569', fontWeight: 600, border: '1px solid #cbd5e1' }}
                >
                    {isMinimized ? '🔽 Expand Controls' : '🔼 Minimize Controls'}
                </button>
            </div>

            {!isMinimized && (
                <div className="tabs-container" style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'daily', label: '📋 Daily Report' },
                        { id: 'sales', label: '📈 Sales Summary' },
                        { id: 'stock', label: '📦 Stock Value' },
                        { id: 'users', label: '👤 User Performance' },
                        { id: 'invoices', label: '🧾 Invoice Summary' },
                        { id: 'summary', label: '📅 Date Summary' },
                    ].map(t => (
                        <button
                            key={t.id}
                            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {activeTab !== 'stock' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px', padding: '10px 14px', background: isMinimized ? '#f8fafc' : '#f3f4f6', borderRadius: '8px', border: isMinimized ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={filterLabelStyle}>From:
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                            style={dateInputStyle} />
                    </label>
                    <label style={filterLabelStyle}>To:
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                            style={dateInputStyle} />
                    </label>

                    {activeTab === 'daily' && userList.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>👤</span>
                            <select
                                value={selectedUser}
                                onChange={e => setSelectedUser(e.target.value)}
                                style={{
                                    padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                    fontSize: '14px', fontWeight: 600, color: '#1e293b', background: selectedUser !== 'all' ? '#dbeafe' : '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">All Users</option>
                                {userList.map(u => (
                                    <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button className="btn btn-primary" onClick={fetchReport} disabled={loading}>
                        {loading ? 'Loading...' : '🔄 Refresh'}
                    </button>

                    {!isMinimized && activeTab === 'daily' && (
                        <>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowProfit(p => !p)}
                                style={{ background: showProfit ? '#f0fdf4' : undefined, border: showProfit ? '1px solid #10b981' : undefined, color: showProfit ? '#059669' : undefined }}
                            >
                                {showProfit ? '🟢 Profit ON' : '⚪ Show Profit'}
                            </button>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={printSummaryOnly}
                                    onChange={e => setPrintSummaryOnly(e.target.checked)}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                Print Summary Only
                            </label>
                        </>
                    )}

                    {(activeTab === 'daily' || activeTab === 'invoices') && (
                        <button className="btn btn-secondary" onClick={handlePrint} style={{ marginLeft: 'auto' }}>
                            🖨️ Print Report
                        </button>
                    )}
                    {activeTab === 'summary' && (
                        <button className="btn btn-secondary" onClick={() => {
                            const content = dateSummaryPrintRef.current?.innerHTML;
                            if (!content) return;
                            const win = window.open('', '_blank');
                            win.document.write(
                                `<html><head><title>Date Summary ${startDate} to ${endDate}</title><style>` +
                                `@page{size:A4;margin:15mm}` +
                                `*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;font-size:11px}` +
                                `body{color:#000}` +
                                `h1{font-size:16px;text-align:center;margin-bottom:4px}` +
                                `.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:14px}` +
                                `table{width:100%;border-collapse:collapse;margin-top:8px}` +
                                `th{background:#1e293b;color:#fff;padding:7px 10px;text-align:right;font-size:11px}` +
                                `th:first-child{text-align:left}` +
                                `td{padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px}` +
                                `td:first-child{text-align:left}` +
                                `tr:nth-child(even)td{background:#f8fafc}` +
                                `.total-row td{font-weight:bold;background:#1e293b!important;color:#fff!important;font-size:12px;padding:8px 10px}` +
                                `@media print{body{padding:0}}` +
                                `</style></head><body>${content}</body></html>`
                            );
                            win.document.close();
                            setTimeout(() => win.print(), 400);
                        }} style={{ marginLeft: 'auto' }}>
                            🖨️ Print A4
                        </button>
                    )}
                  </div>

                  {!isMinimized && (activeTab === 'daily' || activeTab === 'invoices') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🕐 Time Range
                        </span>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={timeInputStyle} />
                        <span style={{ color: '#64748b', fontSize: '15px', fontWeight: 600 }}>to</span>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={timeInputStyle} />
                        {(startTime || endTime) ? (
                            <button className="btn btn-secondary" onClick={() => { setStartTime(''); setEndTime(''); }}
                                title="Clear time filter" style={{ padding: '5px 12px', fontSize: '13px' }}>
                                Clear ✕
                            </button>
                        ) : (
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Showing whole day</span>
                        )}
                    </div>
                  )}
                </div>
            )}

            <div className="report-content">
                {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>⏳ Loading Data...</div>}

                {/* ==================== DAILY REPORT ==================== */}
                {!loading && activeTab === 'daily' && dailyReport && !dailyReport.error && (
                    <div ref={printRef}>
                        {/* Print Header */}
                        <div className="header" style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '2px solid #1e40af', paddingBottom: '10px' }}>
                            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>Al-Touheed Garments</h1>
                            <div style={{ color: '#374151', marginTop: '4px' }}>
                                Daily Report: <strong>{startDate === endDate ? reformatDateDisplay(startDate) : `${reformatDateDisplay(startDate)} to ${reformatDateDisplay(endDate)}`}</strong>
                                {(startTime || endTime) && (
                                    <strong> ({startTime || '00:00'} – {endTime || '23:59'})</strong>
                                )}
                                {selectedUser !== 'all' && (
                                    <strong style={{ color: '#1e40af' }}> — {userList.find(u => String(u.id) === String(selectedUser))?.username || 'User'}</strong>
                                )}
                            </div>
                        </div>



                        {/* Summary Cards (Screen View) */}
                        <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                            {/* Row 1: Total Sales (full width) */}
                            <div className="summary-card" style={{ gridColumn: '1 / -1', padding: '16px 20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Sales</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', marginTop: '2px' }}>{fmt(dailyReport.summary.totalSales)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '15px', color: '#6b7280' }}>{dailyReport.sales.length} invoice{dailyReport.sales.length !== 1 ? 's' : ''}</div>
                                    <div style={{ fontSize: '15px', color: '#6b7280' }}>{dailyReport.summary.totalSoldItems || 0} items</div>
                                </div>
                            </div>
                            {/* Row 2: Net Cash | Total Returns | Credit Invoices */}
                            {[
                                { label: <strong style={{ color: 'black !important' }}>Net Cash in Hand</strong>, value: <strong style={{ color: 'black !important' }}>{fmt(dailyReport.summary.netCash)}</strong> },
                                { label: 'Total Returns', value: fmt(dailyReport.summary.totalReturns), extra: `${dailyReport.summary.totalReturnedItems || 0} items`, color: '#ef4444' },
                                { label: 'Credit Invoices (Unpaid)', value: fmt(dailyReport.summary.totalCredit || 0), color: '#d97706' },
                            ].map((card, i) => (
                                <div key={i} className="summary-card" style={{ padding: '14px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `4px solid ${card.color}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: card.color, marginTop: '4px' }}>{card.value}</div>
                                        </div>
                                        {card.extra && <div style={{ fontSize: '15px', color: '#6b7280', marginTop: 'auto' }}>{card.extra}</div>}
                                    </div>
                                </div>
                            ))}

                            {/* Digital Breakdown Cards */}
                            {Object.entries(dailyReport.summary.digitalBreakdown || {}).map(([method, data], i) => (
                                <div
                                    key={`dig-${i}`}
                                    className="summary-card"
                                    onClick={() => setFilterMethod(filterMethod === method ? null : method)}
                                    style={{
                                        padding: '14px',
                                        background: filterMethod === method ? '#ddd6fe' : 'white',
                                        borderRadius: '8px',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                        borderLeft: '4px solid #8b5cf6',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{method}</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '4px' }}>{fmt(data.amount)}</div>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: 'auto' }}>
                                            {data.count} payment{data.count !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    {filterMethod === method && (
                                        <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '4px' }}>✓ FILTERING ACTIVE</div>
                                    )}
                                </div>
                            ))}

                            {(!dailyReport.summary.digitalBreakdown || Object.keys(dailyReport.summary.digitalBreakdown).length === 0) && (
                                <div className="summary-card" style={{ padding: '14px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #8b5cf6' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Digital Payments</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '4px' }}>{fmt(0)}</div>
                                </div>
                            )}
                            {/* Net Profit — toggled */}
                            {showProfit && (
                                <div className="summary-card" style={{ gridColumn: '1 / -1', padding: '14px 20px', background: '#f0fdf4', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #059669', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#059669', marginTop: '2px' }}>{fmt(dailyReport.summary.netProfit)}</div>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Profit lost on returns: {fmt(dailyReport.summary.profitLostOnReturns)}</div>
                                </div>
                            )}
                        </div>

                        {/* Individual Payment List (Visible when Filtering on Screen) */}
                        {filterMethod && (
                            <div className="digital-detail-panel" style={{ marginBottom: '20px', padding: '15px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ fontSize: '14px', margin: 0, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>📊 Transaction breakdown: {filterMethod}</span>
                                    </h3>
                                    <button
                                        onClick={() => setFilterMethod(null)}
                                        style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Dismiss Detail ✕
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {dailyReport.sales
                                        .filter(sale => sale.breakdown && sale.breakdown[filterMethod])
                                        .map((sale, i) => (
                                            <div key={i} style={{ background: 'white', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{i + 1})</span>
                                                    <span style={{ fontWeight: 'bold', color: '#111827', fontSize: '14px' }}>{Math.round(typeof sale.breakdown[filterMethod] === 'object' ? sale.breakdown[filterMethod].amount : sale.breakdown[filterMethod])}</span>
                                                </div>
                                                <span style={{ fontSize: '11px', color: '#6b7280', borderLeft: '1px solid #e5e7eb', paddingLeft: '8px' }}>Inv #{sale.invoice_no || sale.id}</span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}

                        {/* Sales Invoices Header with Filtering info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '6px', borderBottom: '2px solid #1e40af' }}>
                            <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e3a8a', margin: 0 }}>
                                {filterMethod ? `🔍 Filtering: ${filterMethod}` : `🧾 Sales Invoices`} ({
                                    (dailyReport.sales || [])
                                        .filter(sale => !filterMethod || (sale.payment_method && sale.payment_method.toLowerCase().includes(filterMethod.toLowerCase())))
                                        .length
                                })
                            </h2>
                            {filterMethod && (
                                <button
                                    onClick={() => setFilterMethod(null)}
                                    style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                >
                                    Clear Filter ✕
                                </button>
                            )}
                        </div>


                        {dailyReport.sales.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '8px', marginBottom: '16px' }}>
                                No sales for this period.
                            </div>
                        )}

                        {dailyReport.sales
                            .filter(sale => !filterMethod || (sale.payment_method && sale.payment_method.toLowerCase().includes(filterMethod.toLowerCase())))
                            .map((sale, idx) => (
                                <div key={idx} className="invoice-block" style={{ marginBottom: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ background: '#eff6ff', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #bfdbfe' }}>
                                        <div>
                                            <strong style={{ fontSize: '14px', color: '#1e40af' }}>Invoice #{sale.invoice_no || sale.id}</strong>
                                            {sale.customer_name && <span style={{ marginLeft: '10px', color: '#374151' }}>{sale.customer_name}</span>}
                                            {sale.sold_by && selectedUser === 'all' && <span style={{ marginLeft: '10px', fontSize: '11px', color: '#6b7280', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>👤 {sale.sold_by}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#6b7280' }}>{reformatDateDisplay(sale.sale_date)} {fmtTime(sale.created_at)}</span>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                                background: (sale.displayType === 'Return Invoice' || sale.billAmt < 0) ? '#fee2e2' : (sale.payment_method && (
                                                    sale.payment_method.toLowerCase().includes('jazzcash') ||
                                                    sale.payment_method.toLowerCase().includes('easypais') ||
                                                    sale.payment_method.toLowerCase().includes('raast') ||
                                                    sale.payment_method.toLowerCase().includes('bank') ||
                                                    sale.payment_method.toLowerCase().includes('transfer')
                                                )) ? '#dbeafe' : '#d1fae5',
                                                color: (sale.displayType === 'Return Invoice' || sale.billAmt < 0) ? '#991b1b' : (sale.payment_method && (
                                                    sale.payment_method.toLowerCase().includes('jazzcash') ||
                                                    sale.payment_method.toLowerCase().includes('easypais') ||
                                                    sale.payment_method.toLowerCase().includes('raast') ||
                                                    sale.payment_method.toLowerCase().includes('bank') ||
                                                    sale.payment_method.toLowerCase().includes('transfer')
                                                )) ? '#1e40af' : '#065f46'
                                            }}>
                                                {sale.displayType || sale.payment_method || 'Cash'}
                                            </span>
                                        </div>
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f3f4f6' }}>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Item Code</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Description</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Qty</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Rate</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Amount</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Profit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sale.items.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' }}>{item.item_code}</td>
                                                    <td style={{ padding: '5px 10px', color: '#374151' }}>{item.item_description}</td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{item.quantity}</td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{fmt(item.sale_rate)}</td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 'bold' }}>{fmt(item.amount)}</td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right', color: '#10b981' }}>{fmt(item.profit)}</td>
                                                </tr>
                                            ))}
                                            <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                                                <td colSpan="2" style={{ padding: '6px 10px', fontWeight: 'bold' }}>
                                                    Totals — {sale.total_quantity} items
                                                    {sale.misc_charges > 0 && <span style={{ color: '#059669', marginLeft: '8px' }}> — Misc: {fmt(sale.misc_charges)}</span>}
                                                    {sale.discount > 0 && <span style={{ color: '#ef4444', marginLeft: '8px' }}> — Discount: {fmt(sale.discount)}</span>}
                                                </td>
                                                <td></td>
                                                <td></td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1e40af' }}>{fmt(sale.total_amount + (sale.misc_charges || 0) - (sale.discount || 0))}</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>{fmt(sale.profit)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            ))}

                        {/* Returns Section */}
                        {dailyReport.returns.length > 0 && (
                            <>
                                <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', paddingBottom: '6px', borderBottom: '2px solid #ef4444', color: '#991b1b', marginTop: '20px' }}>
                                    ↩️ Sales Returns ({dailyReport.returns.length})
                                </h2>
                                {dailyReport.returns.map((ret, idx) => (
                                    <div key={idx} className="return-block" style={{ marginBottom: '14px', border: '1px solid #fecaca', borderRadius: '8px', overflow: 'hidden' }}>
                                        <div style={{ background: '#fff0f0', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fecaca' }}>
                                            <div>
                                                <strong style={{ fontSize: '14px', color: '#991b1b' }}>Return #{ret.return_no || ret.id}</strong>
                                                <span style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginTop: '2px' }}>Against Inv #{ret.invoice_no}</span>
                                                {ret.customer_name && <span style={{ marginLeft: '10px', color: '#374151' }}>{ret.customer_name}</span>}
                                            </div>
                                            <span style={{ fontSize: '12px', color: '#6b7280' }}>{reformatDateDisplay(ret.return_date)} {fmtTime(ret.created_at)}</span>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#fef2f2' }}>
                                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Item Code</th>
                                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Description</th>
                                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Qty</th>
                                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Rate</th>
                                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#374151', fontWeight: '600' }}>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ret.items.map((item, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                                                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' }}>{item.item_code}</td>
                                                        <td style={{ padding: '5px 10px', color: '#374151' }}>{item.item_description}</td>
                                                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{item.quantity}</td>
                                                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{fmt(item.sale_rate)}</td>
                                                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>{fmt(item.amount)}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ background: '#fff0f0', borderTop: '2px solid #fecaca' }}>
                                                    <td colSpan="4" style={{ padding: '6px 10px', fontWeight: 'bold' }}>Total Returned</td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>{fmt(ret.total_amount)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </>
                        )}

                        {/* Print Footer */}
                        <div className="print-footer" style={{ marginTop: '20px', padding: '12px', background: '#f9fafb', borderRadius: '8px', borderTop: '2px solid #e5e7eb' }}>
                            <table className="summary-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Total Sales</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>{fmt(dailyReport.summary.totalSales)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Total Returns</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>{fmt(dailyReport.summary.totalReturns)}</td></tr>
                                    <tr style={{ borderTop: '2px solid #d1d5db' }}><td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: '14px' }}>Net Sales</td><td style={{ padding: '6px 8px', textAlign: 'right', color: '#1e40af', fontWeight: 'bold', fontSize: '14px' }}>{fmt(dailyReport.summary.netSales)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px' }}>Cash Collected (from sales)</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#d97706', fontWeight: '600' }}>{fmt(dailyReport.summary.totalCash)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px' }}>Cash Refunded (returns)</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>− {fmt(dailyReport.summary.totalReturns)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Net Cash in Hand</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#f59e0b', fontWeight: 'bold' }}>{fmt(dailyReport.summary.netCash)}</td></tr>

                                    {Object.entries(dailyReport.summary.digitalBreakdown || {}).map(([method, data], i) => (
                                        <tr key={i}>
                                            <td style={{ padding: '4px 8px', paddingLeft: '20px', color: '#6b7280' }}>↳ {method} ({data.count})</td>
                                            <td style={{ padding: '4px 8px', textAlign: 'right', color: '#7c3aed' }}>{fmt(data.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Total Digital Payments</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#7c3aed', fontWeight: 'bold' }}>{fmt(dailyReport.summary.totalDigital)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px' }}>Gross Profit</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#6b7280', fontWeight: '600' }}>{fmt(dailyReport.summary.grossProfit)}</td></tr>
                                    <tr><td style={{ padding: '4px 8px' }}>Profit Lost on Returns</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>− {fmt(dailyReport.summary.profitLostOnReturns)}</td></tr>
                                    <tr style={{ borderTop: '2px solid #d1d5db' }}><td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: '14px' }}>Net Profit</td><td style={{ padding: '6px 8px', textAlign: 'right', color: '#059669', fontWeight: 'bold', fontSize: '14px' }}>{fmt(dailyReport.summary.netProfit)}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ==================== INVOICE SUMMARY ==================== */}
                {!loading && activeTab === 'invoices' && dailyReport && !dailyReport.error && (
                    <div ref={printRef} style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div className="header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '20px', marginBottom: '12px', borderBottom: '2px solid #ccc', paddingBottom: '8px' }}>
                            <h2 style={{ fontSize: '18px', margin: 0 }}>Invoice Summary</h2>
                            <div style={{ color: '#555' }}>Date: {startDate === endDate ? reformatDateDisplay(startDate) : `${reformatDateDisplay(startDate)} to ${reformatDateDisplay(endDate)}`}</div>
                        </div>

                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Total Return: {dailyReport.summary.totalReturnedItems || 0}
                        </div>

                        <table className="invoice-summary-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                            <thead>
                                <tr>
                                    <th style={{ background: '#f3f4f6', color: '#374151', padding: '5px 6px', borderBottom: '2px solid #d1d5db', textAlign: 'left' }}>#No</th>
                                    <th style={{ background: '#f3f4f6', color: '#374151', padding: '5px 6px', borderBottom: '2px solid #d1d5db', textAlign: 'left' }}>Time</th>
                                    <th style={{ background: '#f3f4f6', color: '#374151', padding: '5px 6px', borderBottom: '2px solid #d1d5db', textAlign: 'left' }}>Bill (Items)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyReport.sales.map((sale, i) => {
                                    const prev = dailyReport.sales[i - 1];
                                    // For a multi-day range, write the date at the start of each day's
                                    // group — including the very first batch.
                                    const multiDate = startDate !== endDate;
                                    const showDate = multiDate && (i === 0 || sale.sale_date !== prev.sale_date);
                                    return (
                                        <React.Fragment key={sale.id}>
                                            {showDate && (
                                                <tr className="inv-date-row">
                                                    <td colSpan="3" style={{ padding: '7px 6px 2px', borderTop: '2px solid #d1d5db' }}>
                                                        <span style={{ fontWeight: 'bold', fontSize: '17px', color: '#111827' }}>{reformatDateDisplay(sale.sale_date)}</span>
                                                        <span style={{ marginLeft: '40px', fontWeight: 'bold', fontSize: '17px', color: '#991b1b' }}>Returns: {invoiceReturnsByDate[sale.sale_date] || 0}</span>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                                <td style={{ padding: '3px 6px', fontWeight: 'bold' }}>{sale.invoice_no || sale.id}</td>
                                                <td style={{ padding: '3px 6px' }}>{fmtTime(sale.created_at)}</td>
                                                <td style={{ padding: '3px 6px' }}>{sale.total_quantity || 0} item{(sale.total_quantity || 0) !== 1 ? 's' : ''}</td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                                {dailyReport.sales.length === 0 && (
                                    <tr>
                                        <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No invoices found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '15px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '2px solid #ccc', paddingTop: '10px' }}>
                            Total Bill: {dailyReport.sales.length}
                        </div>
                    </div>
                )}

                {!loading && activeTab === 'daily' && dailyReport?.error && (
                    <div style={{ padding: '20px', color: '#ef4444', background: '#fef2f2', borderRadius: '8px' }}>Error: {dailyReport.error}</div>
                )}

                {/* ==================== SALES SUMMARY ==================== */}
                {!loading && activeTab === 'sales' && salesReport && (
                    <div className="sales-report">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                            {[
                                { label: 'Total Sales', value: fmt(salesReport.total_sales), color: '#10b981' },
                                { label: 'Total Profit', value: fmt(salesReport.total_profit), color: '#3b82f6' },
                                { label: 'Invoices', value: salesReport.total_invoices || 0, color: '#6b7280' },
                                { label: 'Items Sold', value: salesReport.total_items || 0, color: '#6b7280' },
                            ].map((card, i) => (
                                <div key={i} style={{ padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{card.label}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: card.color }}>{card.value}</div>
                                </div>
                            ))}
                        </div>
                        <table className="users-table">
                            <thead><tr><th>Date</th><th>Invoices</th><th>Total Sales</th><th>Avg Sale</th></tr></thead>
                            <tbody>
                                {(salesReport.daily || []).map((day, idx) => (
                                    <tr key={idx}>
                                        <td>{reformatDateDisplay(day.sale_date)}</td>
                                        <td>{day.invoices}</td>
                                        <td>{fmt(day.sales)}</td>
                                        <td>{fmt(day.sales / day.invoices)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ==================== STOCK VALUE ==================== */}
                {!loading && activeTab === 'stock' && stockReport && (
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '20px' }}>
                            {[
                                { label: 'Stock Value (Cost)', value: fmt(stockReport.total_purchase_value), color: '#ef4444' },
                                { label: 'Stock Value (Sale)', value: fmt(stockReport.total_sale_value), color: '#10b981' },
                                { label: 'Items in Stock', value: stockReport.total_items_in_stock || 0, color: '#3b82f6' },
                            ].map((card, i) => (
                                <div key={i} style={{ padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{card.label}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: card.color }}>{card.value}</div>
                                </div>
                            ))}
                        </div>
                        <p style={{ color: '#6b7280', fontSize: '12px' }}>* Values based on current stock levels and configured rates.</p>
                    </div>
                )}

                {/* ==================== USER PERFORMANCE ==================== */}
                {!loading && activeTab === 'users' && userReport && (
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>User</th><th>Invoices</th><th>Items Sold</th><th>Total Sales</th>
                                <th>Returns</th><th>Net Sales</th><th>Cash</th><th>Digital</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {userReport.map((user, idx) => (
                                <React.Fragment key={idx}>
                                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedUser(expandedUser === user.user ? null : user.user)}>
                                        <td style={{ fontWeight: 'bold' }}>{user.user}</td>
                                        <td>{user.invoices_count}</td>
                                        <td>{user.items_sold}</td>
                                        <td style={{ color: '#10b981', fontWeight: 'bold' }}>{fmt(user.total_sales)}</td>
                                        <td style={{ color: '#ef4444' }}>{fmt(user.total_returns)}</td>
                                        <td style={{ fontWeight: 'bold' }}>{fmt(user.net_sales)}</td>
                                        <td>{fmt(user.cash_sales)}</td>
                                        <td>{fmt(user.digital_sales)}</td>
                                        <td><button className="btn-icon">{expandedUser === user.user ? '▲' : '▼'}</button></td>
                                    </tr>
                                    {expandedUser === user.user && (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '15px', background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                                {/* User Digital Breakdown */}
                                                <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                    {Object.entries(user.digital_breakdown || {}).map(([method, data], i) => (
                                                        <div key={i} style={{ background: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                                <div>
                                                                    <span style={{ fontSize: '10px', color: '#6b7280', display: 'block' }}>{method}</span>
                                                                    <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>{fmt(data.amount)}</span>
                                                                </div>
                                                                <span style={{ fontSize: '12px', color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                                                                    {data.count} payments
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!user.digital_breakdown || Object.keys(user.digital_breakdown).length === 0) && (
                                                        <div style={{ color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>No digital payments recorded.</div>
                                                    )}
                                                </div>

                                                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white' }}>
                                                    <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                                        <thead>
                                                            <tr style={{ background: '#e5e7eb' }}>
                                                                <th>Time</th><th>Invoice #</th><th>Items</th><th>Amount</th><th>Method</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {user.invoices_list.map((inv, i) => (
                                                                <tr key={i}>
                                                                    <td>{fmtTime(inv.created_at)}</td>
                                                                    <td>{inv.invoice_no}</td>
                                                                    <td>{inv.total_quantity}</td>
                                                                    <td>{fmt(inv.total_amount)}</td>
                                                                    <td>{inv.payment_method}</td>
                                                                </tr>
                                                            ))}
                                                            {user.invoices_list.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>No invoices found.</td></tr>}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* ==================== DATE SUMMARY REPORT ==================== */}
                {!loading && activeTab === 'summary' && dateSummary && !dateSummary.error && (
                    <div ref={dateSummaryPrintRef}>
                        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: 2 }}>Al-Touheed Garments</h1>
                        <div className="subtitle" style={{ color: '#6b7280', marginBottom: 16, fontSize: '13px' }}>
                            Date Summary Report &mdash; {reformatDateDisplay(startDate)} to {reformatDateDisplay(endDate)}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#1e293b', color: 'white' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Sales</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Return Amt</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Return Items</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Net Cash</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Digital</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dateSummary.rows.map((row, i) => (
                                    <tr key={row.day} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '8px 14px', fontWeight: 600 }}>{reformatDateDisplay(row.day)}</td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmt(row.totalSales)}</td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', color: row.returnAmount > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600 }}>
                                            {row.returnAmount > 0 ? fmt(row.returnAmount) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', color: row.returnItems > 0 ? '#dc2626' : '#9ca3af' }}>
                                            {row.returnItems > 0 ? row.returnItems : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right' }}>{fmt(row.totalCash)}</td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', color: row.totalDigital > 0 ? '#1d4ed8' : '#9ca3af', fontWeight: row.totalDigital > 0 ? 600 : 400 }}>
                                            {row.totalDigital > 0 ? fmt(row.totalDigital) : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {dateSummary.rows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>
                                            No data for selected date range.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {dateSummary.rows.length > 0 && dateSummary.totals && (
                                <tfoot>
                                    <tr className="total-row" style={{ background: '#0f172a', color: '#fff', fontSize: '1rem', fontWeight: 800 }}>
                                        <td style={{ padding: '11px 14px' }}>TOTAL ({dateSummary.rows.length} day{dateSummary.rows.length !== 1 ? 's' : ''})</td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6ee7b7' }}>{fmt(dateSummary.totals.totalSales)}</td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right', color: dateSummary.totals.returnAmount > 0 ? '#fca5a5' : '#6b7280' }}>
                                            {dateSummary.totals.returnAmount > 0 ? fmt(dateSummary.totals.returnAmount) : '—'}
                                        </td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right', color: dateSummary.totals.returnItems > 0 ? '#fca5a5' : '#6b7280' }}>
                                            {dateSummary.totals.returnItems > 0 ? dateSummary.totals.returnItems : '—'}
                                        </td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right' }}>{fmt(dateSummary.totals.totalCash)}</td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right', color: dateSummary.totals.totalDigital > 0 ? '#93c5fd' : '#6b7280' }}>
                                            {dateSummary.totals.totalDigital > 0 ? fmt(dateSummary.totals.totalDigital) : '—'}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
                {!loading && activeTab === 'summary' && dateSummary?.error && (
                    <div style={{ color: '#dc2626', padding: '20px' }}>Error loading report: {dateSummary.error}</div>
                )}
            </div>
        </div>
    );
}

export default React.memo(Reports, (prev, next) => prev.currentUser === next.currentUser);
