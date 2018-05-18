import React from 'react'
import PropTypes from 'prop-types'

export default function Header({ currency, isClose }) {
  return (
    <div className="modal-header">
      <h4 className="modal-title" >{ currency.toUpperCase() }</h4>
      <button type="button" className="close" onClick={() => isClose()} >&times;</button>
    </div>
  )
}

Header.propTypes = {
  isClose: PropTypes.func.isRequired,
  currency:  PropTypes.string.isRequired,
}
