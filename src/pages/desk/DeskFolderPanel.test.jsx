import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DeskFolderPanel from './DeskFolderPanel';
import { DEFAULT_AVATAR } from '../../utils/defaultAvatar';

const user = { uid: 'u1', email: 'ben@deped.gov.ph', photoURL: null };
// React writes ' as &#x27; inside attributes; compare the decoded markup.
const card = (profile, u = user) =>
  renderToStaticMarkup(<DeskFolderPanel user={u} profile={profile} plan={null} />).replace(/&#x27;/g, "'");

describe('Desk account card photo', () => {
  it('shows the photo the teacher uploaded', () => {
    const html = card({ fullName: 'Ben Cuvinar', photoURL: 'https://x/ben.jpg' });
    expect(html).toContain('src="https://x/ben.jpg"');
    expect(html).not.toContain('data-default-avatar');
  });

  it('falls back to the sign-in photo, then the default picture', () => {
    expect(card({}, { ...user, photoURL: 'https://g/me.png' })).toContain('src="https://g/me.png"');
    const none = card({});
    expect(none).toContain(`src="${DEFAULT_AVATAR}"`);
    expect(none).toContain('data-default-avatar="1"');
  });
});
