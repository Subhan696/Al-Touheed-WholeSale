import React, { useState, memo, useEffect } from 'react';
import { DataProvider } from './context/DataContext';
import LoginPage from './components/LoginPage';
import NewItemForm from './components/NewItemForm';
import ProductList from './components/ProductList';
import StockList from './components/StockList';
import NewPurchase from './components/NewPurchase';
import OpenPurchase from './components/OpenPurchase';
import PurchaseList from './components/PurchaseList';
import PurchaseReturn from './components/PurchaseReturn';
import PurchaseReturnList from './components/PurchaseReturnList';
import NewSale from './components/NewSale';
import SalesList from './components/SalesList';
import SalesReturn from './components/SalesReturn';
import SalesReturnList from './components/SalesReturnList';
import Reports from './components/Reports';
import UserManagement from './components/UserManagement';
import NetworkSettings from './components/NetworkSettings';
import BackupSettings from './components/BackupSettings';
import ManufacturerDiscounts from './components/ManufacturerDiscounts';
import ExpenseAccounts from './components/ExpenseAccounts';
import BarcodePrint from './components/BarcodePrint';
import Ledgers from './components/Ledgers';
import ManufacturerStockReport from './components/ManufacturerStockReport';
import Customers from './components/Customers';
import ReceiptSettings from './components/ReceiptSettings';
import GLAccounts from './components/GLAccounts';
import GLVouchers from './components/GLVouchers';
import GLLedgerReport from './components/GLLedgerReport';
import GLCashActivityReport from './components/GLCashActivityReport';
import './App.css';

