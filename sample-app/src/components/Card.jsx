export default function Card({ name, grade, length, featured }) {
  return (
    <article className="card">
      <div className={featured ? 'card-thumb card-thumb--featured' : 'card-thumb'} />
      <h3 className="card-title">{name}</h3>
      <p className="card-meta">
        <span className="badge">{grade}</span> · {length}
      </p>
    </article>
  );
}
