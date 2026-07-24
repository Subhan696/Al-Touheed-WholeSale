import re

with open(r'd:\projects\SHOP\src\components\NewSale.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace CSS
css_pattern = r"\.signatures \{.*?\}\s*\.sig-box \{.*?\}\s*\.footer \{.*?\}\s*\.net-payable \{.*?\}\s*\.footer-notes \{.*?\}"
css_replacement = """          .signatures { display: flex; justify-content: space-between; margin-top: 15px; margin-bottom: 10px; font-size: 14px; padding: 0 20px; page-break-inside: avoid; }
          .sig-box { width: 25%; text-align: center; border-top: 1px solid #000; padding-top: 5px; }
          
          .footer-notes { font-size: 11px; text-transform: uppercase; line-height: 1.4; text-align: center; margin-bottom: 50px; page-break-inside: avoid; }
          
          .fixed-bottom { position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; }
          .net-payable { text-align: right; font-size: 18px; font-weight: 900; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 10px; background: #fff; margin: 0; }"""

new_content = re.sub(css_pattern, css_replacement, content, flags=re.DOTALL)

# Replace HTML
html_pattern = r"<div class=\"signatures\">.*?<div class=\"footer\">\s*<div class=\"net-payable\">\s*Net Payable Total Rs: \$\{formatAmt\(totals\.grandTotal\)\}\s*</div>\s*<div class=\"footer-notes\">\s*\$\{\(receiptSettings\?\.footerNotes \|\| \"THANKS FOR YOUR VISIT \*\*\*\*\!\!\!\!<br/>DON'T EXCHANGE DAMAGED ITEMS AND LOOSE PIECE NOTE: NO ANY RETURN<br/>BRANCH # 2 \.\.\.\.\. SHOP NO # E-2028 KUCHA CHAH TAILIAN RANG MAHAL\"\)\.replace\(/\\n/g, '<br/>'\)\}\s*</div>\s*</div>"
html_replacement = """<div class="signatures">
            <div class="sig-box">
              <div style="text-transform: uppercase;">${currentUser?.username || 'OPERATOR'}</div>
              <div style="font-weight: normal;">Operator</div>
            </div>
            <div class="sig-box">
              <div>SALES MAN</div>
              <div style="font-weight: normal;">Sales Man</div>
            </div>
            <div class="sig-box">
              <div style="visibility: hidden;">CHECKER</div>
              <div style="font-weight: normal;">Checker</div>
            </div>
          </div>
  
          <div class="footer-notes">
            ${(receiptSettings?.footerNotes || "THANKS FOR YOUR VISIT ****!!!!<br/>DON'T EXCHANGE DAMAGED ITEMS AND LOOSE PIECE NOTE: NO ANY RETURN<br/>BRANCH # 2 ..... SHOP NO # E-2028 KUCHA CHAH TAILIAN RANG MAHAL").replace(/\\n/g, '<br/>')}
          </div>
          
          <div class="fixed-bottom">
            <div class="net-payable">
              Net Payable Total Rs: ${formatAmt(totals.grandTotal)}
            </div>
          </div>"""

new_content = re.sub(html_pattern, html_replacement, new_content, flags=re.DOTALL)

with open(r'd:\projects\SHOP\src\components\NewSale.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

if new_content != content:
    print('Replaced successfully')
else:
    print('Failed to replace. Make sure regex matches.')
