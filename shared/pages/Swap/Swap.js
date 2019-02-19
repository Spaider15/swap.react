import React, { PureComponent, Fragment } from 'react'

import Swap from 'swap.swap'
import SwapApp from 'swap.app'

import cssModules from 'react-css-modules'
import styles from './Swap.scss'

import { connect } from 'redaction'
import helpers, { links, constants, request } from 'helpers'
import actions from 'redux/actions'
import { Link } from 'react-router-dom'

import { swapComponents } from './swaps'
import Share from './Share/Share'
import EmergencySave from './EmergencySave/EmergencySave'
import { injectIntl, FormattedMessage } from 'react-intl'
import { localisedUrl } from 'helpers/locale'
import DeleteSwapAfterEnd from './DeleteSwapAfterEnd'
import { Button } from 'components/controls'
import FeeControler from './FeeControler/FeeControler'
import DepositWindow from './DepositWindow/DepositWindow'
import ShowBtcScript from './ShowBtcScript/ShowBtcScript'

import config from 'app-config'


const isWidgetBuild = config && config.isWidget

@injectIntl
@connect(({
  user: { ethData, btcData, /* bchData, */ tokensData, eosData, telosData, nimData, usdtData, ltcData },
  ipfs: { peer },
}) => ({
  items: [ ethData, btcData, eosData, telosData, /* bchData, */ ltcData, usdtData /* nimData */ ],
  tokenItems: [ ...Object.keys(tokensData).map(k => (tokensData[k])) ],
  errors: 'api.errors',
  checked: 'api.checked',
  peer,
}))

@cssModules(styles, { allowMultiple: true })
export default class SwapComponent extends PureComponent {

  state = {
    swap: null,
    isMy: false,
    isDeleted: true,
    hideAll: false,
    ethBalance: null,
    currencyData: null,
    isAmountMore: null,
    SwapComponent: null,
    continueSwap: true,
    enoughBalance: true,
    depositWindow: false,
    isShowingBitcoinScript: false,
    shouldStopCheckSendingOfRequesting: false,
  }

  timerFeeNotication = null

  componentWillMount() {
    const { items, tokenItems, intl: { locale } } = this.props
    let { match : { params : { orderId } }, history, location: { pathname } } = this.props

    if (!orderId) {
      history.push(localisedUrl(links.exchange))
      return
    }

    try {
      const swap = new Swap(orderId, SwapApp.shared())
      const SwapComponent = swapComponents[swap.flow._flowName]
      const ethData = items.filter(item => item.currency === 'ETH')
      const currencyData = items.concat(tokenItems)
        .filter(item => item.currency === swap.sellCurrency.toUpperCase())[0]
      const currencies = [
        {
          currency: swap.sellCurrency,
          amount: swap.sellAmount,
        },
        {
          currency: swap.buyCurrency,
          amount: swap.buyAmount,
        },
      ]

      currencies.forEach(item => {
        actions.user.getExchangeRate(item.currency, 'usd')
          .then(exRate => {
            const amount = exRate * Number(item.amount)

            if (Number(amount) >= 50) {
              this.setState(() => ({ isAmountMore: 'enable' }))
            } else {
              this.setState(() => ({ isAmountMore: 'disable' }))
            }
          })
      })
      window.swap = swap

      this.setState({
        swap,
        ethData,
        SwapComponent,
        currencyData,
        ethAddress: ethData[0].address,
        stepToHide: swap.sellCurrency === 'BTC' ? 5 : 4,
      })

    } catch (error) {
      console.error(error)
      actions.notifications.show(constants.notifications.ErrorNotification, { error: 'Sorry, but this order do not exsit already' })
      this.props.history.push(localisedUrl(links.exchange))
    }
    this.saveThisSwap(orderId, pathname)
    this.setSaveSwapId(orderId)
  }

