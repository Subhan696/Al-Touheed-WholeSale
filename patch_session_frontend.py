import re

# 1. Patch NewItemForm.jsx
with open(r'd:\projects\SHOP\src\components\NewItemForm.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

save_find = """ipcRenderer.invoke('save-product', {
        itemCode: product.itemCode,
        description: product.description,
        gender: product.gender,
        category: product.category,
        sizeRange: product.sizeRange,
        purchaseRate: product.purchaseRate,
        saleRate: product.saleRate,
        packingQty: product.packingQty,
        year: product.year,
        brand: product.brand,
        discount: product.discount,
        note: product.note,
        sessionId
      });"""
save_replace = """ipcRenderer.invoke('save-product', {
        itemCode: product.itemCode,
        description: product.description,
        gender: product.gender,
        category: product.category,
        sizeRange: product.sizeRange,
        purchaseRate: product.purchaseRate,
        saleRate: product.saleRate,
        packingQty: product.packingQty,
        year: product.year,
        brand: product.brand,
        discount: product.discount,
        note: product.note,
        sessionId,
        createdBy: currentUser?.username || 'Unknown'
      });"""
content = content.replace(save_find, save_replace)
with open(r'd:\projects\SHOP\src\components\NewItemForm.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("NewItemForm.jsx patched")


# 2. Patch NewPurchase.jsx
with open(r'd:\projects\SHOP\src\components\NewPurchase.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

datalist_find = """<datalist id="recent-sessions-list">
                  {recentSessions.map(s => (
                    <option key={s.session_id} value={s.session_id}>
                      Session {s.session_id} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </option>
                  ))}
                </datalist>"""
datalist_replace = """<datalist id="recent-sessions-list">
                  {recentSessions.map(s => (
                    <option key={s.session_id} value={s.session_id}>
                      Session {s.session_id} ({s.brand || 'No Brand'}) by {s.created_by || 'Unknown'} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </option>
                  ))}
                </datalist>"""
content = content.replace(datalist_find, datalist_replace)
with open(r'd:\projects\SHOP\src\components\NewPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("NewPurchase.jsx patched")


# 3. Patch OpenPurchase.jsx
with open(r'd:\projects\SHOP\src\components\OpenPurchase.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(datalist_find, datalist_replace)
with open(r'd:\projects\SHOP\src\components\OpenPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("OpenPurchase.jsx patched")

