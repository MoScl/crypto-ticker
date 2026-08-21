import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { api } from './lib/api';
import { useI18n } from './i18n';
import { MiniWindow } from './components/MiniWindow';

export default function App() {
  const { t } = useI18n();
  const loaded = useAppStore((s) => s.loaded);

  useEffect(() => {
    const { init, applyTicker, applySnapshot, setSourceStatus } = useAppStore.getState();
    void init();
    const offTicker = api.onTicker((t) => applyTicker(t));
    const offSnap = api.onSnapshot((list) => applySnapshot(list));
    const offStatus = api.onSourceStatus((s) => setSourceStatus(s));
    return () => {
      offTicker();
      offSnap();
      offStatus();
    };
  }, []);

  if (!loaded) {
    return (
      <div className="boot">
        <span className="boot-dot" /> {t('commonLoading')}
      </div>
    );
  }
  return <MiniWindow />;
}
