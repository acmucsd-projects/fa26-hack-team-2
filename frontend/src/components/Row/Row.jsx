import './Row.css'

function Row({ label, detail, onClick }) {
  return (
    <button className="row" onClick={onClick}>
      <span className="row-label">{label}</span>
      <span className="row-detail">{detail}</span>
    </button>
  )
}

export default Row