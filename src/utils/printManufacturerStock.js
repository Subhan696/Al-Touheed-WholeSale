const { ipcRenderer } = window.require('electron');

export function buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances = {}) {
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const priceModeText = priceMode === 'actual' ? 'Actual Cost' : 'List Price';

  const fmt = (n) => Math.round(n || 0).toLocaleString();
  const fmt2 = (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let suppliersHtml = '';

  groups.forEach(sup => {
    const balKey = (sup.name || '').trim().toLowerCase();
    const balance = supplierBalances[balKey];
    let balText = '';
    if (balance !== undefined) {
      balText = ` | Balance: ${fmt2(Math.abs(balance))} ${balance >= 0 ? 'Cr' : 'Dr'}`;
    }

    let categoriesHtml = '';

    sup.categories.forEach(cat => {
      let itemsHtml = cat.items.map(item => `
        <tr>
          <td style="border: 1px solid #000; padding: 3px 4px; font-family: monospace; font-weight: bold; text-align: center;">${item.item_code}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
            ${`${item.description || ''} ${item.category || ''} ${item.size_range || ''} ${item.gender || ''}`.replace(/\s+/g, ' ').trim()}
          </td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: center; font-weight: bold;">${fmt(item.qty)}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right;">${fmt2(Math.round((item.rate || 0) * 100) / 100)}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right;">${fmt2(Math.round((item.sale_rate || 0) * 100) / 100)}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right; font-weight: bold;">${fmt(item.value)}</td>
        </tr>
      `).join('');

      categoriesHtml += `
        <tr style="background: #f1f5f9; font-weight: bold;">
          <td colSpan="2" style="border: 1px solid #000; padding: 5px 6px;">CATEGORY: ${cat.name}</td>
          <td style="border: 1px solid #000; padding: 5px; text-align: center;">${fmt(cat.totalQty)}</td>
          <td style="border: 1px solid #000; padding: 5px;"></td>
          <td style="border: 1px solid #000; padding: 5px;"></td>
          <td style="border: 1px solid #000; padding: 5px; text-align: right;">${fmt(cat.totalValue)}</td>
        </tr>
        ${itemsHtml}
      `;
    });

    suppliersHtml += `
      <div style="margin-bottom: 18px; page-break-inside: avoid;">
        <div style="background: #e2e8f0; border: 1.5px solid #000; padding: 6px 10px; font-weight: 900; font-size: 12px; display: flex; justify-content: space-between;">
          <span>SUPPLIER: ${sup.name}${balText}</span>
          <span>Total Qty: ${fmt(sup.totalQty)} | Total Value: PKR ${fmt(sup.totalValue)}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: -1px;">
          <thead>
            <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid #000;">
              <th style="border: 1px solid #000; padding: 5px; width: 95px; text-align: center;">Item Code</th>
              <th style="border: 1px solid #000; padding: 5px; text-align: left;">Description / Brand</th>
              <th style="border: 1px solid #000; padding: 5px; width: 65px; text-align: center;">Qty</th>
              <th style="border: 1px solid #000; padding: 5px; width: 85px; text-align: right;">Cost Rate</th>
              <th style="border: 1px solid #000; padding: 5px; width: 85px; text-align: right;">Sale Rate</th>
              <th style="border: 1px solid #000; padding: 5px; width: 100px; text-align: right;">Total Value</th>
            </tr>
          </thead>
          <tbody>
            ${categoriesHtml}
            <tr style="background: #e2e8f0; font-weight: 900;">
              <td colSpan="2" style="border: 1px solid #000; padding: 5px; text-align: right;">Supplier Subtotal:</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center;">${fmt(sup.totalQty)}</td>
              <td style="border: 1px solid #000; padding: 5px;"></td>
              <td style="border: 1px solid #000; padding: 5px;"></td>
              <td style="border: 1px solid #000; padding: 5px; text-align: right;">${fmt(sup.totalValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  });

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Manufacturer Stock Report</title>
    <style>
      @media print {
        @page { size: A4; margin: 8mm; }
        body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 11px; font-weight: bold; -webkit-print-color-adjust: exact; }
        .no-print { display: none !important; }
        td, th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      }
      body { font-family: 'Arial', sans-serif; color: #000; background: #fff; margin: 0; padding: 15px; font-size: 11px; font-weight: bold; }
      
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
      .company-name { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px; color: #000; }
      .company-sub { font-size: 11px; color: #000; margin: 3px 0; font-weight: bold; }
      .doc-title { display: inline-block; border: 1.5px solid #000; background: #fff; color: #000; padding: 3px 18px; font-size: 13px; font-weight: 900; margin-top: 6px; letter-spacing: 1px; text-transform: uppercase; }
      
      .summary-header { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
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
        <td style="width: 25%; font-size: 12px; font-weight: 900; text-align: right;"><b>Grand Total Value:</b> PKR ${fmt(grandValue)}</td>
      </tr>
    </table>

    ${suppliersHtml}
  </body>
  </html>
  `;
}

export async function printManufacturerStock(groups, grandQty, grandValue, priceMode, supplierBalances) {
  const html = buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances);
  try {
    return await ipcRenderer.invoke('print-manufacturer-stock-html', { html });
  } catch (err) {
    console.error('Print failed:', err);
    return { success: false, error: err.message };
  }
}

export async function saveManufacturerStockPDF(groups, grandQty, grandValue, priceMode, supplierBalances) {
  const html = buildManufacturerStockHTML(groups, grandQty, grandValue, priceMode, supplierBalances);
  const filename = `Manufacturer_Stock_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  try {
    return await ipcRenderer.invoke('save-manufacturer-stock-pdf', { html, filename });
  } catch (err) {
    console.error('Save PDF failed:', err);
    return { success: false, error: err.message };
  }
}
