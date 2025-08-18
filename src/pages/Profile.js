import React, { useState, useEffect } from 'react';
import { useStoreContext } from '../components/StoreProvider';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, updateProfile, addresses, fetchAddresses, addAddress, updateAddress, deleteAddress, orders, fetchOrders, wishlist, fetchWishlist } = useStoreContext();

  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '' });
  const [newAddressForm, setNewAddressForm] = useState({
    address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping'
  });
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login'); // Redirect to login if not authenticated
    } else {
      setProfileForm({ first_name: user.first_name, last_name: user.last_name });
      fetchAddresses();
      fetchOrders();
      fetchWishlist();
    }
  }, [user, navigate, fetchAddresses, fetchOrders, fetchWishlist]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateProfile(profileForm);
      setEditMode(false);
      alert('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addAddress(newAddressForm);
      setNewAddressForm({ address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping' });
      alert('Address added successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add address.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAddress = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateAddress(editingAddressId, newAddressForm);
      setEditingAddressId(null);
      setNewAddressForm({ address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping' });
      alert('Address updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update address.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    if (window.confirm('Are you sure you want to delete this address?')) {
      setLoading(true);
      setError(null);
      try {
        await deleteAddress(id);
        alert('Address deleted successfully!');
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete address.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return <div>Loading user data...</div>; // Or a redirect to login
  }

  return (
    <div className="px-8 py-16">
      <h1 className="text-3xl font-bold text-center mb-8">My Profile</h1>
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-8">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

        {/* User Information */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Personal Information</h2>
          {!editMode ? (
            <div>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Name:</strong> {user.first_name} {user.last_name}</p>
              <button onClick={() => setEditMode(true)} className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-md">Edit Profile</button>
            </div>
          ) : (
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div>
                <label htmlFor="firstName" className="block">First Name</label>
                <input type="text" id="firstName" value={profileForm.first_name} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label htmlFor="lastName" className="block">Last Name</label>
                <input type="text" id="lastName" value={profileForm.last_name} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} className="w-full p-2 border rounded" />
              </div>
              <div className="flex space-x-4">
                <button type="submit" className="bg-green-500 text-white py-2 px-4 rounded-md" disabled={loading}>Save Changes</button>
                <button type="button" onClick={() => setEditMode(false)} className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md">Cancel</button>
              </div>
            </form>
          )}
        </div>

        {/* Address Management */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">My Addresses</h2>
          {addresses.length === 0 ? (
            <p>No addresses saved.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map(addr => (
                <div key={addr.id} className="border p-4 rounded-md shadow-sm">
                  <p>{addr.address_line1}</p>
                  {addr.address_line2 && <p>{addr.address_line2}</p>}
                  <p>{addr.city}, {addr.state} {addr.postal_code}</p>
                  <p>{addr.country}</p>
                  <p className="font-semibold">({addr.address_type})</p>
                  <div className="mt-2 flex space-x-2">
                    <button 
                      onClick={() => {
                        setEditingAddressId(addr.id);
                        setNewAddressForm(addr);
                      }}
                      className="text-blue-500 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-red-500 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button 
            onClick={() => {
              setEditingAddressId(null);
              setNewAddressForm({ address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping' });
            }}
            className="mt-4 bg-green-500 text-white py-2 px-4 rounded-md"
          >
            Add New Address
          </button>

          {(editingAddressId || (addresses.length === 0 && !editingAddressId)) && ( // Show form if editing or no addresses and adding new
            <form onSubmit={editingAddressId ? handleUpdateAddress : handleAddAddress} className="space-y-4 mt-4 p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-bold">{editingAddressId ? 'Edit Address' : 'Add New Address'}</h3>
              <input type="text" placeholder="Address Line 1" value={newAddressForm.address_line1} onChange={(e) => setNewAddressForm({...newAddressForm, address_line1: e.target.value})} className="w-full p-2 border rounded" required />
              <input type="text" placeholder="Address Line 2" value={newAddressForm.address_line2} onChange={(e) => setNewAddressForm({...newAddressForm, address_line2: e.target.value})} className="w-full p-2 border rounded" />
              <input type="text" placeholder="City" value={newAddressForm.city} onChange={(e) => setNewAddressForm({...newAddressForm, city: e.target.value})} className="w-full p-2 border rounded" required />
              <input type="text" placeholder="State" value={newAddressForm.state} onChange={(e) => setNewAddressForm({...newAddressForm, state: e.target.value})} className="w-full p-2 border rounded" required />
              <input type="text" placeholder="Postal Code" value={newAddressForm.postal_code} onChange={(e) => setNewAddressForm({...newAddressForm, postal_code: e.target.value})} className="w-full p-2 border rounded" required />
              <input type="text" placeholder="Country" value={newAddressForm.country} onChange={(e) => setNewAddressForm({...newAddressForm, country: e.target.value})} className="w-full p-2 border rounded" required />
              <select value={newAddressForm.address_type} onChange={(e) => setNewAddressForm({...newAddressForm, address_type: e.target.value})} className="w-full p-2 border rounded">
                <option value="shipping">Shipping</option>
                <option value="billing">Billing</option>
              </select>
              <div className="flex space-x-2">
                <button type="submit" className="bg-blue-500 text-white py-2 px-4 rounded-md" disabled={loading}>{editingAddressId ? 'Update Address' : 'Add Address'}</button>
                <button type="button" onClick={() => setEditingAddressId(null)} className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md">Cancel</button>
              </div>
            </form>
          )}
        </div>

        {/* Order History */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">My Orders</h2>
          {orders.length === 0 ? (
            <p>No orders placed yet.</p>
          ) : (
            <div className="space-y-4">
              {orders.map(order => (
                <div key={order.id} className="border p-4 rounded-md shadow-sm">
                  <p><strong>Order ID:</strong> {order.id}</p>
                  <p><strong>Date:</strong> {new Date(order.order_date).toLocaleDateString()}</p>
                  <p><strong>Total:</strong> ${order.total_amount.toFixed(2)}</p>
                  <p><strong>Status:</strong> {order.status}</p>
                  {/* You might want to fetch order items here or link to a detailed order page */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wishlist */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">My Wishlist</h2>
          {wishlist.length === 0 ? (
            <p>Your wishlist is empty.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {wishlist.map(item => (
                <div key={item.variant_id} className="border p-4 rounded-md shadow-sm">
                  <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover mb-2" />
                  <p className="font-bold">{item.name}</p>
                  <p className="text-sm">Size: {item.size}, Color: {item.color}</p>
                  <p className="font-semibold">${item.price.toFixed(2)}</p>
                  {/* Add to cart or remove from wishlist buttons */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="text-center mt-8">
          <button onClick={handleLogout} className="bg-red-500 text-white py-2 px-6 rounded-full hover:bg-red-600 transition-colors duration-300">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;