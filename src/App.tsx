import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { AppProvider, useApp } from './state';
import type { ScreenName } from './state';
import { Icon } from './components/ui';
import { Dashboard } from './screens/Dashboard';
import { FoodScreen } from './screens/Food';
import { ExerciseScreen } from './screens/Exercise';
import { WeightScreen } from './screens/Weight';
import { ProgressScreen } from './screens/Progress';
import { DataScreen, ProfileEditScreen, SavedScreen, SettingsScreen } from './screens/Settings';
import { GoalsScreen, Welcome } from './screens/Profile';

const NAV: { name: ScreenName; label: string; icon: string }[] = [
  { name: 'dashboard', label: 'Today', icon: 'dashboard' },
  { name: 'food', label: 'Food', icon: 'food' },
  { name: 'exercise', label: 'Exercise', icon: 'exercise' },
  { name: 'weight', label: 'Weight', icon: 'weight' },
  { name: 'progress', label: 'Progress', icon: 'progress' },
];

const SETTINGS_SCREENS: ScreenName[] = ['settings', 'saved', 'goals', 'profile', 'data'];

function Shell() {
  const { ready, error, data, screen, go, toastMsg, online, setFoodIntent } = useApp();
  const [update, setUpdate] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => setUpdate((e as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('tally:update', onUpdate);
    return () => window.removeEventListener('tally:update', onUpdate);
  }, []);

  if (!ready) return <div className="boot" aria-busy="true">Loading…</div>;
  if (error && !data)
    return (
      <main className="welcome">
        <h1 className="wordmark">Tally</h1>
        <p className="warn" role="alert">
          Couldn’t open local storage: {error}
        </p>
        <p className="hint">Private browsing modes and some privacy settings block IndexedDB. Open Tally in a normal window, or check that site data is allowed.</p>
      </main>
    );
  if (!data) return <Welcome />;

  const screens: Record<ScreenName, ReactElement> = {
    dashboard: <Dashboard />,
    food: <FoodScreen key={screen} />,
    exercise: <ExerciseScreen />,
    weight: <WeightScreen />,
    progress: <ProgressScreen />,
    settings: <SettingsScreen />,
    saved: <SavedScreen />,
    goals: <GoalsScreen />,
    profile: <ProfileEditScreen />,
    data: <DataScreen />,
  };
  const inSettings = SETTINGS_SCREENS.includes(screen);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="wordmark">Tally</span>
          <button className="profile-chip" onClick={() => go('settings')} aria-label={`Profile: ${data.profile.name}. Open settings`}>
            {data.profile.name}
          </button>
        </div>
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.name}>
                <button
                  className={screen === n.name ? 'on' : ''}
                  aria-current={screen === n.name ? 'page' : undefined}
                  onClick={() => {
                    if (n.name === 'food') setFoodIntent({});
                    go(n.name);
                  }}
                >
                  <Icon name={n.icon} /> {n.label}
                </button>
              </li>
            ))}
            <li>
              <button className={inSettings ? 'on' : ''} aria-current={inSettings ? 'page' : undefined} onClick={() => go('settings')}>
                <Icon name="settings" /> Settings
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <header className="topbar">
        <span className="wordmark">Tally</span>
        <span className="topbar-right">
          {!online && (
            <span className="offline-pill" role="status">
              <Icon name="offline" size={16} /> Offline
            </span>
          )}
          <button className="profile-chip" onClick={() => go('settings')} aria-label={`Profile: ${data.profile.name}. Open settings`}>
            <Icon name="settings" size={18} /> {data.profile.name}
          </button>
        </span>
      </header>

      {update && (
        <div className="update-bar" role="status">
          A new version of Tally is ready.
          <button className="btn btn-small" onClick={() => {
              (window as unknown as { __tallyUpdateRequested?: boolean }).__tallyUpdateRequested = true;
              update.postMessage({ type: 'SKIP_WAITING' });
            }}>
            Reload to update
          </button>
        </div>
      )}
      {!online && (
        <p className="offline-bar" role="status">
          Offline. Logging, weigh-ins, and charts still work; ChatGPT needs a connection.
        </p>
      )}

      <main id="main" className="content" tabIndex={-1}>
        {screens[screen]}
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <button
            key={n.name}
            className={screen === n.name ? 'on' : ''}
            aria-current={screen === n.name ? 'page' : undefined}
            onClick={() => {
              if (n.name === 'food') setFoodIntent({});
              go(n.name);
            }}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="toast" role="status" aria-live="polite">
        {toastMsg && <span>{toastMsg}</span>}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
