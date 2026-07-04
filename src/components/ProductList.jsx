import React, { useState, useEffect } from 'react';
import { useDataVersion } from '../context/DataContext';
import './ProductList.css';

const { ipcRenderer } = window.require('electron');

function ProductList({ onEditProduct, currentUser, isActive }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const version = useDataVersion('products');

  useEffect(() => { loadProducts(); }, [version]);

  const loadProducts = async () => {
    try { setProducts(await ipcRenderer.invoke('get-products') || []); } catch {}
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.item_code} - ${p.description}"?`)) return;
    await ipcRenderer.invoke('delete-product', p.id);
    loadProducts();
  };

  const filtered = products.filter(p =>
    !search || p.item_code.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase())
  );

  const canManage = currentUser?.role === 'admin' || (currentUser?.permissions || []).includes('manage_products');

  return (
    <div className="product-list-container">
      <div className="list-header">
        <h2>Product List <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({filtered.length})</span></h2>
        <input className="search-bar" placeholder="Search by code or description..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Size Range</th>
              <th className="text-right">Purchase Rate</th>
              <th className="text-right">Sale Rate</th>
              <th className="text-center">Packing</th>
              {canManage && <th className="text-center">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={canManage ? 8 : 7} className="empty-state">No products found</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td><span className="badge badge-code">{p.item_code}</span></td>
                <td>{p.description}</td>
                <td><span className="badge badge-cat">{p.category}</span></td>
                <td>{p.size_range || '—'}</td>
                <td className="text-right">PKR {parseFloat(p.purchase_rate).toLocaleString()}</td>
                <td className="text-right" style={{ color: '#16a34a', fontWeight: 600 }}>PKR {parseFloat(p.sale_rate).toLocaleString()}</td>
                <td className="text-center">{p.packing_qty} pcs</td>
                {canManage && (
                  <td className="text-center">
                    <button className="btn-edit" onClick={() => onEditProduct?.(p)}>Edit</button>
                    <button className="btn-del" onClick={() => handleDelete(p)}>Del</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProductList;
