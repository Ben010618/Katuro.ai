import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_AVATAR, avatarSrc, onAvatarError } from './defaultAvatar';
import AvatarImage from '../components/AvatarImage';
import { TeacherAvatar } from '../pages/desk/DeskAvatar';

// React writes ' as &#x27; inside attributes; compare the decoded markup.
const render = (el) => renderToStaticMarkup(el).replace(/&#x27;/g, "'");

describe('default profile picture', () => {
  it('uses the teacher photo when there is one, else the default picture', () => {
    expect(avatarSrc('https://x/me.jpg')).toBe('https://x/me.jpg');
    for (const none of [null, undefined, '', '   ', 42]) expect(avatarSrc(none)).toBe(DEFAULT_AVATAR);
    expect(DEFAULT_AVATAR).toMatch(/default-avatar.*\.svg|^data:image\/svg/);
  });

  it('a broken photo link switches to the default picture once (no reload loop)', () => {
    const img = { src: 'https://x/deleted.jpg', dataset: {} };
    onAvatarError({ currentTarget: img });
    expect(img.src).toBe(DEFAULT_AVATAR);
    expect(img.dataset.defaultAvatar).toBe('1');
    img.src = 'still-broken';
    onAvatarError({ currentTarget: img });
    expect(img.src).toBe('still-broken'); // second error: left alone
  });

  it('web avatar: default picture is marked (its coloured box is removed by CSS)', () => {
    const none = render(<AvatarImage photoURL="" alt="Ana" />);
    expect(none).toContain(`src="${DEFAULT_AVATAR}"`);
    expect(none).toContain('data-default-avatar="1"');
    const own = render(<AvatarImage photoURL="https://x/ana.jpg" alt="Ana" />);
    expect(own).toContain('src="https://x/ana.jpg"');
    expect(own).not.toContain('data-default-avatar');
  });

  it('KaTuroDesk teacher avatar uses the same default picture', () => {
    const html = render(<TeacherAvatar name="Sir Ben" size={32} />);
    expect(html).toContain(`src="${DEFAULT_AVATAR}"`);
    expect(html).toContain('alt="Sir Ben"');
    expect(render(<TeacherAvatar photoURL="https://x/ben.jpg" />)).toContain('src="https://x/ben.jpg"');
  });
});
