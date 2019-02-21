import SwapApp, { util } from 'swap.app'
import actions from 'redux/actions'


const isSwapExist = ({ currency, decline, i }) => {

  const declineSwap = actions.core.getSwapById(decline[i])

  if (declineSwap.isRefunded || declineSwap.flow.state.isFinished === true) {
    actions.core.forgetOrders(this.props.decline[i])
  } else if (declineSwap.sellCurrency === currency.toUpperCase()
    && declineSwap.isMy === false
    && declineSwap.flow.state.isFinished === false
    && !declineSwap.flow.state.isRefunded) {
    return true
  } else {
    return false
  }
}

export default {
  isSwapExist,
}
