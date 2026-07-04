const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/NewItemForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update saveProfitRule definition
content = content.replace(
  `const saveProfitRule = async (company, cat, sr, pct, disc = 0) => {
    if (!pct || !company) return;`,
  `const saveProfitRule = async (company, cat, sr, pct, disc = 0) => {
    if ((!pct && !disc) || !company) return;`
);

// 2. Update Default % logic
content = content.replace(
  `onBlur={() => { if (defaultPctInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}`,
  `onBlur={() => { if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); }}`
);
content = content.replace(
  `onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (defaultPctInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); profitModalRefs.current.newCat?.focus(); } }}`,
  `onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput); profitModalRefs.current.newCat?.focus(); } }}`
);

// We need to replace the above for BOTH defaultPctInput and defaultDiscInput, because both have onBlur
content = content.replace(
  /if \(defaultPctInput\) saveProfitRule\(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput\);/g,
  `if (defaultPctInput || defaultDiscInput) saveProfitRule(selectedProfitCompany, '', '', defaultPctInput, defaultDiscInput);`
);

// 3. Update Override Add logic
content = content.replace(
  `if (newRuleSizeRange && newRulePct) {`,
  `if (newRuleSizeRange && (newRulePct || newRuleDisc)) {`
);

content = content.replace(
  `if (!newRuleSizeRange || !newRulePct) return;`,
  `if (!newRuleSizeRange || (!newRulePct && !newRuleDisc)) return;`
);

content = content.replace(
  `disabled={!newRuleSizeRange || !newRulePct}`,
  `disabled={!newRuleSizeRange || (!newRulePct && !newRuleDisc)}`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated profit logic to allow discount alone');
