import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useStoreContext } from './StoreProvider';

const linkClass = ({ isActive }) =>
  isActive ? 'text-un-gold' : 'hover:text-un-gold';

const Nav = () => {
  const { user, cart, logout } = useStoreContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const itemCount = (cart?.items || []).reduce((n, i) => n + (i.quantity || 0), 0);

  // Close the menu on navigation, otherwise it stays open over the new page.
  React.useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const close = () => setMenuOpen(false);

  return (
    <header className="bg-un-black shadow-md">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center gap-4">
        <Link to="/" className="text-2xl font-bold text-un-gold shrink-0">UN533N</Link>

        {/* Below md these links are hidden; the toggle below reveals them. */}
        <div className="hidden md:flex items-center space-x-6">
          <NavLink to="/shop" className={linkClass}>Shop</NavLink>
          <NavLink to="/about" className={linkClass}>About</NavLink>
          <NavLink to="/contact" className={linkClass}>Contact</NavLink>
          <a href="/blog.html" className="hover:text-un-gold">Blog</a>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <NavLink to="/cart" className={linkClass}>
            Cart{itemCount > 0 ? ` (${itemCount})` : ''}
          </NavLink>
          {user ? (
            <>
              <NavLink to="/profile" className="hidden md:inline hover:text-un-gold">Profile</NavLink>
              <button type="button" onClick={logout} className="hidden md:inline hover:text-un-gold">
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={`hidden md:inline ${'hover:text-un-gold'}`}>Login</NavLink>
          )}

          <button
            type="button"
            className="md:hidden text-2xl leading-none px-1 hover:text-un-gold"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile panel. Without this, /about, /contact and /blog.html have no
          reachable link anywhere in the app on a phone. */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800">
          <div className="container mx-auto px-6 py-4 flex flex-col space-y-3">
            <NavLink to="/shop" className={linkClass} onClick={close}>Shop</NavLink>
            <NavLink to="/about" className={linkClass} onClick={close}>About</NavLink>
            <NavLink to="/contact" className={linkClass} onClick={close}>Contact</NavLink>
            <a href="/blog.html" className="hover:text-un-gold" onClick={close}>Blog</a>
            <hr className="border-gray-800" />
            {user ? (
              <>
                <NavLink to="/profile" className={linkClass} onClick={close}>Profile</NavLink>
                <button
                  type="button"
                  onClick={() => { close(); logout(); }}
                  className="text-left hover:text-un-gold"
                >
                  Log out
                </button>
              </>
            ) : (
              <NavLink to="/login" className={linkClass} onClick={close}>Login</NavLink>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Nav;
