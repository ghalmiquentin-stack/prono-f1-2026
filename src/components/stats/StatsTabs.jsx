// Onglets internes de la page Stats : collés en haut pendant le défilement, 44 px de haut.
export default function StatsTabs({ tabs, value, onChange }) {
  return (
    <div className="px-5 pb-3 pt-1 sticky top-0 z-20 bg-bg">
      <div className="flex rounded-xl bg-surface p-1" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={value === tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-1 min-h-[44px] rounded-lg text-[13px] font-black ${value === tab.key ? 'bg-surfaceHigh text-white' : 'text-muted'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
