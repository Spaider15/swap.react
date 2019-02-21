const initialState = {
  savedOrders: JSON.parse(localStorage.getItem('savedOrders')) || [],
}

const savedOrders = (state, orderId) => ({
  savedOrders: [
    ...state.savedOrders,
    orderId,
  ],
})

const forgetOrders = (state, orderId) => ({
  ...state,
  savedOrders: state.savedOrders.filter(item => item !== orderId),
})

const getOrderIntheProcess = (state, orderId) => ({
  ...state,
  savedOrders: state.savedOrders.filter(item => item === orderId),
})

export {
  initialState,
  savedOrders,
  forgetOrders,
  getOrderIntheProcess,
}
