import sys
file_path = 'd:/projects/SHOP/src/components/ExpenseAccounts.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add useRef to the imports and component
import_find = "import React, { useState, useEffect } from 'react';"
import_replace = "import React, { useState, useEffect, useRef } from 'react';"
content = content.replace(import_find, import_replace)

ref_find = "  const [msg, setMsg] = useState({ text: '', type: '' });"
ref_replace = """  const [msg, setMsg] = useState({ text: '', type: '' });
  const rateRef = useRef(null);"""
content = content.replace(ref_find, ref_replace)

# 2. Fix the refresh issue by reloading data after save/delete
save_success_find = """        if (res.success) {
            showMsg('Updated successfully');
        } else {"""
save_success_replace = """        if (res.success) {
            showMsg('Updated successfully');
            loadData();
        } else {"""
content = content.replace(save_success_find, save_success_replace)

add_success_find = """        if (res.success) {
            showMsg('Added successfully');
        } else {"""
add_success_replace = """        if (res.success) {
            showMsg('Added successfully');
            loadData();
        } else {"""
content = content.replace(add_success_find, add_success_replace)

del_success_find = """      } else {
          showMsg('Deleted successfully');
      }"""
del_success_replace = """      } else {
          showMsg('Deleted successfully');
          loadData();
      }"""
content = content.replace(del_success_find, del_success_replace)

# 3. Add onKeyDown logic to the inputs
name_input_find = """            <input 
              type="text" 
              value={accountName}
              onChange={e => setAccountName(e.target.value.toUpperCase())}
              placeholder="e.g. FREIGHT CTN EXP"
              className="form-input"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
              required
              autoFocus
            />"""
name_input_replace = """            <input 
              type="text" 
              value={accountName}
              onChange={e => setAccountName(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  rateRef.current?.focus();
                }
              }}
              placeholder="e.g. FREIGHT CTN EXP"
              className="form-input"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
              required
              autoFocus
            />"""
content = content.replace(name_input_find, name_input_replace)

rate_input_find = """            <input 
              type="number" 
              value={defaultRate}
              onChange={e => setDefaultRate(e.target.value)}
              placeholder="e.g. 940"
              className="form-input right-text"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />"""
rate_input_replace = """            <input 
              ref={rateRef}
              type="number" 
              value={defaultRate}
              onChange={e => setDefaultRate(e.target.value)}
              placeholder="e.g. 940"
              className="form-input right-text"
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />"""
content = content.replace(rate_input_find, rate_input_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated ExpenseAccounts.jsx with auto-refresh and Enter key logic')
