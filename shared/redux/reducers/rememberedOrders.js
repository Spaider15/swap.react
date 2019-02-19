const initialState = {
  savedOrders: JSON.parse(localStorage.getItem('savedOrders')) || [],
}


const savedOrders = (state, payload) => ({
  savedOrders: [
    ...state.savedOrders,
    payload,
  ],
})

const forgetOrders = (state, payload) => ({
  ...state,
  savedOrders: state.savedOrders.filter(item => item !== payload),
})

const getOrderIntheProcess = (state, payload) => ({
  ...state,
  savedOrders: state.savedOrders.filter(item => item === payload),
})

export {
  initialState,
  savedOrders,
  forgetOrders,
  getOrderIntheProcess,
}
