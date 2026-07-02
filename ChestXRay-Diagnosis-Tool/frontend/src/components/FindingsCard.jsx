const DISEASES = ['Cardiomegaly', 'Pleural Effusion', 'Pneumothorax']

function Row({ name, probability, positive, isPrimary }) {
  const pct      = probability != null ? Math.round(probability * 100) : null
  const hasData  = probability != null

  return (
    <div className="d-row">
      <div className="d-row__info">
        <div className="d-row__name">
          {name}
          {isPrimary && <span className="d-row__badge">Primary Finding</span>}
        </div>
        <div
          className="d-row__track"
          role="progressbar"
          aria-valuenow={pct ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} confidence`}
        >
          <div
            className={`d-row__fill ${positive ? 'd-row__fill--pos' : 'd-row__fill--neg'}`}
            style={{ width: hasData ? `${pct}%` : '0%' }}
          />
        </div>
      </div>

      <div className="d-row__stats">
        <span className="d-row__pct">{hasData ? `${pct}%` : '—'}</span>
        {hasData && (
          <span className={`pill ${positive ? 'pill--present' : 'pill--absent'}`}>
            {positive ? 'Present' : 'Absent'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function FindingsCard({ disease, probability, positive }) {
  return (
    <div className="card fade-up">
      <div className="card__header">
        <span className="card__title">Diagnostic Findings</span>
      </div>
      <div className="card__body">
        {DISEASES.map((d, i) => (
          <div key={d}>
            <Row
              name={d}
              probability={d === disease ? probability : null}
              positive={d === disease ? positive : false}
              isPrimary={d === disease}
            />
            {i < DISEASES.length - 1 && <div className="d-divider" />}
          </div>
        ))}
      </div>
    </div>
  )
}
