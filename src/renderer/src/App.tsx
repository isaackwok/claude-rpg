import { useTranslation } from './i18n'

function App(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'white' }}>
      <h1>{t('game.title')}</h1>
    </div>
  )
}

export default App
