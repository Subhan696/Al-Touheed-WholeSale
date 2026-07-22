import re

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace Header Details
header_target = """        {/* Card 1: Purchase Details */}
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
            <div className="form-group flex-grow" style={{ minWidth: 200 }}>
              <label style={{ fontSize: '0.75rem' }}>Remarks</label>
              <input ref={notesRef} type="text" value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => handleHeaderKD(e, 'notes')} placeholder="Remarks..." className="form-input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
            </div>
          </div>
        </section>"""

code = code.replace(header_target, header_repl)

with open('d:/projects/SHOP/src/components/NewPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Headers Removed")
