export default function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      // after:… = zone tactile invisible qui porte la cible à 44 px de haut sans changer l'apparence
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 after:content-[''] after:absolute after:-inset-x-1 after:-inset-y-2 ${
        checked ? 'bg-accent' : 'bg-surfaceHigh'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