  componentDidMount() {
    const { swap: { id, flow: { state: { canCreateEthTransaction, requireWithdrawFeeSended, isFinished } } }, continueSwap } = this.state

    if (this.state.swap !== null) {
      this.state.swap.room.once('stop swap', this.receiveMessage)

      setTimeout(() => {
        if (!canCreateEthTransaction && continueSwap && requireWithdrawFeeSended) {
          this.checkEnoughFee()
        }
      }, 300 * 1000)

      setInterval(() => {
        this.catchWithdrawError()
        this.requestingWithdrawFee()
        this.isBalanceEnough()
      }, 5000)
    }
    if (isFinished) {
      this.deleteThisSwap(this.props.location.pathname)
    }
  }

  saveThisSwap = (orderId, pathname) => {
    actions.core.rememberOrder(pathname, orderId)
  }

  deleteThisSwap = (id, pathname) => {
    actions.core.forgetOrders(pathname)
    if (this.props.peer === this.state.swap.owner.peer) {
      actions.core.removeOrder(id)
    }
  }

  cancelSwapBtc = () => {
    let { match : { params : { orderId } }, history, location: { pathname }, intl: { locale } } = this.props
    const { swap: { flow: { state: { step } }, sellCurrency }, swap } = this.state

    this.state.swap.flow.isClosed()

    if (step < 2) {
      this.deleteThisSwap(orderId, pathname)
      history.push(localisedUrl(locale, '/'))
    }
    if (step <= 5 && step >= 2) {
      swap.flow.getRefundTxHex()
      this.deleteThisSwap(orderId, pathname)
      this.setState(() => ({
        hideAll: true,
      }))
    }
  }

  cancelSwap = () => {
    let { match : { params : { orderId } }, history, location: { pathname }, intl: { locale } } = this.props
    const { swap: { flow: { state: { step } }, sellCurrency } } = this.state

    this.state.swap.flow.isClosed()

    if (step <= 4) {
      this.deleteThisSwap(orderId, pathname)
    }

    setTimeout(() => {
      history.push(localisedUrl(locale, '/'))
    }, 10 * 1000)
  }

  receiveMessage = () => {
    this.setState({
      isDeleted: true,
    })
    if (this.state.swap.sellCurrency === 'BTC') {
      this.cancelSwapBtc()
    } else {
      this.cancelSwap()
    }
  }

  setSaveSwapId = (orderId) => {
    let swapsId = JSON.parse(localStorage.getItem('swapId'))

    if (swapsId === null || swapsId.length === 0) {
      swapsId = []
    }
    if (!swapsId.includes(orderId)) {
      swapsId.push(orderId)
    }
    localStorage.setItem('swapId', JSON.stringify(swapsId))
  }

  isBalanceEnough = () => {
    const { swap, balance } = this.state
    if (swap.flow.state.step === 4 && swap.sellCurrency !== 'BTC') {
      swap.flow.syncBalance()
    }

    if (!swap.flow.state.isBalanceEnough && swap.flow.state.step === 4) {
      this.setState(() => ({ enoughBalance: false }))
    } else {
      this.setState(() => ({ enoughBalance: true }))
    }
  }

  requestingWithdrawFee = () => {
    const { swap: { flow: { acceptWithdrawRequest, sendWithdrawRequest,
      state: { requireWithdrawFee, requireWithdrawFeeSended, withdrawRequestIncoming, withdrawRequestAccepted } } } } = this.state

    if (requireWithdrawFee && !requireWithdrawFeeSended) {
      sendWithdrawRequest()
    }
    if (withdrawRequestIncoming && !withdrawRequestAccepted) {
      acceptWithdrawRequest()
    }
  }

  catchWithdrawError = () => {
    const { swap, shouldStopCheckSendingOfRequesting, continueSwap } = this.state

    if (swap.sellCurrency === 'BTC'
      && helpers.ethToken.isEthToken({ name: swap.buyCurrency.toLowerCase() })
      && !shouldStopCheckSendingOfRequesting) {
      this.setState(() => ({ continueSwap: true }))
    } else {
      this.checkEnoughFee()
      this.setState(() => ({
        shouldStopCheckSendingOfRequesting: true,
      }))
    }
  }

