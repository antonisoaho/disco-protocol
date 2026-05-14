import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

export function BottomNav() {
  const { t } = useTranslation('common')
  return (
    <nav className="bottom-nav" aria-label={t('shell.bottomNav.aria')}>
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`}
      >
        {t('shell.bottomNav.home')}
      </NavLink>
      <NavLink
        to="/players"
        className={({ isActive }) => `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`}
      >
        {t('shell.bottomNav.players')}
      </NavLink>
      <NavLink
        to="/profile"
        className={({ isActive }) => `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`}
      >
        {t('shell.profile')}
      </NavLink>
    </nav>
  )
}
