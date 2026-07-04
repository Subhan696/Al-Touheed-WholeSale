const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/NewItemForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const searchRates = `<div className="form-group span-third">
                  <label>Purchase Rate (PKR)</label>
                  <input ref={el => refs.current.purchaseRate = el} type="text" inputMode="numeric"
                    value={purchaseRate} onChange={e => setPurchaseRate(e.target.value.replace(/[^\\d.]/g, ''))}
                    onKeyDown={e => handleEnter(e, 'saleRate')}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                </div>
                <div className="form-group span-third">
                  <label>Discount Amount</label>
                  <input type="text" readOnly
                    value={((parseFloat(saleRate) || 0) * (findDiscountPct(selectedCompany, category, sizeRange) / 100)).toFixed(0)}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600, backgroundColor: '#fff5f5', color: '#e53935', borderColor: '#ffcdd2' }} />
                </div>
                <div className="form-group span-third">
                  <label>Sale Rate (PKR)</label>
                  <input ref={el => refs.current.saleRate = el} type="text" inputMode="numeric"
                    value={saleRate} onChange={e => setSaleRate(e.target.value.replace(/[^\\d.]/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                </div>`;

const replaceRates = `<div className="form-group span-half">
                  <label>Purchase Rate (PKR)</label>
                  <input ref={el => refs.current.purchaseRate = el} type="text" inputMode="numeric"
                    value={purchaseRate} onChange={e => setPurchaseRate(e.target.value.replace(/[^\\d.]/g, ''))}
                    onKeyDown={e => handleEnter(e, 'saleRate')}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                </div>
                <div className="form-group span-half">
                  <label>Sale Rate (PKR)</label>
                  <input ref={el => refs.current.saleRate = el} type="text" inputMode="numeric"
                    value={saleRate} onChange={e => setSaleRate(e.target.value.replace(/[^\\d.]/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                </div>
                <div className="form-group span-half">
                  <label>Discount Amount</label>
                  <input type="text" readOnly
                    value={((parseFloat(saleRate) || 0) * (findDiscountPct(selectedCompany, category, sizeRange) / 100)).toFixed(0)}
                    placeholder="0" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 600, backgroundColor: '#fff5f5', color: '#e53935', borderColor: '#ffcdd2' }} />
                </div>`;

content = content.replace(searchRates, replaceRates);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated rates layout');
