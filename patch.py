import re

with open('d:/projects/SHOP/src/components/NewSale.jsx', 'r', encoding='utf-8') as f:
    newsale = f.read()

with open('d:/projects/SHOP/src/components/SalesReturn.jsx', 'r', encoding='utf-8') as f:
    salesreturn = f.read()

# 1. Add PAKISTAN_CITIES import
salesreturn = salesreturn.replace(
    "import './NewSale.css';",
    "import './NewSale.css';\nimport { PAKISTAN_CITIES } from '../utils/pakistanCities';"
)

# 2. Extract Customer Modal and Inline Customer States from NewSale
states_match = re.search(r"  const \[customerId, setCustomerId\].*?  const handleAddCity = async \(\) => \{.*?  \};\n", newsale, re.DOTALL)
if states_match:
    states_code = states_match.group(0)
    # Insert states into SalesReturn
    salesreturn = salesreturn.replace(
        "  const [customerName, setCustomerName] = useState('');\n",
        states_code
    )

# 3. Extract Customer Modal UI
modal_match = re.search(r"      \{/\* Customer Modal \(F4\) \*/\}.*?      \}\)\n", newsale, re.DOTALL)
if modal_match:
    modal_code = modal_match.group(0)
    # Insert modal into SalesReturn
    salesreturn = salesreturn.replace(
        "      {/* Body */}",
        modal_code + "\n\n      {/* Body */}"
    )

# 4. Extract Customer section UI
section_match = re.search(r"      \{/\* Customer section — collapsible \*/\}.*?          </div>\n\n        </div>\n\n      </div>", newsale, re.DOTALL)
if section_match:
    section_code = section_match.group(0)
    # Replace Customer section in SalesReturn
    old_section_match = re.search(r"      \{/\* Customer section — collapsible \*/\}.*?          </div>\n\n        </div>\n\n      </div>", salesreturn, re.DOTALL)
    if old_section_match:
        salesreturn = salesreturn.replace(old_section_match.group(0), section_code)

# 5. Extract CUST button
cust_btn_match = re.search(r'<button type="button" className="topbar-btn" onClick=\{.*?setCustomerModalOpen\(true\).*?CUST</button>', newsale)
if cust_btn_match:
    cust_btn_code = cust_btn_match.group(0)
    # Add CUST button to SalesReturn topbar
    salesreturn = salesreturn.replace(
        '          <button type="button" className="topbar-btn" onClick={() => setStockSearchModalOpen(true)}',
        cust_btn_code + '\n          <button type="button" className="topbar-btn" onClick={() => setStockSearchModalOpen(true)}'
    )

# 6. Add auto-scroll
auto_scroll = """
  useEffect(() => {
    setTimeout(() => {
      const active = document.activeElement;
      const isInRow = active?.classList.contains('qty-field') ||
        active?.classList.contains('rate-field') ||
        active?.classList.contains('code-field');
      if (!isInRow) scanRef.current?.focus();
      const wrap = tableWrapRef.current;
      if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
    }, 80);
  }, [items.length]);
"""
salesreturn = salesreturn.replace(
    "  const roundToFive = (num) => Math.round((parseFloat(num) || 0) / 5) * 5;",
    auto_scroll + "\n  const roundToFive = (num) => Math.round((parseFloat(num) || 0) / 5) * 5;"
)

# 7. Also need to add customerModalItemRefs, newCustPhoneRef, newCustCityRef, etc from NewSale
refs_code = """
  const customerModalItemRefs = useRef([]);
  const newCustPhoneRef = useRef(null);
  const newCustCityRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerPhoneRef = useRef(null);
  const customerNotesRef = useRef(null);
  const inlineCustomerItemRefs = useRef([]);
"""
salesreturn = salesreturn.replace(
    "  const scanRef = useRef(null);",
    "  const scanRef = useRef(null);\n" + refs_code
)

# Add customer modal states if not captured
modal_states_code = """
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerModalSelectedIndex, setCustomerModalSelectedIndex] = useState(-1);

  useEffect(() => {
    if (customerModalOpen) {
      setCustomerSearch('');
      setCustomerResults([]);
      setCustomerModalSelectedIndex(-1);
    }
  }, [customerModalOpen]);

  useEffect(() => {
    if (customerModalSelectedIndex >= 0) {
      customerModalItemRefs.current[customerModalSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [customerModalSelectedIndex]);

  const [inlineCustomerResults, setInlineCustomerResults] = useState([]);
  const [inlineCustomerSelectedIndex, setInlineCustomerSelectedIndex] = useState(-1);

  useEffect(() => {
    if (inlineCustomerSelectedIndex >= 0) {
      inlineCustomerItemRefs.current[inlineCustomerSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [inlineCustomerSelectedIndex]);
"""
salesreturn = salesreturn.replace(
    "  const [showCodeRowDrop, setShowCodeRowDrop] = useState(false);",
    "  const [showCodeRowDrop, setShowCodeRowDrop] = useState(false);\n" + modal_states_code
)

# Update keyboard listener to include customerModalOpen
salesreturn = salesreturn.replace(
    ", stockSearchModalOpen, showScanDrop, showCodeRowDrop]);",
    ", stockSearchModalOpen, showScanDrop, showCodeRowDrop, customerModalOpen]);"
)

salesreturn = salesreturn.replace(
    "if (stockSearchModalOpen) {",
    "if (customerModalOpen) { setCustomerModalOpen(false); return; }\n      if (stockSearchModalOpen) {"
)
salesreturn = salesreturn.replace(
    "if (e.key === 'F8') { e.preventDefault(); setStockSearchModalOpen(true); }",
    "if (e.key === 'F8') { e.preventDefault(); setStockSearchModalOpen(true); }\n      if (e.key === 'F4') { e.preventDefault(); setCustomerModalOpen(true); }"
)

with open('d:/projects/SHOP/src/components/SalesReturn.jsx', 'w', encoding='utf-8') as f:
    f.write(salesreturn)

print('Done patching SalesReturn.jsx')
