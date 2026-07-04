const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/NewItemForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const searchSection = `              {/* Row 3: Category + Size Range */}
              <div className="form-group span-third">
                <label>Category</label>
                <select ref={el => refs.current.category = el} value={category}
                  onChange={e => { setCategory(e.target.value); setSizeRange(''); }}
                  onKeyDown={e => handleEnter(e, 'itemType')} className="form-input">
                            {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group span-third">
                <label>Type</label>
                <select ref={el => refs.current.itemType = el} value={itemType}
                  onChange={e => setItemType(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'sizeRange')} className="form-input">
                  <option value="F/S">F/S</option>
                  <option value="H/S">H/S</option>
                  <option value="WTR">WTR</option>
                </select>
              </div>
              <div className="form-group span-third">
                <label>Size Range</label>
                <select ref={el => refs.current.sizeRange = el} value={sizeRange}
                  onChange={e => setSizeRange(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                  <option value="">-- Select --</option>
                  {Object.keys(SIZE_CONFIG[category] || {}).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>`;

const replaceSection = `              {/* Row 3: Gender + Category + Size Range */}
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Gender</label>
                  <button type="button" onClick={() => openListManager("genders")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.gender = el} value={gender}
                  onChange={e => { setGender(e.target.value); setSizeRange(''); }}
                  onKeyDown={e => handleEnter(e, 'category')} className="form-input">
                  <option value="">-- Select --</option>
                  {gendersList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Category</label>
                  <button type="button" onClick={() => openListManager("categories")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.category = el} value={category}
                  onChange={e => setCategory(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'sizeRange')} className="form-input">
                  <option value="">-- Select --</option>
                  {categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group span-third">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Size Range</label>
                  <button type="button" onClick={() => openListManager("size_ranges")} className="btn btn-secondary sm" style={{ padding: "2px 6px", fontSize: "0.75rem", height: "24px" }}>⚙️</button>
                </div>
                <select ref={el => refs.current.sizeRange = el} value={sizeRange}
                  onChange={e => setSizeRange(e.target.value)}
                  onKeyDown={e => handleEnter(e, 'purchaseRate')} className="form-input">
                  <option value="">-- Select --</option>
                  {sizeRangesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>`;

content = content.replace(searchSection, replaceSection);

// Also need to fix the Preview Box. It shows gender twice.
const previewSearch = `<div className="preview-row" style={{ backgroundColor: '#fff3cd', fontWeight: 'bold', padding: '4px', borderRadius: '4px' }}>
                <span className="preview-label">Description</span>
                <span className="preview-value" style={{ maxWidth: '60%', textAlign: 'right' }}>{\`\${description || ''} \${gender || ''} \${sizeRange || ''} \${gender || ''}\`.trim() || '—'}</span>
              </div>
              <div className="preview-row">
              <div className="preview-row">
                <span className="preview-label">Gender</span>
                <span className="preview-value">{gender}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Category</span>
                <span className="preview-value">{category}</span>
              </div>
              </div>`;

const previewReplace = `<div className="preview-row" style={{ backgroundColor: '#fff3cd', fontWeight: 'bold', padding: '4px', borderRadius: '4px' }}>
                <span className="preview-label">Description</span>
                <span className="preview-value" style={{ maxWidth: '60%', textAlign: 'right' }}>{\`\${description || ''} \${category || ''} \${sizeRange || ''} \${gender || ''}\`.trim() || '—'}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Gender</span>
                <span className="preview-value">{gender}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Category</span>
                <span className="preview-value">{category}</span>
              </div>`;
              
content = content.replace(previewSearch, previewReplace);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated UI for Gender and Category fields');
