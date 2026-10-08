import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DeskSignatureSettings from './DeskSignatureSettings';
import { useDeskStore } from '../../store/deskStore';

describe('Settings > E-signature', () => {
  beforeEach(() => useDeskStore.getState().setESignature(null));

  it('explains where it is used and kept; offers upload and drawing', () => {
    const html = renderToStaticMarkup(<DeskSignatureSettings />);
    expect(html).toContain('placed only above your own name');
    expect(html).toContain('saved only on this computer and never uploaded');
    expect(html).toContain('No e-signature saved yet.');
    expect(html).toContain('Upload a photo');
    expect(html).toContain('Draw it');
    expect(html).not.toContain('Remove');
  });

  it('only a PNG data URL is kept (never a link), and it is saved with the desk settings', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    useDeskStore.getState().setESignature(png);
    expect(useDeskStore.getState().eSignature).toBe(png);
    expect(useDeskStore.persist.getOptions().partialize(useDeskStore.getState()).eSignature).toBe(png);
    useDeskStore.getState().setESignature('https://example.com/sig.png');
    expect(useDeskStore.getState().eSignature).toBe(null);
  });
});
