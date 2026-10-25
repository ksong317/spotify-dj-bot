import { keyLabel } from '../../camelot.js';
import { formatBpm, hasMixValues, mixFlags } from '../../setlist.js';
import KeyDot from './KeyDot.jsx';

function End({ keyCode, bpm, defaultKey, defaultBpm }) {
  const code = keyCode ?? defaultKey;
  const tempo = bpm ?? defaultBpm;
  const impliedKey = !keyCode && defaultKey;
  const impliedBpm = bpm == null && defaultBpm != null;

  if (!code && tempo == null) return <span className="mix__value">—</span>;
  return (
    <span className="mix__value">
      {code ? (
        <span className={impliedKey ? 'mix__part mix__part--implied' : 'mix__part'}>
          <KeyDot code={code} />
          {keyLabel(code)}
        </span>
      ) : null}
      {tempo == null ? null : (
        <span className={impliedBpm ? 'mix__part mix__part--implied' : 'mix__part'}>
          {formatBpm(tempo)} BPM
        </span>
      )}
    </span>
  );
}

/** Where a mix starts and where it lands, with what to watch out for. */
export default function MixSummary({ junction, fromItem, toItem, big = false }) {
  const flags = mixFlags(junction, fromItem, toItem);
  if (!hasMixValues(junction) && !fromItem?.default_key && fromItem?.default_bpm == null) {
    return null;
  }

  const relation = flags.relation;
  const arrowClass = relation
    ? `mix__arrow mix__arrow--${relation.kind}`
    : 'mix__arrow';

  return (
    <div className={big ? 'mix mix--big' : 'mix'}>
      <End
        keyCode={junction.start_key}
        bpm={junction.start_bpm}
        defaultKey={fromItem?.default_key}
        defaultBpm={fromItem?.default_bpm}
      />
      <span
        className={arrowClass}
        title={relation ? relation.label : 'One side has no key yet'}
      >
        →
      </span>
      <End
        keyCode={junction.end_key}
        bpm={junction.end_bpm}
        defaultKey={toItem?.default_key}
        defaultBpm={toItem?.default_bpm}
      />

      {relation && relation.kind !== 'match' ? (
        <span
          className={
            relation.kind === 'clash'
              ? 'mix__flag mix__flag--clash'
              : 'mix__flag mix__flag--near'
          }
          title={
            relation.kind === 'clash'
              ? 'These two keys are not neighbours on the wheel — pitch one of them or cut'
              : 'A step around the wheel, so the two keys still sit together'
          }
        >
          {relation.label}
        </span>
      ) : null}
      {flags.pitched ? (
        <span
          className="mix__flag mix__flag--pitched"
          title="Not where the song sits — this has to be pitched by hand"
        >
          pitched
        </span>
      ) : null}
      {flags.bpmShift ? (
        <span
          className="mix__flag"
          title="The mix does not land at the tempo it started at"
        >
          tempo change
        </span>
      ) : null}
    </div>
  );
}
