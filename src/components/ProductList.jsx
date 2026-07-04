import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';
import './ProductList.css';

const { ipcRenderer } = window.require('electron');

function ProductList({ onEditProduct, currentUser, isActive }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const version = useDataVersion('products');
  const tableContainerRef = React.useRef(null);
  const selectedRowRef = React.useRef(null);

  useEffect(() => { if (isActive) loadProducts(); }, [version, isActive]);

  const loadProducts = async () => {
    try { setProducts(await ipcRenderer.invoke('get-products') || []); } catch {}
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.item_code} - ${p.description}"?`)) return;
    await ipcRenderer.invoke('delete-product', p.id);
    loadProducts();
  };

  const filtered = products.filter(p =>
    !search ||
    p.item_code.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.gender || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const canManage = currentUser?.role === 'admin' || (currentUser?.permissions || []).includes('manage_products');

  useEffect(() => { setSelectedIndex(0); }, [search, products]);

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex] && canManage) {
          onEditProduct?.(filtered[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, filtered, selectedIndex, canManage, onEditProduct]);

  useEffect(() => {
    if (selectedRowRef.current && tableContainerRef.current) {
      const container = tableContainerRef.current;
      const row = selectedRowRef.current;
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();

      if (rowRect.bottom > containerRect.bottom) {
        container.scrollTop += (rowRect.bottom - containerRect.bottom);
      } else if (rowRect.top < containerRect.top) {
        container.scrollTop -= (containerRect.top - rowRect.top);
      }
    }
  }, [selectedIndex]);

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 });

  return (
    <div className="product-list-container">
      <div className="list-header">
        <h2>Product List <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({filtered.length})</span></h2>
        <input className="search-bar" placeholder="Search by code, brand, gender, description..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="table-wrapper" ref={tableContainerRef}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Brand</th>
              <th>Description</th>
              <th>Gender</th>
              <th>Category</th>
              <th>Size</th>
              <th className="text-right">Purchase</th>
              <th className="text-right">Sale</th>
              <th className="text-right">Discount</th>
              <th className="text-center">Packing</th>
              {canManage && <th className="text-center">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={canManage ? 11 : 10} className="empty-state">No products found</td></tr>
            ) : filtered.map((p, idx) => {
              const purchase = parseFloat(p.purchase_rate) || 0;
              const sale = parseFloat(p.sale_rate) || 0;
              const disc = parseFloat(p.discount) || 0;

              return (
                <tr 
                  key={p.id} 
                  className={idx === selectedIndex ? 'selected-row' : ''}
                  ref={idx === selectedIndex ? selectedRowRef : null}
                  onClick={() => setSelectedIndex(idx)}
                  onDoubleClick={() => canManage && onEditProduct?.(p)}
                >
                  <td><span className="badge badge-code">{p.item_code}</span></td>
                  <td style={{ fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{p.brand || '—'}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description}>{p.description || '—'}</td>
                  <td>{p.gender ? <span className="badge badge-cat">{p.gender}</span> : '—'}</td>
                  <td>{p.category ? <span className="badge badge-cat">{p.category}</span> : '—'}</td>
                  <td style={{ fontWeight: 700, color: '#374151', fontSize: '0.9rem' }}>{p.size_range || '—'}</td>

                  {/* Purchase Rate — red tinted */}
                  <td className="text-right">
                    <span style={{
                      display: 'inline-block',
                      background: '#fff1f2', color: '#be123c',
                      fontWeight: 800, fontSize: '1rem',
                      padding: '5px 12px', borderRadius: 6,
                      border: '1px solid #fecdd3',
                    }}>
                      {fmt(purchase)}
                    </span>
                  </td>

                  {/* Sale Rate — green tinted */}
                  <td className="text-right">
                    <span style={{
                      display: 'inline-block',
                      background: '#f0fdf4', color: '#15803d',
                      fontWeight: 800, fontSize: '1rem',
                      padding: '5px 12px', borderRadius: 6,
                      border: '1px solid #bbf7d0',
                    }}>
                      {fmt(sale)}
                    </span>
                  </td>

                  {/* Discount — orange tinted */}
                  <td className="text-right">
                    {disc > 0 ? (
                      <span style={{
                        display: 'inline-block',
                        background: '#fff7ed', color: '#ea580c',
                        fontWeight: 800, fontSize: '1rem',
                        padding: '5px 12px', borderRadius: 6,
                        border: '1px solid #fed7aa',
                      }}>
                        -{fmt(disc)}
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: '0.9rem' }}>—</span>
                    )}
                  </td>

                  <td className="text-center" style={{ color: '#6b7280', fontSize: '0.85rem' }}>{p.packing_qty} pcs</td>

                  {canManage && (
                    <td className="text-center">
                      <button className="btn-edit" onClick={() => onEditProduct?.(p)}>Edit</button>
                      <button className="btn-del" onClick={() => handleDelete(p)}>Del</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProductList;
