import { useState } from 'react'
import chevronDown from '../../assets/chevron-down.svg'
import settingsIcon from '../../assets/settings.svg'
import signOutIcon from '../../assets/sign-out.svg'
import './ProfileMenu.css'

function ProfileMenu({ name, initials, onSettings, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false)

  function handleSettings() {
    setIsOpen(false)
    onSettings()
  }

  function handleSignOut() {
    setIsOpen(false)
    onSignOut()
  }

  return (
    <div className="profile-menu">
      <button
        className="profile-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="profile-menu-avatar">{initials}</span>
        <span className="profile-menu-name">{name}</span>
        <img
          src={chevronDown}
          alt=""
          className={isOpen ? 'profile-menu-chevron profile-menu-chevron-open' : 'profile-menu-chevron'}
        />
      </button>

      {isOpen && (
        <div className="profile-menu-dropdown">
          <button className="profile-menu-item" onClick={handleSettings}>
            <img src={settingsIcon} alt="" />
            Settings
          </button>
          <div className="profile-menu-divider" />
          <button className="profile-menu-item" onClick={handleSignOut}>
            <img src={signOutIcon} alt="" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu