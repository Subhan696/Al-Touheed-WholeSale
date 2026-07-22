import re

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace Header Details
header_target = """        {/* Card 1: Purchase Details */}
        <section className="form-card">
          <h3 className="card-title">Purchase Details</h3>
          <div className="details-row">
            <div className="form-group small-width">
              <label>Date</label>
              <input
                ref={dateRef}
                type="text"
                value={purchaseDate}
                onChange={handleDateChange}
                onKeyDown={e => handleHeaderKD(e, 'date')}
                placeholder="DD-MM-YYYY"
                className="form-input center-text"
              />
            </div>
            <div className="form-group small-width">
              <label>Invoice No</label>
              <input
                ref={invoiceRef}
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'invoice')}
                placeholder="Inv #"
                className="form-input"
              />
            </div>
            <div className="form-group medium-width">
              <label>Supplier Name *</label>
              <input
                ref={supplierRef}
                type="text"
                list="np-companies-list"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'supplier')}
                placeholder="Enter supplier name..."
                className="form-input"
              />
              <datalist id="np-companies-list">
                {companies.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group flex-grow">
              <label>Notes</label>
              <input
                ref={notesRef}
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onKeyDown={e => handleHeaderKD(e, 'notes')}
                placeholder="Remarks..."
                className="form-input"
              />
            </div>
          </div>
        </section>"""

header_repl = """        {/* Card 1: Purchase Details */}
        <section className="form-card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>Invoice No</label>
              <input ref={invoiceRef} type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'invoice')} placeholder="Inv #" className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>Date</label>
              <input ref={dateRef} type="text" value={purchaseDate} onChange={handleDateChange} onKeyDown={e => handleHeaderKD(e, 'date')} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Supplier Name *</label>
              <input ref={supplierRef} type="text" list="np-companies-list" value={supplierName} onChange={e => setSupplierName(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'supplier')} placeholder="Enter supplier name..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
              <datalist id="np-companies-list">{companies.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="form-group" style={{ width: 120 }}>
              <label style={{ fontSize: '0.75rem' }}>Supp. Inv #</label>
              <input type="text" value={supplierInvNo} onChange={e => setSupplierInvNo(e.target.value)} className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group" style={{ width: 100 }}>
              <label style={{ fontSize: '0.75rem' }}>S/Date</label>
              <input type="text" value={supplierDate} onChange={e => setSupplierDate(e.target.value)} placeholder="DD-MM-YYYY" className="form-input center-text" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Remarks</label>
              <input ref={notesRef} type="text" value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'notes')} placeholder="Remarks..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div className="form-group" style={{ width: 150 }}>
              <label style={{ fontSize: '0.75rem' }}>Vehicle No.</label>
              <input type="text" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
            <div className="form-group" style={{ width: 150 }}>
              <label style={{ fontSize: '0.75rem' }}>Godown</label>
              <input type="text" value={godown} onChange={e => setGodown(e.target.value)} className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
          </div>
        </section>"""
code = code.replace(header_target, header_repl)


grid_thead_target = """              <thead>
                <tr>
                  <th style={{ width: 34, textAlign: 'center' }}>#</th>
                  <th style={{ width: '14%' }}>Item Code</th>
                  <th>Description</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Packing</th>
                  <th style={{ width: '13%', textAlign: 'center' }}>Rate/Pkt</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>"""
grid_thead_repl = """              <thead>
                <tr style={{ fontSize: '0.75rem', height: 28 }}>
                  <th style={{ width: 24, textAlign: 'center', padding: '0 2px' }}>No.</th>
                  <th style={{ width: '10%', padding: '0 4px' }}>Alias Name</th>
                  <th style={{ padding: '0 4px' }}>Item Name</th>
                  <th style={{ width: 40, textAlign: 'center', padding: '0 2px' }}>Qty</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>Pre-Disc. Price</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Flat Discount</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>P. Price</th>
                  <th style={{ width: 50, textAlign: 'right', padding: '0 4px' }}>Disc%</th>
                  <th style={{ width: 60, textAlign: 'right', padding: '0 4px' }}>Discount</th>
                  <th style={{ width: 80, textAlign: 'right', padding: '0 4px' }}>Total (Exc.Tax)</th>
                  <th style={{ width: 70, textAlign: 'right', padding: '0 4px' }}>Net Rate</th>
                  <th style={{ width: 24, padding: '0' }}></th>
                </tr>
              </thead>"""
code = code.replace(grid_thead_target, grid_thead_repl)

grid_tbody_target = """              <tbody>
                {items.map((row, idx) => (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#1e1e2d', fontSize: '0.92rem' }}>
                      {(row.description || row.itemCode) ? idx + 1 : ''}
                    </td>

                    {/* Item code + search dropdown */}
                    <td style={{ position: 'relative' }}>
                      <input
                        ref={el => codeRefs.current[row.id] = el}
                        type="text"
                        value={row.itemCode}
                        onChange={e => handleCodeChange(row.id, e.target.value)}
                        onKeyDown={e => handleCodeKD(e, row.id, idx)}
                        onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                        placeholder="Scan / Type"
                        className="form-input fast-entry"
                      />
                      {activeDrop?.rowId === row.id && activeDrop.results.length > 0 && (
                        <div className="np-dropdown">
                          {activeDrop.results.slice(0, 8).map(p => (
                            <div key={p.id} className="np-suggestion"
                              onMouseDown={e => { e.preventDefault(); fillRow(row.id, p); }}>
                              <strong style={{ fontFamily: 'monospace', color: '#3699ff', minWidth: 90, flexShrink: 0 }}>{p.item_code}</strong>
                              <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                              {p.packing_qty > 0 && (
                                <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 3, padding: '0 5px', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                  {p.packing_qty}pcs
                                </span>
                              )}
                              <span style={{ color: '#5e6278', fontWeight: 700, minWidth: 64, textAlign: 'right', flexShrink: 0 }}>
                                {parseFloat(p.purchase_rate || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Description */}
                    <td>
                      <span style={{ fontSize: '0.87rem', color: '#3f4254', lineHeight: 1.3 }}>
                        {row.description || <span style={{ color: '#d1d5db' }}>—</span>}
                      </span>
                    </td>

                    {/* Packing — auto-filled with packing_qty, editable */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        ref={el => packetsRefs.current[row.id] = el}
                        type="text"
                        inputMode="numeric"
                        value={row.packets}
                        onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\\d]/g, ''))}
                        onKeyDown={e => handlePktsKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="form-input center-text packing-field"
                        style={{ width: 64, margin: '0 auto', display: 'block' }}
                      />
                    </td>

                    {/* Rate — auto-filled, editable, not in keyboard flow */}
                    <td>
                      <input
                        ref={el => rateRefs.current[row.id] = el}
                        type="text"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={e => updateRow(row.id, 'rate', e.target.value.replace(/[^\\d.]/g, ''))}
                        onKeyDown={e => handleRateKD(e, row.id, idx)}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="form-input center-text highlight-rate"
                        tabIndex={-1}
                      />
                    </td>

                    {/* Amount */}
                    <td className="amount-cell">
                      {row.amount > 0
                        ? Math.round(row.amount).toLocaleString()
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>

                    {/* Delete */}
                    <td className="action-cell">
                      {(row.description || row.itemCode) && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="btn-remove"
                          disabled={items.length <= 1}
                          tabIndex={-1}
                          title="Remove (Ctrl+D)"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>"""

grid_tbody_repl = """              <tbody>
                {items.map((row, idx) => {
                  const math = rowMath[row.id] || { pPrice: 0, rowDiscTotal: 0, rowTotal: 0, netRate: 0 };
                  return (
                    <tr key={row.id} style={{ height: 26, fontSize: '0.8rem' }}>
                      <td style={{ textAlign: 'center', padding: '0 2px' }}>
                        {(row.description || row.itemCode) ? idx + 1 : ''}
                      </td>

                      {/* Alias Name */}
                      <td style={{ position: 'relative', padding: '0 2px' }}>
                        <input
                          ref={el => codeRefs.current[row.id] = el}
                          type="text"
                          value={row.itemCode}
                          onChange={e => handleCodeChange(row.id, e.target.value)}
                          onKeyDown={e => handleCodeKD(e, row.id, idx)}
                          onBlur={() => setTimeout(() => setActiveDrop(null), 200)}
                          className="form-input"
                          style={{ padding: '2px 4px', fontSize: '0.8rem', height: 24, borderRadius: 2 }}
                        />
                        {activeDrop?.rowId === row.id && activeDrop.results.length > 0 && (
                          <div className="np-dropdown">
                            {activeDrop.results.slice(0, 8).map(p => (
                              <div key={p.id} className="np-suggestion"
                                onMouseDown={e => { e.preventDefault(); fillRow(row.id, p); }}>
                                <strong style={{ fontFamily: 'monospace', color: '#3699ff', minWidth: 90, flexShrink: 0 }}>{p.item_code}</strong>
                                <span style={{ flex: 1 }}>{descForProduct(p)}</span>
                                <span style={{ color: '#5e6278', fontWeight: 700, minWidth: 64, textAlign: 'right', flexShrink: 0 }}>
                                  {parseFloat(p.purchase_rate || 0).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Item Name */}
                      <td style={{ padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.description}
                      </td>

                      {/* Qty */}
                      <td style={{ padding: '0 2px' }}>
                        <input
                          ref={el => packetsRefs.current[row.id] = el}
                          type="text"
                          inputMode="numeric"
                          value={row.packets}
                          onChange={e => updateRow(row.id, 'packets', e.target.value.replace(/[^\\d]/g, ''))}
                          onKeyDown={e => handlePktsKD(e, row.id, idx)}
                          onFocus={e => e.target.select()}
                          className="form-input center-text"
                          style={{ padding: '2px 4px', fontSize: '0.8rem', height: 24, borderRadius: 2, background: '#fdfdbd' }}
                        />
                      </td>

                      {/* Pre-Disc Price */}
                      <td style={{ padding: '0 2px' }}>
                        <input
                          ref={el => rateRefs.current[row.id] = el}
                          type="text"
                          inputMode="decimal"
                          value={row.preDiscPrice}
                          onChange={e => updateRow(row.id, 'preDiscPrice', e.target.value.replace(/[^\\d.]/g, ''))}
                          onKeyDown={e => handleRateKD(e, row.id, idx)}
                          onFocus={e => e.target.select()}
                          className="form-input right-text"
                          style={{ padding: '2px 4px', fontSize: '0.8rem', height: 24, borderRadius: 2 }}
                        />
                      </td>

                      {/* Flat Discount */}
                      <td style={{ textAlign: 'right', padding: '0 4px' }}>
                        {row.flatDiscount > 0 ? parseFloat(row.flatDiscount).toFixed(2) : '0.00'}
                      </td>

                      {/* P. Price */}
                      <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 600 }}>
                        {math.pPrice > 0 ? math.pPrice.toFixed(2) : '0.00'}
                      </td>

                      {/* Disc% */}
                      <td style={{ textAlign: 'right', padding: '0 4px' }}>
                        {row.discPct > 0 ? parseFloat(row.discPct).toFixed(2) : '0.00'}
                      </td>

                      {/* Discount Amount */}
                      <td style={{ textAlign: 'right', padding: '0 4px' }}>
                        {math.rowDiscTotal > 0 ? math.rowDiscTotal.toFixed(2) : ''}
                      </td>

                      {/* Total (Exc. Tax) */}
                      <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 700, background: '#f3f4f6' }}>
                        {math.rowTotal > 0 ? math.rowTotal.toFixed(2) : ''}
                      </td>

                      {/* Net Rate */}
                      <td style={{ textAlign: 'right', padding: '0 4px', fontWeight: 700, color: '#b91c1c' }}>
                        {math.netRate > 0 ? math.netRate.toFixed(5) : ''}
                      </td>

                      {/* Delete */}
                      <td style={{ textAlign: 'center', padding: '0' }}>
                        {(row.description || row.itemCode) && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="btn-remove"
                            style={{ width: 20, height: 20, padding: 0, fontSize: '0.7rem' }}
                            disabled={items.length <= 1}
                            tabIndex={-1}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>"""
