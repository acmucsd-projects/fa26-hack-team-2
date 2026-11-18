import './Button.css'

function Button({ children, variant = 'primary', type = 'button', ...props }) {
  return (
    <button className={`button button-${variant}`} type={type} {...props}>
      {children}
    </button>
  )
}

export default Button