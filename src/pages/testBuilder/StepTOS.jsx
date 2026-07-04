import { useEffect, useMemo } from 'react';
import { useTestBuilderStore } from '../../store/testBuilderStore';
import { computeTOS } from '../../utils/testBuilderCalc';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveHotsFloor, resolveItemCeiling } from '../../config/testBuilderConfig';
import { Table2, CheckCircle2, AlertTriangle } from 'lucide-react';

const cellStyle = {
  padding: '10px 8px', textAlign: 'center', fontSize: 13,
  fontFamily: '"DM Mono", monospace', fontWeight: 600,
  borderBottom: '1px solid var(--kt-border)',
};

export default function StepTOS() {
  const store = useTestBuilderStore();
  const keyStage = deriveKeyStage(store.gradeLevel);
  const itemCeiling = resolveItemCeiling(keyStage, store.testType, store.itemCeilingOverride);
  const hotsFloor = keyStage ? deriveHotsFloor(keyStage) : 0;

  const competenciesKey = JSON.stringify(store.competencies);
  const weightsKey = JSON.stringify(store.cognitiveWeights);

  const tos = useMemo(
    () => computeTOS(store.competencies, store.cognitiveWeights, itemCeiling),
    [competenciesKey, weightsKey, itemCeiling] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    store.setTos(tos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tos]);

  const hotsOk = tos.hotsPct >= hotsFloor;
  const grandTotal = tos.columnTotals.reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 32 }}>

      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--kt-green-tint)', color: 'var(--kt-green-dark)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <Table2 size={12} /> Table of Specifications
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          Auto-generated TOS
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
          Items are distributed across competencies by instructional days, then across cognitive levels by your Bloom's weights.
        </p>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 12, padding: '14px 10px',
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)' }}>{grandTotal}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>of {itemCeiling} items</span>
        </div>

        <div style={{
          flex: 2, display: 'flex', alignItems: 'center', gap: 10,
          background: hotsOk ? 'var(--kt-green-tint)' : 'rgba(232,163,32,0.14)',
          border: `1px solid ${hotsOk ? 'rgba(45,106,79,0.25)' : 'rgba(232,163,32,0.35)'}`,
          borderRadius: 12, padding: '12px 16px',
        }}>
          {hotsOk ? <CheckCircle2 size={18} color="var(--kt-green-dark)" /> : <AlertTriangle size={18} color="#b47a10" />}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: hotsOk ? 'var(--kt-green-dark)' : '#b47a10', textTransform: 'uppercase', letterSpacing: '1px' }}>
              HOTS items
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: hotsOk ? 'var(--kt-green-dark)' : '#92400e' }}>
              {tos.hotsCount} items · {Math.round(tos.hotsPct)}% {keyStage ? `(floor ${hotsFloor}%)` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* TOS table */}
      <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #0d2218, #1a3d2b)' }}>
                <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Competency
                </th>
                {COGNITIVE_LEVELS.map((l) => (
                  <th key={l.key} style={{
                    padding: '11px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: l.hots ? '#c4b5fd' : '#fff', textTransform: 'uppercase', letterSpacing: '0.6px',
                  }}>
                    {l.short}
                  </th>
                ))}
                <th style={{ padding: '11px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {tos.rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '24px 14px', textAlign: 'center', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
                    Add competencies and instructional days in Setup to generate the TOS.
                  </td>
                </tr>
              )}
              {tos.rows.map((row, ri) => (
                <tr key={row.competencyId} style={{ background: ri % 2 ? 'var(--kt-card-2)' : 'var(--kt-card)' }}>
                  <td style={{ ...cellStyle, textAlign: 'left', fontFamily: 'inherit', fontWeight: 500, maxWidth: 220 }}>
                    {row.label?.trim() || <span style={{ color: 'var(--kt-muted)', fontStyle: 'italic' }}>Untitled competency</span>}
                  </td>
                  {row.cells.map((v, ci) => (
                    <td key={ci} style={{
                      ...cellStyle,
                      background: COGNITIVE_LEVELS[ci].hots ? 'rgba(124,58,237,0.05)' : 'transparent',
                      color: COGNITIVE_LEVELS[ci].hots ? '#6d28d9' : 'var(--kt-text-primary)',
                    }}>
                      {v}
                    </td>
                  ))}
                  <td style={{ ...cellStyle, fontWeight: 800, color: 'var(--kt-green-primary)' }}>{row.total}</td>
                </tr>
              ))}
            </tbody>
            {tos.rows.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--kt-green-tint)' }}>
                  <td style={{ ...cellStyle, textAlign: 'left', fontFamily: 'inherit', fontWeight: 800, color: 'var(--kt-green-dark)', borderBottom: 'none', borderTop: '2px solid var(--kt-green-primary)' }}>
                    Totals
                  </td>
                  {tos.columnTotals.map((v, ci) => (
                    <td key={ci} style={{ ...cellStyle, fontWeight: 800, color: 'var(--kt-green-dark)', borderBottom: 'none', borderTop: '2px solid var(--kt-green-primary)' }}>
                      {v}
                    </td>
                  ))}
                  <td style={{ ...cellStyle, fontWeight: 800, color: 'var(--kt-green-dark)', borderBottom: 'none', borderTop: '2px solid var(--kt-green-primary)' }}>
                    {grandTotal}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
