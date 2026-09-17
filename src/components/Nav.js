import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useStoreContext } from './StoreProvider';

const linkClass = ({ isActive }) =>
  isActive ? 'text-un-gold' : 'hover:text-un-gold';

const Nav = () => {
  const { user, cart, logout } = useStoreContext();
  const itemCount = (cart?.items || []).reduce((n, i) => n + (i.quantity || 0), 0);

  return (
    <header className="bg-un-black shadow-md">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-un-gold">UN533N</Link>

        <div className="hidden md:flex items-center space-x-6">
          <NavLink to="/shop" className={linkClass}>Shop</NavLink>
          <NavLink to="/about" className={linkClass}>About</NavLink>
          <NavLink to="/contact" className={linkClass}>Contact</NavLink>
          <a href="/blog.html" className="hover:text-un-gold">Blog</a>
        </div>

        <div className="flex items-center space-x-4">
          <NavLink to="/cart" className={linkClass}>
            Cart{itemCount > 0 ? ` (${itemCount})` : ''}
          </NavLink>
          {user ? (
            <>
              <NavLink to="/profile" className={linkClass}>Profile</NavLink>
              <button type="button" onClick={logout} className="hover:text-un-gold">
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={linkClass}>Login</NavLink>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Nav;
