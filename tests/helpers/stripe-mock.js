// One shared mock instance. Both routes/orders.js and routes/payment.js call
// `require('stripe')(key)` at module load; the factory in each test file hands
// them this same object, so one set of mocks controls both.
module.exports = {
  paymentIntents: {
    retrieve: jest.fn(),
    create: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
};
