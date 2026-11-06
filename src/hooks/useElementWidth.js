import { useEffect, useState } from 'react'

// Largeur (en px) de l'élément auquel on attache `ref` (à passer à l'attribut ref d'un élément),
// mise à jour quand il change de taille. Sert aux dessins en SVG : on les trace à leur taille
// réelle plutôt que de les agrandir, pour que les textes gardent leur taille sur tablette et
// grand écran. La ref est une fonction : elle marche aussi si l'élément apparaît plus tard.
export default function useElementWidth(fallback = 318) {
  const [element, setElement] = useState(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    if (!element) return undefined
    const read = () => setWidth(Math.round(element.clientWidth) || fallback)
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, fallback])

  return [setElement, width]
}
