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
import InlineLoader from 'components/loaders/InlineLoader/InlineLoader'

import config from 'app-config'


const isWidgetBuild = config && config.isWidget

@injectIntl
@connect(({
  user: { ethData, btcData, /* bchData, */ tokensData, eosData, telosData, nimData, usdtData, ltcData },
  ipfs: { peer },
  rememberedOrders,
  rememberedSwaps,
}) => ({
  items: [ ethData, btcData, eosData, telosData, /* bchData, */ ltcData, usdtData /* nimData */ ],
  tokenItems: [ ...Object.keys(tokensData).map(k => (tokensData[k])) ],
  errors: 'api.errors',
  checked: 'api.checked',
  decline: rememberedOrders.savedOrders,
  rememberedSwaps,
  peer,
}))

@cssModules(styles, { allowMultiple: true })
export default class SwapComponent extends PureComponent {

  state = {
    stepToHide: 0,
    swap: null,
    isMy: false,
    hideAll: false,
    ethBalance: null,
    currencyData: null,
    isAmountMore: null,
    SwapComponent: null,
    continueSwap: true,
    enoughBalance: true,
    depositWindow: false,
    isShowingBitcoinScript: false,
    isShowDevInformation: false,
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
        stepToHide: swap.sellCurrency === 'BTC' ? 2 : 3,
      })

    } catch (error) {
      console.error(error)
      actions.notifications.show(constants.notifications.ErrorNotification, { error: 'Sorry, but this order do not exsit already' })
      this.props.history.push(localisedUrl(links.exchange))
    }
    this.saveThisSwap(orderId)
    if (!this.props.decline.includes(orderId)) {
      this.setSaveSwapId(orderId)
    }
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
      this.deleteThisSwap(id)
    }
    this.getSwap()
  }

  saveThisSwap = (orderId) => {
    if (!this.props.decline.includes(orderId)) {
      actions.core.rememberOrder(orderId)
    }
  }

  deleteThisSwap = (orderId) => {
    actions.core.forgetOrders(orderId)
    if (this.props.peer === this.state.swap.owner.peer) {
      actions.core.removeOrder(orderId)
    }
  }

  cancelSwap = () => {
    let { match : { params : { orderId } }, history, location: { pathname }, intl: { locale } } = this.props
    const { swap: { flow: { state: { step } }, sellCurrency }, swap } = this.state

    this.state.swap.flow.isClosed()
    this.deleteThisSwap(orderId)
    this.setState(() => ({
      hideAll: true,
    }))
  }

  receiveMessage = () => {
    this.setState({
      hideAll: true,
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

  toggleInfo = (a, b) => {
    this.setState({
      isShowDevInformation: !a,
      isShowingBitcoinScript: !b,
    })
  }

  getSwap = () => {
    let { match : { params : { orderId } }, history, location: { pathname }, intl: { locale }, rememberedSwaps } = this.props
    actions.core.rememberSwap(this.state.swap)
    localStorage.setItem(constants.localStorage.saveSwap, rememberedSwaps)
  }

  goWallet = () => {
    const { intl: { locale } } = this.props
    this.deleteThisSwap(this.state.swap.id)
    this.props.history.push(localisedUrl(locale, '/'))
  }

  render() {
    const { peer, tokenItems, history, intl: { locale } } = this.props
    const {
      hideAll,
      swap,
      SwapComponent,
      currencyData,
      isAmountMore,
      ethData,
      continueSwap,
      enoughBalance,
      depositWindow,
      ethAddress,
      isShowingBitcoinScript,
      isShowDevInformation,
      requestToFaucetSended,
      stepToHide,
    } = this.state

    if (!swap || !SwapComponent || !peer || !isAmountMore) {
      return null
    }

    const isFinished = (swap.flow.state.step >= (swap.flow.steps.length - 1))
    return (
      <Fragment>
        {hideAll ?
          <div>
            <h3 styleName="canceled" /* eslint-disable-line */ onClick={this.goWallet}>
              <FormattedMessage id="swappropgress327" defaultMessage="this Swap is canceled" />
            </h3>
            <div>
              {swap.flow.state.refundTxHex ?
                <div>
                  <a
                    href="https://wiki.swap.online/faq/my-swap-got-stuck-and-my-bitcoin-has-been-withdrawn-what-to-do/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FormattedMessage id="swappropgress332" defaultMessage="How to refund your money ?" />
                  </a>
                  {' '}
                  <p>
                    <FormattedMessage id="swappropgress333" defaultMessage="Refund hex transaction: " />
                  </p>
                  <code>{swap.flow.state.refundTxHex}</code>
                </div> :
                <h3 styleName="refHex">
                  {swap.flow.state.refundTxHex === null && <FormattedMessage
                    id="swappropgress345"
                    defaultMessage="Refund transaction is creating {loader}"
                    values={{
                      loader: <a styleName="loaderHolder"><InlineLoader /></a>,
                    }}
                  />}
                </h3>
              }
            </div>
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
              {
                swap.flow.state.step <= stepToHide || !enoughBalance &&
                <h1 /* eslint-disable-line */ onClick={this.cancelSwap} styleName="cancelSwap">
                  <FormattedMessage id="swapjs290" defaultMessage="Cancel swap" />
                </h1>
              }
              {
                swap.flow.state.step >= 7 &&
                <h1 /* eslint-disable-line */ onClick={this.goWallet} styleName="cancelSwap">
                  <FormattedMessage id="swapjs394" defaultMessage="Delete the swap" />
                </h1>
              }
              <Share flow={swap.flow} />
              <EmergencySave flow={swap.flow} />
              <ShowBtcScript onClick={this.toggleBitcoinScript} btcScriptValues={swap.flow.state.btcScriptValues} isShowingBitcoinScript={isShowingBitcoinScript} />
            </SwapComponent>
          </div>
        }
      </Fragment>
    )
  }
}
