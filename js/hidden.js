// "Hidden things": pins with notes (water shut-off, gas meter, cable behind this wall…) and pipe / cable routes.
export const NOTE_CATS = {
  water: { icon: '💧', color: '#38bdf8', label: 'Water' }, gas: { icon: '🔥', color: '#f59e0b', label: 'Gas' }, electric: { icon: '⚡', color: '#fbbf24', label: 'Electricity' },
  heating: { icon: '♨️', color: '#f87171', label: 'Heating' }, network: { icon: '🌐', color: '#a78bfa', label: 'Network' }, structure: { icon: '🧱', color: '#a8a29e', label: 'Structure' }, other: { icon: '📌', color: '#f472b6', label: 'Other' },
};
export const ROUTE_KINDS = {
  cable: { label: 'Electrical cable', color: '#fbbf24', z: 2.3, r: .025 }, water: { label: 'Water pipe', color: '#38bdf8', z: .2, r: .04 }, heating: { label: 'Heating pipe', color: '#f87171', z: .2, r: .04 },
  gas: { label: 'Gas pipe', color: '#eab308', z: .3, r: .035 }, data: { label: 'Network cable', color: '#a78bfa', z: 2.3, r: .02 }, drain: { label: 'Drain', color: '#94a3b8', z: -.1, r: .055 },
};
