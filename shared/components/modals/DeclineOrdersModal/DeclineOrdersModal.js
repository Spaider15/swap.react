import React, { Fragment, Component } from 'react'
import PropTypes from 'prop-types'

import { connect } from 'redaction'
import actions from 'redux/actions'
import { localisedUrl } from 'helpers/locale'

import cssModules from 'react-css-modules'
import styles from './DeclineOrdersModal.scss'

import Modal from 'components/modal/Modal/Modal'
import Button from 'components/controls/Button/Button'
import CopyToClipboard from 'react-copy-to-clipboard'

import { FormattedMessage, injectIntl, defineMessages } from 'react-intl'

import { withRouter } from 'react-router'


const title = defineMessages({
  downloadModal: {
    id: 'decline 21',
    defaultMessage: 'Declined orders!',
  },
})

@injectIntl
@withRouter
@cssModules(styles)
export default class DeclineOrdersModal extends Component {

  goToDecline = () => {
    const { intl: { locale }, data: { declineOrder: { sellCurrency, buyCurrency, id } }, history } = this.props
    history.push(localisedUrl(`swaps/${sellCurrency}-${buyCurrency}/${id}`))
    actions.modals.close('DeclineOrdersModal')
  }

  render() {
    const { intl: { locale }, data: { declineOrder }, intl } = this.props

    return (
      <Modal name='DeclineOrdersModal' title={intl.formatMessage(title.downloadModal)}>
        <div styleName="subTitle">
          <FormattedMessage id="decline43" defaultMessage="Sorry, but you have incomplete swaps, you cannot start a new swap until you close the unfinished " />
        </div>
        <h1 styleName="link" onClick={this.goToDecline}>
          <FormattedMessage id="decline49" defaultMessage="Link to uncomplete swap" />
        </h1>
      </Modal>

    )
  }
}
