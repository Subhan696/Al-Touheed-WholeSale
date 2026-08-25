import React, { useState, useEffect } from 'react';
import CustomerLedger from './CustomerLedger';
import BankLedger from './BankLedger';
import CashLedger from './CashLedger';
import SupplierLedger from './SupplierLedger';
import FreightReport from './FreightReport';
import CustomerBalanceList from './CustomerBalanceList';
import SupplierBalanceList from './SupplierBalanceList';
import './Ledgers.css';

const TABS = [
  { id: 'customer', label: 'Customer Ledger', icon: '📋' },
  { id: 'cash', label: 'Cash Ledger', icon: '💵' },
  { id: 'bank', label: 'Bank Ledger', icon: '🏦' },
  { id: 'supplier', label: 'Supplier Ledger', icon: '📒', requiresReports: true },
  { id: 'freight', label: 'Freight Report', icon: '🚚', requiresReports: true },
];

export default function Ledgers({ currentUser, isActive, initialTab = 'customer', initialCustomer, hasPermission }) {
  const visibleTabs = TABS.filter(t => !t.requiresReports || hasPermission?.('view_reports'));
  const defaultTab = visibleTabs.some(t => t.id === initialTab) ? initialTab : visibleTabs[0]?.id || 'customer';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (initialTab && visibleTabs.some(t => t.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="ledgers-page">
      <div className="ledgers-header no-print">
        <h1>Ledgers</h1>
        <div className="ledgers-tabs">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`ledgers-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="ledgers-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ledgers-content">
        {activeTab === 'customer' && (
          <CustomerLedger
            currentUser={currentUser}
            initialCustomer={initialCustomer}
            isActive={isActive && activeTab === 'customer'}
          />
        )}
        {activeTab === 'cash' && (
          <CashLedger currentUser={currentUser} isActive={isActive && activeTab === 'cash'} />
        )}
        {activeTab === 'bank' && (
          <BankLedger currentUser={currentUser} isActive={isActive && activeTab === 'bank'} />
        )}
        {activeTab === 'supplier' && (
          <SupplierLedger />
        )}
        {activeTab === 'freight' && (
          <FreightReport />
        )}
      </div>
    </div>
  );
}
