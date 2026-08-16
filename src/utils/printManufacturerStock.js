const { ipcRenderer } = window.require('electron');

export function buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances = {}, showSupplierBalance = true) {
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const priceModeText = priceMode === 'actual' ? 'Actual Cost' : 'Purchase Price';

  const fmt = (n) => Math.round(n || 0).toLocaleString();
  const fmt2 = (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let suppliersHtml = '';

  groups.forEach(sup => {
    const balKey = (sup.name || '').trim().toLowerCase();
    const balance = supplierBalances[balKey];
    let balText = '';
    if (showSupplierBalance && balance !== undefined) {
      const netBal = balance - (sup.totalValue || 0);
      const supBalLabel = balance > 0 ? 'Cr (Dene Hain)' : balance < 0 ? 'Dr (Lene Hain)' : 'Nil';
      const netBalLabel = netBal > 0 ? 'Cr (Dene Hain)' : netBal < 0 ? 'Dr (Lene Hain)' : 'Nil';
      balText = ` | Sup Bal: ${fmt2(Math.abs(balance))} ${supBalLabel} | Stock in Hand: ${fmt2(Math.abs(netBal))} ${netBalLabel}`;
    }

    let categoriesHtml = '';

    sup.categories.forEach(cat => {
      let itemsHtml = cat.items.map(item => `
        <tr>
          <td style="border: 1px solid #000; padding: 4px 5px; font-weight: 900; text-align: center; font-size: 13px; color: #000;">${item.item_code}</td>
          <td style="border: 1px solid #000; padding: 4px 5px; font-size: 13px; font-weight: 600; white-space: normal; word-break: break-word;">
            ${`${item.description || ''} ${item.category || ''} ${item.size_range || ''} ${item.gender || ''}`.replace(/\s+/g, ' ').trim()}
          </td>
          <td style="border: 1px solid #000; padding: 4px 5px; text-align: center; font-weight: 900; font-size: 13.5px;">${fmt(item.qty)}</td>
          <td style="border: 1px solid #000; padding: 4px 5px; text-align: right; font-size: 13px; font-weight: bold;">${fmt2(Math.round((item.rate || 0) * 100) / 100)}</td>
          <td style="border: 1px solid #000; padding: 4px 5px; text-align: right; font-weight: 900; font-size: 13px; color: #000;">${fmt2(Math.round((item.sale_rate || 0) * 100) / 100)}</td>
          <td style="border: 1px solid #000; padding: 4px 5px; text-align: right; font-weight: 900; font-size: 13.5px;">${fmt(item.value)}</td>
        </tr>
      `).join('');

      categoriesHtml += `
        <tr style="background: #f1f5f9; font-weight: 900; font-size: 14px;">
          <td colSpan="2" style="border: 1px solid #000; padding: 6px 8px;">CATEGORY: ${cat.name}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${fmt(cat.totalQty)}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;"></td>
          <td style="border: 1px solid #000; padding: 6px 8px;"></td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${fmt(cat.totalValue)}</td>
        </tr>
        ${itemsHtml}
      `;
    });

    suppliersHtml += `
      <div style="margin-bottom: 20px;">
        <div style="background: #e2e8f0; border: 1.5px solid #000; padding: 8px 12px; font-weight: 900; font-size: 14.5px; display: flex; justify-content: space-between; page-break-after: avoid; break-after: avoid;">
          <span>SUPPLIER: ${sup.name}${balText}</span>
          <span>Total Qty: ${fmt(sup.totalQty)} | Total Amount: PKR ${fmt(sup.totalValue)}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: -1px;">
          <thead>
            <tr style="background: #f1f5f9; font-weight: 900; border: 1px solid #000; font-size: 13px;">
              <th style="border: 1px solid #000; padding: 5px; width: 70px; text-align: center;">Item Code</th>
              <th style="border: 1px solid #000; padding: 5px; text-align: left;">Description / Brand</th>
              <th style="border: 1px solid #000; padding: 5px; width: 45px; text-align: center;">Qty</th>
              <th style="border: 1px solid #000; padding: 5px; width: 65px; text-align: right;">Cost Rate</th>
              <th style="border: 1px solid #000; padding: 5px; width: 65px; text-align: right;">Sale Rate</th>
              <th style="border: 1px solid #000; padding: 5px; width: 80px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${categoriesHtml}
            <tr style="background: #e2e8f0; font-weight: 900; font-size: 14px;">
              <td colSpan="2" style="border: 1px solid #000; padding: 6px 8px; text-align: right;">Supplier Subtotal:</td>
              <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${fmt(sup.totalQty)}</td>
              <td style="border: 1px solid #000; padding: 6px 8px;"></td>
              <td style="border: 1px solid #000; padding: 6px 8px;"></td>
              <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${fmt(sup.totalValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  });

  let supplierBalancesSummaryHtml = '';
  if (showSupplierBalance && Object.keys(supplierBalances).length > 0) {
    const filteredBals = Object.entries(supplierBalances)
      .filter(([name]) => groups.some(g => (g.name || '').trim().toLowerCase() === name))
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (filteredBals.length > 0) {
      const totalPayable = filteredBals.filter(([, b]) => (parseFloat(b) || 0) > 0).reduce((sum, [, b]) => sum + (parseFloat(b) || 0), 0);
      const totalReceivable = filteredBals.filter(([, b]) => (parseFloat(b) || 0) < 0).reduce((sum, [, b]) => sum + Math.abs(parseFloat(b) || 0), 0);
      const netBal = totalPayable - totalReceivable;

      const rowsHtml = filteredBals.map(([name, bal]) => {
        const typeLabel = bal > 0 ? 'Dene Hain (Cr)' : bal < 0 ? 'Lene Hain (Dr)' : 'Nil';
        const amtLabel = bal > 0 ? 'Cr (Dene Hain)' : bal < 0 ? 'Dr (Lene Hain)' : 'Nil';
        return `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px; font-size: 13.5px; font-weight: 600; text-transform: uppercase;">${(name || '').toUpperCase()}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center; font-size: 13.5px; font-weight: bold;">${typeLabel}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 900; font-size: 14px;">${fmt2(Math.abs(bal))} ${amtLabel}</td>
        </tr>
      `;
      }).join('');

      supplierBalancesSummaryHtml = `
        <div style="margin-top: 20px; page-break-inside: avoid;">
          <div style="background: #e2e8f0; border: 1.5px solid #000; padding: 8px 12px; font-weight: 900; font-size: 14.5px;">
            SUPPLIER LEDGER BALANCES SUMMARY
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: -1px;">
            <thead>
              <tr style="background: #f1f5f9; font-weight: 900; font-size: 13.5px;">
                <th style="border: 1px solid #000; padding: 6px; text-align: left;">Supplier Name</th>
                <th style="border: 1px solid #000; padding: 6px; width: 140px; text-align: center;">Balance Type</th>
                <th style="border: 1px solid #000; padding: 6px; width: 180px; text-align: right;">Stock in Hand / Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: 900; font-size: 13.5px;">
                <td colSpan="2" style="border: 1px solid #000; padding: 6px 8px; text-align: right;">TOTAL PAYABLE — DENE HAIN (Cr):</td>
                <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; color: #15803d;">${fmt2(totalPayable)} Cr</td>
              </tr>
              <tr style="background: #f1f5f9; font-weight: 900; font-size: 13.5px;">
                <td colSpan="2" style="border: 1px solid #000; padding: 6px 8px; text-align: right;">TOTAL RECEIVABLE / ADVANCE — LENE HAIN (Dr):</td>
                <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; color: #dc2626;">${fmt2(totalReceivable)} Dr</td>
              </tr>
              <tr style="background: #e2e8f0; font-weight: 900; font-size: 14px;">
                <td colSpan="2" style="border: 1px solid #000; padding: 6px 8px; text-align: right;">STOCK IN HAND (${netBal >= 0 ? 'TOTAL PAYABLE — DENE HAIN' : 'TOTAL RECEIVABLE — LENE HAIN'}):</td>
                <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${fmt2(Math.abs(netBal))} ${netBal >= 0 ? 'Cr (Dene Hain)' : 'Dr (Lene Hain)'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }
  }

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Manufacturer Stock Report</title>
    <style>
      @media print {
        @page { size: A4; margin: 8mm; }
        body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 13px; font-weight: bold; -webkit-print-color-adjust: exact; }
        .no-print { display: none !important; }
        td, th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        thead { display: table-header-group; }
      }
      body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 15px; font-size: 13px; font-weight: bold; }
      
      .no-print-bar {
        position: sticky;
        top: 0;
        background: #1e293b;
        color: #fff;
        padding: 10px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: -15px -15px 15px -15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 9999;
      }
      .print-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        padding: 8px 18px;
        font-size: 14px;
        font-weight: bold;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
      }
      .print-btn:hover { background: #1d4ed8; }

      .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
      .company-name { font-size: 26px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px; color: #000; }
      .company-sub { font-size: 12px; color: #000; margin: 3px 0; font-weight: bold; }
      .doc-title { display: inline-block; border: 1.5px solid #000; background: #fff; color: #000; padding: 4px 20px; font-size: 14px; font-weight: 900; margin-top: 6px; letter-spacing: 1px; text-transform: uppercase; }
      
      .summary-header { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
      .summary-header td { padding: 6px 10px; border: 1.5px solid #000; }
    </style>
  </head>
  <body>
    <!-- Top Action Bar for Print Preview -->
    <div class="no-print-bar no-print">
      <span style="font-weight: bold; font-size: 14px;">Print Preview - Manufacturer Stock Report</span>
      <button class="print-btn" onclick="window.print()">🖨️ Click Here to Print (Select Printer)</button>
    </div>

    <div class="header-box">
      <h1 class="company-name">AL - TOUHEED GARMENTS</h1>
      <div class="company-sub">Shop 2 & 3, Ground Floor Al Mumtaz Centre, Chowk Rang Mahal, Lahore</div>
      <div class="doc-title">MANUFACTURER / SUPPLIER STOCK IN HAND REPORT</div>
    </div>

    <table class="summary-header">
      <tr style="background: #f8fafc;">
        <td style="width: 25%;"><b>Report Date:</b> ${dateStr}</td>
        <td style="width: 25%;"><b>Valuation:</b> ${priceModeText}</td>
        <td style="width: 25%;"><b>Total Stock Qty:</b> ${fmt(grandQty)}</td>
        <td style="width: 25%; font-size: 13px; font-weight: 900; text-align: right;"><b>Grand Total Value:</b> PKR ${fmt(grandValue)}</td>
      </tr>
    </table>

    ${suppliersHtml}
    ${supplierBalancesSummaryHtml}
  </body>
  </html>
  `;
}

export async function printManufacturerStock(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance = true) {
  const html = buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance);
  try {
    return await ipcRenderer.invoke('print-manufacturer-stock-html', { html });
  } catch (err) {
    console.error('Print failed:', err);
    return { success: false, error: err.message };
  }
}

export async function saveManufacturerStockPDF(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance = true) {
  const html = buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances, showSupplierBalance);
  const filename = `Manufacturer_Stock_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  try {
    return await ipcRenderer.invoke('save-manufacturer-stock-pdf', { html, filename });
  } catch (err) {
    console.error('Save PDF failed:', err);
    return { success: false, error: err.message };
  }
}
