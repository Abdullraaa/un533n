
import React from 'react';

const Contact = () => {
  return (
    <div className="px-8 py-16">
      <h1 className="text-3xl font-bold text-center">Contact Us</h1>
      <div className="max-w-lg mx-auto mt-8">
        <form action="" className="space-y-4">
          <div>
            <label htmlFor="name" className="block">Name</label>
            <input type="text" id="name" className="w-full bg-secondary text-primary border border-gray-700 rounded py-2 px-4" />
          </div>
          <div>
            <label htmlFor="email" className="block">Email</label>
            <input type="email" id="email" className="w-full bg-secondary text-primary border border-gray-700 rounded py-2 px-4" />
          </div>
          <div>
            <label htmlFor="message" className="block">Message</label>
            <textarea id="message" rows="5" className="w-full bg-secondary text-primary border border-gray-700 rounded py-2 px-4"></textarea>
          </div>
          <button type="submit" className="bg-accent text-primary py-2 px-8 rounded-full font-bold">Send</button>
        </form>
      </div>
    </div>
  );
};

export default Contact;
