export const initialState = {}

export const saveSwap = (state, swap) => ({
  saveSwap: swap,
})

export const removeSwap = (state, swap) => ({
  ...state.items.splice(0, 1),
})
