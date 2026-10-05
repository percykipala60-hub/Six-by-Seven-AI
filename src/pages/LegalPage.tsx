import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { legalMeta, legalPages } from "../content/legal";
import { NotFoundPage } from "./NotFoundPage";
import styles from "./LegalPage.module.css";

export function LegalPage() {
  const { slug } = useParams();
  const page = legalPages.find((p) => p.slug === slug);

  useEffect(() => {
    if (page) document.title = `${page.title} · Six by Seven.AI`;
    return () => {
      document.title = "Six by Seven.AI";
    };
  }, [page]);

  if (!page) return <NotFoundPage />;

  return (
    <div className={`container ${styles.layout}`}>
      <article className={styles.article}>
        <Link to="/" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          {legalMeta.back}
        </Link>
        <p className={styles.eyebrow}>{legalMeta.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className={styles.summary}>{page.summary}</p>
        <p className={styles.meta}>{legalMeta.updated}</p>
        <p className={styles.draft}>{legalMeta.draft}</p>

        {page.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.body.map((b, i) =>
              typeof b === "string" ? (
                <p key={i}>{b}</p>
              ) : (
                <ul key={i}>
                  {b.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </article>

      <aside className={styles.aside}>
        <p className={styles.asideTitle}>{legalMeta.otherPages}</p>
        <ul>
          {legalPages.map((p) => (
            <li key={p.slug}>
              <Link to={`/legal/${p.slug}`} aria-current={p.slug === slug ? "page" : undefined}>
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