code = code.replace(grid_tbody_target, grid_tbody_repl)


tfoot_target = """              <tfoot>
                <tr>
                  <td colSpan={3} className="total-label">Total Items:</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: '#1e1e2d' }}>
                    {totals.pkts}
                  </td>
                  <td colSpan={2} style={{ textAlign: 'right' }}>
                    <span className="total-amount">PKR {Math.round(totals.sub).toLocaleString()}</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Adjustments + Grand Total panel */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <div style={{ width: 290, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setIsAdjOpen(v => !v)}
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}
                >
                  <span>Additional Adjustments {isAdjOpen ? '▼' : '▶'}</span>
                  {(parseFloat(miscCharges) || parseFloat(discount)) ? (
                    <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 10 }}>Active</span>
                  ) : null}
                </button>
                {isAdjOpen && (
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: '0.85rem', color: '#374151' }}>Misc Charges (+)</label>
                      <input
                        type="number"
                        value={miscCharges}
                        onChange={e => setMiscCharges(e.target.value)}
                        placeholder="0"
                        style={{ width: 90, textAlign: 'right', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.88rem', fontWeight: 600, color: '#059669', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: '#374151' }}>Discount (-)</label>
                      <input
                        type="number"
                        value={discount}
                        onChange={e => setDiscount(e.target.value)}
                        placeholder="0"
                        style={{ width: 90, textAlign: 'right', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.88rem', fontWeight: 600, color: '#ef4444', fontFamily: 'inherit' }}
                      />
                    </div>
                  </div>
                )}
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>Grand Total</span>
                  <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                    PKR {Math.round(totals.grand).toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>"""

tfoot_repl = """              <tfoot>
                <tr style={{ height: 32, background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontSize: '0.85rem' }}>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, paddingRight: 8 }}>
                    Stock: 0  &nbsp;&nbsp; Tot/Stock: 0
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>
                    {totals.pkts}
                  </td>
                  <td colSpan={4}></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {totals.sub > 0 ? (totals.sub - Object.values(rowMath).reduce((s, m) => s + m.rowTotal, 0)).toFixed(2) : ''} {/* Total discount */}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, background: '#e2e8f0' }}>
                    {totals.sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>

            {/* Bottom Summary Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, padding: '12px 16px', background: '#f1f5f9', borderRadius: 6, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Flat Disc.(-):</label>
                <input
                  type="number"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 80, height: 26, padding: '2px 6px', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Pur. Exp.(+):</label>
                <input
                  type="number"
                  value={miscCharges}
                  onChange={e => setMiscCharges(e.target.value)}
                  className="form-input right-text"
                  style={{ width: 80, height: 26, padding: '2px 6px', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ flex: 1 }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Grand Total:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', background: '#fff', padding: '4px 12px', border: '1px solid #cbd5e1', borderRadius: 4 }}>
                  {Math.round(totals.grand).toLocaleString()}
                </span>
              </div>
            </div>"""
code = code.replace(tfoot_target, tfoot_repl)

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("UI Rewrite Complete")
