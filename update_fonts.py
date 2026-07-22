import re

file_path = 'd:/projects/SHOP/src/components/NewPurchase.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("height: 26, fontSize: '0.8rem'", "height: 32, fontSize: '0.95rem'")
content = content.replace("fontSize: '0.8rem', height: 24", "fontSize: '0.95rem', height: 28")
content = content.replace("height: 32, background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontSize: '0.85rem'", "height: 38, background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontSize: '1rem'")
content = content.replace("fontSize: '0.8rem', fontWeight: 600", "fontSize: '0.95rem', fontWeight: 600")
content = content.replace("height: 26, padding: '2px 6px', fontSize: '0.85rem'", "height: 32, padding: '4px 8px', fontSize: '0.95rem'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced font sizes')
