/**
 * Logo Six aux couleurs du thème : le fond (--icon-bg), le « 6 » (--icon-ink) et le trait (--icon-accent)
 * changent avec le thème choisi. Les deux calques viennent de l'icône d'origine (public/six-glyphe.png, six-trait.png).
 */
export function Logo({ label = 'Six', small = false }: { label?: string; small?: boolean }) {
  return (
    <span
      className={`logo six-logo${small ? ' sm' : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <i className="six-logo-glyphe" />
      <i className="six-logo-trait" />
    </span>
  );
}
