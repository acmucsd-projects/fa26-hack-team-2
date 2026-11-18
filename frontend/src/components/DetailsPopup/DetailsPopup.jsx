import './DetailsPopup.css'

function DetailsPopup({ amount, amountLabel, lines, total }) {
  return (
    <div className="details-popup">
      {amount && (
        <div className="details-popup-amount">
          <span className="details-popup-amount-value">{amount}</span>
          <span className="details-popup-amount-label">{amountLabel}</span>
        </div>
      )}

      {lines.map((line) => (
        <div key={line.label} className="details-popup-line">
          <span className="details-popup-line-label">{line.label}</span>
          <span className="details-popup-line-value">{line.value}</span>
        </div>
      ))}

      {total && (
        <>
          <div className="details-popup-divider" />
          <div className="details-popup-line details-popup-total">
            <span>{total.label}</span>
            <span>{total.value}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default DetailsPopup