  sendRequestToFaucet = () => {
    const { owner, buyCurrency, buyAmount, sellCurrency, sellAmount } = this.state.swap

    if (this.state.requestToFaucetSended) return
    if (this.state.requestToFaucetError) return

    this.setState({
      requestToFaucetSended: true,
    })

    request.post(`${config.api.faucet}`, {
      body: {
        eth: this.state.ethAddress,
        buyCurrency,
        buyAmount: buyAmount.toString(),
        sellCurrency,
        sellAmount: sellAmount.toString(),
      },
    }).then((rv) => {
      console.log('faucet answered', rv)
      this.setState({
        requestToFaucetTxID: rv.txid,
      })
    }).catch((error) => {
      console.log('faucet error')
      this.setState({
        requestToFaucetSended: false,
        requestToFaucetError: true,
      })
    })
  }

  checkEnoughFee = () => {
    const { swap: { participantSwap, flow: { state: { canCreateEthTransaction } } }, currencyData: { currency }, continueSwap } = this.state

    const coinsWithDynamicFee = ['BTC', 'ETH', 'LTC']

    if (canCreateEthTransaction === false && (
      helpers.ethToken.isEthToken({ name: currency.toLowerCase() })
      || coinsWithDynamicFee.includes(currency)
    )) {
      this.setState(() => ({
        continueSwap: false,
      }))
      this.sendRequestToFaucet()
    } else {
      this.setState(() => ({
        continueSwap: true,
      }))
    }
  }

  toggleBitcoinScript = () => {
    this.setState({
      isShowingBitcoinScript: !this.state.isShowingBitcoinScript,
    })
  }
  sr = () => {
    this.setState({
      isDeleted: false,
    })
  }

  render() {
    const { peer, tokenItems, history } = this.props
    const {
      swap, SwapComponent, currencyData, isAmountMore, ethData, continueSwap, enoughBalance, hideAll, hex,
      depositWindow, ethAddress, isShowingBitcoinScript, requestToFaucetSended, stepToHide, isDeleted,
    } = this.state

    if (!swap || !SwapComponent || !peer || !isAmountMore) {
      return null
    }
    const isFinished = (swap.flow.state.step >= (swap.flow.steps.length - 1))

    return (
      <Fragment>
        {hideAll ?
          <div>
            <h3>
              <FormattedMessage id="swappropgress327" defaultMessage="One of Participant canceled this swap" />
            </h3>
            {swap.flow.state.refundTxHex &&
              <div>
                <a
                  href="https://wiki.swap.online/faq/my-swap-got-stuck-and-my-bitcoin-has-been-withdrawn-what-to-do/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FormattedMessage id="swappropgress332" defaultMessage="How refund your money ?" />
                </a>
                <FormattedMessage id="swappropgress333" defaultMessage="Refund hex transaction: " />
                <code>{swap.flow.state.refundTxHex}</code>
              </div>
            }
          </div> :
          <div>
            {isDeleted ?
              <div>
                <h3>
                  <FormattedMessage id="swappropgress327" defaultMessage="Participant cancel the swap" />
                </h3>
              </div> :
              <div styleName="swap">
                <SwapComponent
                  tokenItems={tokenItems}
                  depositWindow={depositWindow}
                  disabledTimer={isAmountMore === 'enable'}
                  history={history}
                  swap={swap}
                  ethAddress={ethAddress}
                  currencyData={currencyData}
                  styles={styles}
                  enoughBalance={enoughBalance}
                  ethData={ethData}
                  continueSwap={continueSwap}
                  requestToFaucetSended={requestToFaucetSended}
                >
                  {swap.flow.state.step <= stepToHide &&
                    <a onClick={swap.sellCurrency === 'BTC' ? this.cancelSwapBtc : this.cancelSwap}>
                      <FormattedMessage id="swapjs290" defaultMessage="Cancel swap" />
                    </a>
                  }
                  <Share flow={swap.flow} />
                  <EmergencySave flow={swap.flow} />
                  <ShowBtcScript onClick={this.toggleBitcoinScript} btcScriptValues={swap.flow.state.btcScriptValues} isShowingBitcoinScript={isShowingBitcoinScript} />
                </SwapComponent>
              </div>
            }
          </div>
        }
      </Fragment>
    )
  }
}
