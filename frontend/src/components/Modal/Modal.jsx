import { useEffect, useId } from 'react'
import './Modal.css'

// Generic popup: dimmed overlay + white card with a title and close button.
// Closes on Escape or a click on the overlay. Reuse it for other popups
// (e.g. "Edit meal") so they all look and behave the same.
function Modal({ title, subtitle, onClose, children, footer, width = 420 }) {
  const titleId = useId()

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId} className="modal-title">{title}</h2>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

export default Modal
