import fitz
import json
import psycopg2

doc = fitz.open(r'C:\Users\ST\.gemini\antigravity-ide\brain\8b0efe22-55d5-41d2-a34b-f45ae2ea5d5b\media__1784819121301.pdf')
lines = []
for i in range(len(doc)):
    page_text = doc.load_page(i).get_text('text')
    lines.extend([l.strip() for l in page_text.split('\n') if l.strip()])

with open(r'D:\Downloads\stock_items.json', 'r', encoding='utf-8') as f:
    user_items = json.load(f)

conn = psycopg2.connect('postgresql://atg_user:atg_pass123@localhost:5432/atg_wholesale')
cur = conn.cursor()
cur.execute('SELECT item_code, purchase_rate FROM products')
db_rates = {str(r[0]): float(r[1] or 0) for r in cur.fetchall()}

mismatches = []
pdf_rates = {}

for item in user_items:
    code = str(item.get('itemCode', item.get('item_code', '')))
    if not code: continue
    try:
        idx = lines.index(code)
        pur_price_str = lines[idx+3].replace(',', '')
        try:
            pur_price = float(pur_price_str)
            pdf_rates[code] = pur_price
        except ValueError:
            pass 
    except ValueError:
        pass

for code, pdf_rate in pdf_rates.items():
    db_rate = db_rates.get(code)
    if db_rate is not None and db_rate != pdf_rate:
        qty = int(next((i['qty'] for i in user_items if str(i.get('itemCode')) == code), 0))
        diff = (pdf_rate - db_rate) * qty
        mismatches.append({'code': code, 'pdf': pdf_rate, 'db': db_rate, 'qty': qty, 'diff': diff})

print('Found mismatches:', len(mismatches))
total_diff = sum(m['diff'] for m in mismatches)
print('Total difference value:', total_diff)

for m in mismatches[:20]:
    print(f"Item: {m['code']} | PDF: {m['pdf']} | DB: {m['db']} | Qty: {m['qty']} | Diff: {m['diff']}")
