import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MyClassesModal from './MyClassesModal';
import TeachingAssistant from './TeachingAssistant';

describe('My classes window', () => {
  it('renders the four tabs and the Today view; nothing when closed', () => {
    const html = renderToStaticMarkup(<MyClassesModal open onClose={() => {}} />);
    for (const tab of ['Today', 'Classes', 'Lessons', 'Assistant']) expect(html).toContain(`>${tab}</button>`);
    expect(html).toContain('Prepare this week');
    expect(html).toContain('Add your classes in the Classes tab first.');
    expect(renderToStaticMarkup(<MyClassesModal open={false} onClose={() => {}} />)).toBe('');
  });

  it('the assistant renders nothing in the page', () => {
    expect(renderToStaticMarkup(<TeachingAssistant user={null} profile={null} />)).toBe('');
  });
});