const WindowContent = memo(({ win, isActive, currentUser, closeTopWindow, openWindow, hasPermission, handleEditProduct, handleEditPurchase, handleEditReturn, handleEditSale, handleEditSalesReturn, setShowLayoutTabs }) => {
  const tabKey = win.rootKey || win.key;

  if (tabKey === 'new-item') return <NewItemForm editItemData={win.editItemData} onClearEdit={closeTopWindow} isActive={isActive} currentUser={currentUser} />;
  if (tabKey === 'products') return <ProductList onEditProduct={hasPermission('manage_products') ? handleEditProduct : undefined} currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'stock') return <StockList isActive={isActive} currentUser={currentUser} />;

  if (tabKey === 'new-purchase') return (
    <NewPurchase currentUser={currentUser} purchaseToEdit={win.purchaseToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchases'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'purchases') return <PurchaseList currentUser={currentUser} onEditPurchase={hasPermission('manage_purchases') ? handleEditPurchase : undefined} isActive={isActive} />;
  if (tabKey === 'open-purchase') return (
    <OpenPurchase currentUser={currentUser} purchaseToEdit={win.purchaseToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchases'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'purchase-return') return (
    <PurchaseReturn currentUser={currentUser} returnToEdit={win.returnToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('purchase-return-list'); }}
      onCancelEdit={closeTopWindow} isActive={isActive} />
  );
  if (tabKey === 'purchase-return-list') return <PurchaseReturnList currentUser={currentUser} onEditReturn={handleEditReturn} isActive={isActive} />;

  if (tabKey === 'sale') return (
    <NewSale currentUser={currentUser} saleToEdit={win.saleToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('sale', { forceNewInstance: true }); }}
      onExit={closeTopWindow} isActive={isActive}
      onNewSale={() => { openWindow('sale', { forceNewInstance: true }); }} />
  );
  if (tabKey === 'sales-list') return <SalesList onEditSale={handleEditSale} onNewSale={() => openWindow('sale', { forceNewInstance: true })} onExit={closeTopWindow} currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'sales-return') return (
    <SalesReturn currentUser={currentUser} returnToEdit={win.returnToEdit}
      onSaveSuccess={() => { closeTopWindow(); openWindow('sales-return-list'); }}
      onExit={closeTopWindow} isActive={isActive}
      onNewReturn={() => openWindow('sales-return', { forceNewInstance: true })} />
  );
  if (tabKey === 'sales-return-list') return <SalesReturnList onEditReturn={handleEditSalesReturn} currentUser={currentUser} isActive={isActive} />;
  
  if (tabKey === 'barcode-print') return <BarcodePrint isActive={isActive} />;

  if (tabKey === 'reports') return <Reports currentUser={currentUser} isActive={isActive} />;
  if (tabKey === 'users') return <UserManagement currentUser={currentUser} />;
  if (tabKey === 'customers') return <Customers currentUser={currentUser} onSelectCustomerLedger={(c) => openWindow('ledgers', { initialTab: 'customer', initialCustomer: c })} />;
  if (tabKey === 'ledgers') return <Ledgers currentUser={currentUser} initialTab={win.initialTab || 'customer'} initialCustomer={win.initialCustomer} isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'customer-ledger') return <Ledgers currentUser={currentUser} initialTab="customer" initialCustomer={win.initialCustomer} isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'cash-ledger') return <Ledgers currentUser={currentUser} initialTab="cash" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'bank-ledger') return <Ledgers currentUser={currentUser} initialTab="bank" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'supplier-ledger') return <Ledgers currentUser={currentUser} initialTab="supplier" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'freight-report') return <Ledgers currentUser={currentUser} initialTab="freight" isActive={isActive} hasPermission={hasPermission} />;
  if (tabKey === 'network-settings') return <NetworkSettings />;
  if (tabKey === 'receipt-settings') return <ReceiptSettings />;
  if (tabKey === 'backup') return <BackupSettings />;
  if (tabKey === 'manufacturer-discounts') return <ManufacturerDiscounts />;
  if (tabKey === 'expense-accounts') return <ExpenseAccounts />;
  if (tabKey === 'manufacturer-stock') return <ManufacturerStockReport />;

  if (tabKey === 'gl-accounts') return <GLAccounts />;
  if (tabKey === 'gl-vouchers') return <GLVouchers />;
  if (tabKey === 'gl-ledger') return <GLLedgerReport />;
  if (tabKey === 'gl-cash-activity') return <GLCashActivityReport />;

  return <div style={{ padding: 20 }}>Unknown view</div>;
}, (prev, next) => prev.isActive === next.isActive && prev.win === next.win && prev.currentUser === next.currentUser);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [networkMode, setNetworkMode] = useState('server');
  const [windowStack, setWindowStack] = useState([]);
  const [purchaseMenuOpen, setPurchaseMenuOpen] = useState(false);
  const [purchaseMenuIndex, setPurchaseMenuIndex] = useState(0);
  const [showNetworkSetup, setShowNetworkSetup] = useState(false);

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('get-network-settings').then(s => {
      if (s && s.networkMode) setNetworkMode(s.networkMode);
    }).catch(() => {});
  }, []);

  const hasPermission = (perm) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const perms = currentUser.permissions || [];
    if (perms.includes(perm)) return true;
    if ((perm === 'manage_sales_returns' || perm === 'manage_purchase_returns') && perms.includes('manage_returns')) return true;
    return false;
  };

  const purchaseMenuOptions = [
    { label: 'New Purchase', tab: 'new-purchase', icon: '🛒', perm: 'manage_purchases' },
    { label: 'Open Purchase', tab: 'open-purchase', icon: '📦', perm: 'manage_purchases' },
    { label: 'Purchase List', tab: 'purchases', icon: '📋', perm: 'view_purchases' },
    { label: 'Purchase Return', tab: 'purchase-return', icon: '🔙', perm: 'manage_purchase_returns' },
    { label: 'Returns List', tab: 'purchase-return-list', icon: '📋', perm: 'manage_purchase_returns' },
    { label: 'Barcode Print', tab: 'barcode-print', icon: '🏷️', perm: 'view_purchases' },
  ].filter(opt => hasPermission(opt.perm));

  const handleLoginSuccess = (userId, username, password, role, permissions) => {
    setIsAuthenticated(true);
    setCurrentUser({ id: userId, username, password, role, permissions });
    const hasPerm = (p) => role === 'admin' || (Array.isArray(permissions) && permissions.includes(p));
    let defaultTab = 'sale';
    if (!hasPerm('create_sale')) {
      if (hasPerm('manage_products')) defaultTab = 'new-item';
      else if (hasPerm('view_products')) defaultTab = 'products';
      else if (hasPerm('view_stock')) defaultTab = 'stock';
      else defaultTab = 'reports';
    }
    setWindowStack([{ id: `w-${Date.now()}`, key: defaultTab }]);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setWindowStack([{ id: `w-${Date.now()}`, key: 'sale' }]);
  };

  const activeTab = windowStack[windowStack.length - 1]?.key || '';

  const openWindow = (key, props = {}) => {
    let finalKey = key;
    if (props.forceNewInstance) {
      finalKey = `${key}-${Date.now()}`;
      delete props.forceNewInstance;
    }
    if (activeTab === finalKey && Object.keys(props).length === 0) return;
    const winId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setWindowStack(prev => [...prev, { id: winId, key: finalKey, rootKey: key, ...props }]);
  };

  const closeTopWindow = () => setWindowStack(prev => {
    if (prev.length > 1) return prev.slice(0, -1);
    // Last window — go to empty homepage
    return [];
  });

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        const hasSelection = isInput && e.target.selectionStart !== e.target.selectionEnd;
        const hasModal = document.querySelector('.modal-overlay');
        if (!hasSelection && !hasModal) { e.preventDefault(); closeTopWindow(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        if (hasPermission('create_sale')) { e.preventDefault(); openWindow('sale', { forceNewInstance: true }); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [windowStack, activeTab]);

  if (!isAuthenticated) {
    if (showNetworkSetup) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f3f6f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: '#1e1e2d', color: 'white' }}>
            <button onClick={() => setShowNetworkSetup(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: '0.9rem' }}>← Back to Login</button>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Network Setup</span>
            <span style={{ fontSize: '0.85rem', opacity: 0.7, marginLeft: 'auto' }}>Restart app after saving settings</span>
          </div>
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <NetworkSettings />
          </div>
        </div>
      );
    }
    return <LoginPage onLoginSuccess={handleLoginSuccess} onOpenNetworkSettings={() => setShowNetworkSetup(true)} />;
  }

  const handleEditProduct = (product) => openWindow('new-item', { editItemData: product });
  const handleEditPurchase = (purchase) => {
    if (purchase.supplier_name === 'Opening Stock') {
      openWindow('open-purchase', { purchaseToEdit: purchase });
    } else {
      openWindow('new-purchase', { purchaseToEdit: purchase });
    }
  };
  const handleEditReturn = (ret) => openWindow('purchase-return', { returnToEdit: ret });
  const handleEditSale = (sale) => openWindow('sale', { saleToEdit: sale });
  const handleEditSalesReturn = (ret) => openWindow('sales-return', { returnToEdit: ret });

  const activeBaseKey = windowStack[windowStack.length - 1]?.rootKey || activeTab;
  const isFullScreenMode = ['sale', 'sales-return'].includes(activeBaseKey);
  const isMiniSidebar = activeBaseKey === 'new-purchase' || activeBaseKey === 'open-purchase';

  return (
    <div className="app-container">
      <aside className={`app-sidebar ${isFullScreenMode ? 'hidden-sidebar' : ''} ${isMiniSidebar ? 'mini-sidebar' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-text">
            <span className="brand-main">ATG</span>
            <span className="brand-sub">Al-Touheed</span>
            <span className="brand-tag">WHOLESALE</span>
          </div>
          <div className="user-info">
            <div className="user-details">
              <span className="username">{currentUser?.username}</span>
              <span className="user-role">{currentUser?.role}</span>
            </div>
          </div>
          {hasPermission('view_reports') && (
            <button className={`nav-item nav-item-reports ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => openWindow('reports')} style={{ marginTop: '10px' }}>
              <span className="icon">📊</span> Reports
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {hasPermission('manage_products') && (
            <button className={`nav-item ${activeTab === 'new-item' ? 'active' : ''}`} onClick={() => openWindow('new-item', { editItemData: null })}>
              <span className="icon">📝</span> New Item
            </button>
          )}
          {hasPermission('view_products') && (
            <button className={`nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => openWindow('products')}>
              <span className="icon">📦</span> Product List
            </button>
          )}
          {hasPermission('view_stock') && (
            <button className={`nav-item ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => openWindow('stock')}>
              <span className="icon">📊</span> Stock Inventory
            </button>
          )}

          <div className="nav-divider" />

          {purchaseMenuOptions.length > 0 && (
            <div className="nav-item-with-dropdown">
              <button
                className={`nav-item ${purchaseMenuOptions.some(o => o.tab === activeTab) ? 'active' : ''}`}
                onClick={() => { setPurchaseMenuOpen(!purchaseMenuOpen); setPurchaseMenuIndex(0); }}
                onBlur={e => { if (!e.currentTarget.parentNode.contains(e.relatedTarget)) setTimeout(() => setPurchaseMenuOpen(false), 150); }}
              >
                <span className="icon">🛒</span> Purchase {purchaseMenuOpen ? '▲' : '▼'}
              </button>
              {purchaseMenuOpen && (
                <div className="dropdown-menu">
                  {purchaseMenuOptions.map((opt, idx) => (
                    <button key={opt.tab} className={`dropdown-item ${purchaseMenuIndex === idx ? 'selected' : ''} ${activeTab === opt.tab ? 'current' : ''}`}
                      onMouseEnter={() => setPurchaseMenuIndex(idx)}
                      onClick={() => { openWindow(opt.tab, { purchaseToEdit: null, returnToEdit: null }); setPurchaseMenuOpen(false); }}>
                      <span className="icon">{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

          {hasPermission('create_sale') && (
            <button className={`nav-item ${activeTab.startsWith('sale') && !activeTab.startsWith('sales-') ? 'active' : ''}`} onClick={() => openWindow('sale', { forceNewInstance: true })}>
              <span className="icon">🧾</span> New Sale
            </button>
          )}
          {hasPermission('manage_sales_returns') && (
            <button className={`nav-item ${activeTab.startsWith('sales-return') && !activeTab.includes('list') ? 'active' : ''}`} onClick={() => openWindow('sales-return', { forceNewInstance: true })}>
              <span className="icon">↩️</span> Sales Return
            </button>
          )}
          {hasPermission('view_sales') && (
            <button className={`nav-item ${activeTab === 'sales-list' ? 'active' : ''}`} onClick={() => openWindow('sales-list')}>
              <span className="icon">📈</span> Sales History
            </button>
          )}
          {hasPermission('manage_sales_returns') && (
            <button className={`nav-item ${activeTab === 'sales-return-list' ? 'active' : ''}`} onClick={() => openWindow('sales-return-list')}>
              <span className="icon">📋</span> Returns List
            </button>
          )}

          <div className="nav-divider" />

          {currentUser?.role === 'admin' && networkMode !== 'client' && (
            <button className={`nav-item ${activeTab === 'backup' ? 'active' : ''}`} onClick={() => openWindow('backup')}>
              <span className="icon">💾</span> Backup
            </button>
          )}
          {hasPermission('manage_users') && (
            <button className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => openWindow('users')}>
              <span className="icon">👥</span> Users
            </button>
          )}
          <button className={`nav-item ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => openWindow('customers')}>
            <span className="icon">🧑‍🤝‍🧑</span> Customers
          </button>
          <button className={`nav-item ${['ledgers', 'customer-ledger', 'cash-ledger', 'bank-ledger', 'supplier-ledger', 'freight-report'].includes(activeTab) ? 'active' : ''}`} onClick={() => openWindow('ledgers')}>
            <span className="icon">📒</span> Ledgers
          </button>

          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'network-settings' ? 'active' : ''}`} onClick={() => openWindow('network-settings')}>
              <span className="icon">🌐</span> Network
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'receipt-settings' ? 'active' : ''}`} onClick={() => openWindow('receipt-settings')}>
              <span className="icon">🖨️</span> Print Settings
            </button>
          )}

          <div className="nav-divider" />
          {hasPermission('view_reports') && (
            <>
              <button className={`nav-item ${activeTab === 'gl-accounts' ? 'active' : ''}`} onClick={() => openWindow('gl-accounts')}>
                <span className="icon">🏛️</span> Chart of Accounts
              </button>
              <button className={`nav-item ${activeTab === 'gl-vouchers' ? 'active' : ''}`} onClick={() => openWindow('gl-vouchers')}>
                <span className="icon">🧾</span> Transaction Entry
              </button>
              <button className={`nav-item ${activeTab === 'gl-ledger' ? 'active' : ''}`} onClick={() => openWindow('gl-ledger')}>
                <span className="icon">📖</span> Account Ledger
              </button>
              <button className={`nav-item ${activeTab === 'gl-cash-activity' ? 'active' : ''}`} onClick={() => openWindow('gl-cash-activity')}>
                <span className="icon">💸</span> Cash Activity
              </button>
            </>
          )}
          <div className="nav-divider" />

          {hasPermission('view_reports') && (
            <button className={`nav-item ${activeTab === 'manufacturer-stock' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-stock')}>
              <span className="icon">📊</span> Mfg/Brand Stock
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'manufacturer-discounts' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-discounts')}>
              <span className="icon">🏭</span> Mfg Discounts
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'expense-accounts' ? 'active' : ''}`} onClick={() => openWindow('expense-accounts')}>
              <span className="icon">💰</span> Freight Expense
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="btn-logout">🚪 Logout</button>
          <small>v1.0.0 · Wholesale</small>
        </div>
      </aside>

      <main className="app-main-content">
        <div className="window-content-area">
          {windowStack.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
              <h2 style={{ fontSize: '2.5rem', color: '#374151', fontWeight: '800' }}>Al-Touheed Wholesale</h2>
              <p style={{ fontSize: '1.2rem', color: '#6b7280' }}>Select an option from the sidebar.</p>
            </div>
          )}
          {windowStack.map((win, index) => {
            const isTop = index === windowStack.length - 1;
            const baseKey = win.rootKey || win.key;
            const isFullScreen = ['sale', 'sales-return'].includes(baseKey);
            return (
              <div key={win.id} className={`window-layer ${isFullScreen ? 'fullscreen-mode' : ''}`} style={{ zIndex: index + 10, display: isTop ? 'block' : 'none' }}>
                <div className="window-content-wrapper">
                  <WindowContent
                    win={win} isActive={isTop} currentUser={currentUser}
                    closeTopWindow={closeTopWindow} openWindow={openWindow}
                    hasPermission={hasPermission}
                    handleEditProduct={handleEditProduct}
                    handleEditPurchase={handleEditPurchase}
                    handleEditReturn={handleEditReturn}
                    handleEditSale={handleEditSale}
                    handleEditSalesReturn={handleEditSalesReturn}
                    setShowLayoutTabs={() => {}}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function AppWithData() {
  return <DataProvider><App /></DataProvider>;
}
